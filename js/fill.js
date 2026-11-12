/* Flood fill. The board is rasterised, flooded from the drop point, and the
   flooded region is traced back into vector outlines so fills stay part of the
   vector document (and export to SVG/PDF like everything else). */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});

  /* b = {x,y,w,h} world region to rasterise; (wx, wy) = world drop point.
     Returns { status: 'ok', rings, under } | { status: 'open' } | { status: 'outside' }.
     'open' means the flood reached the edge of the region: no closed shape contains the point. */
  WB.flood = function (strokes, b, scale, wx, wy) {
    // Pictures are backgrounds, not walls: a shape drawn over a photo still fills.
    const canvas = WB.renderToCanvas(strokes.filter((s) => s.tool !== 'image'), b, scale, null).canvas;
    const w = canvas.width, h = canvas.height, kx = w / b.w, ky = h / b.h;
    const sx = Math.floor((wx - b.x) * kx), sy = Math.floor((wy - b.y) * ky);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return { status: 'outside' };
    const d = canvas.getContext('2d').getImageData(0, 0, w, h).data;

    // What counts as "the same area" as the drop point.
    const seed = (sy * w + sx) * 4, r0 = d[seed], g0 = d[seed + 1], b0 = d[seed + 2], a0 = d[seed + 3];
    const under = a0 < 16;               // dropped on empty canvas: the fill goes beneath the ink
    const TOL = 40;
    const match = under
      ? (i) => d[i * 4 + 3] < TOL
      : (i) => { const o = i * 4; return Math.abs(d[o] - r0) <= TOL && Math.abs(d[o + 1] - g0) <= TOL && Math.abs(d[o + 2] - b0) <= TOL && Math.abs(d[o + 3] - a0) <= TOL; };

    // Scanline flood.
    const mask = new Uint8Array(w * h), stack = [sy * w + sx];
    let x0 = sx, x1 = sx, y0 = sy, y1 = sy;
    while (stack.length) {
      const i = stack.pop();
      if (mask[i] || !match(i)) continue;
      const y = (i / w) | 0, row = y * w;
      let xl = i - row, xr = xl;
      while (xl > 0 && !mask[row + xl - 1] && match(row + xl - 1)) xl--;
      while (xr < w - 1 && !mask[row + xr + 1] && match(row + xr + 1)) xr++;
      if (xl === 0 || xr === w - 1 || y === 0 || y === h - 1) return { status: 'open' };
      for (let k = xl; k <= xr; k++) mask[row + k] = 1;
      if (xl < x0) x0 = xl; if (xr > x1) x1 = xr; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let ny = y - 1; ny <= y + 1; ny += 2) {
        const nrow = ny * w;
        for (let k = xl; k <= xr; k++) {
          if (!mask[nrow + k] && match(nrow + k)) {
            stack.push(nrow + k);
            while (k <= xr && !mask[nrow + k] && match(nrow + k)) k++;
          }
        }
      }
    }

    // Grow into the soft edge of the surrounding ink so no pale seam is left.
    // Under-fills only grow into ink (never out the far side of a thin line).
    for (let pass = 0; pass < (under ? 3 : 1); pass++) {
      const add = [];
      const ax0 = Math.max(1, x0 - 1), ax1 = Math.min(w - 2, x1 + 1), ay0 = Math.max(1, y0 - 1), ay1 = Math.min(h - 2, y1 + 1);
      for (let y = ay0; y <= ay1; y++) {
        for (let x = ax0, i = y * w + ax0; x <= ax1; x++, i++) {
          if (mask[i] || !(mask[i - 1] || mask[i + 1] || mask[i - w] || mask[i + w])) continue;
          if (under && d[i * 4 + 3] < TOL) continue;
          add.push(i);
        }
      }
      if (!add.length) break;
      for (const i of add) mask[i] = 1;
      x0 = ax0; x1 = ax1; y0 = ay0; y1 = ay1;
    }

    const flow = flowField(mask, w, x0, y0, x1, y1, sx, sy);
    flow.x = b.x + flow.px / kx; flow.y = b.y + flow.py / ky; flow.cw = flow.cell / kx; flow.ch = flow.cell / ky;

    // Trace the mask's outline along pixel edges (region on the right-hand side), as closed loops.
    const W1 = w + 1, out = new Map();
    const edge = (a, c) => { const e = out.get(a); if (e === undefined) out.set(a, c); else if (typeof e === 'number') out.set(a, [e, c]); else e.push(c); };
    for (let y = y0; y <= y1; y++) {
      for (let x = x0, i = y * w + x0; x <= x1; x++, i++) {
        if (!mask[i]) continue;
        const v = y * W1 + x;
        if (y === 0 || !mask[i - w]) edge(v, v + 1);
        if (x === w - 1 || !mask[i + 1]) edge(v + 1, v + 1 + W1);
        if (y === h - 1 || !mask[i + w]) edge(v + 1 + W1, v + W1);
        if (x === 0 || !mask[i - 1]) edge(v + W1, v);
      }
    }
    const take = (a) => {
      const e = out.get(a);
      if (e === undefined) return -1;
      if (typeof e === 'number') { out.delete(a); return e; }
      const c = e.pop();
      if (e.length === 1) out.set(a, e[0]);
      return c;
    };
    const rings = [];
    for (const start of [...out.keys()]) {
      while (out.has(start)) {
        const P = [];
        let a = start;
        do { P.push([a % W1, (a / W1) | 0]); a = take(a); } while (a !== start && a !== -1);
        if (P.length < 4) continue;
        // Simplify the pixel staircase: split the loop at its two extremes and reduce each half.
        let far = 0, fd = -1;
        for (let i = 1; i < P.length; i++) { const dd = (P[i][0] - P[0][0]) ** 2 + (P[i][1] - P[0][1]) ** 2; if (dd > fd) { fd = dd; far = i; } }
        const A = WB.rdp(P.slice(0, far + 1), 0.85), B = WB.rdp(P.slice(far).concat([P[0]]), 0.85);
        const V = A.slice(0, -1).concat(B.slice(0, -1));
        if (V.length < 3) continue;
        const flat = [];
        for (const p of V) flat.push(b.x + p[0] / kx, b.y + p[1] / ky);
        rings.push(flat);
      }
    }
    return rings.length ? { status: 'ok', rings, under, flow } : { status: 'open' };
  };

  /* How paint poured at the seed would spread through the region: for each cell of a
     coarse grid, the distance the paint has to travel to get there (around obstacles,
     not through them), kept smooth so the front advances evenly like thick paint.
     Used only to animate the fill. */
  function flowField(mask, w, x0, y0, x1, y1, sx, sy) {
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, cell = Math.max(1, Math.ceil(Math.max(bw, bh) / 150));
    const gw = Math.ceil(bw / cell) + 2, gh = Math.ceil(bh / cell) + 2, n = gw * gh, INF = 1e9;
    const dist = new Float32Array(n).fill(INF), inside = new Uint8Array(n);
    const step = Math.max(1, cell >> 1);
    for (let gy = 1; gy < gh - 1; gy++) {
      for (let gx = 1; gx < gw - 1; gx++) {
        const px = x0 + (gx - 1) * cell, py = y0 + (gy - 1) * cell;
        let hit = 0;
        for (let y = py; y < py + cell && y <= y1 && !hit; y += step) for (let x = px; x < px + cell && x <= x1; x += step) if (mask[y * w + x]) { hit = 1; break; }
        inside[gy * gw + gx] = hit;
      }
    }
    const seed = (((sy - y0) / cell) | 0) + 1, seedX = (((sx - x0) / cell) | 0) + 1, si = seed * gw + seedX;
    inside[si] = 1; dist[si] = 0;
    // Everywhere the drop point can "see" in a straight line, the paint arrives as a clean
    // circle. Only around corners does it have to travel along the shape (handled below).
    for (let gy = 1; gy < gh - 1; gy++) {
      for (let gx = 1; gx < gw - 1; gx++) {
        const i = gy * gw + gx;
        if (!inside[i]) continue;
        const dx = gx - seedX, dy = gy - seed, steps = Math.max(Math.abs(dx), Math.abs(dy));
        let clear = true;
        for (let k = 1; k < steps && clear; k++) clear = !!inside[Math.round(seed + (dy * k) / steps) * gw + Math.round(seedX + (dx * k) / steps)];
        if (clear) dist[i] = Math.hypot(dx, dy);
      }
    }
    const D = Math.SQRT2;
    for (let iter = 0; iter < 24; iter++) {     // sweep until the distances settle (more sweeps for winding shapes)
      let changed = false;
      for (let i = gw + 1; i < n - gw - 1; i++) {
        if (!inside[i]) continue;
        const d = Math.min(dist[i - 1] + 1, dist[i - gw] + 1, dist[i - gw - 1] + D, dist[i - gw + 1] + D);
        if (d < dist[i] - 1e-3) { dist[i] = d; changed = true; }
      }
      for (let i = n - gw - 2; i > gw; i--) {
        if (!inside[i]) continue;
        const d = Math.min(dist[i + 1] + 1, dist[i + gw] + 1, dist[i + gw + 1] + D, dist[i + gw - 1] + D);
        if (d < dist[i] - 1e-3) { dist[i] = d; changed = true; }
      }
      if (!changed) break;
    }
    // Thick paint has a smooth, rounded front: relax the field a little so no creases
    // show where the flow bends around a corner.
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = gw; i < n - gw; i++) {
        if (!inside[i] || dist[i] >= INF) { tmp[i] = dist[i]; continue; }
        let sum = dist[i] * 2, cnt = 2;
        for (const j of [i - 1, i + 1, i - gw, i + gw]) if (inside[j] && dist[j] < INF) { sum += dist[j]; cnt++; }
        tmp[i] = sum / cnt;
      }
      for (let i = gw; i < n - gw; i++) if (i !== si) dist[i] = tmp[i];
    }
    let max = 0;
    for (let i = 0; i < n; i++) if (inside[i] && dist[i] < INF && dist[i] > max) max = dist[i];
    // Pockets the coarse grid could not reach fill last; cells just outside borrow from
    // their neighbours so the paint runs right up to the outline.
    for (let i = 0; i < n; i++) if (inside[i] && dist[i] >= INF) dist[i] = max;
    const edge = [];
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const i = gy * gw + gx;
        if (inside[i]) continue;
        let d = INF;
        if (gx > 0 && inside[i - 1]) d = Math.min(d, dist[i - 1]);
        if (gx < gw - 1 && inside[i + 1]) d = Math.min(d, dist[i + 1]);
        if (gy > 0 && inside[i - gw]) d = Math.min(d, dist[i - gw]);
        if (gy < gh - 1 && inside[i + gw]) d = Math.min(d, dist[i + gw]);
        if (d < INF) edge.push(i, d);
      }
    }
    for (let k = 0; k < edge.length; k += 2) dist[edge[k]] = edge[k + 1];
    return { px: x0 - cell, py: y0 - cell, cell, gw, gh, dist, max };
  }
})();
