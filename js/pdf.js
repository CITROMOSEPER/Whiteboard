/* Reading PDFs from other programs, with Mozilla's pdf.js (Apache 2.0, js/vendor/pdfjs/).

   pdf.js is large, so it is loaded only when a PDF is actually opened: from this site's own copy,
   or, where that can't be loaded (the single-file app opened from disk), from the jsDelivr CDN.
   Each page is drawn into a picture (JPEG, about 2400 px on its long side) that the board keeps;
   the board then works the same with or without pdf.js. */
(function () {
  'use strict';
  const WB = window.WB;
  const VERSION = '4.10.38';
  const CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}/`;
  let lib = null;

  async function load() {
    if (lib) return lib;
    let last = null;
    const local = new URL('js/vendor/pdfjs/', document.baseURI).href;
    for (const base of [local, CDN + 'legacy/build/']) {
      try {
        // This site's copy is named .js (every server sends that as JavaScript); the CDN's is .mjs.
        const ext = base.startsWith(CDN) ? '.mjs' : '.js';
        const m = await import(base + 'pdf.min' + ext);
        m.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min' + ext;
        return (lib = m);
      } catch (e) { last = e; }
    }
    throw last || new Error('pdf.js could not be loaded');
  }

  const LONG_SIDE = 2400;   // pixels on the long side of each page's picture

  /* PDF bytes -> [{ w, h, src }]: each page's size in board units (CSS pixels, 96 per inch) and its
     picture. onPage(i, n) reports progress. */
  WB.readPdf = async function (buffer, onPage) {
    const pdfjs = await load();
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer.slice(0)),
      isEvalSupported: false,                          // never compile code from the file
      standardFontDataUrl: CDN + 'standard_fonts/',    // only fetched for PDFs that use the standard fonts without embedding them
      cMapUrl: CDN + 'cmaps/', cMapPacked: true,
    });
    const pdf = await task.promise, out = [];
    try {
      for (let i = 1; i <= pdf.numPages; i++) {
        if (onPage) onPage(i, pdf.numPages);
        const page = await pdf.getPage(i);
        const v1 = page.getViewport({ scale: 1 });                     // in points, 72 per inch
        const scale = Math.min(4, LONG_SIDE / Math.max(v1.width, v1.height));
        const vp = page.getViewport({ scale });
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(vp.width)); cv.height = Math.max(1, Math.round(vp.height));
        const g = cv.getContext('2d');
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: g, viewport: vp }).promise;
        out.push({ w: (v1.width * 96) / 72, h: (v1.height * 96) / 72, src: cv.toDataURL('image/jpeg', 0.88) });
        cv.width = cv.height = 0;
        page.cleanup();
      }
    } finally { pdf.destroy(); }
    return out;
  };
})();
