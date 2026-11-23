# Parker Institute — LinkedIn Post Generator

A single-page tool for making on-brand LinkedIn posts. Pick a layout, replace the words and images, adjust if needed, and export a PNG at full LinkedIn size.

**Live tool:** https://reedsmith-pentagram.github.io/Parker-Institute-LinkedIn/

Everything runs in the browser. Nothing is uploaded anywhere: photos and logos stay on the person's computer.

## Using it

1. **Post type:** Single Image, Multi Image, Solo Logo, Horizontal Logos or Vertical Logos.
2. **Size:** Square 1080 × 1080, Portrait 1080 × 1350 or Landscape 1200 × 627.
3. **Pattern:** Dots, Circles or Plain.
4. **Color:** Purple, Black (and Black ALT for Solo Logo) or Tan.
5. **Content:** type into each field and add images and logos. Click an empty frame in the preview, drag a file onto it, or use Upload.

Only combinations that exist in the design are offered. Words and images carry over when you change size, pattern or color within a post type.

### Text

- Text at the bottom of a layout grows upward, so its last line stays on the baseline and the text above moves up with it. Text at the top grows downward. Captions grow downward from their first line.
- Each field has a line limit, shown under it. Typing stops at the limit.

### Manual edits (always on)

Click anything in the preview:

- **Photos:** drag to reposition, scroll or use the slider to zoom, and drag the handles to resize the frame. Photos always fill their frame and are never stretched.
- **Text:** drag the side handle to change the line length. Text never crosses the margins or goes over its line limit.
- **Multi Image year and subhead:** drag them anywhere inside the margins, or delete them (Delete key).
- **Logos:** drag to move, use the arrow keys to nudge (Shift for 10px), and drag a corner to scale proportionally. *Re-center* puts the logo back in the middle.
- **Squares (Dots pattern):** click a square to remove it. *Restore all* brings them back.
- **Undo:** the Undo button or ⌘Z / Ctrl+Z, repeatable.

Manual edits are kept separately for each size.

### Export

**Export PNG** saves the post at full size, named like `ParkerInstitute_SingleImage_Square_Plain_Tan.png`.

## How it's built

| Path | What it is |
|---|---|
| `docs/index.html` | The built tool: one self-contained file with the fonts and layouts inlined. GitHub Pages serves this. It also works offline if opened directly. |
| `templates.json` | All 50 layouts, taken from the Figma file: positions, type styles, image and logo frames, and the dot and circle patterns. |
| `src/engine.js` | Draws a layout onto a canvas. It matches Figma's text metrics (including vertical trim), wraps text, and anchors the text blocks. |
| `src/app.js` | The interface: selection steps, content fields, manual edits, undo and export. |
| `src/index.html` | Page shell and styles. |
| `fonts/` | HEX Franklin (X Condensed Extrabold, Extrabold, Light) and Caslon Ionic Regular. |
| `build.py` | Combines the above into `docs/index.html`: `python3 build.py`. |

### Source design

The layouts come from the Figma file's **LinkedIn Templates** page. Artboards are named `size_post type_color_pattern`, e.g. `1080x1350_Single Image_Tan_Plain`. Editable layers are named by role, how they grow, and their line limit, e.g. `subhead · bottom-stack · max 4`, `caption-2 · top · max 2`, `image-1`, `logo-1`, `divider`. Each artboard's margin is its layout grid.

To change a layout, edit it in Figma, then ask Claude to re-extract `templates.json` and rebuild.

## Hosting

GitHub Pages: **Settings → Pages → Deploy from a branch → `main` / `/docs`**. Changes pushed to `main` go live within a couple of minutes.
