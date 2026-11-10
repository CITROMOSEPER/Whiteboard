/* Stroke geometry, painting, and shape recognition. */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});
  const hyp = Math.hypot;

  /* ---- Stroke paths --------------------------------------------------
     A stroke is { tool, color, width, opacity, points:[x0,y0,x1,y1,...], smooth, closed }.
     trace() walks it into any sink with the canvas path interface, so the same
     geometry feeds the screen, SVG and PDF. */
  WB.trace = function (s, k) {
    if (s.tool === 'text') return;
    if (s.rings) {                      // a fill: closed outlines, holes included (even-odd)
      for (const r of s.rings) {
        k.moveTo(r[0], r[1]);
        for (let i = 2; i < r.length; i += 2) k.lineTo(r[i], r[i + 1]);
        k.closePath();
      }
      return;
    }
    const p = s.points, n = p.length >> 1;
    if (!n) return;
    if (n === 1) { k.moveTo(p[0], p[1]); k.lineTo(p[0] + 0.01, p[1]); return; }
    if (!s.smooth || n < 3) {
      k.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) k.lineTo(p[i], p[i + 1]);
      if (s.closed) k.closePath();
      return;
    }
    if (s.closed) {
      k.moveTo((p[2 * n - 2] + p[0]) / 2, (p[2 * n - 1] + p[1]) / 2);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        k.quadraticCurveTo(p[2 * i], p[2 * i + 1], (p[2 * i] + p[2 * j]) / 2, (p[2 * i + 1] + p[2 * j + 1]) / 2);
      }
      k.closePath();
      return;
    }
    k.moveTo(p[0], p[1]);
    for (let i = 1; i < n - 1; i++) {
      k.quadraticCurveTo(p[2 * i], p[2 * i + 1], (p[2 * i] + p[2 * i + 2]) / 2, (p[2 * i + 1] + p[2 * i + 3]) / 2);
    }
    k.lineTo(p[2 * n - 2], p[2 * n - 1]);
  };

  WB.pathOf = function (s) {
    if (!s._path) { s._path = new Path2D(); WB.trace(s, s._path); }
    return s._path;
  };

  /* Paint one stroke. The context transform must already map world -> pixels. */
  /* ---- Text ----------------------------------------------------------
     A text object is { tool:'text', x, y, text, font, size, color }. (x, y) is the
     top-left of the first line; lines are left-aligned and split on "\n". */
  WB.FONTS = {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
    serif: 'Georgia, "Times New Roman", serif',
    mono: 'ui-monospace, "Cascadia Mono", Consolas, Menlo, monospace',
    rounded: '"SF Pro Rounded", "Arial Rounded MT Bold", "Varela Round", system-ui, sans-serif',
    hand: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive',
  };
  WB.FONT_NAMES = { sans: 'Sans', serif: 'Serif', mono: 'Mono', rounded: 'Rounded', hand: 'Handwritten' };
  WB.LINE = 1.3;   // line height, as a multiple of the font size
  const mctx = document.createElement('canvas').getContext('2d');
  const family = (s) => WB.FONTS[s.font] || WB.FONTS.sans;

  /* Measured at 100px and scaled, so very small or very large sizes stay exact. */
  WB.textLayout = function (s) {
    if (s._t) return s._t;
    mctx.font = '100px ' + family(s);
    const m = mctx.measureText('Mg'), k = s.size / 100;
    const asc = (m.fontBoundingBoxAscent || 80) * k, desc = (m.fontBoundingBoxDescent || 20) * k;
    const lines = s.text.split('\n'), lh = WB.LINE * s.size;
    let w = 0;
    for (const l of lines) w = Math.max(w, mctx.measureText(l).width * k);
    return (s._t = { lines, w, h: lines.length * lh, lh, base: (lh - asc - desc) / 2 + asc });
  };

  WB.paint = function (c, s, path) {
    if (s.tool === 'text') {
      const L = WB.textLayout(s), k = s.size / 100;
      c.save();
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = s.opacity;
      c.fillStyle = s.color;
      c.translate(s.x, s.y); c.scale(k, k);
      c.font = '100px ' + family(s); c.textBaseline = 'alphabetic';
      for (let i = 0; i < L.lines.length; i++) if (L.lines[i]) c.fillText(L.lines[i], 0, (i * L.lh + L.base) / k);
      c.restore();
      return;
    }
    if (s.tool === 'fill') {
      // "under" fills slide beneath the existing ink, so they never cover the lines that bound them.
      c.globalCompositeOperation = s.under ? 'destination-over' : 'source-over';
      c.globalAlpha = s.opacity;
      c.fillStyle = s.color;
      c.fill(path || WB.pathOf(s), 'evenodd');
      return;
    }
    const erase = s.tool === 'eraser';
    c.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    c.globalAlpha = s.opacity;
    c.strokeStyle = erase ? '#000' : s.color;
    c.lineWidth = s.width;
    c.stroke(path || WB.pathOf(s));
  };

  WB.boundsOf = function (s) {
    if (s._b) return s._b;
    if (s.tool === 'text') { const L = WB.textLayout(s); return (s._b = { x0: s.x, y0: s.y, x1: s.x + L.w, y1: s.y + L.h }); }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of s.rings || [s.points]) {
      for (let i = 0; i < p.length; i += 2) {
        if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i];
        if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1];
      }
    }
    const r = s.rings ? 0 : s.width / 2;
    return (s._b = { x0: x0 - r, y0: y0 - r, x1: x1 + r, y1: y1 + r });
  };

  /* Bounds of everything visible (erasers never extend the drawing). */
  WB.contentBounds = function (strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) {
      if (s.tool === 'eraser') continue;
      const b = WB.boundsOf(s);
      if (b.x0 < x0) x0 = b.x0; if (b.y0 < y0) y0 = b.y0;
      if (b.x1 > x1) x1 = b.x1; if (b.y1 > y1) y1 = b.y1;
    }
    return x0 === Infinity ? null : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  };

  /* ---- Selection hit-testing ----------------------------------------- */
  /* Is world point (x, y) on this object, within `tol`? Erasers are not objects. */
  WB.hit = function (s, x, y, tol) {
    if (s.tool === 'eraser') return false;
    const b = WB.boundsOf(s);
    if (x < b.x0 - tol || x > b.x1 + tol || y < b.y0 - tol || y > b.y1 + tol) return false;
    if (s.tool === 'text') return true;
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    if (s.tool === 'fill') return mctx.isPointInPath(WB.pathOf(s), x, y, 'evenodd');
    mctx.lineWidth = s.width + 2 * tol; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
    return mctx.isPointInStroke(WB.pathOf(s), x, y);
  };

  /* Is most of this object inside the lasso (a closed flat polygon)? */
  WB.inLasso = function (s, poly) {
    if (s.tool === 'eraser') return false;
    let pts;
    if (s.tool === 'text') { const b = WB.boundsOf(s), mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2; pts = [b.x0, b.y0, b.x1, b.y0, b.x1, b.y1, b.x0, b.y1, mx, my]; }
    else pts = s.rings ? s.rings[0] : s.points;
    const n = pts.length >> 1, step = Math.max(1, Math.floor(n / 64)), m = poly.length;
    let inside = 0, total = 0;
    for (let i = 0; i < n; i += step) {
      const x = pts[2 * i], y = pts[2 * i + 1];
      let c = false;
      for (let a = 0, b = m - 2; a < m; b = a, a += 2) {
        const ya = poly[a + 1], yb = poly[b + 1];
        if ((ya > y) !== (yb > y) && x < ((poly[b] - poly[a]) * (y - ya)) / (yb - ya) + poly[a]) c = !c;
      }
      total++; if (c) inside++;
    }
    return total > 0 && inside / total >= 0.6;
  };

  /* ---- Helpers ------------------------------------------------------- */
  function toPairs(flat) {
    const out = []; let lx = NaN, ly = NaN;
    for (let i = 0; i < flat.length; i += 2) {
      const x = flat[i], y = flat[i + 1];
      if (x !== lx || y !== ly) { out.push([x, y]); lx = x; ly = y; }
    }
    return out;
  }
  function toFlat(P) {
    const o = new Array(P.length * 2);
    for (let i = 0; i < P.length; i++) { o[2 * i] = P[i][0]; o[2 * i + 1] = P[i][1]; }
    return o;
  }
  const dist = (a, b) => hyp(a[0] - b[0], a[1] - b[1]);
  function pathLen(P) { let l = 0; for (let i = 1; i < P.length; i++) l += dist(P[i], P[i - 1]); return l; }

  /* n points evenly spaced by arc length, including both ends. */
  function resample(P, n) {
    const L = pathLen(P), last = P[P.length - 1];
    if (!(L > 0)) return Array.from({ length: n }, () => [P[0][0], P[0][1]]);
    const out = [[P[0][0], P[0][1]]], step = L / (n - 1);
    let acc = 0, target = step;
    for (let i = 1; i < P.length && out.length < n - 1; i++) {
      const a = P[i - 1], b = P[i], seg = dist(a, b);
      while (seg > 0 && acc + seg >= target && out.length < n - 1) {
        const t = (target - acc) / seg;
        out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        target += step;
      }
      acc += seg;
    }
    while (out.length < n) out.push([last[0], last[1]]);
    return out;
  }

  function segDist(p, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return hyp(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }

  /* Ramer-Douglas-Peucker simplification. */
  function rdp(P, eps) {
    const n = P.length;
    if (n < 3) return P.slice();
    const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
    const stack = [[0, n - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let md = 0, mi = -1;
      for (let i = a + 1; i < b; i++) { const d = segDist(P[i], P[a], P[b]); if (d > md) { md = d; mi = i; } }
      if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
    }
    return P.filter((_, i) => keep[i]);
  }

  function meanDistToPolyline(P, V, closed) {
    const m = closed ? V.length : V.length - 1;
    let sum = 0;
    for (const p of P) {
      let best = Infinity;
      for (let i = 0; i < m; i++) { const d = segDist(p, V[i], V[(i + 1) % V.length]); if (d < best) best = d; }
      sum += best;
    }
    return sum / P.length;
  }

  function cornerAngle(p, c, q) {
    const ax = p[0] - c[0], ay = p[1] - c[1], bx = q[0] - c[0], by = q[1] - c[1];
    const d = hyp(ax, ay) * hyp(bx, by);
    return d ? Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / d))) : Math.PI;
  }

  const DEG = Math.PI / 180;

  /* ---- Closed shapes ------------------------------------------------- */
  function loopVertices(C, diag) {
    const n = C.length;
    let cx = 0, cy = 0;
    for (const p of C) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    // Start the loop at an extreme point so the seam never lands mid-edge.
    let i0 = 0, md = -1;
    for (let i = 0; i < n; i++) { const d = hyp(C[i][0] - cx, C[i][1] - cy); if (d > md) { md = d; i0 = i; } }
    const R = C.slice(i0).concat(C.slice(0, i0));
    let i1 = 0; md = -1;
    for (let i = 0; i < n; i++) { const d = dist(R[i], R[0]); if (d > md) { md = d; i1 = i; } }
    const eps = 0.06 * diag;
    const A = rdp(R.slice(0, i1 + 1), eps), B = rdp(R.slice(i1).concat([R[0]]), eps);
    const V = A.slice(0, -1).concat(B.slice(0, -1));
    // Merge doubled-up corners and drop vertices that sit on a straight edge.
    let changed = true;
    while (changed && V.length > 3) {
      changed = false;
      for (let i = 0; i < V.length; i++) {
        const m = V.length, p = V[(i - 1 + m) % m], c = V[i], q = V[(i + 1) % m];
        if (dist(c, q) < 0.12 * diag) {
          V[i] = [(c[0] + q[0]) / 2, (c[1] + q[1]) / 2]; V.splice((i + 1) % m, 1); changed = true; break;
        }
        if (cornerAngle(p, c, q) > 155 * DEG) { V.splice(i, 1); changed = true; break; }
      }
    }
    return V;
  }

  function fitRect(V) {
    for (let i = 0; i < 4; i++) {
      const a = cornerAngle(V[(i + 3) % 4], V[i], V[(i + 1) % 4]);
      if (a < 62 * DEG || a > 118 * DEG) return null;
    }
    // Dominant edge direction modulo 90 degrees.
    let sx = 0, sy = 0, cx = 0, cy = 0;
    for (let i = 0; i < 4; i++) {
      const a = V[i], b = V[(i + 1) % 4], l = dist(a, b), phi = Math.atan2(b[1] - a[1], b[0] - a[0]);
      sx += l * Math.cos(4 * phi); sy += l * Math.sin(4 * phi);
      cx += a[0] / 4; cy += a[1] / 4;
    }
    let th = Math.atan2(sy, sx) / 4;
    const cos = Math.cos(-th), sin = Math.sin(-th);
    const xs = [], ys = [];
    for (const v of V) {
      const dx = v[0] - cx, dy = v[1] - cy;
      xs.push(dx * cos - dy * sin); ys.push(dx * sin + dy * cos);
    }
    xs.sort((a, b) => a - b); ys.sort((a, b) => a - b);
    const l = (xs[0] + xs[1]) / 2, r = (xs[2] + xs[3]) / 2, t = (ys[0] + ys[1]) / 2, b = (ys[2] + ys[3]) / 2;
    let w = r - l, h = b - t;
    const mx = (l + r) / 2, my = (t + b) / 2;
    let square = false;
    if (Math.abs(w - h) / Math.max(w, h) < 0.1) { w = h = (w + h) / 2; square = true; }
    // Rotate the rectangle's centre back, then snap near-level rectangles to the axes.
    const ccx = cx + mx * Math.cos(th) - my * Math.sin(th), ccy = cy + mx * Math.sin(th) + my * Math.cos(th);
    if (Math.abs(th) < 7 * DEG) th = 0;
    const c2 = Math.cos(th), s2 = Math.sin(th);
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
      .map(([x, y]) => [ccx + x * c2 - y * s2, ccy + x * s2 + y * c2]);
    return { pts, square };
  }

  function fitEllipse(C) {
    const n = C.length;
    let cx = 0, cy = 0;
    for (const p of C) { cx += p[0]; cy += p[1]; }
    cx /= n; cy /= n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const p of C) { const dx = p[0] - cx, dy = p[1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    sxx /= n; syy /= n; sxy /= n;
    const tr = sxx + syy, df = Math.sqrt(Math.max(0, (sxx - syy) * (sxx - syy) / 4 + sxy * sxy));
    let a = Math.sqrt(Math.max(1e-9, 2 * (tr / 2 + df))), b = Math.sqrt(Math.max(1e-9, 2 * (tr / 2 - df)));
    let th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const cos = Math.cos(th), sin = Math.sin(th);
    const radial = [];
    let mean = 0;
    for (const p of C) {
      const dx = p[0] - cx, dy = p[1] - cy;
      const u = dx * cos + dy * sin, v = -dx * sin + dy * cos;
      const r = hyp(u / a, v / b); radial.push(r); mean += r;
    }
    mean /= n; a *= mean; b *= mean;
    let err = 0;
    for (const r of radial) err += Math.abs(r / mean - 1);
    err = (err / n) * Math.sqrt(a * b);
    return { cx, cy, a, b, th, err };
  }

  function ellipsePoints(e, n) {
    const P = [], cos = Math.cos(e.th), sin = Math.sin(e.th);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * 2 * Math.PI, u = e.a * Math.cos(t), v = e.b * Math.sin(t);
      P.push([e.cx + u * cos - v * sin, e.cy + u * sin + v * cos]);
    }
    return P;
  }

  /* ---- Recognition ---------------------------------------------------
     Returns { type, label, points(flat), smooth, closed } or null. */
  WB.recognize = function (flat) {
    const P = toPairs(flat);
    if (P.length < 2) return null;
    const len = pathLen(P);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const diag = hyp(x1 - x0, y1 - y0);
    if (!(diag > 0)) return null;
    const first = P[0], last = P[P.length - 1], gap = dist(first, last);
    const make = (type, label, pts, smooth, closed) => ({ type, label, points: toFlat(pts), smooth, closed });

    if (P.length >= 8 && gap < 0.16 * len && gap < 0.45 * diag) {
      const C = resample(P.concat([first]), 97).slice(0, 96);
      const e = fitEllipse(C);
      const V = loopVertices(C, diag);
      if (V.length >= 3 && V.length <= 6) {
        const polyErr = meanDistToPolyline(C, V, true);
        if (polyErr < e.err * (V.length <= 4 ? 0.9 : 0.55)) {
          if (V.length === 3) return make('triangle', 'Triangle', V, false, true);
          if (V.length === 4) {
            const r = fitRect(V);
            if (r) return make(r.square ? 'square' : 'rectangle', r.square ? 'Square' : 'Rectangle', r.pts, false, true);
            return make('quadrilateral', 'Quadrilateral', V, false, true);
          }
          return make('polygon', V.length === 5 ? 'Pentagon' : 'Hexagon', V, false, true);
        }
      }
      let circle = false;
      if (e.b / e.a > 0.86) { e.a = e.b = (e.a + e.b) / 2; e.th = 0; circle = true; }
      else {
        const q = Math.round(e.th / (Math.PI / 2)) * (Math.PI / 2);
        if (Math.abs(e.th - q) < 7 * DEG) e.th = q;
      }
      return make(circle ? 'circle' : 'ellipse', circle ? 'Circle' : 'Ellipse', ellipsePoints(e, 72), true, true);
    }

    // Open strokes: straight line, polyline, or a cleaned-up curve.
    let dev = 0;
    for (const p of P) dev = Math.max(dev, segDist(p, first, last));
    if (gap > 0 && dev < 0.07 * gap) {
      let a = first, b = last;
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), q = Math.round(ang / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(ang - q) < 3 * DEG) {
        const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, h = gap / 2;
        a = [mx - Math.cos(q) * h, my - Math.sin(q) * h]; b = [mx + Math.cos(q) * h, my + Math.sin(q) * h];
      }
      return make('line', 'Line', [a, b], false, false);
    }
    const R = rdp(P, 0.05 * diag);
    if (R.length >= 3 && R.length <= 7) {
      let sharp = true;
      for (let i = 1; i < R.length - 1; i++) if (cornerAngle(R[i - 1], R[i], R[i + 1]) > 150 * DEG) sharp = false;
      if (sharp && meanDistToPolyline(P, R, false) < 0.016 * diag) return make('polyline', 'Polyline', R, false, false);
    }
    const m = Math.max(8, Math.min(48, Math.round((len / diag) * 10)));
    let S = resample(P, m);
    for (let pass = 0; pass < 2; pass++) {
      S = S.map((p, i) => (i === 0 || i === m - 1) ? p
        : [(S[i - 1][0] + 2 * p[0] + S[i + 1][0]) / 4, (S[i - 1][1] + 2 * p[1] + S[i + 1][1]) / 4]);
    }
    return make('curve', 'Curve', S, true, false);
  };

  WB.rdp = rdp;

  /* Area centroid of a closed outline (flat points); falls back to the vertex mean for degenerate shapes. */
  WB.centroid = function (p) {
    const n = p.length >> 1;
    let a = 0, cx = 0, cy = 0, mx = 0, my = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, x0 = p[2 * i], y0 = p[2 * i + 1], x1 = p[2 * j], y1 = p[2 * j + 1], c = x0 * y1 - x1 * y0;
      a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; mx += x0; my += y0;
    }
    return Math.abs(a) < 1e-9 ? [mx / n, my / n] : [cx / (3 * a), cy / (3 * a)];
  };

  /* ---- Morph support -------------------------------------------------
     Both return flat arrays of n points so a stroke can be interpolated
     point-for-point into its recognised shape. */
  WB.resampleFlat = (flat, n) => toFlat(resample(toPairs(flat), n));

  WB.morphTarget = function (shape, fromFlat, n) {
    let V = toPairs(shape.points);
    if (shape.closed && shape.smooth) V = V.concat([V[0]]);
    if (!shape.closed) {
      if (shape.smooth) { // flatten the curve the same way it is drawn
        const sink = { pts: [], moveTo(x, y) { this.pts.push([x, y]); this.c = [x, y]; }, lineTo(x, y) { this.pts.push([x, y]); this.c = [x, y]; },
          quadraticCurveTo(cx, cy, x, y) { const [ax, ay] = this.c; for (let i = 1; i <= 6; i++) { const t = i / 6, u = 1 - t; this.pts.push([u * u * ax + 2 * u * t * cx + t * t * x, u * u * ay + 2 * u * t * cy + t * t * y]); } this.c = [x, y]; }, closePath() {} };
        WB.trace(shape, sink); V = sink.pts;
      }
      return toFlat(resample(V, n));
    }
    // Closed: choose the starting vertex and winding that best match the hand-drawn stroke.
    const ring = shape.smooth ? V : V.concat([V[0]]);
    const dense = resample(ring, n + 1).slice(0, n);
    const F = toPairs(fromFlat);
    while (F.length < n) F.push(F[F.length - 1]);
    let best = null, bestCost = Infinity;
    for (let dir = 1; dir >= -1; dir -= 2) {
      for (let off = 0; off < n; off++) {
        let cost = 0;
        for (let i = 0; i < n; i += 4) {
          const q = dense[(((off + dir * i) % n) + n) % n];
          cost += hyp(F[i][0] - q[0], F[i][1] - q[1]);
          if (cost > bestCost) break;
        }
        if (cost < bestCost) { bestCost = cost; best = [off, dir]; }
      }
    }
    const out = [];
    for (let i = 0; i < n - 1; i++) out.push(dense[(((best[0] + best[1] * i) % n) + n) % n]);
    out.push(out[0]); // land back on the start so the loop closes
    return toFlat(out);
  };
})();
