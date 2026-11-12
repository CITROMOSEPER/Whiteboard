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
    const lines = doc.strokes.map((s) => {
      if (s.tool === 'text') {
        return `    { "tool": "text", "x": ${f(s.x)}, "y": ${f(s.y)}, "font": "${s.font}", "size": ${+s.size.toFixed(3)}, "color": "${s.color}", "opacity": ${+s.opacity.toFixed(3)}, "text": ${JSON.stringify(s.text)} }`;
      }
      if (s.tool === 'image') {
        return `    { "tool": "image", "x": ${f(s.x)}, "y": ${f(s.y)}, "w": ${f(s.w)}, "h": ${f(s.h)}, "opacity": ${+s.opacity.toFixed(3)}, "src": ${JSON.stringify(s.src)} }`;
      }
      if (s.tool === 'fill') {
        const rings = s.rings.map((r) => { const q = []; for (let i = 0; i < r.length; i += 2) q.push(`[${f(r[i])},${f(r[i + 1])}]`); return `[${q.join(',')}]`; });
        return `    { "tool": "fill", "color": "${s.color}", "opacity": ${+s.opacity.toFixed(3)}, "under": ${!!s.under}, "rings": [${rings.join(',')}] }`;
      }
      const p = s.points, pts = [];
      for (let i = 0; i < p.length; i += 2) pts.push(`[${f(p[i])},${f(p[i + 1])}]`);
      let o = `{ "tool": "${s.tool}", `;
      if (s.tool === 'pen') o += `"color": "${s.color}", `;
      o += `"width": ${+s.width.toFixed(3)}, "opacity": ${+s.opacity.toFixed(3)}, "smooth": ${!!s.smooth}, "closed": ${!!s.closed}, `;
      if (s.shape) o += `"shape": "${s.shape}", `;
      return `    ${o}"points": [${pts.join(',')}] }`;
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
    const num = (v, def) => (typeof v === 'number' && isFinite(v) ? v : def);
    const strokes = [];
    const hex = (c) => (/^#[0-9a-f]{6}$/i.test(c) ? c.toLowerCase() : '#000000');
    for (const s of d.strokes) {
      if (s && s.tool === 'text') {
        if (typeof s.text === 'string' && s.text.trim() && isFinite(s.x) && isFinite(s.y)) {
          strokes.push({ tool: 'text', x: +s.x, y: +s.y, text: s.text.slice(0, 20000), font: WB.FONTS[s.font] ? s.font : 'sans',
            size: Math.max(0.01, num(s.size, 24)), color: hex(s.color), opacity: Math.min(1, Math.max(0.01, num(s.opacity, 1))), width: 0 });
        }
        continue;
      }
      if (s && s.tool === 'image') {
        if (typeof s.src === 'string' && /^data:image\/(png|jpeg|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/.test(s.src) &&
            isFinite(s.x) && isFinite(s.y) && num(s.w, 0) > 0 && num(s.h, 0) > 0) {
          strokes.push({ tool: 'image', x: +s.x, y: +s.y, w: +s.w, h: +s.h, opacity: Math.min(1, Math.max(0.01, num(s.opacity, 1))), src: s.src, width: 0 });
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
      if (typeof s.shape === 'string') st.shape = s.shape.replace(/[^a-z]/gi, '').slice(0, 24);
      strokes.push(st);
    }
    const v = d.view || {};
    const created = Date.parse(d.created);
    return {
      title: typeof d.title === 'string' && d.title.trim() ? d.title.slice(0, 80) : 'Untitled',
      created: isFinite(created) ? created : Date.now(),
      strokes,
      view: { x: num(v.x, 0), y: num(v.y, 0), zoom: Math.min(64, Math.max(0.02, num(v.zoom, 1))) },
    };
  };

  /* ---- Bitmap -------------------------------------------------------- */
  const MAX_SIDE = 12000, MAX_AREA = 120e6;

  /* b = {x,y,w,h} in world units. Returns { canvas, scale } (scale may be reduced to fit limits). */
  WB.renderToCanvas = function (strokes, b, scale, bg) {
    scale = Math.min(scale, MAX_SIDE / b.w, MAX_SIDE / b.h, Math.sqrt(MAX_AREA / (b.w * b.h)));
    const w = Math.max(1, Math.round(b.w * scale)), h = Math.max(1, Math.round(b.h * scale));
    const ink = document.createElement('canvas'); ink.width = w; ink.height = h;
    const c = ink.getContext('2d');
    c.setTransform(scale, 0, 0, scale, -b.x * scale, -b.y * scale);
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of strokes) WB.paint(c, s);
    if (!bg) return { canvas: ink, scale };
    // Erasers cut holes in the ink layer, so the background goes on a separate layer underneath.
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const o = out.getContext('2d');
    o.fillStyle = bg; o.fillRect(0, 0, w, h); o.drawImage(ink, 0, 0);
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
  function svgPath(s) {
    let d = '';
    WB.trace(s, {
      moveTo(x, y) { d += `M${f(x)} ${f(y)}`; },
      lineTo(x, y) { d += `L${f(x)} ${f(y)}`; },
      quadraticCurveTo(a, b, x, y) { d += `Q${f(a)} ${f(b)} ${f(x)} ${f(y)}`; },
      closePath() { d += 'Z'; },
    });
    return d;
  }

  WB.toSVG = function (strokes, b, bg, payload) {
    const box = `x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}"`;
    let defs = '', body = '', n = 0;
    for (const run of runs(strokes)) {
      if (run.kind === 'ink') {
        for (const s of run.items) {
          if (s.tool === 'image') {
            body += `<image x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" preserveAspectRatio="none"${s.opacity < 1 ? ` opacity="${f(s.opacity)}"` : ''} xlink:href="${s.src}"/>\n`;
          } else if (s.tool === 'text') {
            const L = WB.textLayout(s);
            body += `<text font-family="${esc(WB.FONTS[s.font] || WB.FONTS.sans)}" font-size="${f(s.size)}" fill="${s.color}"${s.opacity < 1 ? ` fill-opacity="${f(s.opacity)}"` : ''} stroke="none" xml:space="preserve">` +
              L.lines.map((l, i) => `<tspan x="${f(s.x)}" y="${f(s.y + i * L.lh + L.base)}">${esc(l)}</tspan>`).join('') + '</text>\n';
          } else if (s.tool === 'fill') {
            // An "under" fill sits beneath everything drawn before it, so it goes first in the document.
            const el = `<path d="${svgPath(s)}" fill="${s.color}" fill-rule="evenodd"${s.opacity < 1 ? ` fill-opacity="${f(s.opacity)}"` : ''} stroke="none"/>\n`;
            body = s.under ? el + body : body + el;
          } else body += `<path d="${svgPath(s)}" stroke="${s.color}" stroke-width="${f(s.width)}"${s.opacity < 1 ? ` stroke-opacity="${f(s.opacity)}"` : ''}/>\n`;
        }
      } else if (body) {
        const id = 'erase' + (++n);
        defs += `<mask id="${id}" maskUnits="userSpaceOnUse" ${box}>\n<rect ${box} fill="#fff" stroke="none"/>\n`;
        for (const s of run.items) defs += `<path d="${svgPath(s)}" stroke="#000" stroke-width="${f(s.width)}" stroke-opacity="${f(s.opacity)}"/>\n`;
        defs += '</mask>\n';
        body = `<g mask="url(#${id})">\n${body}</g>\n`;
      }
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}" width="${f(b.w)}" height="${f(b.h)}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n` +
      (defs ? `<defs>\n${defs}</defs>\n` : '') +
      (bg ? `<rect ${box} fill="${bg}" stroke="none"/>\n` : '') +
      body + (payload ? `<metadata id="whiteboard-board">${payload}</metadata>\n` : '') + '</svg>\n';
  };

  /* ---- PDF -----------------------------------------------------------
     Vector output. Eraser runs become luminosity soft masks applied to a
     transparency group holding everything drawn before them. */
  function pdfPath(s) {
    let d = '', cx = 0, cy = 0;
    WB.trace(s, {
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

  WB.toPDF = async function (strokes, b, bg, payload) {
    const k = Math.min(1, 14400 / b.w, 14400 / b.h); // PDF pages max out at 14400 units
    const PW = f(b.w * k), PH = f(b.h * k);
    const bbox = `[${f(b.x)} ${f(b.y)} ${f(b.x + b.w)} ${f(b.y + b.h)}]`;
    const rect = `${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)} re`;

    const objs = [null, null, null]; // 1 catalog, 2 pages, 3 page (filled in at the end)
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
    const formObj = (st, cs) => streamObj(
      `/Type /XObject /Subtype /Form /BBox ${bbox} /Group << /S /Transparency /CS /${cs} /I true >> /Resources ${resources(st)}`, st.ops);

    let cur = newStream(), has = false, n = 0, tn = 0;
    for (const run of runs(strokes)) {
      if (run.kind === 'ink') {
        for (const s of run.items) {
          if (s.tool === 'image') {
            // The picture's pixels, at most 4000 px on the long side, with its transparency as a soft mask.
            const img = WB.imageOf(s);
            if (!img.complete || !img.naturalWidth) continue;
            const q = Math.min(1, 4000 / Math.max(img.naturalWidth, img.naturalHeight));
            const cv = document.createElement('canvas');
            cv.width = Math.max(1, Math.round(img.naturalWidth * q)); cv.height = Math.max(1, Math.round(img.naturalHeight * q));
            const g = cv.getContext('2d');
            g.drawImage(img, 0, 0, cv.width, cv.height);
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
            cur.ops += `q /${alpha(cur, s.opacity)} gs ${f(s.w)} 0 0 ${f(-s.h)} ${f(s.x)} ${f(s.y + s.h)} cm /${name} Do Q\n`;
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
            cur.ops += `q /${alpha(cur, s.opacity)} gs ${f(tw)} 0 0 ${f(-th)} ${f(s.x - pad)} ${f(s.y - pad + th)} cm /${name} Do Q\n`;
          } else if (s.tool === 'fill') {
            const op = `/${alpha(cur, s.opacity)} gs ${rgb(s.color)} rg ${pdfPath(s)}f*\n`;
            cur.ops = s.under ? op + cur.ops : cur.ops + op;
          } else cur.ops += `/${alpha(cur, s.opacity)} gs ${rgb(s.color)} RG ${f(s.width)} w ${pdfPath(s)}S\n`;
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

    const page = `q ${f(k)} 0 0 ${f(-k)} ${f(-b.x * k)} ${f((b.y + b.h) * k)} cm\n` +
      (bg ? `${rgb(bg)} rg ${rect} f\n` : '') + cur.ops + 'Q\n';
    const contentId = await streamObj('', page);
    // The board itself, for Import: an uncompressed stream nothing refers to, so viewers ignore it.
    if (payload) add(`<< /Type /WhiteboardBoard /Length ${payload.length} >>\nstream\n${payload}\nendstream`);
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[1] = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
    objs[2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents ${contentId} 0 R ` +
      `/Group << /S /Transparency /CS /DeviceRGB >> /Resources ${resources(cur)} >>`;

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
    try {
      const bytes = fromB64(m[2]);
      return new TextDecoder().decode(m[1] === 'z' ? await inflate(bytes) : bytes);
    } catch (e) { return null; }
  };

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
      try { await img.decode(); } catch (e) { return null; }
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
