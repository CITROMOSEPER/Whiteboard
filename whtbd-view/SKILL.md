---
name: whtbd-view
description: Look at a Whiteboard board file. Use whenever the user shares, uploads or mentions a .whtbd file (or a PNG/JPEG/WebP/BMP/SVG/PDF exported from the Whiteboard app, which carries the board inside it) and you need to see or describe what is drawn on it, check how it renders, or read its texts. Renders it to a PNG you can view with Read, and prints a summary of its contents.
---

# Viewing a Whiteboard board

**Whiteboard** (https://citromoseper.github.io/Whiteboard/, source at github.com/CITROMOSEPER/Whiteboard, author Nemes Dániel) is a browser whiteboard app. Its boards are saved as `.whtbd` files. They are JSON, but the drawing is a list of point coordinates, so you can't see it by reading the text. Render it instead.

## Render it

```bash
python ~/.claude/skills/whtbd-view/render.py "path/to/board.whtbd"
```

Then **Read the PNG it names** (`PNG: ...`) to see the board, **and Read every close-up it lists** (`Close-up N ...: path`). By default the PNGs are written next to the board as `NAME.render.png` and `NAME.render.detail-N.png`. If that folder isn't yours to write into (an upload, the user's gallery), pass `--out` with a path in your scratchpad; the close-ups go beside it.

**Why the close-ups matter.** The board is infinite and zoomable, so people often write things very small: a note while zoomed far in, a typed text at size 0.4. In the overview these are a few pixels, a "speck", and easy to miss or misread. The script groups strokes and texts that belong together (a word, a line of writing, a drawing) and lists every group with its position and its size in pixels in the overview. Every group smaller than 60 px is marked `<< SMALL` and gets its own zoomed-in close-up. Don't describe a board until you have looked at all of them. If more small groups are listed than close-ups were made (at most 12), render the rest with `--region`.

The script also prints a summary: the title and dates, how many of each kind of object, snapped shapes, colours, line types, every typed text (its words, even when tiny), and the pictures. Handwriting is only strokes, so it shows up only in the pictures.

Options:
- `--out FILE.png`: where to write the PNG.
- `--px 1600`: the longest side in pixels. Use 2400–4000 to read small handwriting.
- `--region X,Y,W,H`: zoom into one area, in the board's own units. The summary prints the content bounds to help you pick a box.
- `--saved-view`: roughly what the user last had on screen (the board's saved view in a 1440×900 window).
- `--bg auto|white|dark|none|#rrggbb`: the background. `auto` uses white, or the app's dark theme colour `#1c1c1e` when most of the ink is light.
- `--small 60` and `--max-details 12`: the size below which a group gets a close-up, and the most close-ups to make.
- `--json`: also print the board's JSON, with picture data cut short.

**Exports work too.** Every PNG, JPEG, WebP, BMP, SVG or PDF the app exports carries the whole board inside it (`WHTBD-DATA:...:END`). Pass such a file instead of a `.whtbd` and the script renders the embedded board. If the file carries none, the script says so. A plain picture can simply be Read directly.

## How it works and what it needs

The script loads the app's own drawing code (`js/geometry.js` and `js/io.js`) into headless Chrome or Edge through Playwright, so the picture matches the app. It takes that code from a local checkout of the app when it finds one: the folder in `WHITEBOARD_REPO`, `~/Documents/PROJECTS/Whiteboard app`, or the current folder. Otherwise it tries, in turn: downloading from the live site, downloading from raw.githubusercontent.com, and a shallow `git clone` of github.com/CITROMOSEPER/Whiteboard into the temp folder (reused next time). Sandboxes often block some of these hosts. If all of them fail, it says so; clone the repository any way that works and set `WHITEBOARD_REPO` to it.

It needs Python with `playwright` (`pip install playwright`) and Chrome or Edge installed. If neither browser is there, run `python -m playwright install chromium`. The summary is printed before rendering starts, so you still get the contents if the browser fails.

## The file format, in case you need to read or edit it

```json
{ "format": "WHTBD", "version": 1, "title": "...", "created": "ISO date", "modified": "ISO date",
  "view": { "x": 0, "y": 0, "zoom": 1 },
  "pages": [ { "x": 0, "y": 0, "w": 793.7, "h": 1122.52, "src": "data:image/jpeg;base64,..." } ],
  "strokes": [ ...objects, painted in order, later on top... ] }
```

`pages` is present only on a **sheet**: a board with a fixed paper size (from New sheet…, in CSS pixels at 96 per inch, so A4 is 793.7 × 1122.52), or a PDF opened as a sheet, where each page carries `src`, a picture of that PDF page. Pages lie beneath all the ink. Exports keep only what is on the pages; the app tints the area around them, and the script draws page edges in grey. Drawing outside the pages is scrap space, but it is still part of the board.

Coordinates are board units, with y pointing down. `view.x/y` is the top-left of the screen and `zoom` is pixels per unit. Object kinds (`tool`):

- **pen**: `color`, `width`, `opacity`, `smooth` (drawn as a curve), `closed`, `points: [[x,y],...]`. Optional `shape` (`line`, `circle`, `rectangle`, `polygon` and so on, for strokes that snapped to a clean shape) and `dash` (`dotted`, `dashed`, `long`, `dashdot`). Optional `"highlight": true` for a highlighter stroke: flat square tip, see-through, painted *beneath* everything drawn before it. Optional `pressure: [0-100 per point]`: drawn with a stylus with pressure on; the line is `width` wide at full pressure and thinner where the pen pressed lightly.
- **eraser**: `width`, `points`. It cuts away the ink painted before it.
- **text**: `x`, `y` (the top-left anchor), `rot` (degrees, clockwise, turned about the anchor), `font` (`sans`, `serif`, `mono`, `rounded`, `hand`), `size`, `color`, `opacity`, `text` (may contain newlines).
- **image**: `x`, `y`, `w`, `h`, `rot` (degrees, about the centre), `opacity`, `src` (a base64 data URL).
- **fill**: a colour poured into a shape. `color`, `opacity`, `under` (painted beneath the lines), `rings: [[[x,y],...],...]` (even-odd, so holes are allowed).

The app's gallery saves boards as `.whtbd` files in a `Whiteboard gallery` folder. Stickers are boards too, with the extension `.wbsticker`, in a `Whiteboard stickers` folder; render them the same way. Gallery backups (`.wbgallery`, `.wbstickers`) are JSON bundles of many boards (`{"format": "WHTBD-GALLERY", "entries": [{"path": "folder/Board.whtbd", "text": "<board JSON>"}, ...]}`). Pass a backup to the script and it lists the boards inside. Then add `--entry PART_OF_ITS_PATH` to render one of them.
