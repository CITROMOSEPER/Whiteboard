# Whiteboard

A fast, free, open source whiteboard that runs entirely in your browser.

Built because Microsoft Whiteboard was clunky, slow, and then discontinued. Whiteboard borrows the best ideas from Procreate (shape snapping, drag-to-fill colors, a proper color picker with a pipette) and wraps them in a clean, Apple-style glass interface that feels smooth and professional.

No account. No server. No dependencies. No build step required to hack on it.

---

## Features

### Drawing
- **Pen and eraser** with adjustable thickness and opacity, with a live brush preview
- **Hold to snap shapes**: pause at the end of a stroke and it turns into a clean line, circle, or polygon
- **Adjustable snap delay** and **stroke smoothing** (off by default, so strokes stay exactly as you drew them)
- **Infinite canvas**: pinch, scroll, or drag to move around, with zoom and fit-to-content
- **Stylus mode**: turn off finger drawing so only a pen draws and one finger pans the board

### Color
- **Drag a color out of the dock into a closed shape to fill it**, with a paint-flow animation
- Fills are traced back into **vector outlines**, so they stay part of the document and export cleanly to SVG and PDF
- **Full color picker** with a saturation/brightness map, hue slider, and HEX, RGB, or HSL fields
- **Pipette with a magnifying loupe** to pick any color from the board

### Text and selection
- Text tool with font, size, and color controls in a floating format bar
- Select tool for moving and deleting objects
- Unlimited undo and redo

### Files and export
- **Save and open** boards as `.whtbd` files
- **Export** to PNG, JPEG, WebP, BMP, SVG, or PDF
- Pick 1x, 2x, or 4x resolution for raster formats
- Choose a board, white, or transparent background

### Look and feel
- Light, dark, or system theme, with no flash on load
- Canvas color: dark, light, follow theme, or any custom color
- Plain, dotted, or grid canvas background
- Translucent glass toolbars, smooth animations, and tooltips with shortcuts

### Works anywhere
- **Installable** as a PWA on desktop and mobile
- **Offline support** through a service worker (network first, so you always get the newest version when online)
- Ships as a **single self-contained HTML file** you can open by double-clicking

---

## Getting started

### Option 1: Use the single file
1. Run the build (see below) or grab `Whiteboard.html` from the releases page.
2. Double-click it. That is all.

### Option 2: Host it as a website
Upload the contents of `dist/web/` to any HTTPS host. Browsers will offer to install it, and it keeps working offline after the first visit.

### Option 3: Run from source
Serve the project folder with any static server, for example:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`. A server is needed in this mode because the service worker and manifest do not work from `file://`.

---

## Build

Requires Python 3 only. There are no packages to install.

```bash
python build.py
```

This produces:

| Output | Description |
| --- | --- |
| `dist/Whiteboard.html` | One self-contained file. No server or internet needed. |
| `dist/web/` | The same app as an installable, offline-capable website. |

---

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Pen | `P` |
| Eraser | `E` |
| Text | `T` |
| Select | `V` |
| Move | `H` (or hold `Space`) |
| Undo | `Ctrl Z` |
| Redo | `Ctrl Shift Z` |
| Open | `Ctrl O` |
| Save | `Ctrl S` |
| Export | `Ctrl E` |
| Zoom in / out | `Ctrl +` / `Ctrl -` |
| Actual size | `Ctrl 0` |
| Fit to content | `Ctrl 1` |

On macOS, use `Cmd` in place of `Ctrl`.

---

## Project structure

```
.
├── index.html              App shell and all UI markup
├── styles.css              Glass UI, themes, layout
├── manifest.webmanifest    PWA manifest
├── sw.js                   Service worker (offline support)
├── build.py                Bundles everything for shipping
├── icons/                  App icons
└── js/
    ├── geometry.js         Shape math and stroke helpers
    ├── io.js               Save, open, and export (PNG, SVG, PDF, ...)
    ├── fill.js             Flood fill traced into vector outlines
    ├── picker.js           Color picker and pipette loupe
    └── app.js              Tools, input, rendering, and UI wiring
```

---

## Contributing

Issues and pull requests are welcome. The project is plain HTML, CSS, and JavaScript, so there is no toolchain to set up. Edit a file, refresh the page, and you are testing.

Ideas for where to help:
- More shapes for the snap recognizer
- More export options
- Touch and stylus testing on different devices
- Translations

---

## Author

Nemes Dániel
