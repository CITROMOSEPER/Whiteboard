# Third-party notices

The Whiteboard app contains one piece of third-party code, **pdf.js** (below), used only to
read PDF files.

## pdf.js (reading PDF files)

- Mozilla Foundation, *pdf.js*, version 4.10.38 (the `pdfjs-dist` package, legacy build),
  <https://github.com/mozilla/pdf.js>
- Included unmodified in `js/vendor/pdfjs/` (renamed from `.mjs` to `.js`), and loaded from
  <https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/> where that copy can't be used, together with
  pdf.js's standard font and character map files when a PDF needs them.
- Licence: **Apache License 2.0** — full text in `js/vendor/pdfjs/LICENSE`.
