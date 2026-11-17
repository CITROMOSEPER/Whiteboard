/* Built-in stickers: ready-made drawings that come with the app, in their own folder of the
   sticker gallery ("Built-in stickers"). They live in the app's code, not in the sticker folder,
   so they are always there (no folder needs choosing first) and cannot be renamed, moved or
   deleted. Each is made fresh when shown or placed, from real lines and texts (so it can be
   recoloured, erased and edited like anything drawn by hand), in the ink colour that suits the
   canvas, and sized to look right at 100 % zoom.

   WB.builtins.tree(ink) -> [{ key, items: [{ key, label, make() -> board text }] }] */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});
  const tr = (k, v) => WB.t(k, v);

  /* ---- Drawing helpers (board units = screen pixels at 100 %) ----------------- */
  function kit(ink) {
    const out = [];
    const line = (pts, w = 2, op = 1, closed = false) => out.push({ tool: 'pen', color: ink, width: w, opacity: op, points: pts.flat(), smooth: false, closed });
    const seg = (x1, y1, x2, y2, w, op) => line([[x1, y1], [x2, y2]], w, op);
    const rect = (x, y, w, h, lw = 2) => line([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], lw, 1, true);
    function ellipse(cx, cy, rx, ry, rot = 0, w = 2.5) {
      const p = [], c = Math.cos(rot), s = Math.sin(rot);
      for (let i = 0; i < 120; i++) { const a = (i / 120) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; p.push([cx + x * c - y * s, cy + x * s + y * c]); }
      out.push({ tool: 'pen', color: ink, width: w, opacity: 1, points: p.flat(), smooth: true, closed: true, shape: rx === ry ? 'circle' : 'ellipse' });
    }
    /* A text placed by an anchor: ax 'left' | 'center' | 'right', ay 'top' | 'middle' | 'bottom'. */
    function text(x, y, t, size = 14, ax = 'center', ay = 'middle', font = 'sans') {
      const L = WB.textLayout({ text: t, font, size });
      const left = ax === 'left' ? x : ax === 'right' ? x - L.w : x - L.w / 2;
      const top = ay === 'top' ? y : ay === 'bottom' ? y - L.h : y - L.h / 2;
      out.push({ tool: 'text', x: left, y: top, rot: 0, text: t, font, size, color: ink, opacity: 1, width: 0 });
    }
    function arrowHead(x, y, dx, dy, size = 9, w = 2) {
      const a = Math.atan2(dy, dx);
      line([[x - size * Math.cos(a - 0.42), y - size * Math.sin(a - 0.42)], [x, y], [x - size * Math.cos(a + 0.42), y - size * Math.sin(a + 0.42)]], w);
    }
    return { out, line, seg, rect, ellipse, text, arrowHead };
  }
  const board = (title, strokes) => WB.serialize({ title, created: 0, strokes, pages: [] }, { x: 0, y: 0, zoom: 1 });

  /* ---- Coordinate systems ------------------------------------------------------
     1 unit = 32 px (the canvas dot spacing). Q: the quarters shown, as 1–4 (counter-clockwise from
     the top right, as in maths). Grid only in those quarters; both axes, with arrows, ticks and
     numbers wherever a shown quarter touches them. */
  function axes(ink, Q, N) {
    const K = kit(ink), u = 32, has = (q) => Q.includes(q);
    const R = has(1) || has(4) ? N : 0, L = has(2) || has(3) ? N : 0, T = has(1) || has(2) ? N : 0, B = has(3) || has(4) ? N : 0;
    // Grid: each line covers the shown quarters it passes through, joined where they meet.
    const spans = (a, b) => (a && b ? [[-N, N]] : a ? [[0, N]] : b ? [[-N, 0]] : []);
    for (let k = -L; k <= R; k++) {
      if (!k) continue;
      for (const [a, b] of spans(k > 0 ? has(1) : has(2), k > 0 ? has(4) : has(3))) K.seg(k * u, -b * u, k * u, -a * u, 1, 0.22);
    }
    for (let k = -B; k <= T; k++) {
      if (!k) continue;
      for (const [a, b] of spans(k > 0 ? has(1) : has(4), k > 0 ? has(2) : has(3))) K.seg(a * u, -k * u, b * u, -k * u, 1, 0.22);
    }
    // Axes, reaching a little past the grid on the positive side, with arrows.
    const xr = (R + 0.8) * u, yt = -(T + 0.8) * u;
    K.seg(-L * u, 0, xr, 0, 2); K.arrowHead(xr, 0, 1, 0);
    K.seg(0, B * u, 0, yt, 2); K.arrowHead(0, yt, 0, -1);
    K.text(xr + 2, 6, 'x', 17, 'left', 'top', 'serif');
    K.text(8, yt - 2, 'y', 17, 'left', 'bottom', 'serif');
    // Ticks, left unnumbered: the scale is for whoever uses it to write in.
    for (let k = -L; k <= R; k++) if (k) K.seg(k * u, -4, k * u, 4, 1.5);
    for (let k = -B; k <= T; k++) if (k) K.seg(-4, -k * u, 4, -k * u, 1.5);
    return K.out;
  }

  /* ---- Venn diagrams --------------------------------------------------------- */
  function venn(ink, kind) {
    const K = kit(ink), S = 22;
    const universe = (x0, y0, x1, y1) => { K.rect(x0, y0, x1 - x0, y1 - y0, 2); K.text(x0 + 10, y0 + 8, 'U', 18, 'left', 'top'); };
    if (kind === 'two' || kind === 'twoU') {
      K.ellipse(-55, 0, 92, 92); K.ellipse(55, 0, 92, 92);
      K.text(-128, -78, 'A', S); K.text(128, -78, 'B', S);
      if (kind === 'twoU') universe(-185, -125, 185, 125);
    } else if (kind === 'three' || kind === 'threeU') {
      K.ellipse(-55, -32, 92, 92); K.ellipse(55, -32, 92, 92); K.ellipse(0, 63, 92, 92);
      K.text(-128, -110, 'A', S); K.text(128, -110, 'B', S); K.text(0, 180, 'C', S);
      if (kind === 'threeU') universe(-185, -160, 185, 205);
    } else if (kind === 'four') {
      // Four ellipses: every combination of the four sets has its own region (16 in all).
      const a = 150, b = 82, t = Math.PI / 4, E = [[-48, 28, t], [-8, -22, t], [8, -22, -t], [48, 28, -t]];
      const inside = ([cx, cy, r], x, y) => { const c = Math.cos(r), s = Math.sin(r), dx = x - cx, dy = y - cy, u = dx * c + dy * s, v = -dx * s + dy * c; return (u * u) / (a * a) + (v * v) / (b * b) < 1; };
      E.forEach(([cx, cy, r]) => K.ellipse(cx, cy, a, b, r));
      // Each letter goes just outside the part that belongs to its set alone, straight out from the middle.
      E.forEach((e, i) => {
        let sx = 0, sy = 0, n = 0;
        for (let x = -240; x <= 240; x += 6) for (let y = -200; y <= 200; y += 6) {
          if (inside(e, x, y) && E.every((o, j) => j === i || !inside(o, x, y))) { sx += x; sy += y; n++; }
        }
        let x = sx / n, y = sy / n;
        const d = Math.hypot(x, y) || 1, ux = x / d, uy = y / d;
        while (inside(e, x, y)) { x += ux * 3; y += uy * 3; }
        K.text(x + ux * 16, y + uy * 16, 'ABCD'[i], S);
      });
    } else if (kind === 'subset') {
      K.ellipse(0, 0, 115, 115); K.ellipse(28, 22, 50, 50);
      K.text(-70, -60, 'A', S); K.text(28, 22, 'B', S);
      universe(-150, -145, 150, 145);
    } else if (kind === 'disjoint') {
      K.ellipse(-82, 0, 66, 66); K.ellipse(82, 0, 66, 66);
      K.text(-82, 0, 'A', S); K.text(82, 0, 'B', S);
      universe(-175, -105, 175, 105);
    }
    return K.out;
  }

  /* ---- Karnaugh and Veitch maps ---------------------------------------------------
     rows / cols: the variables along each side (one or two each). The order of the cells is the
     Gray code (00 01 11 10), so neighbouring cells differ in one variable. Each cell shows its
     number in the corner: the minterm's (disjunctive) or the maxterm's (conjunctive, 2ⁿ−1−m).
     Karnaugh maps write the codes along the sides; Veitch maps mark, with a bracket, the rows and
     columns where each variable is 1. Both have the corner with the variables split by a diagonal. */
  const GRAY = { 1: [0, 1], 2: [0, 1, 3, 2] };
  const bin = (v, n) => v.toString(2).padStart(n, '0');
  function kmap(ink, rows, cols, veitch, conj) {
    const K = kit(ink), C = 56, nr = rows.length, nc = cols.length, R = GRAY[nr], Cc = GRAY[nc], W = Cc.length * C, H = R.length * C;
    const n = nr + nc, top = (1 << n) - 1;
    // Grid
    K.rect(0, 0, W, H, 2);
    for (let i = 1; i < Cc.length; i++) K.seg(i * C, 0, i * C, H, 2);
    for (let i = 1; i < R.length; i++) K.seg(0, i * C, W, i * C, 2);
    // Cell numbers, in the bottom right corner of each cell.
    R.forEach((rv, ri) => Cc.forEach((cv, ci) => {
      const m = (rv << nc) | cv;
      K.text((ci + 1) * C - 5, (ri + 1) * C - 4, String(conj ? top - m : m), 11, 'right', 'bottom');
    }));
    // The corner: row variables below the diagonal, column variables above it.
    K.seg(0, 0, -30, -36, 1.5);
    K.text(-30, -12, rows.join(''), 15, 'right', 'middle');
    K.text(-10, -38, cols.join(''), 15, 'left', 'bottom');
    if (!veitch) {
      Cc.forEach((cv, ci) => K.text(ci * C + C / 2, -8, bin(cv, nc), 15, 'center', 'bottom'));
      R.forEach((rv, ri) => K.text(-12, ri * C + C / 2, bin(rv, nr), 15, 'right', 'middle'));
      return K.out;
    }
    // Veitch: a bracket over the stretch of rows or columns where the variable is 1.
    const stretch = (codes, j, len) => {
      const on = codes.map((v, i) => ((v >> (len - 1 - j)) & 1 ? i : -1)).filter((i) => i >= 0);
      return [on[0], on[on.length - 1] + 1];
    };
    const D = 16, hook = 7, inset = 5, S = 19;
    cols.forEach((v, j) => {
      const [a, b] = stretch(Cc, j, nc), x0 = a * C + inset, x1 = b * C - inset, below = j === 1, y = below ? H + D : -D, hy = below ? y - hook : y + hook;
      K.line([[x0, hy], [x0, y], [x1, y], [x1, hy]], 2);
      K.text((x0 + x1) / 2, below ? y + 6 : y - 6, v, S, 'center', below ? 'top' : 'bottom');
    });
    rows.forEach((v, j) => {
      const [a, b] = stretch(R, j, nr), y0 = a * C + inset, y1 = b * C - inset, right = j === 1, x = right ? W + D : -D, hx = right ? x - hook : x + hook;
      K.line([[hx, y0], [x, y0], [x, y1], [hx, y1]], 2);
      K.text(right ? x + 8 : x - 8, (y0 + y1) / 2, v, S, right ? 'left' : 'right', 'middle');
    });
    return K.out;
  }

  /* ---- Truth tables ---------------------------------------------------------------
     Columns: the row's number counted disjunctively (0 at the top) and conjunctively (2ⁿ−1 at the
     top), then the variables, then F (empty, to be filled in), set off by a double line. */
  function truth(ink, n) {
    const K = kit(ink), vars = 'ABCD'.slice(0, n).split(''), rows = 1 << n;
    const IW = 34, VW = 30, FW = 42, RH = 24, HH = 30, GAP = 4;
    const xs = [0, IW, 2 * IW];
    for (let i = 1; i <= n; i++) xs.push(2 * IW + i * VW);
    const xF = xs[xs.length - 1], W = xF + GAP + FW, H = HH + rows * RH;
    K.rect(0, 0, W, H, 2);
    for (let i = 1; i < xs.length - 1; i++) K.seg(xs[i], 0, xs[i], H, i === 2 ? 2 : 1.5);
    K.seg(xF, 0, xF, H, 1.5); K.seg(xF + GAP, 0, xF + GAP, H, 1.5);
    K.seg(0, HH, W, HH, 2);
    for (let r = 1; r < rows; r++) K.seg(0, HH + r * RH, W, HH + r * RH, 1, 0.45);
    vars.forEach((v, i) => K.text(xs[2 + i] + VW / 2, HH / 2, v, 16));
    K.text(xF + GAP + FW / 2, HH / 2, 'F', 16);
    for (let r = 0; r < rows; r++) {
      const y = HH + r * RH + RH / 2;
      K.text(IW / 2, y, String(r), 13);
      K.text(IW + IW / 2, y, String(rows - 1 - r), 13);
      vars.forEach((_, i) => K.text(xs[2 + i] + VW / 2, y, String((r >> (n - 1 - i)) & 1), 13));
    }
    return K.out;
  }

  /* ---- Graphs ----------------------------------------------------------------------- */
  const graph = (fns) => [{ tool: 'plot', x: 0, y: 0, w: 480, h: 340, rot: 0, opacity: 1, width: 0, cx: 0, cy: 0, span: 16,
    fns: fns.map((src, i) => ({ src, color: WB.PLOT_COLORS[i % WB.PLOT_COLORS.length] })) }];

  /* ---- The folder ---------------------------------------------------------------------- */
  const ROMAN = ['', 'I', 'II', 'III', 'IV'];
  WB.builtins = {
    tree(ink) {
      const item = (key, label, strokes) => ({ key, label, make: () => board(label, strokes()) });
      const quad = (Q) => {
        const name = Q.length === 4 ? tr('bAllQuadrants') : Q.length === 1 ? tr('bQuadrant', { q: ROMAN[Q[0]] }) : tr('bQuadrants', { q: Q.map((q) => ROMAN[q]).join(' + ') });
        return item('axes' + Q.join(''), name, () => axes(ink, Q, Q.length === 1 ? 10 : 8));
      };
      const sizes = [[['A'], ['B'], '2×2'], [['A'], ['B', 'C'], '2×4'], [['A', 'B'], ['C'], '4×2'], [['A', 'B'], ['C', 'D'], '4×4']];
      const maps = (veitch) => sizes.flatMap(([r, c, dim]) => [false, true].map((conj) =>
        item((veitch ? 'veitch' : 'karnaugh') + dim + (conj ? 'c' : 'd'), `${dim} · ${tr(conj ? 'bConj' : 'bDisj')}`, () => kmap(ink, r, c, veitch, conj))));
      return [
        { key: 'bGraphs', items: [
          item('graph0', tr('bGraphEmpty'), () => graph([])),
          item('graphSq', tr('bGraphOf', { f: 'x²' }), () => graph(['f(x) = x^2'])),
          item('graphSin', tr('bGraphOf', { f: 'sin x' }), () => graph(['f(x) = sin(x)'])),
        ] },
        { key: 'bAxes', items: [[1, 2, 3, 4], [1], [2], [3], [4], [1, 2], [3, 4], [1, 4], [2, 3], [1, 3], [2, 4]].map(quad) },
        { key: 'bVenn', items: [
          item('venn2', tr('bVennTwo'), () => venn(ink, 'two')),
          item('venn3', tr('bVennThree'), () => venn(ink, 'three')),
          item('venn4', tr('bVennFour'), () => venn(ink, 'four')),
          item('venn2u', tr('bVennTwoU'), () => venn(ink, 'twoU')),
          item('venn3u', tr('bVennThreeU'), () => venn(ink, 'threeU')),
          item('vennSub', tr('bVennSubset'), () => venn(ink, 'subset')),
          item('vennDis', tr('bVennDisjoint'), () => venn(ink, 'disjoint')),
        ] },
        { key: 'bKarnaugh', items: maps(false) },
        { key: 'bVeitch', items: maps(true) },
        { key: 'bTruth', items: [2, 3, 4].map((n) => item('truth' + n, tr('bTruthVars', { n }), () => truth(ink, n))) },
      ];
    },
    /* The ink colour that reads on a canvas colour: white on dark canvases, near-black on light ones. */
    inkFor(bg) {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(bg || '').trim());
      if (!m) return '#111111';
      const v = parseInt(m[1], 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255;
      return 0.299 * r + 0.587 * g + 0.114 * b < 128 ? '#ffffff' : '#111111';
    },
  };
})();
