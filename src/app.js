/* Parker Institute LinkedIn Post Generator — interface */

const SIZES = { '1080x1080': 'Square', '1080x1350': 'Portrait', '1200x627': 'Landscape' };
const SIZE_ORDER = ['1080x1080', '1080x1350', '1200x627'];
const TYPES = ['Single Image', 'Multi Image', 'Solo Logo', 'Horizontal Logos', 'Vertical Logos'];
const STYLE_ORDER = ['Dots', 'Circles', 'Plain'];
const COLOR_ORDER = ['Purple', 'Black', 'Black ALT', 'Tan'];
const STEPS = [
  { key: 'type', label: 'Post type' },
  { key: 'size', label: 'Size' },
  { key: 'style', label: 'Pattern' },
  { key: 'color', label: 'Color' },
];
const ROLE_LABELS = { headline: 'Headline', subhead: 'Subhead', body: 'Body copy', title: 'Title', year: 'Year', logo: 'Logo' };

const CATALOG = Object.keys(TEMPLATES).map(name => {
  const p = name.split('_');
  return { name, size: p[0], type: p[1], color: p[2] + (p[4] === 'ALT' ? ' ALT' : ''), style: p[3] };
});

/* What the person supplies (kept per post type) and the manual adjustments
   (kept per layout, since positions differ between sizes). */
const typeContent = {};   // type -> { text, images: {role: {img,name}}, logos: {role: {img,name}} }
const tplEdits = {};      // template name -> { frames, overrides, hidden, deletedDots, adj }
const history = {};       // template name -> [snapshots]

const state = {
  sel: { type: null, size: null, style: null, color: null },
  selected: null,         // { kind: 'img'|'text'|'logo', role }
  hover: null,
  drag: null,
};

const tc = () => typeContent[state.sel.type] || (typeContent[state.sel.type] = { text: {}, images: {}, logos: {} });
const te = name => tplEdits[name] || (tplEdits[name] = { frames: {}, overrides: {}, hidden: {}, deletedDots: {}, adj: {} });

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const k of [].concat(kids)) if (k !== null && k !== undefined && k !== false) n.append(k.nodeType ? k : document.createTextNode(k));
  return n;
};

/* ---------- selection logic ---------- */
function matches(t, sel, uptoIdx) {
  for (let i = 0; i < uptoIdx; i++) { const k = STEPS[i].key; if (sel[k] && t[k] !== sel[k]) return false; }
  return true;
}
function optionsFor(stepIdx, sel) {
  const key = STEPS[stepIdx].key;
  if (key === 'type') return TYPES.filter(t => CATALOG.some(c => c.type === t));
  const vals = new Set(CATALOG.filter(t => matches(t, sel, stepIdx)).map(t => t[key]));
  const order = key === 'size' ? SIZE_ORDER : key === 'style' ? STYLE_ORDER : COLOR_ORDER;
  return order.filter(v => vals.has(v));
}
function resolve(sel) {
  let pool = CATALOG.filter(t => t.type === sel.type);
  for (const s of STEPS.slice(1)) {
    const k = s.key;
    if (sel[k]) { const p = pool.filter(t => t[k] === sel[k]); if (p.length) pool = p; }
  }
  const rank = t => SIZE_ORDER.indexOf(t.size) * 100 + STYLE_ORDER.indexOf(t.style) * 10 + COLOR_ORDER.indexOf(t.color);
  pool.sort((a, b) => rank(a) - rank(b));
  return pool[0] || null;
}
function choose(stepIdx, value) {
  state.sel[STEPS[stepIdx].key] = value;
  for (let i = stepIdx + 1; i < STEPS.length; i++) {
    const k = STEPS[i].key, opts = optionsFor(i, state.sel);
    if (!opts.includes(state.sel[k])) state.sel[k] = null;
    if (opts.length === 1) state.sel[k] = opts[0];
  }
  state.selected = null;
  renderAll();
}
const complete = () => STEPS.every(s => state.sel[s.key]);
const currentEntry = () => state.sel.type && resolve(state.sel);
const currentTemplate = () => { const e = currentEntry(); return e ? TEMPLATES[e.name] : null; };

/* Everything the renderer needs for one template. */
function compose(entry, forThumb) {
  const c = typeContent[entry.type] || { text: {}, images: {}, logos: {} };
  const e = tplEdits[entry.name] || { frames: {}, overrides: {}, hidden: {}, deletedDots: {}, adj: {} };
  const withAdj = src => {
    const o = {};
    for (const [role, v] of Object.entries(src)) o[role] = { ...v, ...(e.adj[role] || {}) };
    return o;
  };
  return { text: c.text, images: withAdj(c.images), logos: withAdj(c.logos), frames: e.frames, overrides: e.overrides,
    hidden: e.hidden, deletedDots: e.deletedDots, noLabels: !!forThumb };
}

/* ---------- undo ---------- */
function snapshot() {
  const entry = currentEntry(); if (!entry) return null;
  const c = tc(), e = te(entry.name);
  return { text: { ...c.text }, images: { ...c.images }, logos: { ...c.logos }, e: JSON.parse(JSON.stringify(e)) };
}
function pushHistory() {
  const entry = currentEntry(); if (!entry) return;
  const h = history[entry.name] || (history[entry.name] = []);
  h.push(snapshot()); if (h.length > 200) h.shift();
  updateUndo();
}
function undo() {
  const entry = currentEntry(); if (!entry) return;
  const h = history[entry.name]; if (!h || !h.length) return;
  const s = h.pop();
  const c = tc();
  c.text = s.text; c.images = s.images; c.logos = s.logos;
  tplEdits[entry.name] = s.e;
  renderContent(); renderPreview(); renderManualPanel();
}
function updateUndo() {
  const entry = currentEntry();
  const n = entry && history[entry.name] ? history[entry.name].length : 0;
  document.querySelectorAll('[data-undo]').forEach(b => { b.disabled = !n; });
}

/* ---------- thumbnails ---------- */
function thumb(entry, max) {
  const tpl = TEMPLATES[entry.name];
  const c = el('canvas', { class: 'thumb' });
  const s = max / Math.max(tpl.w, tpl.h);
  Engine.render(c, tpl, compose(entry, true), s * 2);
  c.style.width = tpl.w * s + 'px'; c.style.height = tpl.h * s + 'px';
  return c;
}

/* ---------- steps panel ---------- */
function renderSteps() {
  const wrap = $('#steps'); wrap.innerHTML = '';
  STEPS.forEach((step, i) => {
    const reachable = i === 0 || state.sel[STEPS[i - 1].key];
    const opts = reachable ? optionsFor(i, state.sel) : [];
    const sec = el('section', { class: 'step' + (reachable ? '' : ' locked') });
    const value = state.sel[step.key];
    sec.append(el('div', { class: 'step-head' }, [
      el('span', { class: 'num' }, String(i + 1)),
      el('span', { class: 'label' }, step.label),
      el('span', { class: 'value' }, value ? (step.key === 'size' ? `${SIZES[value]}  ${value.replace('x', ' × ')}` : value) : ''),
    ]));
    if (reachable) {
      const grid = el('div', { class: 'opts' });
      for (const o of opts) {
        const trial = { ...state.sel, [step.key]: o };
        for (let j = i + 1; j < STEPS.length; j++) { const k = STEPS[j].key; if (!optionsFor(j, trial).includes(trial[k])) trial[k] = null; }
        const entry = resolve(trial);
        const label = step.key === 'size' ? SIZES[o] : o;
        grid.append(el('button', { class: 'opt' + (value === o ? ' on' : ''), onclick: () => choose(i, o) }, [thumb(entry, 64), el('span', {}, label)]));
      }
      if (opts.length === 1 && i > 0) grid.append(el('p', { class: 'hint' }, 'Only option for this layout.'));
      sec.append(grid);
    }
    wrap.append(sec);
  });
}

/* ---------- content panel ---------- */
const readingOrder = (a, b) => (a.b[1] - b.b[1]) || (a.b[0] - b.b[0]);
function roleLabel(role) {
  if (ROLE_LABELS[role]) return ROLE_LABELS[role];
  const m = role.match(/^(caption|image|logo)-(\d+)$/);
  if (m) return { caption: 'Caption, image ', image: 'Image ', logo: 'Logo ' }[m[1]] + m[2];
  return role;
}
const textOf = (e) => (e.role in tc().text) ? tc().text[e.role] : e.txt;

function renderContent() {
  const box = $('#content'); box.innerHTML = '';
  if (!complete()) { box.hidden = true; return; }
  box.hidden = false;
  const entry = currentEntry(), tpl = TEMPLATES[entry.name], edits = te(entry.name);
  box.append(el('div', { class: 'step-head' }, [el('span', { class: 'num' }, '5'), el('span', { class: 'label' }, 'Content')]));

  const texts = tpl.el.filter(e => e.k === 'text');
  const captions = texts.filter(e => e.role.startsWith('caption')).sort((a, b) => a.role.localeCompare(b.role));
  const main = texts.filter(e => !e.role.startsWith('caption')).sort(readingOrder);
  for (const e of main.concat(captions)) box.append(textField(tpl, e, edits));

  const imgs = tpl.el.filter(e => e.k === 'img').sort((a, b) => a.role.localeCompare(b.role));
  if (imgs.length) {
    const g = el('div', { class: 'field' }, [el('label', {}, imgs.length > 1 ? 'Images' : 'Image')]);
    for (const e of imgs) g.append(imageRow(e.role, roleLabel(e.role), false));
    g.append(el('p', { class: 'hint' }, 'You can also click an empty frame in the preview, or drag a photo onto it.'));
    box.append(g);
  }
  const logos = tpl.el.filter(e => e.k === 'logo');
  if (logos.length) {
    const g = el('div', { class: 'field' }, [el('label', {}, logos.length > 1 ? 'Logos' : 'Logo')]);
    for (const e of logos) g.append(imageRow(e.role, logos.length > 1 ? roleLabel(e.role) : 'Logo', true));
    g.append(el('p', { class: 'hint' }, 'SVG or PNG. Logos start centred in their frame.'));
    box.append(g);
  }
  updateUndo();
}

function textField(tpl, e, edits) {
  if (edits.hidden[e.role]) {
    return el('div', { class: 'field' }, [el('label', {}, roleLabel(e.role)),
      el('div', { class: 'img-row' }, [el('span', { class: 'img-name' }, el('span', { class: 'file muted' }, 'Deleted in Manual Edit')),
        el('button', { class: 'link', onclick: () => { pushHistory(); delete edits.hidden[e.role]; renderAll(); } }, 'Restore')])]);
  }
  const ov = edits.overrides[e.role];
  const val = textOf(e);
  const n = Engine.lineCount(tpl, e, val, ov);
  const over = n > e.max;
  const ta = el('textarea', { rows: Math.min(Math.max(e.max, 1), 4), spellcheck: 'true', 'data-role': e.role });
  ta.value = val;
  const unit = m => `${m === 1 ? 'line' : 'lines'}`;
  const count = el('span', { class: 'count' + (over ? ' over' : '') }, `${n} / ${e.max} ${unit(e.max)}`);
  const note = el('span', { class: 'note' }, over ? 'Too long for this layout — shorten to fit.' : '');
  ta.addEventListener('input', () => {
    const o = te(currentEntry().name).overrides[e.role];
    const lines = Engine.lineCount(tpl, e, ta.value, o);
    const prev = textOf(e);
    const prevLines = Engine.lineCount(tpl, e, prev, o);
    // at the limit, don't let invisible trailing spaces pile up either
    const spacesAtLimit = prevLines >= e.max && ta.value.length > prev.length && / {2,}$/.test(ta.value);
    if ((lines > e.max && lines > prevLines) || spacesAtLimit) {
      const pos = Math.max(0, ta.selectionStart - (ta.value.length - prev.length));
      ta.value = prev; ta.setSelectionRange(pos, pos);
      note.textContent = `Line limit reached — ${e.max} ${unit(e.max)} max.`;
      clearTimeout(ta._t); ta._t = setTimeout(() => { note.textContent = ''; }, 2400);
      return;
    }
    tc().text[e.role] = ta.value;
    count.textContent = `${lines} / ${e.max} ${unit(e.max)}`;
    count.classList.toggle('over', lines > e.max);
    if (lines <= e.max && note.textContent.startsWith('Too long')) note.textContent = '';
    renderPreview();
  });
  return el('div', { class: 'field' }, [
    el('label', {}, [roleLabel(e.role), e.up ? el('span', { class: 'case' }, ' (sets in capitals)') : null]),
    ta, el('div', { class: 'meta' }, [count, note]),
  ]);
}

function imageRow(role, label, isLogo) {
  const src = isLogo ? tc().logos : tc().images;
  const has = src[role];
  const input = el('input', { type: 'file', accept: isLogo ? '.svg,.png,image/svg+xml,image/png' : 'image/*', hidden: true });
  input.addEventListener('change', () => { if (input.files[0]) loadInto(role, input.files[0], isLogo); input.value = ''; });
  return el('div', { class: 'img-row' }, [
    el('span', { class: 'img-name' }, [el('span', {}, label), has ? el('span', { class: 'file' }, has.name) : el('span', { class: 'file muted' }, 'Placeholder')]),
    el('button', { class: 'link', onclick: () => input.click() }, has ? 'Replace' : 'Upload'),
    has ? el('button', { class: 'link', onclick: () => { pushHistory(); delete src[role]; renderAll(); } }, 'Remove') : null,
    input,
  ]);
}

async function fileToImage(file) {
  let url;
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    // give the SVG a pixel size so it draws crisply at any scale
    const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.nodeName.toLowerCase() !== 'svg') throw new Error('not svg');
    const vb = (svg.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    let w = parseFloat(svg.getAttribute('width')), h = parseFloat(svg.getAttribute('height'));
    if ((!w || !h) && vb.length === 4) { w = vb[2]; h = vb[3]; }
    if (w && h) { const k = 2400 / Math.max(w, h); svg.setAttribute('width', w * k); svg.setAttribute('height', h * k); }
    url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }));
  } else url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

async function loadInto(role, file, isLogo) {
  if (!file || !(/^image\//.test(file.type) || /\.svg$/i.test(file.name))) { setStatus('Please choose an image file.'); return; }
  if (isLogo && !/svg|png/i.test(file.type + file.name)) { setStatus('Logos need to be SVG or PNG.'); return; }
  try {
    const img = await fileToImage(file);
    pushHistory();
    const entry = currentEntry();
    (isLogo ? tc().logos : tc().images)[role] = { img, name: file.name };
    delete te(entry.name).adj[role];   // a new picture starts centred
    renderAll();
  } catch (err) { setStatus('That file could not be opened as an image.'); }
}

/* ---------- preview ---------- */
let lastLayout = [];
function renderPreview() {
  const entry = currentEntry();
  const c = $('#preview'), cap = $('#preview-caption');
  if (!entry) { c.hidden = true; $('#overlay').style.display = 'none'; cap.textContent = 'Choose a post type to begin.'; updateActions(); return; }
  c.hidden = false;
  const tpl = TEMPLATES[entry.name];
  const content = compose(entry);
  Engine.render(c, tpl, content, 1);
  lastLayout = Engine.layout(tpl, content);
  fitPreview();
  const missing = STEPS.filter(s => !state.sel[s.key]).map(s => s.label.toLowerCase());
  cap.textContent = missing.length
    ? `Preview — still to choose: ${missing.join(', ')}`
    : `${entry.type}  ·  ${SIZES[entry.size]} ${entry.size.replace('x', ' × ')}  ·  ${entry.style}  ·  ${entry.color}`;
  updateActions();
  drawOverlay();
}

function fitPreview() {
  const c = $('#preview'), wrap = c.parentElement, ov = $('#overlay');
  if (c.hidden || !c.width) return;
  const aw = wrap.clientWidth - 64, ah = wrap.clientHeight - 64;
  const s = Math.min(aw / c.width, ah / c.height);
  const w = Math.floor(c.width * s) + 'px', h = Math.floor(c.height * s) + 'px';
  c.style.width = w; c.style.height = h;
  ov.style.width = w; ov.style.height = h; ov.style.display = 'block';
  ov.setAttribute('viewBox', `0 0 ${c.width} ${c.height}`);
}
window.addEventListener('resize', () => { fitPreview(); drawOverlay(); });

/* Post-pixel coordinates of a pointer event. */
function toPost(evt) {
  const c = $('#preview'), r = c.getBoundingClientRect();
  return { x: (evt.clientX - r.left) / r.width * c.width, y: (evt.clientY - r.top) / r.height * c.height, k: c.width / r.width };
}

/* ---------- hit testing ---------- */
function frameBox(tpl, e, edits) { return edits.frames[e.role] || e.b; }
function logoBox(tpl, e, content) {
  const lg = content.logos[e.role];
  if (lg && lg.img) { const r = Engine.containRect(lg.img, e.b, lg); return r; }
  return e.b;
}
const inBox = (p, b, pad = 0) => p.x >= b[0] - pad && p.x <= b[0] + b[2] + pad && p.y >= b[1] - pad && p.y <= b[1] + b[3] + pad;

function itemsAt(p) {
  const entry = currentEntry(); if (!entry) return null;
  const tpl = TEMPLATES[entry.name], content = compose(entry), edits = te(entry.name);
  // text first (it sits on top), then logos, then loose squares, then image frames
  for (const it of lastLayout) {
    if (it.kind !== 'text' || !it.lines.length) continue;
    const bx = Engine.textBox(it);
    if (inBox(p, [bx.x, bx.y, bx.w, bx.h], 4 * p.k)) return { kind: 'text', role: it.el.role };
  }
  for (const e of tpl.el.filter(e => e.k === 'logo').reverse()) if (inBox(p, logoBox(tpl, e, content))) return { kind: 'logo', role: e.role };
  const imgs = tpl.el.filter(e => e.k === 'img');
  const covered = q => imgs.some(e => inBox(q, frameBox(tpl, e, edits)));
  for (let i = tpl.dots.length - 1; i >= 0; i--) {
    if (edits.deletedDots[i]) continue;
    const d = tpl.dots[i], cx = d[0] + d[2] / 2, cy = d[1] + d[3] / 2;
    const rad = Math.max(d[2], d[3]) / 2 + 6 * p.k;
    if (Math.abs(p.x - cx) <= rad && Math.abs(p.y - cy) <= rad && !covered({ x: cx, y: cy })) return { kind: 'dot', index: i };
  }
  for (const e of imgs.slice().reverse()) if (inBox(p, frameBox(tpl, e, edits))) return { kind: 'img', role: e.role };
  return null;
}

/* ---------- manual edit overlay ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
const sv = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

function selectionBox(sel) {
  const entry = currentEntry(); if (!entry || !sel) return null;
  const tpl = TEMPLATES[entry.name], content = compose(entry), edits = te(entry.name);
  if (sel.kind === 'img') { const e = tpl.el.find(x => x.role === sel.role); return frameBox(tpl, e, edits); }
  if (sel.kind === 'logo') { const e = tpl.el.find(x => x.role === sel.role); return logoBox(tpl, e, content); }
  if (sel.kind === 'text') { const it = lastLayout.find(i => i.kind === 'text' && i.el.role === sel.role); if (!it) return null; const b = Engine.textBox(it); return [b.x, b.y, b.w, b.h]; }
  if (sel.kind === 'dot') { const d = tpl.dots[sel.index]; return [d[0], d[1], d[2], d[3]]; }
  return null;
}

function handlesFor(sel, b) {
  if (!sel || !b) return [];
  const [x, y, w, h] = b, cx = x + w / 2, cy = y + h / 2;
  if (sel.kind === 'img') return [['nw', x, y], ['n', cx, y], ['ne', x + w, y], ['e', x + w, cy], ['se', x + w, y + h], ['s', cx, y + h], ['sw', x, y + h], ['w', x, cy]];
  if (sel.kind === 'logo') { const has = tc().logos[sel.role]; return has ? [['nw', x, y], ['ne', x + w, y], ['se', x + w, y + h], ['sw', x, y + h]] : []; }
  if (sel.kind === 'text') {
    const e = currentTemplate().el.find(x => x.role === sel.role);
    return e.al === 'C' ? [['w', x, cy], ['e', x + w, cy]] : [['e', x + w, cy]];
  }
  return [];
}

function drawOverlay() {
  const ov = $('#overlay'); ov.innerHTML = '';
  const tpl = currentTemplate();
  if (!tpl) return;
  const k = $('#preview').width / $('#preview').getBoundingClientRect().width;
  // margin guide
  ov.append(sv('rect', { x: tpl.m, y: tpl.m, width: tpl.w - 2 * tpl.m, height: tpl.h - 2 * tpl.m, class: 'guide', 'stroke-width': k }));
  const hb = state.hover && !(state.selected && sameItem(state.hover, state.selected)) ? selectionBox(state.hover) : null;
  if (hb) ov.append(sv('rect', { x: hb[0], y: hb[1], width: hb[2], height: hb[3], class: state.hover.kind === 'dot' ? 'hover dot' : 'hover', 'stroke-width': 1.5 * k }));
  const sb = selectionBox(state.selected);
  if (sb) {
    ov.append(sv('rect', { x: sb[0], y: sb[1], width: sb[2], height: sb[3], class: 'sel', 'stroke-width': 1.5 * k }));
    const hs = 9 * k;
    for (const [id, hx, hy] of handlesFor(state.selected, sb)) {
      ov.append(sv('rect', { x: hx - hs / 2, y: hy - hs / 2, width: hs, height: hs, class: 'handle', 'stroke-width': 1.5 * k, 'data-h': id }));
    }
  }
}
const sameItem = (a, b) => a && b && a.kind === b.kind && a.role === b.role && a.index === b.index;

function handleAt(p) {
  if (!state.selected) return null;
  const sb = selectionBox(state.selected);
  const r = 10 * p.k;
  for (const [id, hx, hy] of handlesFor(state.selected, sb)) if (Math.abs(p.x - hx) <= r && Math.abs(p.y - hy) <= r) return id;
  return null;
}

const CURSORS = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };

function wirePreview() {
  const ov = $('#overlay');
  const picker = el('input', { type: 'file', hidden: true });
  document.body.append(picker);
  const pick = (f) => {
    const isLogo = f.kind === 'logo';
    picker.accept = isLogo ? '.svg,.png,image/svg+xml,image/png' : 'image/*';
    picker.onchange = () => { if (picker.files[0]) loadInto(f.role, picker.files[0], isLogo); picker.value = ''; };
    picker.click();
  };

  ov.addEventListener('pointermove', e => {
    if (!currentEntry()) return;
    const p = toPost(e);
    if (state.drag) { dragMove(p); return; }
    const h = handleAt(p);
    if (h) { ov.style.cursor = CURSORS[h]; return; }
    const hit = itemsAt(p);
    state.hover = hit;
    ov.style.cursor = !hit ? 'default' : hit.kind === 'dot' ? 'not-allowed' : movable(hit) ? 'move' : 'pointer';
    drawOverlay();
  });
  ov.addEventListener('pointerleave', () => { if (!state.drag) { state.hover = null; drawOverlay(); } });

  ov.addEventListener('pointerdown', e => {
    if (!currentEntry()) return;
    const p = toPost(e);
    ov.setPointerCapture(e.pointerId);
    const h = handleAt(p);
    if (h) { startDrag(h === 'e' || h === 'w' ? (state.selected.kind === 'text' ? 'width' : 'frame') : state.selected.kind === 'logo' ? 'logo-scale' : 'frame', p, h); return; }
    const hit = itemsAt(p);
    if (hit && hit.kind === 'dot') {
      pushHistory(); te(currentEntry().name).deletedDots[hit.index] = true;
      state.hover = null; renderPreview(); renderManualPanel(); return;
    }
    state.selected = hit;
    renderManualPanel();
    if (hit && movable(hit)) startDrag(hit.kind === 'img' ? 'pan' : hit.kind === 'logo' ? 'logo-move' : 'text-move', p);
    drawOverlay();
    // an empty frame opens the file picker straight away
    if (hit && (hit.kind === 'img' || hit.kind === 'logo') && !movable(hit)) { try { ov.releasePointerCapture(e.pointerId); } catch (_) {} pick(hit); }
  });
  ov.addEventListener('pointerup', () => { if (state.drag) { state.drag = null; renderManualPanel(); } });
  ov.addEventListener('dblclick', e => {
    const hit = itemsAt(toPost(e));
    if (hit && (hit.kind === 'img' || hit.kind === 'logo')) pick(hit);
  });

  ov.addEventListener('wheel', e => {
    if (!state.selected) return;
    const s = state.selected;
    if ((s.kind === 'img' && tc().images[s.role]) || (s.kind === 'logo' && tc().logos[s.role])) {
      e.preventDefault();
      const cur = adjOf(s.role).zoom || 1;
      setZoom(s, cur * Math.exp(-e.deltaY * 0.0015), true);
    }
  }, { passive: false });

  ov.addEventListener('dragover', e => { const hit = itemsAt(toPost(e)); if (hit && (hit.kind === 'img' || hit.kind === 'logo')) { e.preventDefault(); ov.classList.add('drop'); } else ov.classList.remove('drop'); });
  ov.addEventListener('dragleave', () => ov.classList.remove('drop'));
  ov.addEventListener('drop', e => {
    e.preventDefault(); ov.classList.remove('drop');
    const hit = itemsAt(toPost(e));
    if (hit && (hit.kind === 'img' || hit.kind === 'logo') && e.dataTransfer.files[0]) loadInto(hit.role, e.dataTransfer.files[0], hit.kind === 'logo');
  });
}

function movable(hit) {
  if (hit.kind === 'img') return !!tc().images[hit.role];
  if (hit.kind === 'logo') return !!tc().logos[hit.role];
  if (hit.kind === 'text') { const e = currentTemplate().el.find(x => x.role === hit.role); return e && e.drag; }
  return false;
}

/* ---------- drags ---------- */
const adjOf = role => { const e = te(currentEntry().name); return e.adj[role] || (e.adj[role] = { zoom: 1, ox: 0, oy: 0 }); };

function startDrag(kind, p, handle) {
  const entry = currentEntry(), tpl = TEMPLATES[entry.name], edits = te(entry.name), s = state.selected;
  const d = { kind, handle, p0: p, pushed: false };
  if (kind === 'pan' || kind === 'logo-move' || kind === 'logo-scale') { const a = adjOf(s.role); d.a0 = { ...a }; }
  if (kind === 'logo-scale') { const b = selectionBox(s); d.c = [b[0] + b[2] / 2, b[1] + b[3] / 2]; d.r0 = Math.hypot(p.x - d.c[0], p.y - d.c[1]) || 1; }
  if (kind === 'frame') { const e = tpl.el.find(x => x.role === s.role); d.b0 = (edits.frames[s.role] || e.b).slice(); d.orig = e.b; }
  if (kind === 'width' || kind === 'text-move') { const e = tpl.el.find(x => x.role === s.role); d.o0 = { ...(edits.overrides[s.role] || {}) }; d.w0 = Engine.wrapWidth(tpl, e, edits.overrides[s.role]); d.el = e; }
  state.drag = d;
}

function commitOnce(d) { if (!d.pushed) { pushHistory(); d.pushed = true; } }

function dragMove(p) {
  const d = state.drag, entry = currentEntry(), tpl = TEMPLATES[entry.name], edits = te(entry.name), s = state.selected;
  const dx = p.x - d.p0.x, dy = p.y - d.p0.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.5) return;
  commitOnce(d);
  if (d.kind === 'pan') {
    const a = adjOf(s.role); a.ox = d.a0.ox + dx; a.oy = d.a0.oy + dy;
    const e = tpl.el.find(x => x.role === s.role);
    Engine.clampPan(tc().images[s.role].img, frameBox(tpl, e, edits), a);
  } else if (d.kind === 'logo-move') {
    const a = adjOf(s.role); a.ox = d.a0.ox + dx; a.oy = d.a0.oy + dy;
    clampLogo(tpl, s.role, a);
  } else if (d.kind === 'logo-scale') {
    const r = Math.hypot(p.x - d.c[0], p.y - d.c[1]);
    const a = adjOf(s.role); a.zoom = Math.max(0.15, Math.min(4, d.a0.zoom * r / d.r0));
    clampLogo(tpl, s.role, a);
  } else if (d.kind === 'frame') {
    resizeFrame(tpl, edits, s.role, d, dx, dy);
  } else if (d.kind === 'width') {
    const e = d.el;
    const delta = d.handle === 'w' ? -dx : dx;
    let w = d.w0 + (e.al === 'C' ? 2 * delta : delta);
    const cx = e.b[0] + e.b[2] / 2 + (d.o0.dx || 0);
    const x = e.b[0] + (d.o0.dx || 0);
    const maxW = e.al === 'C' ? 2 * Math.min(cx - tpl.m, tpl.w - tpl.m - cx) : tpl.w - tpl.m - x;
    const minW = Math.min(d.w0, Engine.wrapWidth(tpl, e, null)) * 0.5;
    w = Math.max(minW, Math.min(maxW, w));
    const o = { ...d.o0, w };
    if (Engine.lineCount(tpl, e, textOf(e), o) <= e.max) edits.overrides[s.role] = o;
    else setStatus(`That width would push ${roleLabel(e.role).toLowerCase()} past ${e.max} ${e.max === 1 ? 'line' : 'lines'}.`);
  } else if (d.kind === 'text-move') {
    const o = { ...d.o0, dx: (d.o0.dx || 0) + dx, dy: (d.o0.dy || 0) + dy };
    edits.overrides[s.role] = o;
    // keep the block inside the margins
    const content = compose(entry);
    const it = Engine.layout(tpl, content).find(i => i.kind === 'text' && i.el.role === s.role);
    const bx = Engine.textBox(it);
    let fx = 0, fy = 0;
    if (bx.x < tpl.m) fx = tpl.m - bx.x; else if (bx.x + bx.inkW > tpl.w - tpl.m) fx = tpl.w - tpl.m - bx.x - bx.inkW;
    if (bx.y < tpl.m) fy = tpl.m - bx.y; else if (bx.y + it.h > tpl.h - tpl.m) fy = tpl.h - tpl.m - bx.y - it.h;
    o.dx += fx; o.dy += fy;
  }
  renderPreview();
}

function clampLogo(tpl, role, a) {
  const e = tpl.el.find(x => x.role === role);
  const lg = tc().logos[role]; if (!lg) return;
  const r = Engine.containRect(lg.img, e.b, { zoom: a.zoom });
  const cx0 = e.b[0] + e.b[2] / 2, cy0 = e.b[1] + e.b[3] / 2;
  // the logo stays fully inside the margins
  const minX = tpl.m + r[2] / 2 - cx0, maxX = tpl.w - tpl.m - r[2] / 2 - cx0;
  const minY = tpl.m + r[3] / 2 - cy0, maxY = tpl.h - tpl.m - r[3] / 2 - cy0;
  a.ox = minX > maxX ? (minX + maxX) / 2 : Math.max(minX, Math.min(maxX, a.ox));
  a.oy = minY > maxY ? (minY + maxY) / 2 : Math.max(minY, Math.min(maxY, a.oy));
}

function resizeFrame(tpl, edits, role, d, dx, dy) {
  let [x, y, w, h] = d.b0;
  const o = d.orig, m = tpl.m, MIN = 80;
  // a side can reach the margin, or stay as far out as the original design already went
  const L = Math.min(o[0], m), T = Math.min(o[1], m), R = Math.max(o[0] + o[2], tpl.w - m), B = Math.max(o[1] + o[3], tpl.h - m);
  let x2 = x + w, y2 = y + h;
  const H = d.handle;
  if (H.includes('w')) x = Math.max(L, Math.min(x2 - MIN, x + dx));
  if (H.includes('e')) x2 = Math.min(R, Math.max(x + MIN, x2 + dx));
  if (H.includes('n')) y = Math.max(T, Math.min(y2 - MIN, y + dy));
  if (H.includes('s')) y2 = Math.min(B, Math.max(y + MIN, y2 + dy));
  edits.frames[role] = [x, y, x2 - x, y2 - y];
  const img = tc().images[role];
  if (img) Engine.clampPan(img.img, edits.frames[role], adjOf(role));
}

function setZoom(s, z, live) {
  const entry = currentEntry(), tpl = TEMPLATES[entry.name], edits = te(entry.name);
  const a = adjOf(s.role);
  if (!live || !state._zoomPushed) { pushHistory(); state._zoomPushed = true; clearTimeout(state._zt); }
  state._zt = setTimeout(() => { state._zoomPushed = false; }, 400);
  if (s.kind === 'img') {
    const k = Math.max(1, Math.min(4, z)) / (a.zoom || 1);
    a.zoom = Math.max(1, Math.min(4, z)); a.ox *= k; a.oy *= k;
    const e = tpl.el.find(x => x.role === s.role);
    Engine.clampPan(tc().images[s.role].img, frameBox(tpl, e, edits), a);
  } else {
    a.zoom = Math.max(0.15, Math.min(4, z));
    clampLogo(tpl, s.role, a);
  }
  renderPreview(); syncSliders();
}

/* ---------- manual edit panel ---------- */
function renderManualPanel() {
  const box = $('#manual-panel');
  box.innerHTML = '';
  box.hidden = !currentEntry();
  if (box.hidden) return;
  const entry = currentEntry(), tpl = TEMPLATES[entry.name], edits = te(entry.name), s = state.selected;
  box.append(el('div', { class: 'manual-head' }, [
    el('span', { class: 'label' }, 'Manual Edit'),
    el('button', { class: 'link', 'data-undo': '', onclick: undo, title: '⌘Z / Ctrl+Z' }, 'Undo'),
    s ? el('button', { class: 'link', onclick: () => { state.selected = null; renderManualPanel(); drawOverlay(); } }, 'Deselect') : null,
  ]));

  const tips = [];
  if (tpl.el.some(e => e.k === 'img')) tips.push('Photos: select a frame, drag to reposition the photo, scroll or use the slider to zoom. Drag the handles to resize the frame.');
  if (tpl.el.some(e => e.k === 'text' && !e.drag)) tips.push('Text: select it and drag the side handle to change the line length. Text never crosses the margins.');
  if (tpl.el.some(e => e.drag)) tips.push('The year and the subhead can be dragged anywhere inside the margins, or deleted.');
  if (tpl.el.some(e => e.k === 'logo')) tips.push('Logos: drag to move, use the arrow keys to nudge (Shift for 10px), drag a corner to scale.');
  if (tpl.dots.length) tips.push('Squares: click any square to remove it.');
  const how = el('details', { class: 'tips' }, [el('summary', {}, 'How to edit this layout'), el('ul', {}, tips.map(t => el('li', {}, t)))]);
  how.open = !!state.tipsOpen;
  how.addEventListener('toggle', () => { state.tipsOpen = how.open; });
  box.append(how);

  const ctl = el('div', { class: 'ctl' });
  if (!s) ctl.append(el('p', { class: 'hint' }, 'Click anything in the preview to adjust it.'));
  else if (s.kind === 'img') {
    const has = tc().images[s.role];
    ctl.append(el('div', { class: 'ctl-title' }, roleLabel(s.role)));
    if (has) ctl.append(slider('Photo zoom', 100, 400, Math.round((adjOf(s.role).zoom || 1) * 100), v => setZoom(s, v / 100, true), 'img-zoom'));
    else ctl.append(el('p', { class: 'hint' }, 'Upload a photo to reposition or zoom it. Double-click the frame to upload.'));
    ctl.append(el('div', { class: 'row' }, [
      has ? el('button', { class: 'link', onclick: () => { pushHistory(); const a = adjOf(s.role); a.ox = 0; a.oy = 0; a.zoom = 1; renderPreview(); syncSliders(); } }, 'Reset photo') : null,
      edits.frames[s.role] ? el('button', { class: 'link', onclick: () => { pushHistory(); delete edits.frames[s.role]; if (has) Engine.clampPan(has.img, tpl.el.find(x => x.role === s.role).b, adjOf(s.role)); renderPreview(); renderManualPanel(); } }, 'Reset frame size') : null,
    ]));
  } else if (s.kind === 'logo') {
    const has = tc().logos[s.role];
    ctl.append(el('div', { class: 'ctl-title' }, tpl.el.filter(e => e.k === 'logo').length > 1 ? roleLabel(s.role) : 'Logo'));
    if (has) {
      ctl.append(slider('Logo size', 15, 400, Math.round((adjOf(s.role).zoom || 1) * 100), v => setZoom(s, v / 100, true), 'logo-zoom'));
      ctl.append(el('div', { class: 'row' }, [
        el('button', { class: 'link', onclick: () => { pushHistory(); const a = adjOf(s.role); a.ox = 0; a.oy = 0; renderPreview(); } }, 'Re-center'),
        el('button', { class: 'link', onclick: () => { pushHistory(); const a = adjOf(s.role); a.zoom = 1; clampLogo(tpl, s.role, a); renderPreview(); syncSliders(); } }, 'Reset size'),
      ]));
    } else ctl.append(el('p', { class: 'hint' }, 'Upload a logo to move or scale it. Double-click the frame to upload.'));
  } else if (s.kind === 'text') {
    const e = tpl.el.find(x => x.role === s.role), o = edits.overrides[s.role] || {};
    ctl.append(el('div', { class: 'ctl-title' }, roleLabel(s.role)));
    ctl.append(el('div', { class: 'row' }, [
      o.w ? el('button', { class: 'link', onclick: () => { pushHistory(); const n = { ...o }; delete n.w; if (Engine.lineCount(tpl, e, textOf(e), n) > e.max) { setStatus('Shorten the text first — it needs the wider line.'); edits.overrides[s.role] = o; return; } edits.overrides[s.role] = n; renderPreview(); renderManualPanel(); } }, 'Reset line length') : null,
      e.drag && (o.dx || o.dy) ? el('button', { class: 'link', onclick: () => { pushHistory(); edits.overrides[s.role] = { ...o, dx: 0, dy: 0 }; renderPreview(); renderManualPanel(); } }, 'Reset position') : null,
      e.del ? el('button', { class: 'link', onclick: () => deleteText(s.role) }, 'Delete') : null,
    ]));
    if (!o.w && !(e.drag && (o.dx || o.dy)) && !e.del) ctl.append(el('p', { class: 'hint' }, 'Drag the handle on the side to change the line length.'));
  }
  box.append(ctl);

  const extras = [];
  const hidden = Object.keys(edits.hidden);
  for (const r of hidden) extras.push(el('div', { class: 'row' }, [el('span', {}, `${roleLabel(r)} deleted`), el('button', { class: 'link', onclick: () => { pushHistory(); delete edits.hidden[r]; renderAll(); } }, 'Restore')]));
  const nd = Object.keys(edits.deletedDots).length;
  if (nd) extras.push(el('div', { class: 'row' }, [el('span', {}, `${nd} ${nd === 1 ? 'square' : 'squares'} removed`), el('button', { class: 'link', onclick: () => { pushHistory(); edits.deletedDots = {}; renderPreview(); renderManualPanel(); } }, 'Restore all')]));
  const anyEdits = Object.keys(edits.frames).length || Object.keys(edits.overrides).length || hidden.length || nd || Object.keys(edits.adj).length;
  if (anyEdits) extras.push(el('div', { class: 'row' }, [el('button', { class: 'link', onclick: resetAllEdits }, 'Reset all manual edits')]));
  if (extras.length) box.append(el('div', { class: 'ctl extras' }, extras));
  updateUndo();
}

function slider(label, min, max, val, on, id) {
  const out = el('span', { class: 'val' }, val + '%');
  const r = el('input', { type: 'range', min, max, value: val, 'data-slider': id });
  r.addEventListener('input', () => { out.textContent = r.value + '%'; on(+r.value); });
  return el('label', { class: 'slider' }, [el('span', {}, label), r, out]);
}
function syncSliders() {
  const s = state.selected; if (!s) return;
  const v = Math.round((adjOf(s.role).zoom || 1) * 100);
  document.querySelectorAll('[data-slider]').forEach(r => { r.value = v; r.nextSibling.textContent = v + '%'; });
}

function deleteText(role) {
  pushHistory();
  te(currentEntry().name).hidden[role] = true;
  state.selected = null;
  renderAll();
}
function resetAllEdits() {
  pushHistory();
  const name = currentEntry().name;
  tplEdits[name] = { frames: {}, overrides: {}, hidden: {}, deletedDots: {}, adj: {} };
  state.selected = null;
  renderAll();
}


/* ---------- keyboard ---------- */
document.addEventListener('keydown', e => {
  const typing = /^(TEXTAREA|INPUT)$/.test(document.activeElement && document.activeElement.tagName) && document.activeElement.type !== 'range';
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); undo(); return; }
  if (typing || !currentEntry()) return;
  const s = state.selected;
  if (e.key === 'Escape') { state.selected = null; renderManualPanel(); drawOverlay(); return; }
  if (!s) return;
  if ((e.key === 'Backspace' || e.key === 'Delete') && s.kind === 'text') {
    const el0 = currentTemplate().el.find(x => x.role === s.role);
    if (el0.del) { e.preventDefault(); deleteText(s.role); }
    return;
  }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && (s.kind === 'logo' && tc().logos[s.role] || s.kind === 'text' && movable(s))) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1, [ax, ay] = arrows[e.key];
    if (!e.repeat || !state._nudged) { pushHistory(); state._nudged = true; }
    clearTimeout(state._nt); state._nt = setTimeout(() => { state._nudged = false; }, 500);
    if (s.kind === 'logo') { const a = adjOf(s.role); a.ox += ax * step; a.oy += ay * step; clampLogo(currentTemplate(), s.role, a); renderPreview(); }
    else {
      const p0 = { x: 0, y: 0 }; startDrag('text-move', p0); state.drag.pushed = true;
      dragMove({ x: ax * step, y: ay * step }); state.drag = null;
    }
  }
});

/* ---------- actions ---------- */
function setStatus(msg) { $('#status').textContent = msg || ''; clearTimeout(setStatus._t); if (msg) setStatus._t = setTimeout(updateActions, 4000); }

function updateActions() {
  const ok = complete();
  $('#export').disabled = !ok;
  updateUndo();
  if (!ok) { $('#status').textContent = ''; return; }
  const entry = currentEntry(), tpl = TEMPLATES[entry.name], edits = te(entry.name);
  const empty = tpl.el.filter(e => e.k === 'img' && !tc().images[e.role]).length;
  const noLogo = tpl.el.filter(e => e.k === 'logo' && !tc().logos[e.role]).length;
  const over = tpl.el.filter(e => e.k === 'text' && !edits.hidden[e.role] && Engine.lineCount(tpl, e, textOf(e), edits.overrides[e.role]) > e.max).length;
  const parts = [];
  if (empty) parts.push(`${empty} image ${empty === 1 ? 'frame is' : 'frames are'} still a placeholder`);
  if (noLogo) parts.push(`${noLogo} logo ${noLogo === 1 ? 'frame is' : 'frames are'} still a placeholder`);
  if (over) parts.push(`${over} text ${over === 1 ? 'field is' : 'fields are'} too long`);
  $('#status').textContent = parts.length ? 'Note: ' + parts.join('; ') + '.' : '';
}

function exportPNG() {
  const entry = currentEntry(); if (!entry || !complete()) return;
  const c = document.createElement('canvas');
  Engine.render(c, TEMPLATES[entry.name], compose(entry), 1);
  const name = ['ParkerInstitute', entry.type, SIZES[entry.size], entry.style, entry.color].join('_').replace(/\s+/g, '') + '.png';
  c.toBlob(async blob => {
    if (hostDownloads) {
      // inside a claude.ai preview: the viewer confirms the save
      try { await hostDownloads.save({ filename: name, data: blob }); setStatus('Saved ' + name); }
      catch (err) { setStatus(err && err.code === 'declined' ? 'Export cancelled.' : 'Export is not available in this view.'); }
      return;
    }
    const a = el('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

let hostDownloads = null;
if (window.claude && typeof window.claude.use === 'function') {
  window.claude.use('downloads').then(d => { hostDownloads = d; }).catch(() => {});
}

function renderAll() { renderSteps(); renderManualPanel(); renderContent(); renderPreview(); }

async function boot() {
  const faces = ['800 20px "PI Hex XCond"', '800 20px "PI Hex"', '300 20px "PI Hex"', '400 20px "PI Caslon"'];
  await Promise.all(faces.map(f => document.fonts.load(f)));
  $('#export').addEventListener('click', exportPNG);
  $('#undo').addEventListener('click', undo);
  wirePreview();
  renderAll();
  document.body.classList.add('ready');
}
boot();
