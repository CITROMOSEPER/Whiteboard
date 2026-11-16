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
