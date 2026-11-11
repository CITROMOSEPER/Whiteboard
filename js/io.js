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

  WB.toSVG = function (strokes, b, bg) {
    const box = `x="${f(b.x)}" y="${f(b.y)}" width="${f(b.w)}" height="${f(b.h)}"`;
    let defs = '', body = '', n = 0;
    for (const run of runs(strokes)) {
      if (run.kind === 'ink') {
        for (const s of run.items) {
          if (s.tool === 'text') {
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
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(b.x)} ${f(b.y)} ${f(b.w)} ${f(b.h)}" width="${f(b.w)}" height="${f(b.h)}" fill="none" stroke-linecap="round" stroke-linejoin="round">\n` +
      (defs ? `<defs>\n${defs}</defs>\n` : '') +
      (bg ? `<rect ${box} fill="${bg}" stroke="none"/>\n` : '') +
      body + '</svg>\n';
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

  WB.toPDF = async function (strokes, b, bg) {
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
          if (s.tool === 'text') {
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
})();
