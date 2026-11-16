/* Share links: a whole board packed into the part of a link after "#b=".

   The fragment never leaves the browser (it is not sent to the server), so the board stays
   between the people who have the link. Links get long quickly, so the board is packed tightly:

     1. Strokes are simplified (Ramer-Douglas-Peucker) with a tolerance well under a pixel.
     2. Points are rounded to a grid fine enough for the stroke: a quarter of its width, at most
        half a unit, so writing done while zoomed far in survives.
     3. After the first point, each point is stored as its step from the one before, as a zigzag
        varint: most steps fit in one byte.
     4. Binary layout, with a colour table so each colour is written once.
     5. The result is deflated and written as base64url.

   Layout (version 1); "uv"/"sv" are unsigned/signed varints, "f" a float32, "str" a uv length + UTF-8:
     u8 version · str title · uv pages, each f x, y, w, h · uv colours, each 3 bytes RGB · uv objects:
       u8 kind 0 pen, 1 eraser:  u8 flags (1 smooth, 2 closed, 4 highlighter, 8 pressure, 16 shape, 32 dash)
                                 [uv colour] f width · u8 opacity · [u8 dash] [str shape] · points · [u8 pressure per point]
       u8 kind 2 text:           f x, y, rot, size · u8 font · uv colour · u8 opacity · str text
       u8 kind 3 fill:           uv colour · u8 opacity · u8 under · uv rings, each: points
       u8 kind 4 graph:          f x, y, w, h, rot · u8 opacity · f64 cx, cy, span · uv functions, each: uv colour · str source
       u8 kind 5 maths text:     as kind 2 (the text holds $…$ maths)
     points = u8 (grid exponent + 8) · uv count · sv x0, y0 (in grid steps) · sv dx, dy ...
   Pictures (and the page pictures of an opened PDF) are left out: they would make links far too long. */
(function () {
  'use strict';
  const WB = window.WB;
  const FONTS = ['sans', 'serif', 'mono', 'rounded', 'hand'];
  const DASHES = ['dotted', 'dashed', 'long', 'dashdot'];
  const te = new TextEncoder(), td = new TextDecoder();

  class Out {
    constructor() { this.b = new Uint8Array(4096); this.n = 0; }
    need(k) { if (this.n + k > this.b.length) { const nb = new Uint8Array(Math.max(this.b.length * 2, this.n + k)); nb.set(this.b); this.b = nb; } }
    u8(v) { this.need(1); this.b[this.n++] = v & 255; }
    uv(v) { v = Math.max(0, Math.floor(v)); while (v >= 128) { this.u8((v % 128) | 128); v = Math.floor(v / 128); } this.u8(v); }
    sv(v) { this.uv(v < 0 ? -2 * v - 1 : 2 * v); }
    f(v) { this.need(4); new DataView(this.b.buffer).setFloat32(this.n, v, true); this.n += 4; }
    d(v) { this.need(8); new DataView(this.b.buffer).setFloat64(this.n, v, true); this.n += 8; }
    str(s) { const u = te.encode(s); this.uv(u.length); this.need(u.length); this.b.set(u, this.n); this.n += u.length; }
  }
  class In {
    constructor(u) { this.b = u; this.n = 0; this.dv = new DataView(u.buffer, u.byteOffset, u.byteLength); }
    u8() { if (this.n >= this.b.length) throw new Error('the link ends too early'); return this.b[this.n++]; }
    uv() { let v = 0, m = 1, x; do { x = this.u8(); v += (x & 127) * m; m *= 128; } while (x & 128); return v; }
    sv() { const v = this.uv(); return v % 2 ? -(v + 1) / 2 : v / 2; }
    f() { if (this.n + 4 > this.b.length) throw new Error('the link ends too early'); const v = this.dv.getFloat32(this.n, true); this.n += 4; return v; }
    d() { if (this.n + 8 > this.b.length) throw new Error('the link ends too early'); const v = this.dv.getFloat64(this.n, true); this.n += 8; return v; }
    str() { const l = this.uv(); if (this.n + l > this.b.length) throw new Error('the link ends too early'); const s = td.decode(this.b.subarray(this.n, this.n + l)); this.n += l; return s; }
  }

  /* Indices of the points to keep, simplified with tolerance eps. */
  function simplify(p, eps, closed) {
    const n = p.length >> 1;
    if (n < 3) return [...Array(n).keys()];
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      const ax = p[2 * a], ay = p[2 * a + 1], dx = p[2 * b] - ax, dy = p[2 * b + 1] - ay, l2 = dx * dx + dy * dy;
      let md = 0, mi = -1;
      for (let i = a + 1; i < b; i++) {
        let t = l2 ? ((p[2 * i] - ax) * dx + (p[2 * i + 1] - ay) * dy) / l2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(p[2 * i] - ax - t * dx, p[2 * i + 1] - ay - t * dy);
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    if (closed && n > 3) keep[n >> 1] = 1;   // a closed loop's ends meet: keep its far side too
    const out = [];
    for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
    return out;
  }
  /* Simplifying looks only at the line's shape, so on a straight line pressed harder in the middle
     the change would vanish. Points where the pressure has moved by more than 0.08 since the last
     kept point are kept as well. */
  function keepPressure(idx, press) {
    const keep = new Set(idx), out = [];
    let last = press[0];
    for (let i = 0; i < press.length; i++) {
      if (keep.has(i) || Math.abs(press[i] - last) > 0.08) { out.push(i); last = press[i]; }
    }
    return out;
  }
  const gridExp = (size) => Math.min(30, Math.max(-8, Math.ceil(-Math.log2(Math.max(1e-9, size)))));
  function putPoints(o, p, idx, e) {
    const q = Math.pow(2, -e);
    o.u8(e + 8); o.uv(idx.length);
    let lx = 0, ly = 0;
    idx.forEach((i, j) => {
      const x = Math.round(p[2 * i] / q), y = Math.round(p[2 * i + 1] / q);
      if (j === 0) { o.sv(x); o.sv(y); } else { o.sv(x - lx); o.sv(y - ly); }
      lx = x; ly = y;
    });
  }
  /* Points as [x, y] pairs (the file's shape). Each point takes at least two bytes, so a count
     larger than what is left of the link is a damaged link, not a reason to allocate. */
  function getPoints(r) {
    const q = Math.pow(2, -(r.u8() - 8)), n = r.uv(), p = [];
    if (n * 2 > r.b.length - r.n) throw new Error('the link is damaged');
    let x = 0, y = 0;
    for (let j = 0; j < n; j++) { x += r.sv(); y += r.sv(); p.push([x * q, y * q]); }
    return p;
  }
  const opacityByte = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);

  /* Deflate, or inflate. Inflating stops past MAX_BOARD bytes: a link of a few MB could otherwise
     unpack into gigabytes and bring the tab down. */
  const MAX_BOARD = 64 * 1024 * 1024;
  async function squeeze(bytes, inflate) {
    const stream = new Blob([bytes]).stream().pipeThrough(inflate ? new DecompressionStream('deflate-raw') : new CompressionStream('deflate-raw'));
    if (!inflate) return new Uint8Array(await new Response(stream).arrayBuffer());
    const reader = stream.getReader(), parts = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_BOARD) { reader.cancel().catch(() => {}); throw new Error('the board in the link is too large'); }
      parts.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  const toB64url = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  const fromB64url = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

  /* doc -> { text (for after "#b="), images (pictures left out), pdf (page pictures left out) } */
  async function encode(doc) {
    const o = new Out(), colors = new Map();
    const color = (c) => { if (!colors.has(c)) colors.set(c, colors.size); return colors.get(c); };
    const items = doc.strokes.filter((s) => s.tool !== 'image');
    for (const s of items) if (s.color && s.tool !== 'eraser') color(s.color);
    for (const s of items) if (s.tool === 'plot') for (const q of s.fns) color(q.color);
    o.u8(1);
    o.str(doc.title || 'Untitled');
    o.uv(doc.pages.length);
    for (const p of doc.pages) { o.f(p.x); o.f(p.y); o.f(p.w); o.f(p.h); }
    o.uv(colors.size);
    for (const c of colors.keys()) { const n = parseInt(c.slice(1), 16); o.u8(n >> 16); o.u8(n >> 8); o.u8(n); }
    o.uv(items.length);
    for (const s of items) {
      if (s.tool === 'text') {
        o.u8(s.math ? 5 : 2); o.f(s.x); o.f(s.y); o.f(s.rot || 0); o.f(s.size);
        o.u8(Math.max(0, FONTS.indexOf(s.font))); o.uv(color(s.color)); o.u8(opacityByte(s.opacity)); o.str(s.text);
      } else if (s.tool === 'plot') {
        o.u8(4); o.f(s.x); o.f(s.y); o.f(s.w); o.f(s.h); o.f(s.rot || 0); o.u8(opacityByte(s.opacity));
        o.d(s.cx); o.d(s.cy); o.d(s.span);
        o.uv(s.fns.length);
        for (const q of s.fns) { o.uv(color(q.color)); o.str(q.src); }
      } else if (s.tool === 'fill') {
        o.u8(3); o.uv(color(s.color)); o.u8(opacityByte(s.opacity)); o.u8(s.under ? 1 : 0);
        const b = WB.boundsOf(s), e = gridExp(Math.min(0.5, Math.max(b.x1 - b.x0, b.y1 - b.y0) / 1500));
        o.uv(s.rings.length);
        for (const r of s.rings) putPoints(o, r, simplify(r, Math.pow(2, -e) * 0.6, true), e);
      } else {
        const pen = s.tool === 'pen', press = WB.hasPress(s), dash = pen && !s.hl ? DASHES.indexOf(s.dash) : -1;
        const flags = (s.smooth ? 1 : 0) | (s.closed ? 2 : 0) | (s.hl ? 4 : 0) | (press ? 8 : 0) | (s.shape ? 16 : 0) | (dash >= 0 ? 32 : 0);
        o.u8(pen ? 0 : 1); o.u8(flags);
        if (pen) o.uv(color(s.color));
        o.f(s.width); o.u8(opacityByte(s.opacity));
        if (dash >= 0) o.u8(dash);
        if (s.shape) o.str(s.shape);
        const e = gridExp(Math.min(0.5, s.width / 4));
        let idx = simplify(s.points, Math.pow(2, -e) * 0.6, s.closed);
        if (press) idx = keepPressure(idx, s.press);
        putPoints(o, s.points, idx, e);
        if (press) for (const i of idx) o.u8(Math.round(s.press[i] * 255));
      }
    }
    const z = await squeeze(o.b.subarray(0, o.n));
    return {
      text: toB64url(z),
      images: doc.strokes.length - items.length,
      pdf: doc.pages.some((p) => p.src),
    };
  }

  /* text after "#b=" -> { title, strokes, pages, ... }. The link is read into the shape of a .whtbd
     file and goes through the same checks as a file (WB.normalize), so whatever a damaged or
     hand-made link holds, the board it gives can be shown, saved and opened again. */
  async function decode(text) {
    const r = new In(await squeeze(fromB64url(text), true));
    if (r.u8() !== 1) throw new Error('made by a newer version');
    const title = r.str(), pages = [], colors = [], strokes = [];
    const np = r.uv();
    for (let i = 0; i < np; i++) pages.push({ x: r.f(), y: r.f(), w: r.f(), h: r.f() });
    const nc = r.uv();
    for (let i = 0; i < nc; i++) colors.push('#' + [r.u8(), r.u8(), r.u8()].map((v) => v.toString(16).padStart(2, '0')).join(''));
    const col = (i) => colors[i] || '#000000';
    const n = r.uv();
    for (let i = 0; i < n; i++) {
      const kind = r.u8();
      if (kind === 2 || kind === 5) {
        const x = r.f(), y = r.f(), rot = r.f(), size = r.f(), font = FONTS[r.u8()] || 'sans', color = col(r.uv()), opacity = r.u8() / 255, t = r.str();
        strokes.push({ tool: 'text', x, y, rot: (rot * 180) / Math.PI, text: t, font, size, color, opacity, math: kind === 5 });
      } else if (kind === 4) {
        const x = r.f(), y = r.f(), w = r.f(), h = r.f(), rot = r.f(), opacity = r.u8() / 255, cx = r.d(), cy = r.d(), span = r.d(), nf = r.uv(), fns = [];
        if (nf > r.b.length - r.n) throw new Error('the link is damaged');
        for (let j = 0; j < nf; j++) { const color = col(r.uv()); fns.push({ color, src: r.str() }); }
        strokes.push({ tool: 'plot', x, y, w, h, rot: (rot * 180) / Math.PI, opacity, cx, cy, span, fns });
      } else if (kind === 3) {
        const color = col(r.uv()), opacity = r.u8() / 255, under = !!r.u8(), nr = r.uv(), rings = [];
        for (let j = 0; j < nr; j++) rings.push(getPoints(r));
        strokes.push({ tool: 'fill', color, opacity, under, rings });
      } else if (kind === 0 || kind === 1) {
        const flags = r.u8(), s = { tool: kind === 0 ? 'pen' : 'eraser' };
        if (kind === 0) s.color = col(r.uv());
        s.width = r.f(); s.opacity = r.u8() / 255;
        if (flags & 32) s.dash = DASHES[r.u8()];
        if (flags & 16) s.shape = r.str();
        s.points = getPoints(r);
        s.smooth = !!(flags & 1); s.closed = !!(flags & 2);
        if (flags & 4) s.highlight = true;
        if (flags & 8) { s.pressure = []; for (let j = 0; j < s.points.length; j++) s.pressure.push(Math.round((r.u8() / 255) * 100)); }
        strokes.push(s);
      } else throw new Error('unknown object ' + kind);
    }
    return WB.normalize({ title, strokes, pages, created: new Date().toISOString() });
  }

  WB.share = { encode, decode };
})();
