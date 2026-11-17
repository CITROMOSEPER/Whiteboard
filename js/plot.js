/* Graphs: an object that draws functions on a coordinate grid, like a small window of a graphing
   calculator placed on the board. It moves, resizes and turns like a picture; its own view (where
   it is centred, how far it is zoomed) is part of the object and is changed by dragging and
   zooming inside it while it is open for exploring (see app.js).

   { tool:'plot', x, y, w, h, rot, opacity, fns:[{ src, color }], cx, cy, span }
   (cx, cy) is the maths point at the centre, span how many units fit across its width; both axes
   use the same scale. Each function's src is what was written, e.g. "f(x) = sin(x)". */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});
  WB.PLOT_COLORS = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#000000'];
  WB.PLOT_SPAN = 20;

  /* The compiled functions, kept on the object and redone only when the sources change. */
  WB.plotFns = function (s) {
    const key = s.fns.map((f) => f.src).join('\n');
    if (!s._fx || s._fx.key !== key) s._fx = { key, list: s.fns.map((f) => WB.mx.plotFn(f.src)) };
    return s._fx.list;
  };

  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
    return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
  }
  const fmt = (v, step) => {
    if (Math.abs(v) < step * 1e-6) return '0';
    const a = Math.abs(v);
    if (a >= 1e6 || a < 1e-4) return v.toExponential(1).replace('e+', 'e');
    const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
    return v.toFixed(dec).replace('-', '−');
  };

  /* Paint a graph. The context transform maps world units to pixels (its scale sets how finely
     curves are sampled and how thick lines are, so they stay crisp at any zoom and in exports). */
  WB.paintPlot = function (c, s) {
    const t = c.getTransform(), ppw = Math.max(1e-6, Math.hypot(t.a, t.b)), px = 1 / ppw;
    const w = s.w, h = s.h, u = w / s.span, r = Math.min(10, w / 12, h / 12);
    const X = (mx) => (mx - s.cx) * u, Y = (my) => -(my - s.cy) * u;
    c.save();
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = s.opacity;
    c.translate(s.x + w / 2, s.y + h / 2);
    if (s.rot) c.rotate(s.rot);
    c.beginPath();
    if (c.roundRect) c.roundRect(-w / 2, -h / 2, w, h, r); else c.rect(-w / 2, -h / 2, w, h);
    c.fillStyle = '#ffffff'; c.fill();
    c.save();
    c.clip();

    // Grid: major lines about every seventh of the larger side, minor ones between.
    const step = niceStep(Math.max(w, h) / 7 / u), m5 = String(step / Math.pow(10, Math.floor(Math.log10(step)))) === '2' ? 4 : 5, minor = step / m5;
    const x0 = s.cx - w / 2 / u, x1 = s.cx + w / 2 / u, y0 = s.cy - h / 2 / u, y1 = s.cy + h / 2 / u;
    const lines = (st, color, lw) => {
      c.beginPath();
      for (let v = Math.ceil(x0 / st) * st; v <= x1; v += st) { c.moveTo(X(v), -h / 2); c.lineTo(X(v), h / 2); }
      for (let v = Math.ceil(y0 / st) * st; v <= y1; v += st) { c.moveTo(-w / 2, Y(v)); c.lineTo(w / 2, Y(v)); }
      c.strokeStyle = color; c.lineWidth = lw; c.stroke();
    };
    if (minor * u * ppw > 6) lines(minor, '#eef0f4', px);
    lines(step, '#d3d8e0', px);
    c.beginPath();
    c.moveTo(X(0), -h / 2); c.lineTo(X(0), h / 2); c.moveTo(-w / 2, Y(0)); c.lineTo(w / 2, Y(0));
    c.strokeStyle = '#3b3f46'; c.lineWidth = 1.4 * px; c.stroke();

    // Numbers along the axes (kept inside the window when an axis is off to one side).
    const fs = Math.max(7, Math.min(14, Math.min(w, h) * 0.04)), pad = fs * 0.35;
    c.font = `${fs}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    c.fillStyle = '#4a4f57';
    c.lineWidth = fs * 0.28; c.strokeStyle = '#ffffff'; c.lineJoin = 'round';
    const ax = Math.min(h / 2 - fs - pad, Math.max(-h / 2 + pad, Y(0) + pad));       // top of the x labels
    c.textAlign = 'center'; c.textBaseline = 'top';
    for (let v = Math.ceil(x0 / step) * step; v <= x1; v += step) {
      if (Math.abs(v) < step / 2) continue;
      const tx = X(v), label = fmt(v, step);
      if (Math.abs(tx) > w / 2 - fs) continue;
      c.strokeText(label, tx, ax); c.fillText(label, tx, ax);
    }
    const ayRight = X(0) - pad, left = ayRight < -w / 2 + fs * 2.5;
    c.textAlign = left ? 'left' : 'right'; c.textBaseline = 'middle';
    const lx = left ? Math.max(-w / 2 + pad, X(0) + pad) : Math.min(w / 2 - pad, ayRight);
    for (let v = Math.ceil(y0 / step) * step; v <= y1; v += step) {
      if (Math.abs(v) < step / 2) continue;
      const ty = Y(v), label = fmt(v, step);
      if (Math.abs(ty) > h / 2 - fs * 0.7) continue;
      c.strokeText(label, lx, ty); c.fillText(label, lx, ty);
    }
    if (X(0) > -w / 2 && X(0) < w / 2 && Y(0) > -h / 2 && Y(0) < h / 2) {
      c.textAlign = 'right'; c.textBaseline = 'top';
      c.strokeText('0', X(0) - pad, Y(0) + pad); c.fillText('0', X(0) - pad, Y(0) + pad);
    }

    // The curves. Sampled about every 1.5 device pixels; a jump far bigger than the window between
    // neighbouring samples (an asymptote, as in tan x or 1/x) breaks the line instead of joining it.
    const fns = WB.plotFns(s), n = Math.max(60, Math.min(4000, Math.ceil((w * ppw) / 1.5))), lim = h * 4;
    c.lineCap = 'round'; c.lineJoin = 'round';
    fns.forEach((F, i) => {
      if (!F.f) return;
      c.beginPath();
      let pen = false, prevY = 0, prevX = 0;
      for (let k = 0; k <= n; k++) {
        const lxp = -w / 2 + (w * k) / n, mx = s.cx + lxp / u;
        let my;
        try { my = F.f(mx); } catch (e) { my = NaN; }
        if (!isFinite(my)) { pen = false; continue; }
        let ly = Math.max(-lim, Math.min(lim, Y(my)));
        if (pen && Math.abs(ly - prevY) > h * 1.5) {
          let mid;
          try { mid = Y(F.f(mx - (w / n) / u / 2)); } catch (e) { mid = NaN; }
          if (!(isFinite(mid) && (mid - prevY) * (ly - mid) >= 0)) {
            // Not monotone across the gap: an asymptote. Each side runs off its edge of the window.
            const up = prevY < ly;
            c.lineTo(prevX, up ? -lim : lim);
            c.moveTo(lxp, up ? lim : -lim);
          }
        }
        if (pen) c.lineTo(lxp, ly); else c.moveTo(lxp, ly);
        pen = true; prevY = ly; prevX = lxp;
      }
      c.strokeStyle = s.fns[i].color || WB.PLOT_COLORS[i % WB.PLOT_COLORS.length];
      c.lineWidth = 2.6 * px;
      c.stroke();
    });

    // Special points: a small dot each; the ones tapped show their coordinates.
    const pts = WB.plotPoints(s), dr = 3.6 * px;
    for (const q of pts) {
      c.beginPath(); c.arc(X(q.x), Y(q.y), dr, 0, Math.PI * 2);
      c.fillStyle = q.color; c.fill();
      c.lineWidth = 1.4 * px; c.strokeStyle = '#ffffff'; c.stroke();
    }
    const fsl = Math.max(9, Math.min(15, Math.min(w, h) * 0.045));
    c.font = `${fsl}px -apple-system, "Segoe UI", system-ui, sans-serif`;
    c.textAlign = 'left'; c.textBaseline = 'middle';
    for (const q of pts) {
      if (!q.pinned) continue;
      const label = WB.plotLabel(q), tw = c.measureText(label).width, pw = tw + fsl * 0.9, ph = fsl * 1.6;
      let lx = X(q.x) + fsl * 0.6, ly = Y(q.y) - fsl * 0.6 - ph;
      if (lx + pw > w / 2 - 2) lx = X(q.x) - fsl * 0.6 - pw;
      if (ly < -h / 2 + 2) ly = Y(q.y) + fsl * 0.6;
      c.beginPath();
      if (c.roundRect) c.roundRect(lx, ly, pw, ph, ph * 0.3); else c.rect(lx, ly, pw, ph);
      c.fillStyle = 'rgba(255,255,255,0.95)'; c.fill();
      c.lineWidth = px; c.strokeStyle = q.color; c.stroke();
      c.fillStyle = '#24272c'; c.fillText(label, lx + fsl * 0.45, ly + ph / 2);
    }

    // The functions, typeset, in a card at the top left.
    const ls = Math.max(8, Math.min(18, Math.min(w, h) * 0.055));
    const rows = fns.map((F, i) => {
      const color = s.fns[i].color || WB.PLOT_COLORS[i % WB.PLOT_COLORS.length];
      const text = F.error ? '⚠ ' + s.fns[i].src : '$' + F.tex + '$';
      const o = { tool: 'text', text, font: 'sans', size: ls, math: true };
      return { L: WB.mathLayout(o), o, color: F.error ? '#c0392b' : '#24272c', dot: color };
    });
    if (rows.length) {
      const gap = ls * 0.5, dotW = ls * 0.9, cw = Math.min(w - 2 * gap, dotW + Math.max(...rows.map((q) => q.L.w)) + gap * 1.6);
      const ch = rows.reduce((a, q) => a + q.L.h, 0) + gap;
      const bx = -w / 2 + gap, by = -h / 2 + gap;
      c.beginPath();
      if (c.roundRect) c.roundRect(bx, by, cw, ch, ls * 0.4); else c.rect(bx, by, cw, ch);
      c.fillStyle = 'rgba(255,255,255,0.92)'; c.fill();
      c.strokeStyle = '#d3d8e0'; c.lineWidth = px; c.stroke();
      let yy = by + gap / 2;
      for (const q of rows) {
        c.beginPath(); c.arc(bx + gap * 0.6 + dotW * 0.3, yy + q.L.h / 2, ls * 0.22, 0, Math.PI * 2);
        c.fillStyle = q.dot; c.fill();
        c.save(); c.translate(bx + gap * 0.6 + dotW, yy); c.fillStyle = q.color; c.beginPath(); c.rect(0, 0, cw - dotW - gap * 0.6, q.L.h); c.clip(); WB.paintMath(c, q.o, q.L); c.restore();
        yy += q.L.h;
      }
    }
    c.restore();
    c.beginPath();
    if (c.roundRect) c.roundRect(-w / 2, -h / 2, w, h, r); else c.rect(-w / 2, -h / 2, w, h);
    c.strokeStyle = '#b8bec8'; c.lineWidth = px; c.stroke();
    c.restore();
  };

  /* ---- Special points ------------------------------------------------------
     Where each curve crosses the axes, its local highest and lowest points, its inflection points,
     and where two curves meet, within the part of the plane in view. Found numerically: the curve
     is sampled finely, then every sign change (of the value, its slope or its curvature, or of
     the difference of two curves) is narrowed down by bisection. Jumps across an asymptote are
     not crossings. Worked out again only when the view or the functions change.
     Each: { x, y, kind: 'root' | 'yint' | 'max' | 'min' | 'infl' | 'cross', color, pinned }. */
  const N = 480;
  function bisect(g, a, b, ga) {
    for (let k = 0; k < 60; k++) {
      const m = (a + b) / 2, gm = g(m);
      if (!isFinite(gm)) return NaN;
      if ((gm > 0) === (ga > 0)) { a = m; ga = gm; } else b = m;
    }
    return (a + b) / 2;
  }
  function golden(g, a, b, max) {            // the highest (or lowest) point of g between a and b
    const r = (Math.sqrt(5) - 1) / 2, sgn = max ? -1 : 1;
    let x1 = b - r * (b - a), x2 = a + r * (b - a), f1 = sgn * g(x1), f2 = sgn * g(x2);
    for (let k = 0; k < 80; k++) {
      if (f1 < f2) { b = x2; x2 = x1; f2 = f1; x1 = b - r * (b - a); f1 = sgn * g(x1); }
      else { a = x1; x1 = x2; f1 = f2; x2 = a + r * (b - a); f2 = sgn * g(x2); }
    }
    return (a + b) / 2;
  }
  WB.plotPoints = function (s) {
    const fns = WB.plotFns(s), u = s.w / s.span;
    const x0 = s.cx - s.w / 2 / u, x1 = s.cx + s.w / 2 / u, y0 = s.cy - s.h / 2 / u, y1 = s.cy + s.h / 2 / u;
    const key = [s.cx, s.cy, s.span, s.w, s.h, s._fx && s._fx.key].join('|');
    if (s._pts && s._pts.key === key) return markPins(s, s._pts.list);
    const out = [], H = y1 - y0, dx = (x1 - x0) / N, eps = H * 1e-9;
    const inView = (x, y) => isFinite(x) && isFinite(y) && x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const add = (x, y, kind, color) => {
      if (!inView(x, y)) return;
      const tol = (x1 - x0) * 2e-4;
      if (out.some((q) => Math.abs(q.x - x) < tol && Math.abs(q.y - y) < tol)) return;   // already there (a root that is also a minimum…)
      out.push({ x, y, kind, color });
    };
    const safe = (f) => (x) => { try { return f(x); } catch (e) { return NaN; } };
    const curves = fns.map((F, i) => ({ f: F.f && safe(F.f), color: s.fns[i].color || WB.PLOT_COLORS[i % WB.PLOT_COLORS.length] })).filter((c) => c.f);
    const xs = [];
    for (let k = 0; k <= N; k++) xs.push(x0 + k * dx);
    // Is the step from k to k+1 a smooth stretch (not across an asymptote or a gap)?
    const smooth = (ys, k) => isFinite(ys[k]) && isFinite(ys[k + 1]) && Math.abs(ys[k + 1] - ys[k]) < H * 0.5;
    for (const C of curves) {
      const f = C.f, ys = xs.map(f);
      // Where it meets the y axis.
      if (x0 <= 0 && x1 >= 0) add(0, f(0), 'yint', C.color);
      // Where it meets the x axis: a sign change, or a sample right on it.
      for (let k = 0; k < N; k++) {
        if (!smooth(ys, k)) continue;
        if (ys[k] === 0) add(xs[k], 0, 'root', C.color);
        else if (ys[k] * ys[k + 1] < 0) { const r = bisect(f, xs[k], xs[k + 1], ys[k]); if (Math.abs(f(r)) < H * 1e-6) add(r, 0, 'root', C.color); }
      }
      // Highest and lowest points: the slope changes sign.
      for (let k = 1; k < N; k++) {
        if (!smooth(ys, k - 1) || !smooth(ys, k)) continue;
        const a = ys[k] - ys[k - 1], b = ys[k + 1] - ys[k];
        if (Math.abs(a) < eps && Math.abs(b) < eps) continue;         // flat: no single highest point
        if (a > 0 && b <= 0 || a >= 0 && b < 0) { const x = golden(f, xs[k - 1], xs[k + 1], true); add(x, f(x), 'max', C.color); }
        else if (a < 0 && b >= 0 || a <= 0 && b > 0) { const x = golden(f, xs[k - 1], xs[k + 1], false); add(x, f(x), 'min', C.color); }
      }
      // Inflection points: the curvature changes sign.
      const h = dx;
      const curv = (x) => (f(x + h) - 2 * f(x) + f(x - h));
      const cs = xs.map((x, k) => (k > 0 && k < N && smooth(ys, k - 1) && smooth(ys, k) ? ys[k + 1] - 2 * ys[k] + ys[k - 1] : NaN));
      const noise = H * 1e-9;
      for (let k = 1; k < N - 1; k++) {
        const a = cs[k], b = cs[k + 1];
        if (!isFinite(a) || !isFinite(b) || Math.abs(a) < noise || Math.abs(b) < noise || a * b >= 0) continue;
        if (Math.max(Math.abs(a), Math.abs(b)) > H * 0.2) continue;   // a corner or a near-asymptote, not a bend
        const x = bisect(curv, xs[k], xs[k + 1], a);
        if (isFinite(x)) add(x, f(x), 'infl', C.color);
      }
    }
    // Where two curves meet.
    for (let i = 0; i < curves.length; i++) for (let j = i + 1; j < curves.length; j++) {
      const f = curves[i].f, g = curves[j].f, d = (x) => f(x) - g(x), ds = xs.map(d), fy = xs.map(f), gy = xs.map(g);
      for (let k = 0; k < N; k++) {
        if (!smooth(fy, k) || !smooth(gy, k) || !(ds[k] * ds[k + 1] <= 0) || ds[k] === ds[k + 1]) continue;
        const x = ds[k] === 0 ? xs[k] : bisect(d, xs[k], xs[k + 1], ds[k]);
        if (Math.abs(d(x)) < H * 1e-6) add(x, f(x), 'cross', '#5a6270');
      }
    }
    s._pts = { key, list: out };
    return markPins(s, out);
  };
  function markPins(s, list) {
    const pins = s._pins || [], tol = s.span * 1e-6;
    for (const q of list) q.pinned = pins.some((p) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol);
    return list;
  }
  /* "(x; y)", rounded to what can be told apart in the view (whole numbers stay whole). */
  WB.plotLabel = function (q) {
    const n = (v) => {
      if (Math.abs(v) < 1e-10) return '0';
      const r = Math.round(v * 1e4) / 1e4;
      return (Math.abs(r - Math.round(r)) < 1e-9 ? String(Math.round(r)) : String(r)).replace('-', '−');
    };
    return `(${n(q.x)}; ${n(q.y)})`;
  };
  /* The special point at a spot in the graph's own frame (lx, ly), within tol, or null. */
  WB.plotPointAt = function (s, lx, ly, tol) {
    const u = s.w / s.span;
    let best = null, bd = tol;
    for (const q of WB.plotPoints(s)) {
      const d = Math.hypot((q.x - s.cx) * u - lx, -(q.y - s.cy) * u - ly);
      if (d <= bd) { bd = d; best = q; }
    }
    return best;
  };
  /* Show or hide the coordinates of a special point (kept while the board is open). */
  WB.plotTogglePin = function (s, q) {
    const pins = s._pins || (s._pins = []), tol = s.span * 1e-6;
    const i = pins.findIndex((p) => Math.abs(p.x - q.x) <= tol && Math.abs(p.y - q.y) <= tol);
    if (i >= 0) pins.splice(i, 1); else pins.push({ x: q.x, y: q.y });
  };

  /* Zoom the graph's view by factor k (> 1 zooms out) about a point given in its own frame. */
  WB.plotZoom = function (s, k, lx = 0, ly = 0) {
    const u = s.w / s.span, mx = s.cx + lx / u, my = s.cy - ly / u;
    s.span = Math.min(1e9, Math.max(1e-9, s.span * k));
    const u2 = s.w / s.span;
    s.cx = mx - lx / u2; s.cy = my + ly / u2;
  };
  /* Move the view by (dx, dy) in the graph's own frame (world units). */
  WB.plotPan = function (s, dx, dy) {
    const u = s.w / s.span;
    s.cx -= dx / u; s.cy += dy / u;
  };
})();
