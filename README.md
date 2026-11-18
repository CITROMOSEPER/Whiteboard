# Whiteboard

**Open it here: https://citromoseper.github.io/Whiteboard/**

Tutorials and an overview: **https://citromoseper.github.io/Whiteboard-site/**

A fast, free whiteboard for pen, touch and mouse that runs in your browser. Nothing to download, no account. It borrows the best ideas from Procreate (shapes that snap clean, colours you drag into a shape to fill it) and wraps them in a calm, glass-style interface.

**New: AI for handwriting.** Select what you wrote and tidy it into typed text with proper maths, solve an equation with the steps shown, or turn a function into a graph you can explore. It uses your own API key, which [never leaves your device](#your-api-key-is-safe).

It works on computers, tablets and phones, in 14 languages, and keeps working offline once it has been opened. Your browser may offer to **install** it (an app icon and its own window); that is optional.

---

## Contents

- [Drawing](#drawing)
- [Text and handwriting](#text-and-handwriting)
- [Selecting and changing things](#selecting-and-changing-things)
- [AI: tidy up, solve, plot](#ai-tidy-up-solve-plot)
- [Pictures](#pictures)
- [Sheets and PDFs](#sheets-and-pdfs)
- [Stickers](#stickers)
- [Moving around](#moving-around)
- [Your files](#your-files)
- [Device notes: iPhone, iPad and Mac](#device-notes-iphone-ipad-and-mac)
- [Troubleshooting](#troubleshooting)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Showing a board to Claude](#showing-a-board-to-claude)

---

## Drawing

The dock at the bottom holds the tools and colours; the panel on the left sets the brush.

- **Pen and eraser.** Drag the left sliders to set **thickness** and **opacity**; a preview shows the result.
- **Erasing stays with what you erased.** Erase part of a line and that part is gone from the line itself: move, resize, turn or duplicate the line and the erased part goes with it (a copy is erased the same way), and it never uncovers or hides anything else. Erase a line completely and it is removed. Selecting only needs the part that is left: tap it, or loop around just the visible part.
- **Highlighter.** The tool after the pen draws wide, see-through strokes with a flat tip, in neon colours (the dock shows its own colour set while it is chosen). It always slides **under** what is already drawn, so the writing you mark stays crisp.
- **Pressure.** Turn on **Settings → Pressure sensitivity** and pressing harder with a stylus makes thicker lines. It is off by default: then every line keeps the thickness you set. It only works with a stylus that reports pressure (Apple Pencil, most Windows pens); a mouse or finger always draws evenly.
- **Laser pointer.** The tool at the end of the tools shows a glowing red dot with a short trail that follows your pen, finger or mouse, for presenting. Nothing is drawn; dragging moves the board, like the hand tool. On a [live board](#share-links), everyone sees everyone's pointer, each in its own colour.
- **Line type.** The button under the opacity slider picks solid, dotted, dashed, long dashes, or dash and dot.
- **Snap to a shape.** Hold still for a moment at the end of a stroke and it becomes a clean line, circle, ellipse, triangle, square, rectangle or polygon. Keep holding to turn and resize it; put **another finger** down (or hold **Shift**) to snap its angle to 45° steps.
- **Fill a shape.** Drag a colour out of the dock and drop it inside a closed shape. A dashed outline counts as closed too. Fills work the same at any zoom.
- **Recolour.** Drop a colour from the dock onto a line, a text or a fill to change its colour (a dashed line stays dashed).
- **Scratch out.** Quickly scribble back and forth over something, like crossing out a mistake on paper, and it is deleted; **Undo** appears at the bottom. Turn it off in **Settings → Scratch out to delete** if you shade with quick back-and-forth strokes.
- **Any colour.** The last swatch opens a colour mixer (also HEX, RGB and HSL), with a pipette that picks colours from the board.
- **Stylus.** The eraser end of a stylus erases. In **Settings → Draw with finger**, turn finger drawing off to draw only with the pen; one finger then moves the board.

## Text and handwriting

- **Type.** Choose the text tool and tap where the text should go. A small bar sets font, size and colour.
- **Edit a text.** Double-click or double-tap it, with any tool.
- **Turn handwriting into text.** Select what you wrote and choose **AI → Tidy up handwriting** (see [AI: tidy up, solve, plot](#ai-tidy-up-solve-plot)): it becomes typed text, with maths typeset properly.

## Selecting and changing things

Choose the select tool (the arrow), then tap something, or drag a loop around several things.

- **Move:** drag inside the frame.
- **Resize:** drag a **corner** to keep the shape, or a **side** to stretch it.
- **Turn:** drag the round knob above the frame.
- **Two-finger tricks:** while resizing, put **another finger** on the screen and it grows from the middle instead of from the opposite side. While turning, another finger snaps the angle to 45° steps. With a mouse, hold **Alt** or **Shift** for the same.
- **Change the style:** the bar under the selection sets the **colour**, **thickness** and **line type** of everything selected.
- **Top bar:** **Duplicate** (copies appear slightly offset, already selected), **Save as sticker**, and **Delete**.
- **Group:** with two or more things selected, **Group** in the style bar joins them, so they are selected, moved, resized, turned, styled, copied and deleted together. Groups can hold groups. With a group selected, the same button reads **Ungroup** and takes apart only the outermost group, leaving any groups inside it. Groups are kept in files, share links, stickers and backups.
- **Let go:** tap or click an empty spot and everything is deselected, whatever tool is chosen (also when one finger moves the board).

Everything can be undone: the arrows at the top right, or tap with **two fingers** to undo and **three fingers** to redo.

## AI: tidy up, solve, plot

Select some handwriting, press **AI** in the bar at the top, and choose what to do with it:

- **Tidy up handwriting** turns it into typed text, with the maths typeset properly: fractions, exponents, roots, sums, Greek letters. It is a normal text object afterwards; double-click it to edit (maths is written as LaTeX between `$` signs, e.g. `$\frac{x}{2}$`).
- **Solve, showing the steps** writes the working under the problem, in the handwritten font and your ink colour. The answer is then **checked on your device** by putting it back into the problem: a ✓ means it fits, a ⚠ warning means it does not and the steps need a second look.
- **Plot as a graph** turns a written function (`f(x) = sin(x)`, `y = x² − 1`, several at once) into a graph that takes its place. Move, resize and turn it like a picture. **Double-click or double-tap** it (or press **Explore** in its bar) to drag around inside it and zoom with the wheel or a pinch; click outside it or press Esc to stop. **Functions** in its bar edits what is drawn, one per line, and the graph follows as you type. Typed functions are plotted straight away, without AI. You can also start from an empty graph: **Stickers → Built-in stickers → Graphs**.
- **Special points.** Small dots mark where each curve crosses the axes, its highest and lowest points, its inflection points, and where two curves meet. **Tap a dot** (while exploring, or with the select tool) to show its coordinates as (x; y); tap again to hide them.

The AI only **reads** the handwriting. Graphs are drawn and answers checked by the app itself, on your device, so the numbers are exact.

### Your API key is safe

The AI features use **your own API key** from an AI provider. That key **never leaves your device**, except to go straight to the provider you chose:

- **There is no Whiteboard server.** Whiteboard is a static web page. Nothing you do in it, and no key, is ever sent to me or to anyone else.
- **The key is stored only in your browser, on this device.** It is not in your boards, files, exports, backups or share links, so sharing a board can never share your key.
- **Requests go directly from your browser to the provider** (Google, OpenAI, Anthropic, or the server you entered), over an encrypted connection. Only the picture of what you selected is sent, and only when you use an AI action.
- **You can remove it any time:** Settings → AI → **Remove keys**.

The provider may charge your key for each use. Gemini has a free tier.

### Tutorial: set it up and try it

1. **Get a key.** Open **Settings → AI**, choose a provider and tap **Get a key ↗**. For Gemini, sign in to Google AI Studio and press *Create API key*; it is free to start.
2. **Paste the key** into the **API key** field. It is saved in this browser straight away.
3. **Pick a model.** The field shows the suggested one (for Gemini, `gemini-flash-lite-latest`, quick and good at handwriting). **Show available** lists every model your key can use; pick one from the list, or type to narrow it down. If a model gets stuck or fails, try another one.
4. **Write something.** For example `2x + 3 = 7`, or `f(x) = sin(x)`.
5. **Select it** with the select tool (a loop around it), press **AI**, and choose **Solve**, **Tidy up** or **Plot**. A few seconds later the result appears, and **Undo** brings the handwriting back if you change your mind.

**Other providers.** OpenAI and Claude work the same way. **Other** takes any OpenAI-compatible server address, such as OpenRouter, or a model running on your own computer with Ollama or LM Studio (then nothing leaves your computer at all).

## Pictures

**Menu → Import…** brings a picture onto the board (PNG, JPEG, WebP, BMP or SVG). It arrives selected, so you can move, resize and turn it straight away. You can draw and erase over it, and the fill tool pours paint over pictures rather than treating them as walls.

Files exported from Whiteboard are special: every export carries the board it was made from. Importing such a PNG, PDF or other export gives you back the **editable board**, not just a picture of it.

Importing a **PDF from another program** puts each of its pages on the board as a picture, one under the other, all selected so you can move them together. To work on a PDF as paper instead, open it as a sheet (below).

## Sheets and PDFs

The board is normally endless. A **sheet** is a board with a fixed page size, for things that end up on paper.

- **New sheet…** (menu, under New board) offers A sizes (A0–A6), B sizes (B0–B6), North American sizes (Letter, Legal, Tabloid, Executive, Half Letter, index card), and slide and screen shapes, upright or sideways.
- **Add pages** with the **+** buttons just above the top page and below the bottom one: each adds a page of the same size there (undoable). While the top or bottom page is empty, a **bin** button appears next to its **+** and deletes that page.
- Pages are placed so the canvas pattern falls the same way on each: a line of the grid or the lined pattern runs along every page's top edge, and a grid line along its left edge.
- The page has a clear edge, and everything around it is slightly tinted. You can still draw out there, as scrap space: it stays on the board and in share links, but **exports contain only the page**. A PDF export has the page's real paper size, so it prints at the right scale.
- **Open from…** also opens **PDF files**: lecture slides, handouts, forms. After you confirm, the PDF replaces the current board (undo brings it back) and becomes a sheet with one page per PDF page. Highlight, write and draw on it with every tool; the PDF itself can't be erased or moved by accident. Exporting as PDF gives you the annotated document back, page by page.
- PDFs are read by Mozilla's pdf.js, which comes with the app and works offline. A few PDFs that rely on fonts they don't include need an internet connection the first time.

## Stickers

Stickers are drawings you reuse: a logo, a symbol, a labelled diagram.

- **Make one:** select what you drew and press **Save as sticker** in the top bar, choose a folder, then type a name.
- **Use one:** press the sticker button in the dock (after the text tool; on phones it's only in the menu), or **Menu → Stickers…**, and tap a sticker. It is placed in the middle of the screen, selected, ready to move and resize.
- The sticker gallery works exactly like the board gallery (folders, colours, renaming, backups), but is kept separately.

**Built-in stickers.** The first folder in the sticker gallery comes with the app and is always there, even before you choose where your own stickers live. It is part of the app itself, so it can't be renamed, moved, copied or deleted, and nothing can be saved into it. They are listed under headings for their kinds. Everything in it is drawn with real lines and texts in the ink colour that suits your canvas, at the size that looks right at 100 % zoom. Placing one puts it on the board at that size as one group, ready to move, recolour or erase (ungroup it to edit its parts):

- **Graphs:** an empty interactive graph, and ready ones for x² and sin x.
- **Coordinate systems:** all four quadrants with the origin in the middle, each quadrant on its own, and every pair of quadrants, with a unit grid, arrows and tick marks, left unnumbered so you can set the scale.
- **Venn diagrams:** two, three and four sets, two and three sets in a universe, a subset, and disjoint sets.
- **Karnaugh maps** and **Veitch maps:** 2×2, 2×4, 4×2 and 4×4, each in a disjunctive version (cells numbered by minterm) and a conjunctive one (by maxterm, 2ⁿ−1−m). Karnaugh maps carry the Gray-code values along the sides; Veitch maps mark with a bracket where each variable is 1.
- **Truth tables:** for 2, 3 and 4 variables, each row numbered both ways (disjunctively from 0, conjunctively from 2ⁿ−1), with every 0 and 1 filled in and an empty F column.

## Moving around

- **Pan:** drag with two fingers, scroll with a trackpad or mouse wheel, hold **Space** and drag, use the hand tool, or drag with the middle mouse button.
- **Zoom:** pinch, or **Ctrl** + scroll. The zoom button at the top right has zoom in, zoom out, actual size and **fit to content**.
- **Background:** **Settings → Canvas** picks plain, dots, lined (like ruled paper) or grid. It shows on sheets too.

---

## Your files

The **menu** (top left) holds everything about files.

| Menu item | What it does |
| --- | --- |
| **New board** | Starts an empty board (undoable). |
| **New sheet…** | Starts a board with a fixed paper size (see [Sheets and PDFs](#sheets-and-pdfs)). |
| **Gallery** | Your boards, in folders, with previews. |
| **Save to gallery** | Saves the board into the gallery. Saving again updates the same entry. |
| **Save to "name.whtbd"** | Appears once a board was saved to, or opened from, a file on your device: saves straight back into that file. |
| **Save as…** | Saves a copy as a new `.whtbd` file wherever you choose. |
| **Open from…** | Opens a `.whtbd` file, or a PDF as a sheet, from your device. You can also drag a file onto the window. |
| **Stickers…** | The sticker gallery. |
| **Export…** | PNG, JPEG, WebP, BMP, SVG or PDF, at 1×, 2× or 4×, on the board's colour, white, or transparent, with or without the canvas pattern (dots, lines or grid). |
| **Import…** | Brings in a picture or a PDF's pages, or restores a board from one of its exports. |
| **Share link…** | Makes a link that opens a copy of the board (see below). |
| **Open share link…** | Opens a link someone sent you by pasting it, handy in the installed app, which has no address bar. |

**Ctrl S** saves to wherever the board was saved last (its file, or the gallery).

### Share links

**Share link…** makes one link that does two things:

- **It carries a copy of the board.** Opening it shows the board at once, even when you're offline later. The board is stored in the link itself, in the part after `#`, which browsers never send to the server.
- **It makes the board live.** While your board is open, anyone who opens the link draws on it with you: lines, highlighting and erasing appear as they happen, things being moved glide along, texts change as they're typed, and every other change, deletion and group reaches everyone. The top bar shows a green **Live** badge with how many people are on the board (orange while you're alone).
- **Join from a phone or another device.** While the board is live, the share window also shows a **QR code** and a short **room code** like `K7QM-4XHC`. Scan the QR code with a phone camera and it opens the app straight into the live board. On a computer, type the code into **Open share link…** instead (capitals, spaces and the dash don't matter). The code only joins the live board, so it needs someone to have the board open; the long link also carries a copy of the board.

How the live part works, without any server of ours:

- Browsers connect **directly to each other** (WebRTC) and send the changes straight between them, encrypted. Nothing is uploaded or stored anywhere.
- To find each other, they use free public meeting points (WebTorrent trackers) for a few seconds. These only see a scrambled version of the room code, and the connection details they pass on are encrypted, so they can't see what's on the board or even who is in it. No account or sign-up is needed.
- With more than two people, everyone connects to everyone. That works well for a handful of people, like a study group or a lesson.
- **Laser pointers:** everyone sees each other's pointer while they use the laser pointer tool. Whoever started the live board points in **red**, and everyone who joins gets a different colour of their own (green, blue, orange, …). Each pointer looks the same colour to everyone, its owner too. Switching to another tool hides your pointer for the others. Each pointer carries its owner's name.
- **Pointing at a graph:** while you explore a graph, your pointer sits on a spot of the graph itself, not the board. If you point at the lowest point of x², everyone sees your pointer on that lowest point, even when they have moved or zoomed their own view of the graph (if that spot is out of their view, they don't see it).
- **Who's who:** tap the **Live** badge to see everyone on the board with their colour. Tap your own name to type a nickname; the others see it in the list and next to your pointer, and it's kept on your device for next time. **Share link…** at the bottom of the list shows the link, the QR code and **Stop** again.
- **Joining:** until the board has arrived, a **Loading the board…** message (with how far it has got, for big boards) shows at the bottom. If nobody who has the board is online, it says so instead.
- **One at a time:** while someone moves, resizes or turns something, or edits a text, it's theirs until they let go. The others see it framed in that person's colour and can't select, erase or edit it meanwhile. If two people grab the same thing at the same moment, one of them gets it and the other is told.
- **Graphs:** one person at a time edits a graph's **Functions**; the others see the curves change as they're typed, and can still explore the graph and zoom in it on their own. While someone explores a graph, nobody else can move, resize or delete it, but everyone can explore it at once, each with their own view.
- **Undo** only undoes your own steps, never someone else's.
- **Pictures and PDF pages** aren't in the link itself (they'd make it far too long), but they reach the others over the live connection.
- When everyone has closed the board, there is no shared board any more: each person keeps their own copy, autosaved as usual. Opening another board, or **New**, leaves the live board and the others keep it. Reloading the page joins again.
- **Anyone with the link can draw on your board** while it is live. Send it only to people you want there, and press **Stop** when you're done.
- **Some networks block direct connections** (some school and university Wi-Fi, some mobile networks). If no connection can be made, the app says so after a few seconds; the link still opens a copy. A TURN relay gets through those networks: if you have one, enter it under **Settings → Live boards**. Like an AI key, it stays on your device.

More about links:

- Links grow with the drawing. A sketch or a few lines of notes make a short link; a page of handwriting makes one of roughly ten thousand characters. Long links work when copied and pasted, but some chat apps and emails cut them short.
- Opening a link replaces the board on screen. If that board has changes you haven't saved, the app asks first, and **Undo** brings it back either way.

### The gallery

The gallery is the app's own file browser. Folders can be created, renamed, coloured and nested; boards and folders can be renamed, duplicated, moved (also by dragging a tile onto a folder) and deleted.

The first time you open it, choose where it lives:

- **A real folder (recommended where possible).** In Chrome or Edge on a computer, choose any folder and a `Whiteboard gallery` folder is created inside it. Your boards are ordinary files there, so they survive clearing the browser and are included in your normal computer backups. You can also simply **drag a folder** from your file manager onto the app.
- **Inside the browser.** Everywhere else (and if you choose it) the gallery is stored by the browser itself. It works the same, but it is **deleted if you clear the browser's data** for this site, and it lives only in that browser on that device.

The footer shows where the gallery lives and has **Change folder…**.

### Backups

In the gallery's footer, **Back up…** saves the whole gallery (folders, names, colours, boards) as one file, and **Restore…** puts it back.

- **Back up changes…** appears after your first backup when boards have changed since. It saves only the new and changed boards, so it is small and quick. Restoring several of these one after another simply adds them all.
- **Reminders:** when the gallery is kept in the browser, saving a board suggests a backup (at most once a day) once three boards aren't in any backup, or a changed board has waited three days. A gallery in a real folder is already safe and isn't nagged about.

- On a computer, the backup is saved wherever you choose.
- On a phone or tablet, the share sheet opens: choose **Save to Files** to keep it in any folder, including iCloud Drive.
- Restoring never overwrites anything. Boards already there are skipped; a board that has changed since the backup is kept next to the existing one under a new name.

Gallery backups end in `.wbgallery`; sticker backups end in `.wbstickers` and can only be restored into the sticker gallery.

**Add boards…**, also in the footer, brings single `.whtbd` files into the folder you're looking at. You can choose many at once, and boards already there are skipped.

**If your gallery is stored in the browser, make a backup now and then**, especially before clearing browsing data.

---

## Device notes: iPhone, iPad and Mac

### iPhone and iPad (all browsers)

Every browser on iPhone and iPad, including Chrome, is built on Safari's engine and has Safari's limits:

- **The gallery and sticker gallery always live inside the browser.** Websites can't create folders in the Files app. Clearing the browser's history and website data deletes them, and so does deleting the browser app. Use **Back up…** regularly and keep the backup in Files or iCloud Drive.
- **Add it to the Home Screen** (share button → Add to Home Screen). Safari clears the stored data of websites you haven't opened for a while, but a Home Screen app keeps its own storage and counts only its own use, so its gallery is far safer. The app suggests this once when you open it in the browser. It also opens full screen.
- **Large PDFs take a lot of space.** If the browser's storage for the app runs full, the app says so: save the board to a file or the gallery, so it doesn't depend on the browser's storage.
- **Each browser has its own gallery.** Boards saved in Safari don't appear in Chrome, and a Home Screen app has its own storage too. Move boards between them with a backup.
- **Keep every board in Files too.** Turn on **Settings → Save a copy to Files** (iPhone and iPad only). Then every **Save to gallery** also opens the share sheet with the board file. With a one-time Shortcut (below), one more tap saves it into a folder of your choice in iCloud Drive, replacing the older copy. You get a real file of every board that syncs to your other devices and survives clearing the browser. **Add boards…** in the gallery brings them back.
- **Exports go to the share sheet**, so **Save Image** puts a PNG in Photos and **Save to Files** puts any export in Files. A PNG export carries its board, so importing it from Photos gives the editable board back (provided Photos keeps the file as it was).
- **Save as…** saves into the browser's downloads (Safari: Downloads in Files; Chrome: the Chrome folder in Files).
- **Open from… and Restore…** show all files; pick the `.whtbd` or backup file as usual.
- **Apple Pencil:** turn off **Draw with finger** in Settings so the Pencil draws and your fingers move the board.

#### A Shortcut that saves boards into one folder

Set this up once in the **Shortcuts** app:

1. Tap **+** to make a new shortcut, and name it **Save to Whiteboard folder**.
2. Open its details (the **ⓘ** button) and turn on **Show in Share Sheet**. Under the types it receives, keep only **Files**.
3. Add the action **Save File**. Turn off **Ask Where to Save**, choose a folder (for example a new **Whiteboard** folder in iCloud Drive), and turn on **Overwrite If File Exists**.

From then on, when the share sheet opens after a save, tap **Save to Whiteboard folder**. The board lands in that folder, replacing its older copy.

### Mac

- **Chrome or Edge** support real gallery folders. macOS may ask once whether the browser may access your Documents (or Desktop) folder: allow it.
- **Safari and Firefox** keep the gallery inside the browser, and **Save as…** saves to Downloads. The iPhone notes about clearing website data and unused websites apply to Safari on Mac too: back up regularly.
- Use **Cmd** where the shortcuts below say **Ctrl**.

---

## Troubleshooting

**"Can't open this folder because it contains system files."**
Browsers don't allow choosing Documents, Desktop, Downloads or your user folder *themselves*. Open one of them in the dialog and choose (or create) a folder **inside** it.

**Choosing a folder, or replacing an existing file, silently does nothing (Windows).**
On some Windows setups, Chrome's file dialogs cancel themselves on screens with **150% or larger scaling**. Ways around it:
- Drag the folder (or a board file) from File Explorer onto the app instead.
- Open the dialog on a screen with 100% or 125% scaling.
- Quit Chrome completely and reopen it if dialogs stop appearing at all.

**The app looks half-updated after a new version.** Close it and open it again (or reload the page).

**Something else?** The version is shown at the bottom of **Settings**; mention it when reporting a problem.

---

## Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Pen / Eraser / Text / Select | `P` / `E` / `T` / `V` |
| Highlighter / Laser pointer | `M` / `L` |
| Move the board | `H`, or hold `Space` |
| Thinner / thicker brush | `[` / `]` |
| Undo / Redo | `Ctrl Z` / `Ctrl Shift Z` (or `Ctrl Y`) |
| Select all | `Ctrl A` |
| Duplicate selection | `Ctrl D` |
| Delete selection | `Delete` or `Backspace` |
| Gallery | `Ctrl G` |
| Save (file or gallery) | `Ctrl S` |
| Save as… | `Ctrl Shift S` |
| Open from… | `Ctrl O` |
| Export | `Ctrl E` |
| Zoom in / out | `Ctrl +` / `Ctrl -` |
| Actual size / Fit to content | `Ctrl 0` / `Ctrl 1` |

On a Mac, use `Cmd` in place of `Ctrl`.

---

## Showing a board to Claude

Board files are mostly lists of coordinates, so an AI assistant can't tell what's drawn just by reading one. The [`whtbd-view`](whtbd-view/) folder is a skill for [Claude](https://claude.ai) that turns a board into pictures it can look at. It also adds zoomed-in close-ups of anything written very small.

It works with `.whtbd` boards, stickers, gallery backups, and files exported from the app.

- **claude.ai:** download [`whtbd-view.zip`](whtbd-view.zip) and add it under **Settings → Capabilities → Skills**.
- **Claude Code:** copy the `whtbd-view` folder into `~/.claude/skills/`.

Then share a board and ask Claude what's on it. The skill needs Python with Playwright, and Chrome or Edge, wherever Claude runs it.

---

## About

Made by Nemes Dániel. The app is open source under the [MIT License](LICENSE). The one piece of third-party code it contains, pdf.js (for reading PDFs), is credited in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

Issues and suggestions are welcome on GitHub.
