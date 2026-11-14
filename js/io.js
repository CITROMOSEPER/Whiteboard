/* File formats: .whtbd (native), bitmap, SVG, PDF. */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});

  /* Short decimal: at most 2 places, no trailing zeros. */
  const f = (n) => String(+n.toFixed(2));

  /* ---- .whtbd -------------------------------------------------------
     Plain JSON, one stroke per line, so the file reads and diffs cleanly. */
  WB.serialize = function (doc, view) {
    let out = '{\n' +
      '  "format": "WHTBD",\n' +
      '  "version": 1,\n' +
      `  "title": ${JSON.stringify(doc.title)},\n` +
      `  "created": "${new Date(doc.created).toISOString()}",\n` +
      `  "modified": "${new Date().toISOString()}",\n` +
      `  "view": { "x": ${f(view.x)}, "y": ${f(view.y)}, "zoom": ${+view.zoom.toFixed(4)} },\n`;
    // A sheet board: the pages exports are limited to (with the picture of each page of an opened PDF).
    if (doc.pages && doc.pages.length) {
      out += '  "pages": [\n' + doc.pages.map((p) => `    { "x": ${f(p.x)}, "y": ${f(p.y)}, "w": ${f(p.w)}, "h": ${f(p.h)}${p.src ? `, "src": ${JSON.stringify(p.src)}` : ''} }`).join(',\n') + '\n  ],\n';
    }
    const lines = doc.strokes.map((s) => {
      if (s.tool === 'text') {
        return `    { "tool": "text", "x": ${f(s.x)}, "y": ${f(s.y)}, ${s.rot ? `"rot": ${f((s.rot * 180) / Math.PI)}, ` : ''}"font": "${s.font}", "size": ${+s.size.toFixed(3)}, "color": "${s.color}", "opacity": ${+s.opacity.toFixed(3)}, "text": ${JSON.stringify(s.text)} }`;
      }
      if (s.tool === 'image') {
        // "rot" is in degrees in the file (clockwise), and left out when the picture is upright.
        const rot = s.rot ? `"rot": ${f((s.rot * 180) / Math.PI)}, ` : '';
        return `    { "tool": "image", "x": ${f(s.x)}, "y": ${f(s.y)}, "w": ${f(s.w)}, "h": ${f(s.h)}, ${rot}"opacity": ${+s.opacity.toFixed(3)}, "src": ${JSON.stringify(s.src)} }`;
      }
      if (s.tool === 'fill') {
        const rings = s.rings.map((r) => { const q = []; for (let i = 0; i < r.length; i += 2) q.push(`[${f(r[i])},${f(r[i + 1])}]`); return `[${q.join(',')}]`; });
        return `    { "tool": "fill", "color": "${s.color}", "opacity": ${+s.opacity.toFixed(3)}, "under": ${!!s.under}, "rings": [${rings.join(',')}] }`;
      }
      const p = s.points, pts = [];
      for (let i = 0; i < p.length; i += 2) pts.push(`[${f(p[i])},${f(p[i + 1])}]`);
      let o = `{ "tool": "${s.tool}", `;
      if (s.tool === 'pen') o += `"color": "${s.color}", `;
      if (s.tool === 'pen' && s.dash && WB.DASHES[s.dash]) o += `"dash": "${s.dash}", `;
      if (s.tool === 'pen' && s.hl) o += '"highlight": true, ';
      o += `"width": ${+s.width.toFixed(3)}, "opacity": ${+s.opacity.toFixed(3)}, "smooth": ${!!s.smooth}, "closed": ${!!s.closed}, `;
      if (s.shape) o += `"shape": "${s.shape}", `;
      // Pressure: one whole number 0-100 per point.
      const press = s.tool === 'pen' && s.press && s.press.length === p.length >> 1 ? `, "pressure": [${s.press.map((v) => Math.round(v * 100)).join(',')}]` : '';
      return `    ${o}"points": [${pts.join(',')}]${press} }`;
    });
    out += '  "strokes": [\n' + lines.join(',\n') + (lines.length ? '\n' : '') + '  ]\n}\n';
    return out;
  };

  WB.parse = function (text) {
    let d;
    // Errors carry a translation key; the app shows the message in the active language.
    try { d = JSON.parse(text); } catch (e) { throw new Error('eInvalid'); }
    if (!d || d.format !== 'WHTBD' || !Array.isArray(d.strokes)) throw new Error('eNotBoard');
    if (d.version > 1) throw new Error('eNewer');
    return WB.normalize(d);
  };
  /* The checks every board goes through, from a file or from a share link (js/share.js builds the
     same shape): only finite numbers, known tools, fonts, line types and #rrggbb colours, opacity
     0.01-1, text at most 20 000 characters, pictures only as image data. Anything else is dropped
     or replaced by a default, so a damaged or hand-made board can always be shown, saved and reopened.
     d is the file's JSON: points as [x, y] pairs, angles in degrees, pressure 0-100. */
  WB.normalize = function (d) {
    if (!d || !Array.isArray(d.strokes)) throw new Error('eNotBoard');
    const num = (v, def) => (typeof v === 'number' && isFinite(v) ? v : def);
    const strokes = [];
    const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#000000');
    for (const s of d.strokes) {
      if (s && s.tool === 'text') {
        if (typeof s.text === 'string' && s.text.trim() && isFinite(s.x) && isFinite(s.y)) {
          strokes.push({ tool: 'text', x: +s.x, y: +s.y, rot: (num(s.rot, 0) % 360) * Math.PI / 180, text: s.text.slice(0, 20000), font: WB.FONTS[s.font] ? s.font : 'sans',
            size: Math.max(0.01, num(s.size, 24)), color: hex(s.color), opacity: Math.min(1, Math.max(0.01, num(s.opacity, 1))), width: 0 });
        }
        continue;
      }
      if (s && s.tool === 'image') {
        if (typeof s.src === 'string' && /^data:image\/(png|jpeg|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/.test(s.src) &&
            isFinite(s.x) && isFinite(s.y) && num(s.w, 0) > 0 && num(s.h, 0) > 0) {
          strokes.push({ tool: 'image', x: +s.x, y: +s.y, w: +s.w, h: +s.h, rot: (num(s.rot, 0) % 360) * Math.PI / 180, opacity: Math.min(1, Math.max(0.01, num(s.opacity, 1))), src: s.src, width: 0 });
        }
        continue;
      }
      if (s && s.tool === 'fill' && Array.isArray(s.rings)) {
        const rings = [];
        for (const r of s.rings) {
          const q = [];
          if (Array.isArray(r)) for (const p of r) if (Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])) q.push(+p[0], +p[1]);
          if (q.length >= 6) rings.push(q);
        }
        if (rings.length) strokes.push({ tool: 'fill', color: hex(s.color), width: 0, opacity: Math.min(1, Math.max(0.01, num(s.opacity, 1))), under: !!s.under, rings });
        continue;
      }
      if (!s || !Array.isArray(s.points)) continue;
      const points = [];
      for (const p of s.points) {
        if (Array.isArray(p) && isFinite(p[0]) && isFinite(p[1])) points.push(+p[0], +p[1]);
      }
      if (!points.length) continue;
      const st = {
        tool: s.tool === 'eraser' ? 'eraser' : 'pen',
        color: hex(s.color),
        width: Math.max(0.01, num(s.width, 4)),
        opacity: Math.min(1, Math.max(0.01, num(s.opacity, 1))),
        points,
        smooth: !!s.smooth,
        closed: !!s.closed,
      };
      if (st.tool === 'pen' && typeof s.dash === 'string' && WB.DASHES[s.dash]) st.dash = s.dash;
      if (st.tool === 'pen' && s.highlight === true) { st.hl = true; delete st.dash; }
      if (st.tool === 'pen' && Array.isArray(s.pressure) && s.pressure.length === points.length >> 1) {
        st.press = s.pressure.map((v) => Math.min(1, Math.max(0, num(v, 50) / 100)));
      }
      if (typeof s.shape === 'string') st.shape = s.shape.replace(/[^a-z]/gi, '').slice(0, 24);
      strokes.push(st);
    }
    const v = d.view || {};
    const created = Date.parse(d.created);
    const pages = [];
    if (Array.isArray(d.pages)) {
      for (const p of d.pages) {
        if (!p || !(num(p.w, 0) > 0 && num(p.h, 0) > 0) || !isFinite(p.x) || !isFinite(p.y)) continue;
        const pg = { x: +p.x, y: +p.y, w: +p.w, h: +p.h };
        if (typeof p.src === 'string' && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.src)) pg.src = p.src;
        pages.push(pg);
      }
    }
    return {
      pages,
      title: typeof d.title === 'string' && d.title.trim() ? d.title.slice(0, 80) : 'Untitled',
      created: isFinite(created) ? created : Date.now(),
      strokes,
      view: { x: num(v.x, 0), y: num(v.y, 0), zoom: Math.min(64, Math.max(0.02, num(v.zoom, 1))) },
    };
  };

  /* ---- Bitmap -------------------------------------------------------- */
  const MAX_SIDE = 12000, MAX_AREA = 120e6;

  /* ---- The canvas pattern ------------------------------------------------
     The board's background pattern, for exports that ask for it: dots, lines (ruled) or a grid,
     one step every GRID board units, lined up with 0, 0 exactly as on screen (where at 100 % the
     steps are 32 px apart, and halve or double as you zoom). Sheets are placed on these steps. */
  WB.GRID = 32;
  /* { kind, color (#000 or #fff, whichever shows on the background), alpha }, or null for none. */
  WB.patternStyle = function (kind, background) {
    if (!kind || kind === 'none') return null;
    const n = parseInt((background || '#ffffff').slice(1), 16);
    const dark = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.45;
    return { kind, color: dark ? '#ffffff' : '#000000', alpha: kind === 'lines' ? 0.08 : 0.16 };
  };
  const gridSteps = (a, len) => { const out = []; for (let v = Math.ceil(a / WB.GRID) * WB.GRID; v <= a + len; v += WB.GRID) out.push(v); return out; };
  WB.paintPattern = function (c, pat, r) {
    const xs = gridSteps(r.x, r.w), ys = gridSteps(r.y, r.h);
    c.save();
    c.globalAlpha = pat.alpha; c.globalCompositeOperation = 'source-over';
    c.fillStyle = c.strokeStyle = pat.color;
    c.beginPath();
    if (pat.kind === 'dots') { for (const y of ys) for (const x of xs) { c.moveTo(x + 1.2, y); c.arc(x, y, 1.2, 0, 2 * Math.PI); } c.fill(); }
    else {
      for (const y of ys) { c.moveTo(r.x, y); c.lineTo(r.x + r.w, y); }
      if (pat.kind === 'lines') for (const x of xs) { c.moveTo(x, r.y); c.lineTo(x, r.y + r.h); }
      c.lineWidth = 1; c.lineCap = 'butt'; c.stroke();
    }
    c.restore();
  };

  /* A picture (or a PDF page) decoded only while it is drawn into an export, then let go again,
     unless it was already decoded for the screen. A decoded 2400 px page takes about 17 MB, so
     decoding all pages of a long PDF at once could take more memory than an iPad allows. */
  async function borrow(o) {
    const had = !!o._img, img = WB.imageOf(o);
    await WB.imageReady(img);
    return { img, done: () => { if (!had && o._img === img) { img.onload = null; img.src = ''; delete o._img; } } };
  }
  /* The pixel size of a JPEG, from its header (no decoding). */
  function jpegSize(u8) {
    let i = 2;
    while (i + 9 < u8.length) {
      if (u8[i] !== 0xff) { i++; continue; }
      const m = u8[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (u8[i + 5] << 8) | u8[i + 6], w: (u8[i + 7] << 8) | u8[i + 8] };
      i += 2 + ((u8[i + 2] << 8) | u8[i + 3]);
    }
    return null;
  }
  WB.jpegSize = jpegSize;

  /* renderToCanvas for exports: the same picture, with every picture and page decoded one at a time. */
  WB.renderToCanvasAsync = async function (strokes, b, scale, bg, pages, pattern) {
    scale = Math.min(scale, MAX_SIDE / b.w, MAX_SIDE / b.h, Math.sqrt(MAX_AREA / (b.w * b.h)));
    const w = Math.max(1, Math.round(b.w * scale)), h = Math.max(1, Math.round(b.h * scale));
    const pg = pages && pages.length ? pages : null;
    const world = (g) => g.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale);
    const ink = document.createElement('canvas'); ink.width = w; ink.height = h;
    const c = ink.getContext('2d');
    world(c);
    if (pg) { c.beginPath(); for (const p of pg) c.rect(p.x, p.y, p.w, p.h); c.clip(); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of strokes) {
      if (s.tool !== 'image') { WB.paint(c, s); continue; }
      const { done } = await borrow(s);
      WB.paint(c, s); done();
    }
    if (!bg && !pattern && !(pg && pg.some((p) => p.src))) return { canvas: ink, scale };
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const o = out.getContext('2d');
    world(o);
    if (pg) { o.save(); o.beginPath(); for (const p of pg) o.rect(p.x, p.y, p.w, p.h); o.clip(); }
    if (bg) { o.fillStyle = bg; o.fillRect(b.x, b.y, b.w, b.h); }
    if (pattern) WB.paintPattern(o, pattern, b);
    if (pg) {
      for (const p of pg) {
        if (!p.src) continue;
        const { done } = await borrow(p);
        WB.paintPages(o, [p], null); done();
      }
      o.restore();
    }
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.drawImage(ink, 0, 0);
    return { canvas: out, scale };
  };

  /* b = {x,y,w,h} in world units. Returns { canvas, scale } (scale may be reduced to fit limits).
     With pages (a sheet board), only what lies on the pages is drawn: the background fills the
     pages, a PDF's page pictures go beneath the ink, and the gaps between pages stay empty. */
  WB.renderToCanvas = function (strokes, b, scale, bg, pages, pattern) {
    scale = Math.min(scale, MAX_SIDE / b.w, MAX_SIDE / b.h, Math.sqrt(MAX_AREA / (b.w * b.h)));
    const w = Math.max(1, Math.round(b.w * scale)), h = Math.max(1, Math.round(b.h * scale));
    const pg = pages && pages.length ? pages : null;
    const world = (g) => g.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale);
    const ink = document.createElement('canvas'); ink.width = w; ink.height = h;
    const c = ink.getContext('2d');
    world(c);
    if (pg) { c.beginPath(); for (const p of pg) c.rect(p.x, p.y, p.w, p.h); c.clip(); }
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of strokes) WB.paint(c, s);
    if (!bg && !pattern && !(pg && pg.some((p) => p.src))) return { canvas: ink, scale };
    // Erasers cut holes in the ink layer, so the background, the pattern and a PDF's page
    // pictures go on a separate layer underneath (on a sheet, only within its pages).
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const o = out.getContext('2d');
    world(o);
    if (pg) { o.save(); o.beginPath(); for (const p of pg) o.rect(p.x, p.y, p.w, p.h); o.clip(); }
    if (bg) { o.fillStyle = bg; o.fillRect(b.x, b.y, b.w, b.h); }
    if (pattern) WB.paintPattern(o, pattern, b);
    if (pg) { WB.paintPages(o, pg, null); o.restore(); }
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.drawImage(ink, 0, 0);
    return { canvas: out, scale };
  };

  WB.canvasToBlob = (canvas, mime, quality) => new Promise((res, rej) => {
    canvas.toBlob((b) => (b && b.type === mime ? res(b) : rej(new Error('This browser cannot write that format.'))), mime, quality);
  });

  /* 24-bit uncompressed BMP. */
  WB.canvasToBMP = function (canvas) {
    const w = canvas.width, h = canvas.height;
    const src = canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const row = (w * 3 + 3) & ~3, size = 54 + row * h;
    const buf = new ArrayBuffer(size), dv = new DataView(buf), out = new Uint8Array(buf);
    dv.setUint16(0, 0x4d42, true); dv.setUint32(2, size, true); dv.setUint32(10, 54, true);
    dv.setUint32(14, 40, true); dv.setInt32(18, w, true); dv.setInt32(22, h, true);
    dv.setUint16(26, 1, true); dv.setUint16(28, 24, true); dv.setUint32(34, row * h, true);
    dv.setInt32(38, 2835, true); dv.setInt32(42, 2835, true);
    for (let y = 0; y < h; y++) {
      let o = 54 + (h - 1 - y) * row, i = y * w * 4;
      for (let x = 0; x < w; x++, i += 4) { out[o++] = src[i + 2]; out[o++] = src[i + 1]; out[o++] = src[i]; }
    }
    return new Blob([buf], { type: 'image/bmp' });
  };

  /* Runs of consecutive strokes of the same kind. Consecutive erasers combine
     into a single mask, which keeps the vector output shallow. */
  function runs(strokes) {
    const out = [];
    for (const s of strokes) {
      const kind = s.tool === 'eraser' ? 'eraser' : 'ink', last = out[out.length - 1];
      if (last && last.kind === kind) last.items.push(s); else out.push({ kind, items: [s] });
    }
    return out;
  }

  /* ---- SVG ----------------------------------------------------------- */
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  function svgPath(s, outline) {
    let d = '';
    (outline ? WB.traceVar : WB.trace)(s, {
      moveTo(x, y) { d += `M${f(x)} ${f(y)}`; },
      lineTo(x, y) { d += `L${f(x)} ${f(y)}`; },
      quadraticCurveTo(a, b, x, y) { d += `Q${f(a)} ${f(b)} ${f(x)} ${f(y)}`; },
      closePath() { d += 'Z'; },
    });
    return d;
  }

  WB.toSVG = function (strokes, b, bg, payload, pages, pattern) {
    const box = `x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}"`;
    const pg = pages && pages.length ? pages : null;
    const rectOf = (p) => `x="${f(p.x)}" y="${f(p.y)}" width="${f(p.w)}" height="${f(p.h)}"`;
    let defs = '', body = '', n = 0;
    for (const run of runs(strokes)) {
      if (run.kind === 'ink') {
        for (const s of run.items) {
          if (s.tool === 'image') {
            const turn = s.rot ? ` transform="rotate(${f((s.rot * 180) / Math.PI)} ${f(s.x + s.w / 2)} ${f(s.y + s.h / 2)})"` : '';
            body += `<image x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" preserveAspectRatio="none"${turn}${s.opacity < 1 ? ` opacity="${f(s.opacity)}"` : ''} xlink:href="${s.src}"/>\n`;
          } else if (s.tool === 'text') {
            const L = WB.textLayout(s);
            body += `<text${s.rot ? ` transform="rotate(${f((s.rot * 180) / Math.PI)} ${f(s.x)} ${f(s.y)})"` : ''} font-family="${esc(WB.FONTS[s.font] || WB.FONTS.sans)}" font-size="${f(s.size)}" fill="${s.color}"${s.opacity < 1 ? ` fill-opacity="${f(s.opacity)}"` : ''} stroke="none" xml:space="preserve">` +
              L.lines.map((l, i) => `<tspan x="${f(s.x)}" y="${f(s.y + i * L.lh + L.base)}">${esc(l)}</tspan>`).join('') + '</text>\n';
          } else if (s.tool === 'fill') {
            // An "under" fill sits beneath everything drawn before it, so it goes first in the document.
            const el = `<path d="${svgPath(s)}" fill="${s.color}" fill-rule="evenodd"${s.opacity < 1 ? ` fill-opacity="${f(s.opacity)}"` : ''} stroke="none"/>\n`;
            body = s.under ? el + body : body + el;
          } else if (WB.hasPress(s)) {
            body += `<path d="${svgPath(s, true)}" fill="${s.color}"${s.opacity < 1 ? ` fill-opacity="${f(s.opacity)}"` : ''} stroke="none"/>\n`;
          } else if (s.hl) {
            // A highlighter sits beneath what was drawn before it, like an "under" fill.
            body = `<path d="${svgPath(s)}" stroke="${s.color}" stroke-width="${f(s.width)}" stroke-linecap="square"${s.opacity < 1 ? ` stroke-opacity="${f(s.opacity)}"` : ''}/>\n` + body;
          } else {
            const dash = WB.dashOf(s);
            body += `<path d="${svgPath(s)}" stroke="${s.color}" stroke-width="${f(s.width)}"${dash ? ` stroke-dasharray="${dash.map(f).join(' ')}"` : ''}${s.opacity < 1 ? ` stroke-opacity="${f(s.opacity)}"` : ''}/>\n`;
          }
        }
      } else if (body) {
        const id = 'erase' + (++n);
        defs += `<mask id="${id}" maskUnits="userSpaceOnUse" ${box}>\n<rect ${box} fill="#fff" stroke="none"/>\n`;
        for (const s of run.items) defs += `<path d="${svgPath(s)}" stroke="#000" stroke-width="${f(s.width)}" stroke-opacity="${f(s.opacity)}"/>\n`;
        defs += '</mask>\n';
        body = `<g mask="url(#${id})">\n${body}</g>\n`;
      }
    }
    let under = bg && !pg ? `<rect ${box} fill="${bg}" stroke="none"/>\n` : '';
    if (pg) {
      // A sheet: the paper and any PDF page pictures beneath, and everything clipped to the pages.
      defs += `<clipPath id="pages">${pg.map((p) => `<rect ${rectOf(p)}/>`).join('')}</clipPath>\n`;
      if (bg) for (const p of pg) under += `<rect ${rectOf(p)} fill="${bg}" stroke="none"/>\n`;
    }
    if (pattern) {
      // One tile per grid step, shifted by half a step so its marks fall on the multiples of GRID.
      const G = WB.GRID, H = G / 2, mark = pattern.kind === 'dots' ? `<circle cx="${H}" cy="${H}" r="1.2" fill="${pattern.color}"/>`
        : `<path d="M0 ${H}H${G}${pattern.kind === 'lines' ? `M${H} 0V${G}` : ''}" stroke="${pattern.color}" stroke-width="1" stroke-linecap="butt"/>`;
      defs += `<pattern id="canvas-pattern" x="${-H}" y="${-H}" width="${G}" height="${G}" patternUnits="userSpaceOnUse">${mark}</pattern>\n`;
      under += `<rect ${box} fill="url(#canvas-pattern)" fill-opacity="${pattern.alpha}" stroke="none"${pg ? ' clip-path="url(#pages)"' : ''}/>\n`;
    }
    if (pg) {
      for (const p of pg) if (p.src) under += `<image ${rectOf(p)} preserveAspectRatio="none" xlink:href="${p.src}"/>\n`;
      body = `<g clip-path="url(#pages)">\n${body}</g>\n`;
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}" width="${f(b.w)}" height="${f(b.h)}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n` +
      (defs ? `<defs>\n${defs}</defs>\n` : '') +
      under + body + (payload ? `<metadata id="whiteboard-board">${payload}</metadata>\n` : '') + '</svg>\n';
  };

  /* ---- PDF -----------------------------------------------------------
     Vector output. Eraser runs become luminosity soft masks applied to a
     transparency group holding everything drawn before them. */
  function pdfPath(s, outline) {
    let d = '', cx = 0, cy = 0;
    (outline ? WB.traceVar : WB.trace)(s, {
      moveTo(x, y) { d += `${f(x)} ${f(y)} m `; cx = x; cy = y; },
      lineTo(x, y) { d += `${f(x)} ${f(y)} l `; cx = x; cy = y; },
      quadraticCurveTo(a, b, x, y) {
        d += `${f(cx + (a - cx) * 2 / 3)} ${f(cy + (b - cy) * 2 / 3)} ${f(x + (a - x) * 2 / 3)} ${f(y + (b - y) * 2 / 3)} ${f(x)} ${f(y)} c `;
        cx = x; cy = y;
      },
      closePath() { d += 'h '; },
    });
    return d;
  }
  const rgb = (hex) => [1, 3, 5].map((i) => f(parseInt(hex.slice(i, i + 2), 16) / 255)).join(' ');
  const enc = new TextEncoder();

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) { return null; }
  }

  /* pages: a sheet board's pages, each exported as its own PDF page at its true paper size
     (board units are CSS pixels, 96 per inch; PDF units are points, 72 per inch). Without pages
     the whole drawing (b) becomes one page, one unit per point as before. */
  WB.toPDF = async function (strokes, b, bg, payload, pages, pattern) {
    const sheet = pages && pages.length ? pages : null;
    const pageList = sheet || [b];
    const k = sheet ? 0.75 : Math.min(1, 14400 / b.w, 14400 / b.h); // PDF pages max out at 14400 units
    const bbox = `[${f(b.x)} ${f(b.y)} ${f(b.x + b.w)} ${f(b.y + b.h)}]`;
    const rect = `${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)} re`;

    const objs = [null, null]; // 1 catalog, 2 page tree (filled in at the end)
    const add = (body) => (objs.push(body), objs.length);
    const alphaObj = new Map();
    const newStream = () => ({ ops: '1 J 1 j\n', gs: new Map(), xo: new Map() });
    function alpha(st, o) {
      const name = 'A' + Math.round(o * 1000);
      if (!alphaObj.has(name)) alphaObj.set(name, add(`<< /Type /ExtGState /CA ${f(o)} /ca ${f(o)} >>`));
      st.gs.set(name, alphaObj.get(name));
      return name;
    }
    const resources = (st) => {
      const dict = (m) => [...m].map(([n, id]) => `/${n} ${id} 0 R`).join(' ');
      return `<< /ExtGState << ${dict(st.gs)} >> /XObject << ${dict(st.xo)} >> >>`;
    };
    async function streamObj(dict, text) {
      const raw = typeof text === 'string' ? enc.encode(text) : text, z = await deflate(raw), data = z || raw;
      const head = enc.encode(`<< ${dict} /Length ${data.length}${z ? ' /Filter /FlateDecode' : ''} >>\nstream\n`);
      const tail = enc.encode('\nendstream');
      const out = new Uint8Array(head.length + data.length + tail.length);
      out.set(head); out.set(data, head.length); out.set(tail, head.length + data.length);
      return add(out);
    }
    /* A PDF page's picture: a JPEG goes in as it is; anything else as raw pixels. */
    /* A PDF page's picture: a JPEG goes in as it is, its size read from its header, so nothing is
       decoded; it is tagged /WhiteboardPage n so Import can take it back out (see extractBoard).
       Anything else is decoded, for this page only, and goes in as raw pixels. */
    async function pageImage(p, index) {
      if (p.src.startsWith('data:image/jpeg;base64,')) {
        const data = fromB64(p.src.slice(23)), size = jpegSize(data);
        if (size) {
          const dims = `/Width ${size.w} /Height ${size.h} /BitsPerComponent 8 /ColorSpace /DeviceRGB`;
          const head = enc.encode(`<< /Type /XObject /Subtype /Image ${dims} /Filter /DCTDecode /WhiteboardPage ${index} /Length ${data.length} >>\nstream\n`), tail = enc.encode('\nendstream');
          const out = new Uint8Array(head.length + data.length + tail.length);
          out.set(head); out.set(data, head.length); out.set(tail, head.length + data.length);
          return add(out);
        }
      }
      const { img, done } = await borrow(p);
      if (!img.naturalWidth) { done(); return 0; }
      const dims = `/Width ${img.naturalWidth} /Height ${img.naturalHeight} /BitsPerComponent 8 /ColorSpace /DeviceRGB`;
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0); done();
      const px = g.getImageData(0, 0, cv.width, cv.height).data, n = cv.width * cv.height, rgbBytes = new Uint8Array(n * 3);
      for (let i = 0; i < n; i++) { rgbBytes[3 * i] = px[4 * i]; rgbBytes[3 * i + 1] = px[4 * i + 1]; rgbBytes[3 * i + 2] = px[4 * i + 2]; }
      return streamObj(`/Type /XObject /Subtype /Image ${dims}`, rgbBytes);
    }
    const formObj = (st, cs) => streamObj(
      `/Type /XObject /Subtype /Form /BBox ${bbox} /Group << /S /Transparency /CS /${cs} /I true >> /Resources ${resources(st)}`, st.ops);

    let cur = newStream(), has = false, n = 0, tn = 0;
    for (const run of runs(strokes)) {
      if (run.kind === 'ink') {
        for (const s of run.items) {
          if (s.tool === 'image') {
            // The picture's pixels, at most 4000 px on the long side, with its transparency as a soft mask.
            const { img, done } = await borrow(s);
            if (!img.naturalWidth) { done(); continue; }
            const q = Math.min(1, 4000 / Math.max(img.naturalWidth, img.naturalHeight));
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(img.naturalWidth * q)); cv.height = Math.max(1, Math.round(img.naturalHeight * q));
            const g = cv.getContext('2d');
            g.drawImage(img, 0, 0, cv.width, cv.height);
            done();
            const px = g.getImageData(0, 0, cv.width, cv.height).data, n = cv.width * cv.height;
            const rgbBytes = new Uint8Array(n * 3), a = new Uint8Array(n);
            let clear = false;
            for (let i = 0; i < n; i++) {
              rgbBytes[3 * i] = px[4 * i]; rgbBytes[3 * i + 1] = px[4 * i + 1]; rgbBytes[3 * i + 2] = px[4 * i + 2];
              a[i] = px[4 * i + 3]; if (a[i] < 255) clear = true;
            }
            const dims = `/Width ${cv.width} /Height ${cv.height} /BitsPerComponent 8`;
            const maskId = clear ? await streamObj(`/Type /XObject /Subtype /Image ${dims} /ColorSpace /DeviceGray`, a) : 0;
            const imgId = await streamObj(`/Type /XObject /Subtype /Image ${dims} /ColorSpace /DeviceRGB${clear ? ` /SMask ${maskId} 0 R` : ''}`, rgbBytes);
            const name = 'I' + (++tn);
            cur.xo.set(name, imgId);
            // The image's unit square onto its turned box (PDF images run bottom-up).
            const co = Math.cos(s.rot || 0), si = Math.sin(s.rot || 0), cx = s.x + s.w / 2, cy = s.y + s.h / 2;
            const m = [co * s.w, si * s.w, si * s.h, -co * s.h, cx - (co * s.w + si * s.h) / 2, cy - (si * s.w - co * s.h) / 2];
            cur.ops += `q /${alpha(cur, s.opacity)} gs ${m.map(f).join(' ')} cm /${name} Do Q\n`;
          } else if (s.tool === 'text') {
            // Text goes in as a high-resolution alpha image in the text colour, so every font
            // and script looks exactly as it does on the board without embedding font files.
            const L = WB.textLayout(s), pad = s.size * 0.25, tw = L.w + 2 * pad, th = L.h + 2 * pad;
            const q = Math.min(96 / s.size, 4000 / tw, 4000 / th);
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.ceil(tw * q)); cv.height = Math.max(1, Math.ceil(th * q));
            const g = cv.getContext('2d');
            g.setTransform(q, 0, 0, q, (pad - s.x) * q, (pad - s.y) * q);
            WB.paint(g, { tool: 'text', x: s.x, y: s.y, text: s.text, font: s.font, size: s.size, color: '#000000', opacity: 1 });
            const px = g.getImageData(0, 0, cv.width, cv.height).data, a = new Uint8Array(cv.width * cv.height);
            for (let i = 0; i < a.length; i++) a[i] = px[i * 4 + 3];
            const maskId = await streamObj(`/Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceGray /BitsPerComponent 8`, a);
            const c = [1, 3, 5].map((i) => parseInt(s.color.slice(i, i + 2), 16));
            const imgId = await streamObj(`/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask ${maskId} 0 R`, new Uint8Array(c));
            const name = 'T' + (++tn);
            cur.xo.set(name, imgId);
            // The text image's unit square onto its (possibly turned) box; the box turns about the text's anchor.
            const co = Math.cos(s.rot || 0), si = Math.sin(s.rot || 0);
            const bx = s.x - pad * co + pad * si, by = s.y - pad * si - pad * co;   // top-left corner of the padded box
            const tm = [co * tw, si * tw, si * th, -co * th, bx - si * th, by + co * th];
            cur.ops += `q /${alpha(cur, s.opacity)} gs ${tm.map(f).join(' ')} cm /${name} Do Q\n`;
          } else if (s.tool === 'fill') {
            const op = `/${alpha(cur, s.opacity)} gs ${rgb(s.color)} rg ${pdfPath(s)}f*\n`;
            cur.ops = s.under ? op + cur.ops : cur.ops + op;
          } else if (WB.hasPress(s)) cur.ops += `/${alpha(cur, s.opacity)} gs ${rgb(s.color)} rg ${pdfPath(s, true)}f\n`;
          else if (s.hl) cur.ops = `/${alpha(cur, s.opacity)} gs ${rgb(s.color)} RG ${f(s.width)} w 2 J [] 0 d ${pdfPath(s)}S 1 J\n` + cur.ops;   // beneath, like an "under" fill
          else cur.ops += `/${alpha(cur, s.opacity)} gs ${rgb(s.color)} RG ${f(s.width)} w [${(WB.dashOf(s) || []).map(f).join(' ')}] 0 d ${pdfPath(s)}S\n`;
        }
        has = true;
      } else if (has) {
        const mask = newStream();
        mask.ops += `1 g ${rect} f\n`;
        for (const s of run.items) mask.ops += `/${alpha(mask, s.opacity)} gs 0 G ${f(s.width)} w ${pdfPath(s)}S\n`;
        const maskId = await formObj(mask, 'DeviceGray');
        const smId = add(`<< /Type /ExtGState /SMask << /Type /Mask /S /Luminosity /G ${maskId} 0 R >> >>`);
        const groupId = await formObj(cur, 'DeviceRGB');
        n++;
        cur = newStream();
        cur.gs.set('M' + n, smId); cur.xo.set('X' + n, groupId);
        cur.ops += `q /M${n} gs /X${n} Do Q\n`;
      }
    }

    // Several pages share the drawing as one form, so it is stored once.
    let inkOps = cur.ops, inkRes = cur;
    if (pageList.length > 1) {
      const formId = await formObj(cur, 'DeviceRGB');
      inkRes = newStream(); inkRes.xo.set('Ink', formId);
      inkOps = '/Ink Do\n';
    }
    const kids = [];
    for (const [pi, p] of pageList.entries()) {
      const st = newStream();
      for (const [n2, id] of inkRes.gs) st.gs.set(n2, id);
      for (const [n2, id] of inkRes.xo) st.xo.set(n2, id);
      const pr = `${f(p.x)} ${f(p.y)} ${f(p.w)} ${f(p.h)} re`;
      let ops = `q ${f(k)} 0 0 ${f(-k)} ${f(-p.x * k)} ${f((p.y + p.h) * k)} cm\n` + (sheet ? `${pr} W n\n` : '') + (bg ? `${rgb(bg)} rg ${pr} f\n` : '');
      if (pattern) {
        // Dots are zero-length strokes with round caps; lines and the grid are hairlines of 1 unit.
        const xs = gridSteps(p.x, p.w), ys = gridSteps(p.y, p.h);
        let path = '';
        if (pattern.kind === 'dots') for (const y of ys) for (const x of xs) path += `${f(x)} ${f(y)} m ${f(x)} ${f(y)} l `;
        else {
          for (const y of ys) path += `${f(p.x)} ${f(y)} m ${f(p.x + p.w)} ${f(y)} l `;
          if (pattern.kind === 'lines') for (const x of xs) path += `${f(x)} ${f(p.y)} m ${f(x)} ${f(p.y + p.h)} l `;
        }
        if (path) ops += `q /${alpha(st, pattern.alpha)} gs ${rgb(pattern.color)} RG ${pattern.kind === 'dots' ? '2.4 w 1 J' : '1 w 0 J'} ${path}S Q\n`;
      }
      if (p.src) {
        const id = await pageImage(p, pi);
        if (id) { st.xo.set('P', id); ops += `q ${f(p.w)} 0 0 ${f(-p.h)} ${f(p.x)} ${f(p.y + p.h)} cm /P Do Q\n`; }
      }
      const contentId = await streamObj('', ops + inkOps + 'Q\n');
      kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(p.w * k)} ${f(p.h * k)}] /Contents ${contentId} 0 R ` +
        `/Group << /S /Transparency /CS /DeviceRGB >> /Resources ${resources(st)} >>`));
    }
    // The board itself, for Import: an uncompressed stream nothing refers to, so viewers ignore it.
    if (payload) add(`<< /Type /WhiteboardBoard /Length ${payload.length} >>\nstream\n${payload}\nendstream`);
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[1] = `<< /Type /Pages /Kids [${kids.map((id) => id + ' 0 R').join(' ')}] /Count ${kids.length} >>`;

    const parts = [], offsets = [];
    let pos = 0;
    const push = (x) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); pos += u.length; };
    push('%PDF-1.4\n'); push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
    objs.forEach((body, i) => { offsets.push(pos); push(`${i + 1} 0 obj\n`); push(body); push('\nendobj\n'); });
    const xref = pos;
    push(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
    push(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: 'application/pdf' });
  };

  /* ---- The board inside its exports ------------------------------------
     Every export carries the board it was made from, so Import can give back the editable
     board, not just a picture of it. The board travels as one ASCII run,
       WHTBD-DATA:<z|j>:<base64>:END     (z = deflate-compressed .whtbd, j = plain .whtbd)
     placed where each format's readers skip unknown data: a PNG text chunk, a WebP extra
     chunk, after the end of a JPEG or BMP, an SVG <metadata> element, an unused PDF stream.
     Reading is the same for every format: find that run anywhere in the file. */
  const toB64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  WB.boardPayload = async function (text) {
    const raw = enc.encode(text), z = await deflate(raw);
    return z ? `WHTBD-DATA:z:${toB64(z)}:END` : `WHTBD-DATA:j:${toB64(raw)}:END`;
  };
  /* The .whtbd text carried inside an export, or null when the file carries none. */
  WB.extractBoard = async function (buffer) {
    const s = new TextDecoder('latin1').decode(buffer);
    const i = s.lastIndexOf('WHTBD-DATA:');
    if (i < 0) return null;
    const m = /^WHTBD-DATA:([zj]):([A-Za-z0-9+/=]+):END/.exec(s.slice(i));
    if (!m) return null;
    let text;
    try {
      const bytes = fromB64(m[2]);
      text = new TextDecoder().decode(m[1] === 'z' ? await inflate(bytes) : bytes);
    } catch (e) { return null; }
    // A PDF export doesn't repeat its page pictures inside the board (that would double its size):
    // the board says "whiteboard-pdf-page:n", and the picture is page n's own JPEG in the PDF.
    if (!text.includes(PDF_PAGE)) return text;
    try {
      const d = JSON.parse(text), u8 = new Uint8Array(buffer);
      for (const p of d.pages || []) {
        if (typeof p.src !== 'string' || !p.src.startsWith(PDF_PAGE)) continue;
        const at = s.indexOf(`/WhiteboardPage ${p.src.slice(PDF_PAGE.length)} `);
        const lm = at < 0 ? null : /^[^>]*\/Length (\d+) >>\nstream\n/.exec(s.slice(at, at + 200));
        if (!lm) { delete p.src; continue; }
        const start = at + lm[0].length;
        p.src = 'data:image/jpeg;base64,' + toB64(u8.subarray(start, start + +lm[1]));
      }
      return JSON.stringify(d);
    } catch (e) { return text; }
  };
  const PDF_PAGE = 'whiteboard-pdf-page:';
  /* The board to put inside a PDF export: page JPEGs replaced by references to the PDF's own. */
  WB.pdfPayloadDoc = (doc) => ({ ...doc, pages: doc.pages.map((p, i) => (p.src && p.src.startsWith('data:image/jpeg;base64,') ? { ...p, src: PDF_PAGE + i } : p)) });

  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const ascii = (u8, at, n) => String.fromCharCode(...u8.subarray(at, at + n));
  const join = (...parts) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };

  /* Put the payload into an exported bitmap (png, jpeg, webp or bmp) of w × h pixels. */
  WB.embedPayload = async function (blob, payload, w, h) {
    const u8 = new Uint8Array(await blob.arrayBuffer()), data = enc.encode(payload);
    let out = null;
    if (u8[0] === 0x89 && ascii(u8, 1, 3) === 'PNG') {
      // A tEXt chunk ("WHTBD" keyword) just before the closing IEND chunk.
      const iend = u8.length - 12;
      if (ascii(u8, iend + 4, 4) === 'IEND') {
        const body = join(enc.encode('tEXtWHTBD\0'), data), chunk = new Uint8Array(body.length + 8), dv = new DataView(chunk.buffer);
        dv.setUint32(0, body.length - 4); chunk.set(body, 4); dv.setUint32(4 + body.length, crc32(body));
        out = join(u8.subarray(0, iend), chunk, u8.subarray(iend));
      }
    } else if (ascii(u8, 0, 4) === 'RIFF' && ascii(u8, 8, 4) === 'WEBP') {
      // Extra chunks are only allowed in the extended layout, so a simple WebP gets a VP8X header first.
      let rest = u8.subarray(12);
      const kind = ascii(u8, 12, 4);
      if (kind !== 'VP8X') {
        const x = new Uint8Array(18), dv = new DataView(x.buffer);
        x.set(enc.encode('VP8X')); dv.setUint32(4, 10, true);
        x[8] = kind === 'VP8L' ? 0x10 : 0;   // a lossless image may carry transparency
        for (let i = 0; i < 3; i++) { x[12 + i] = ((w - 1) >> (8 * i)) & 255; x[15 + i] = ((h - 1) >> (8 * i)) & 255; }   // 24-bit sizes
        rest = join(x, rest);
      }
      const pad = data.length & 1, chunk = new Uint8Array(8 + data.length + pad), dv = new DataView(chunk.buffer);
      chunk.set(enc.encode('WTBD')); dv.setUint32(4, data.length, true); chunk.set(data, 8);
      out = join(enc.encode('RIFF'), new Uint8Array(4), enc.encode('WEBP'), rest, chunk);
      new DataView(out.buffer).setUint32(4, out.length - 8, true);
    } else {
      // JPEG and BMP: readers stop at the end of the image, so anything after it is left alone.
      out = join(u8, data);
    }
    return new Blob([out || u8], { type: blob.type });
  };

  /* ---- Pictures from other programs ------------------------------------
     A file without a board inside becomes a picture object. Returns { src, w, h } (w × h is
     its natural size in CSS pixels), or null for a file that cannot be shown as a picture.
     Big pictures are scaled to at most 4096 px on the long side; formats canvases can draw
     but boards should not store (BMP, SVG) are converted to PNG or JPEG. */
  const MAX_PIC = 4096;
  WB.pictureFromFile = async function (file) {
    const type = file.type || '', name = file.name.toLowerCase();
    const svg = type === 'image/svg+xml' || name.endsWith('.svg');
    const url = URL.createObjectURL(svg ? new Blob([await file.text()], { type: 'image/svg+xml' }) : file);
    try {
      const img = new Image();
      img.src = url;
      if (!(await WB.imageReady(img))) return null;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (!w || !h) { if (!svg) return null; w = 1024; h = 768; }      // an SVG without a size of its own
      const kept = /^image\/(png|jpeg|webp|gif)$/.test(type) && Math.max(w, h) <= MAX_PIC;
      if (kept) {
        const src = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
        return { src, w, h };
      }
      // Draw it out: vector art at twice its size for crisp zooming, everything within the size limit.
      const k = Math.min(svg ? 2 : 1, MAX_PIC / Math.max(w, h));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const opaque = type === 'image/jpeg' || type === 'image/bmp' || name.endsWith('.bmp');
      return { src: cv.toDataURL(opaque ? 'image/jpeg' : 'image/png', 0.92), w, h };
    } finally { URL.revokeObjectURL(url); }
  };
})();
