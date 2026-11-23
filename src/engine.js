/* Parker Institute LinkedIn Post Generator — render engine
   Every template comes from the Figma file (templates.json). This file turns a
   template + the person's content into pixels, matching Figma's text metrics. */

const FONT_SPECS = {
  'HEX Franklin v0.3 X Condensed|Extrabold': { css: '"PI Hex XCond"', weight: 800, asc: 0.95, desc: 0.2, cap: 0.75 },
  'HEX Franklin v0.3|Extrabold':             { css: '"PI Hex"',       weight: 800, asc: 0.95, desc: 0.2, cap: 0.75 },
  'HEX Franklin v0.3|Light':                 { css: '"PI Hex"',       weight: 300, asc: 0.95, desc: 0.2, cap: 0.75 },
  'Caslon Ionic|Regular':                    { css: '"PI Caslon"',    weight: 400, asc: 0.843, desc: 0.157, cap: 0.726 },
};
const PLACEHOLDER_FONT = 'HEX Franklin v0.3|Light';
const HAS_LS = typeof CanvasRenderingContext2D !== 'undefined' && 'letterSpacing' in CanvasRenderingContext2D.prototype;

const Engine = {
  measureCtx: null,

  ctx() {
    if (!this.measureCtx) this.measureCtx = document.createElement('canvas').getContext('2d');
    return this.measureCtx;
  },

  setFont(ctx, fontKey, size, lsPct) {
    const f = FONT_SPECS[fontKey];
    ctx.font = `${f.weight} ${size}px ${f.css}`;
    const ls = (lsPct || 0) / 100 * size;
    if (HAS_LS) ctx.letterSpacing = `${ls}px`;
    return ls;
  },

  measure(ctx, str, fontKey, size, lsPct) {
    const ls = this.setFont(ctx, fontKey, size, lsPct);
    let w = ctx.measureText(str).width;
    if (!HAS_LS) w += ls * str.length;
    // canvas adds spacing after the last glyph; Figma doesn't count it for layout
    if (str.length) w -= ls;
    return w;
  },

  /* Greedy word wrap, honouring hard line breaks. Returns array of lines. */
  wrap(text, fontKey, size, lsPct, width, upper) {
    const ctx = this.ctx();
    let t = (text || '').replace(/\r/g, '');
    if (upper) t = t.toUpperCase();
    if (!t.length) return [];
    const out = [];
    for (const para of t.split('\n')) {
      if (para === '') { out.push(''); continue; }
      const words = para.split(' ');
      let line = '';
      for (const word of words) {
        const test = line === '' ? word : line + ' ' + word;
        if (this.measure(ctx, test.trimEnd(), fontKey, size, lsPct) <= width + 0.5 || line === '') {
          if (line === '' && this.measure(ctx, word, fontKey, size, lsPct) > width + 0.5) {
            // single word wider than the box: break it by characters
            let chunk = '';
            for (const ch of word) {
              if (chunk && this.measure(ctx, chunk + ch, fontKey, size, lsPct) > width + 0.5) { out.push(chunk); chunk = ch; }
              else chunk += ch;
            }
            line = chunk;
          } else line = test;
        } else { out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  },

  /* Figma places each line's baseline in the middle of its line box. */
  baselineOffset(fontKey, size, lh) {
    const f = FONT_SPECS[fontKey];
    return (lh - (f.asc + f.desc) * size) / 2 + f.asc * size;
  },

  /* Figma "vertical trim: cap height to baseline" boxes start at the cap top of
     the first line and end on the last baseline. */
  capPx(el) { return FONT_SPECS[el.font].cap * el.size; },
  blockH(el, n) {
    if (!n) return 0;
    return el.trim ? this.capPx(el) + (n - 1) * el.lh : n * el.lh;
  },
  firstBaseline(el) {
    return el.trim ? this.capPx(el) : this.baselineOffset(el.font, el.size, el.lh);
  },
  shownLines(el) {
    const n = el.trim ? (el.b[3] - this.capPx(el)) / el.lh + 1 : el.b[3] / el.lh;
    return Math.max(1, Math.round(n));
  },

  /* Width a text block may wrap to. Auto-width boxes run to the right margin
     (or both margins when centred); fixed boxes keep their Figma width. */
  wrapWidth(tpl, el, ov) {
    if (ov && ov.w) return ov.w;
    if (!el.auto) return el.b[2];
    if (el.al === 'C') return tpl.w - 2 * tpl.m;
    return tpl.w - tpl.m - el.b[0];
  },

  /* Anchor geometry derived once from the Figma layout. */
  anchors(tpl) {
    if (tpl._anchors) return tpl._anchors;
    const stack = tpl.el.filter(e => e.anchor === 'bottom-stack' && (e.k === 'text' || e.k === 'rule'))
      .map(e => ({ e, top: e.b[1], h: e.k === 'rule' ? 0 : this.blockH(e, this.shownLines(e)) }))
      .sort((a, b) => a.top - b.top);
    const gaps = [];
    for (let i = 0; i < stack.length - 1; i++) gaps.push(stack[i + 1].top - (stack[i].top + stack[i].h));
    const last = stack[stack.length - 1];
    tpl._anchors = { stack: stack.map(s => s.e), gaps, bottom: last ? last.top + last.h : 0 };
    return tpl._anchors;
  },

  /* Resolve every element's position for the current content. */
  layout(tpl, content) {
    const items = [];
    const ov = content.overrides || {};
    const textOf = el => (content.text && el.role in content.text) ? content.text[el.role] : el.txt;
    const textItem = el => {
      const o = ov[el.role] || {};
      const width = this.wrapWidth(tpl, el, o);
      const lines = this.wrap(textOf(el), el.font, el.size, el.ls, width, el.up);
      return { kind: 'text', el, lines, width, h: this.blockH(el, lines.length), x: el.b[0] + (o.dx || 0), o };
    };
    for (const el of tpl.el) {
      if (el.k !== 'text' || el.anchor === 'bottom-stack') continue;
      if (content.hidden && content.hidden[el.role]) continue;
      const it = textItem(el);
      if (el.anchor === 'bottom') it.top = el.b[1] + this.blockH(el, this.shownLines(el)) - it.h;
      else it.top = el.b[1];
      it.top += (it.o.dy || 0);
      items.push(it);
    }
    // bottom stack: last element holds its bottom edge, the rest ride above it
    const A = this.anchors(tpl);
    let cursor = A.bottom;
    for (let i = A.stack.length - 1; i >= 0; i--) {
      const el = A.stack[i];
      if (el.k === 'rule') {
        items.push({ kind: 'rule', el, y: cursor });
        if (i > 0) cursor -= A.gaps[i - 1];
        continue;
      }
      const it = textItem(el);
      it.top = cursor - it.h;
      items.push(it);
      cursor = it.top;
      if (i > 0 && it.h > 0) cursor -= A.gaps[i - 1];
    }
    return items;
  },

  lineCount(tpl, el, text, ov) {
    return this.wrap(text, el.font, el.size, el.ls, this.wrapWidth(tpl, el, ov), el.up).length;
  },

  drawText(ctx, it) {
    const el = it.el;
    ctx.fillStyle = '#' + el.col;
    this.setFont(ctx, el.font, el.size, el.ls);
    ctx.textBaseline = 'alphabetic';
    const bo = this.firstBaseline(el);
    it.lines.forEach((line, i) => {
      const s = line.trimEnd();
      let x = it.x;
      if (el.al === 'C') {
        const cx = el.b[0] + el.b[2] / 2 + (it.o.dx || 0);
        x = cx - this.measure(ctx, s, el.font, el.size, el.ls) / 2;
        this.setFont(ctx, el.font, el.size, el.ls);
      }
      ctx.fillText(s, x, it.top + i * el.lh + bo);
    });
  },

  placeholderLabel(ctx, b, text, size, twoLine) {
    const font = PLACEHOLDER_FONT, lh = size * 1.3;
    const lines = twoLine ? text.split(' ') : [text];
    ctx.fillStyle = '#000';
    const total = lines.length * lh;
    const bo = this.baselineOffset(font, size, lh);
    lines.forEach((l, i) => {
      const w = this.measure(ctx, l, font, size, 2);
      this.setFont(ctx, font, size, 2);
      ctx.fillText(l, b[0] + (b[2] - w) / 2, b[1] + (b[3] - total) / 2 + i * lh + bo);
    });
  },

  /* One label size per template so every placeholder in a post matches. */
  placeholderSpec(tpl) {
    if (tpl._ph) return tpl._ph;
    const ctx = this.ctx();
    const imgs = tpl.el.filter(e => e.k === 'img');
    const one = this.measure(ctx, 'PLACEHOLDER IMAGE', PLACEHOLDER_FONT, 53, 2);
    const word = this.measure(ctx, 'PLACEHOLDER', PLACEHOLDER_FONT, 53, 2);
    let twoLine = imgs.length > 1, size = 53;
    for (const e of imgs) {
      const w = Math.min(e.b[2], tpl.w - Math.max(0, e.b[0])) * 0.8;
      size = Math.min(size, 53 * w / (twoLine ? word : one));
    }
    if (!twoLine && size < 28) { twoLine = true; size = 53; for (const e of imgs) size = Math.min(size, 53 * e.b[2] * 0.8 / word); }
    tpl._ph = { size, twoLine };
    return tpl._ph;
  },

  logoLabelSize(el) {
    const w = this.measure(this.ctx(), 'LOGO PLACEHOLDER', PLACEHOLDER_FONT, 53, 2);
    return Math.min(53.26, 53 * el.b[2] * 0.9 / w, el.b[3] * 0.5);
  },

  /* Keep a photo covering its frame: limit how far it can be panned. */
  clampPan(img, b, st) {
    const r = this.coverRect(img, b, { zoom: st.zoom });
    const mx = Math.max(0, (r[2] - b[2]) / 2), my = Math.max(0, (r[3] - b[3]) / 2);
    st.ox = Math.max(-mx, Math.min(mx, st.ox || 0));
    st.oy = Math.max(-my, Math.min(my, st.oy || 0));
  },

  /* Bounding box of a laid-out text item, in post pixels. */
  textBox(it) {
    const el = it.el;
    const w = it.lines.length ? Math.max(...it.lines.map(l => this.measure(this.ctx(), l.trimEnd(), el.font, el.size, el.ls))) : 0;
    const x = el.al === 'C' ? el.b[0] + el.b[2] / 2 + (it.o.dx || 0) - it.width / 2 : it.x;
    return { x, y: it.top, w: it.width, h: Math.max(it.h, el.lh * 0.6), inkW: w };
  },

  /* Cover-fit an image into a frame, with optional zoom and offset. */
  coverRect(img, b, st) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const base = Math.max(b[2] / iw, b[3] / ih);
    const s = base * ((st && st.zoom) || 1);
    const w = iw * s, h = ih * s;
    return [b[0] + (b[2] - w) / 2 + ((st && st.ox) || 0), b[1] + (b[3] - h) / 2 + ((st && st.oy) || 0), w, h];
  },

  containRect(img, b, st) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const s = Math.min(b[2] / iw, b[3] / ih) * ((st && st.zoom) || 1);
    const w = iw * s, h = ih * s;
    return [b[0] + (b[2] - w) / 2 + ((st && st.ox) || 0), b[1] + (b[3] - h) / 2 + ((st && st.oy) || 0), w, h];
  },

  frameOf(el, content) {
    const f = content.frames && content.frames[el.role];
    return f ? f : el.b;
  },

  render(canvas, tpl, content, scale) {
    scale = scale || 1;
    canvas.width = Math.round(tpl.w * scale);
    canvas.height = Math.round(tpl.h * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = '#' + tpl.bg;
    ctx.fillRect(0, 0, tpl.w, tpl.h);

    // circles: rings sharing a group opacity are drawn on their own layer, then composited
    const layers = new Map();
    for (const r of tpl.rings) { const la = r[9] == null ? 1 : r[9]; if (!layers.has(la)) layers.set(la, []); layers.get(la).push(r); }
    for (const [alpha, rings] of layers) {
      let lctx = ctx, layer = null;
      if (alpha < 1) {
        layer = document.createElement('canvas');
        layer.width = canvas.width; layer.height = canvas.height;
        lctx = layer.getContext('2d'); lctx.setTransform(scale, 0, 0, scale, 0, 0);
      }
      for (const r of rings) {
        const [cx, cy, rad, stroke, sw, fill, op, dash, fillOp] = r;
        const o = op == null ? 1 : op;
        lctx.beginPath(); lctx.arc(cx, cy, Math.max(0, rad - (stroke ? sw / 2 : 0)), 0, Math.PI * 2);   // Figma strokes sit inside
        if (fill) { lctx.globalAlpha = o * (fillOp == null ? 1 : fillOp); lctx.fillStyle = '#' + fill; lctx.fill(); }
        if (stroke) { lctx.globalAlpha = o; lctx.strokeStyle = '#' + stroke; lctx.lineWidth = sw; lctx.lineCap = 'butt'; lctx.setLineDash(dash || []); lctx.stroke(); lctx.setLineDash([]); }
        lctx.globalAlpha = 1;
      }
      if (layer) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(layer, 0, 0); ctx.restore(); }
    }
    const gone = content.deletedDots || {};
    tpl.dots.forEach((d, i) => {
      if (gone[i]) return;
      const [x, y, w, h, col, rot] = d;
      const a = (rot || 0) * Math.PI / 180;
      const bw = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a));
      const bh = Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a));
      ctx.save();
      ctx.translate(x + bw / 2, y + bh / 2);
      ctx.rotate(-a);
      ctx.fillStyle = '#' + col;
      ctx.fillRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    });

    const ph = this.placeholderSpec(tpl);
    for (const el of tpl.el) {
      if (el.k === 'img') {
        const b = this.frameOf(el, content);
        const st = content.images && content.images[el.role];
        ctx.save();
        ctx.beginPath(); ctx.rect(b[0], b[1], b[2], b[3]); ctx.clip();
        if (st && st.img) {
          const r = this.coverRect(st.img, b, st);
          ctx.drawImage(st.img, r[0], r[1], r[2], r[3]);
        } else {
          ctx.fillStyle = '#' + el.col; ctx.fillRect(b[0], b[1], b[2], b[3]);
          if (!content.noLabels) {
            // keep the label centred in the visible part of frames that run off the canvas
            const vx = Math.max(b[0], 0), vy = Math.max(b[1], 0);
            const vb = [vx, vy, Math.min(b[0] + b[2], tpl.w) - vx, Math.min(b[1] + b[3], tpl.h) - vy];
            this.placeholderLabel(ctx, vb, 'PLACEHOLDER IMAGE', ph.size, ph.twoLine);
          }
        }
        ctx.restore();
      } else if (el.k === 'logo') {
        const lg = content.logos && content.logos[el.role];
        if (lg && lg.img) {
          const r = this.containRect(lg.img, el.b, lg);
          ctx.drawImage(lg.img, r[0], r[1], r[2], r[3]);
        } else {
          ctx.fillStyle = '#' + el.col; ctx.fillRect(el.b[0], el.b[1], el.b[2], el.b[3]);
          if (!content.noLabels) this.placeholderLabel(ctx, el.b, 'LOGO PLACEHOLDER', this.logoLabelSize(el), false);
        }
      } else if (el.k === 'rule' && el.anchor === 'static') {
        ctx.strokeStyle = '#' + el.col; ctx.lineWidth = el.sw;
        ctx.beginPath(); ctx.moveTo(el.b[0], el.b[1]); ctx.lineTo(el.b[0] + el.b[2], el.b[1]); ctx.stroke();
      }
    }
    for (const it of this.layout(tpl, content)) {
      if (it.kind === 'rule') {
        ctx.strokeStyle = '#' + it.el.col; ctx.lineWidth = it.el.sw;
        ctx.beginPath(); ctx.moveTo(it.el.b[0], it.y); ctx.lineTo(it.el.b[0] + it.el.b[2], it.y); ctx.stroke();
      } else this.drawText(ctx, it);
    }
    return ctx;
  },
};
