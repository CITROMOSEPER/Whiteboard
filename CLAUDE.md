# Whiteboard

## Version stamp (bump it with every release)

The version is shown at the bottom of the Settings window, in `index.html`:

```html
<p id="app-version">version: 2026.11.12.04.</p>
```

Keep the text exactly in that shape: `version: YYYY.MM.DD.NN.` (lowercase "version:", one space, trailing dot).
- `YYYY.MM.DD` is the date of the release.
- `NN` is that day's release count, two digits, starting at `01`.

How to bump it, every time changes are pushed to GitHub (each push to `main` is a release, since GitHub Pages deploys it):
- If the current stamp's date is today, add 1 to `NN` (`2026.11.12.01` → `2026.11.12.02`).
- If it is an earlier date, use today's date and `01` (`2026.11.12.03` → `2026.11.13.01`).

Bump it in the same commit as the changes, then run `python build.py` so `dist/` carries the new stamp too.

The line above it reads "Nemes Dániel © 2026-now", literally, as the author asked. Don't change it.

## Building

`python build.py` bundles the app into `dist/` (both the single-file `Whiteboard.html` and the `dist/web/` site). `dist/` is committed, so rebuild before every commit that changes the app.
