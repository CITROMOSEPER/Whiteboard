/* Whiteboard: canvas engine, input, and UI. */
(function () {
  'use strict';
  const WB = window.WB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const hyp = Math.hypot;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  const root = document.documentElement;
  const board = $('#board'), canvas = $('#canvas'), cursorEl = $('#brush-cursor'), hint = $('#hint');
  const ctx = canvas.getContext('2d', { desynchronized: true });
  const base = document.createElement('canvas'), bctx = base.getContext('2d');
  const scratch = document.createElement('canvas'), sctx = scratch.getContext('2d');   // compositing space for the fill animation
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const darkMq = matchMedia('(prefers-color-scheme: dark)');

  const holdMs = () => clamp(+settings.snapDelay || 1, 0.2, 10) * 1000;   // hold still this long to snap a stroke into a shape
  const ZOOM_MIN = 0.02, ZOOM_MAX = 64;
  const PALETTE = ['#111111', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'];
  const SIZE = { pen: [1, 60], eraser: [4, 200] };

  /* ---- State --------------------------------------------------------- */
  const store = {
    get(k, def) { try { return Object.assign(def, JSON.parse(localStorage.getItem(k)) || {}); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const settings = store.get('wb.settings', { theme: 'system', smoothing: 0, snap: true, fingerDraw: true, grid: 'dots', canvas: 'theme', canvasCustom: '#f4f1e8', snapDelay: 1,
    ink: false, inkDelay: 1, inkScript: null,   // handwriting to text (alphabet null = follow the language)
    lang: null });                              // interface language (null = follow the system)
  const tr = WB.t;
  WB.setLang(settings.lang || WB.systemLang());
  const resolvedTheme = () => (settings.theme === 'system' ? (darkMq.matches ? 'dark' : 'light') : settings.theme);
  const ink0 = resolvedTheme() === 'dark' ? '#ffffff' : '#111111';
  const tools = store.get('wb.tools', {
    tool: 'pen',
    pen: { color: ink0, width: 4, opacity: 1 },
    eraser: { width: 28, opacity: 1 },
    text: { font: 'sans', size: 24, color: ink0 },
    custom: '#ff2d55',              // last colour mixed in the picker
  });

  const doc = { title: 'Untitled', created: Date.now(), strokes: [] };
  const view = { x: 0, y: 0, zoom: 1 };   // screen = world * zoom + (x, y), in CSS pixels
  let fileHandle = null, restored = false;
  const undoStack = [], redoStack = [];

  /* ---- Rendering -----------------------------------------------------
     `base` holds every committed stroke rendered for `baseView`. Each frame the
     visible canvas is base + the stroke in progress, so drawing never re-renders
     the board. While panning a heavy board, base is reprojected and re-rendered
     once the motion settles. */
  let W = 0, H = 0, dpr = 1, raf = 0, lastFrame = 0;
  let baseDirty = true, renderCost = 0;
  const baseView = { x: 0, y: 0, zoom: 1 };

  function requestFrame() { if (!raf) raf = requestAnimationFrame(frame); }
  function invalidate() { baseDirty = true; requestFrame(); }
  function worldTransform(c) {
    const k = dpr * view.zoom;
    c.setTransform(k, 0, 0, k, dpr * view.x, dpr * view.y);
    c.lineCap = 'round'; c.lineJoin = 'round';
  }

  function resize() {
    const w = board.clientWidth, h = board.clientHeight, d = Math.min(window.devicePixelRatio || 1, 3);
    if (w === W && h === H && d === dpr) return;
    W = w; H = h; dpr = d;
    canvas.width = base.width = scratch.width = Math.max(1, Math.round(W * dpr));
    canvas.height = base.height = scratch.height = Math.max(1, Math.round(H * dpr));
    baseDirty = true;
    frame(performance.now()); // paint synchronously so a resize never flashes empty
  }

  function renderBase() {
    const t0 = performance.now();
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = 'source-over';
    bctx.clearRect(0, 0, base.width, base.height);
    worldTransform(bctx);
    const x0 = -view.x / view.zoom, y0 = -view.y / view.zoom, x1 = (W - view.x) / view.zoom, y1 = (H - view.y) / view.zoom;
    for (const s of doc.strokes) {
      const b = WB.boundsOf(s);
      if (b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1 || (fillAnim && fillAnim.s === s) || (edit && edit.s === s)) continue;
      WB.paint(bctx, s);
    }
    baseView.x = view.x; baseView.y = view.y; baseView.zoom = view.zoom;
    baseDirty = false;
    renderCost = performance.now() - t0;
  }

  function frame(now) {
    raf = 0;
    const dt = clamp(now - lastFrame, 1, 64); lastFrame = now;
    stepMotion(now, dt);
    if (live) stepLive(now, dt);

    if (fillAnim && now - fillAnim.t0 >= fillAnim.dur) finishFill();
    const moving = mode === 'pan' || mode === 'pinch' || motion;
    if (baseDirty && (!moving || renderCost < 7)) renderBase();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!baseDirty) ctx.drawImage(base, 0, 0);
    else {
      const k = view.zoom / baseView.zoom;
      ctx.setTransform(k, 0, 0, k, (view.x - baseView.x * k) * dpr, (view.y - baseView.y * k) * dpr);
      ctx.drawImage(base, 0, 0);
    }
    if (fillAnim) drawFillAnim(now);
    if (selection.size || (selDrag && selDrag.lasso)) drawSelection();
    if (live) {
      worldTransform(ctx);
      const p = new Path2D(); WB.trace(live, p);
      WB.paint(ctx, live, p);
    }
    syncView();
  }

  const synced = { x: NaN, y: NaN, zoom: NaN };
  function syncView() {
    if (synced.x === view.x && synced.y === view.y && synced.zoom === view.zoom) return;
    synced.x = view.x; synced.y = view.y; synced.zoom = view.zoom;
    let g = 32 * view.zoom;
    while (g < 18) g *= 2;
    while (g > 72) g /= 2;
    board.style.setProperty('--gs', g + 'px');
    board.style.backgroundPosition = `${(((view.x - 1) % g) + g) % g}px ${(((view.y - 1) % g) + g) % g}px`;
    $('#btn-zoom').textContent = Math.round(view.zoom * 100) + '%';
    if (edit) layoutEdit();
  }

  /* ---- View motion --------------------------------------------------- */
  let motion = null;
  function stopMotion() { if (motion) { motion = null; requestFrame(); } }

  function stepMotion(now, dt) {
    if (!motion) return;
    if (motion.type === 'glide') {            // momentum after a flick, exponential decay like native scrolling
      view.x += motion.vx * dt; view.y += motion.vy * dt;
      const d = Math.pow(0.997, dt);
      motion.vx *= d; motion.vy *= d;
      if (hyp(motion.vx, motion.vy) < 0.012) motion = null;
    } else {                                   // critically damped spring toward a target view
      const t = Math.max(0, (now - motion.t0) / 1000), w = (2 * Math.PI) / 0.4;
      const k = t > 0.75 ? 1 : 1 - (1 + w * t) * Math.exp(-w * t);
      const z = motion.z0 * Math.pow(motion.z1 / motion.z0, k);
      view.zoom = z;
      view.x = W / 2 - (motion.cx0 + (motion.cx1 - motion.cx0) * k) * z;
      view.y = H / 2 - (motion.cy0 + (motion.cy1 - motion.cy0) * k) * z;
      if (k === 1) motion = null;
    }
    baseDirty = true;
    requestFrame();
  }

  /* Move the view so world point (cx, cy) sits at the screen centre at `zoom`. */
  function animateView(cx, cy, zoom, instant) {
    zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    if (instant || reduceMotion.matches) {
      motion = null; view.zoom = zoom; view.x = W / 2 - cx * zoom; view.y = H / 2 - cy * zoom;
      invalidate(); return;
    }
    motion = { type: 'spring', t0: performance.now(), z0: view.zoom, z1: zoom,
      cx0: (W / 2 - view.x) / view.zoom, cy0: (H / 2 - view.y) / view.zoom, cx1: cx, cy1: cy };
    requestFrame();
  }
  function zoomAt(sx, sy, zoom) {
    zoom = clamp(zoom, ZOOM_MIN, ZOOM_MAX);
    const k = zoom / view.zoom;
    view.x = sx - (sx - view.x) * k; view.y = sy - (sy - view.y) * k; view.zoom = zoom;
    invalidate();
  }
  function zoomStep(factor) {
    const target = motion && motion.type === 'spring' ? motion.z1 : view.zoom;
    animateView((W / 2 - view.x) / view.zoom, (H / 2 - view.y) / view.zoom, target * factor);
  }
  function fitView(instant) {
    const b = WB.contentBounds(doc.strokes);
    if (!b) return animateView(W / 2, H / 2, 1, instant);
    const z = Math.min((W - 150) / b.w, (H - 210) / b.h, 2);
    animateView(b.x + b.w / 2, b.y + b.h / 2, Math.max(z, ZOOM_MIN), instant);
  }

  /* ---- Drawing ------------------------------------------------------- */
  let mode = null;      // 'draw' | 'pan' | 'pinch'
  let live = null;      // stroke in progress
  let holdTimer = 0;

  function beginStroke(e, tool) {
    clearTimeout(inkTimer); hideAlts();     // still writing: don't convert yet
    mode = 'draw';
    const t = tools[tool], z = view.zoom, now = performance.now();
    const x = (e.clientX - view.x) / z, y = (e.clientY - view.y) / z;
    const sm = settings.smoothing / 100;
    live = {
      id: e.pointerId, ptype: e.pointerType, t0: now,
      tool, color: tools.pen.color, width: t.width / z, opacity: t.opacity,
      points: [x, y], smooth: sm > 0, closed: false,
      tau: sm * 140, sx: x, sy: y, tx: x, ty: y,
      hold: { x: e.clientX, y: e.clientY, t: now, tol: e.pointerType === 'mouse' ? 3 : 7 },
      snapped: false, morph: null, final: null,
    };
    hint.classList.add('gone');
    scheduleHold(holdMs());
    requestFrame();
  }

  function addPoint(cx, cy) {
    const L = live, h = L.hold;
    const x = (cx - view.x) / view.zoom, y = (cy - view.y) / view.zoom;
    if (L.snapped) {
      // The shape stays in hand until the pen lifts: the pen swings it around its pivot
      // (start point for open shapes, centre for closed ones) and resizes it by its distance from that pivot.
      const X = L.xf;
      if (!X.active) {
        if (hyp(cx - X.cx, cy - X.cy) < h.tol) return;      // ignore jitter while holding still
        X.active = true; X.ax = x; X.ay = y;                // anchor here so the shape doesn't jump
      }
      const d0 = hyp(X.ax - X.px, X.ay - X.py), d1 = hyp(x - X.px, y - X.py);
      if (Math.min(d0, d1) * view.zoom < 6) return;         // too close to the pivot to steer
      X.sc = d1 / d0;                                       // pulling away from the pivot grows the shape, pushing in shrinks it
      X.ang = Math.atan2(y - X.py, x - X.px) - Math.atan2(X.ay - X.py, X.ax - X.px);
      if (!L.morph) applyXf(L);
      requestFrame();
      return;
    }
    if (hyp(cx - h.x, cy - h.y) > h.tol) { h.x = cx; h.y = cy; h.t = performance.now(); }
    L.tx = x; L.ty = y;
    if (L.tau > 0) return;                    // smoothing on: the frame loop pulls the stroke toward the pointer
    const p = L.points, n = p.length;
    if (p[n - 2] !== x || p[n - 1] !== y) p.push(x, y);
  }

  function stepLive(now, dt) {
    const L = live;
    if (L.morph) {                            // spring the hand-drawn stroke into its clean shape
      const m = L.morph, t = Math.max(0, (now - m.t0) / 1000), w = (2 * Math.PI) / 0.32;
      if (t > 0.55) applyFinal(L);
      else {
        const k = 1 - (1 + w * t) * Math.exp(-w * t), p = L.base;
        for (let i = 0; i < p.length; i++) p[i] = m.from[i] + (m.to[i] - m.from[i]) * k;
        applyXf(L);
        requestFrame();
      }
    } else if (L.tau > 0 && !L.snapped) {
      const dx = L.tx - L.sx, dy = L.ty - L.sy;
      if (hyp(dx, dy) * view.zoom > 0.25) {
        const a = 1 - Math.exp(-dt / L.tau);
        L.sx += dx * a; L.sy += dy * a;
        L.points.push(L.sx, L.sy);
        requestFrame();
      }
    }
  }

  const SHAPE_KEYS = { line: 'sLine', polyline: 'sPolyline', curve: 'sCurve', triangle: 'sTriangle', rectangle: 'sRectangle',
    square: 'sSquare', quadrilateral: 'sQuad', circle: 'sCircle', ellipse: 'sEllipse' };
  function scheduleHold(ms) {
    clearTimeout(holdTimer);
    if (settings.snap) holdTimer = setTimeout(checkHold, ms);
  }
  function checkHold() {
    if (!live || live.snapped || mode !== 'draw') return;
    const el = performance.now() - live.hold.t, wait = holdMs();
    if (el < wait - 4) return scheduleHold(wait - el);
    if (!trySnap()) { live.hold.t = performance.now(); scheduleHold(wait); }
  }
  function trySnap() {
    const L = live, p = L.points;
    if (L.tau > 0) p.push(L.tx, L.ty);
    let len = 0;
    for (let i = 2; i < p.length; i += 2) len += hyp(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (len * view.zoom < 24) return false;
    const res = WB.recognize(p);
    if (!res) return false;
    L.snapped = true; L.final = res;
    const pivot = res.closed ? WB.centroid(res.points) : [res.points[0], res.points[1]];
    L.xf = { px: pivot[0], py: pivot[1], cx: L.hold.x, cy: L.hold.y, ax: 0, ay: 0, ang: 0, sc: 1, active: false };
    if (reduceMotion.matches) applyFinal(L);
    else {
      const from = WB.resampleFlat(p, 96);
      L.morph = { from, to: WB.morphTarget(res, from, 96), t0: performance.now() };
      L.base = from.slice(); L.points = from.slice(); L.smooth = false; L.closed = false;
    }
    toast(tr(SHAPE_KEYS[res.type] || (res.points.length === 10 ? 'sPentagon' : 'sHexagon')));
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}
    requestFrame();
    return true;
  }
  function applyFinal(L) {
    L.base = L.final.points; L.points = new Array(L.base.length);
    L.smooth = L.final.smooth; L.closed = L.final.closed; L.shape = L.final.type;
    L.morph = null; L.final = null;
    applyXf(L);
  }
  /* points = base rotated and scaled about the pivot. */
  function applyXf(L) {
    const X = L.xf, b = L.base, p = L.points;
    const c = Math.cos(X.ang) * X.sc, s = Math.sin(X.ang) * X.sc;
    for (let i = 0; i < b.length; i += 2) {
      const dx = b[i] - X.px, dy = b[i + 1] - X.py;
      p[i] = X.px + dx * c - dy * s; p[i + 1] = X.py + dx * s + dy * c;
    }
  }

  function endStroke(cancel) {
    clearTimeout(holdTimer);
    const L = live;
    live = null; mode = null;
    requestFrame();
    if (cancel || !L) return updateChrome();
    if (L.final) applyFinal(L);
    else if (L.tau > 0 && !L.snapped) L.points.push(L.tx, L.ty);   // smoothing lags the pen: finish at the pen (never on a snapped shape)
    if (L.tool === 'eraser' && !doc.strokes.length) return updateChrome();
    const s = { tool: L.tool, color: L.color, width: L.width, opacity: L.opacity, points: L.points, smooth: L.smooth, closed: L.closed };
    if (L.shape) s.shape = L.shape;
    s._at = performance.now();
    doc.strokes.push(s);
    if (!baseDirty) { worldTransform(bctx); WB.paint(bctx, s); }
    record({ type: 'add', stroke: s });
    // Handwriting: plain pen strokes wait to be read; a snapped shape ends the word; erasing abandons it.
    if (settings.ink && s.tool === 'pen' && !s.shape) inkAdd(s);
    else if (s.tool === 'pen') inkConvert();
    else inkDrop();
  }

  /* ---- Flood fill ----------------------------------------------------
     Fill the closed shape under a screen point. If nothing encloses the point
     the fill is cancelled rather than flooding the canvas. */
  function fillAt(cx, cy, color) {
    if (live) return;
    inkDrop();
    const z = view.zoom, wx = (cx - view.x) / z, wy = (cy - view.y) / z;
    const cb = WB.contentBounds(doc.strokes), none = () => toast(tr('tNoShape'));
    if (!cb) return none();
    const m = 6 / z, full = { x: cb.x - m, y: cb.y - m, w: cb.w + 2 * m, h: cb.h + 2 * m };
    if (wx < full.x || wy < full.y || wx > full.x + full.w || wy > full.y + full.h) return none();
    // First look at the area around the screen at screen resolution; only if the shape
    // runs off that area is the whole board checked (at a coarser resolution if it is huge).
    const nx0 = Math.max(full.x, (-view.x - W * 0.25) / z), ny0 = Math.max(full.y, (-view.y - H * 0.25) / z);
    const nx1 = Math.min(full.x + full.w, (W * 1.25 - view.x) / z), ny1 = Math.min(full.y + full.h, (H * 1.25 - view.y) / z);
    const near = { x: nx0, y: ny0, w: nx1 - nx0, h: ny1 - ny0 };
    const clipped = near.w < full.w - 1e-6 || near.h < full.h - 1e-6;
    const scaleFor = (b) => Math.min(z * dpr, Math.sqrt(8e6 / (b.w * b.h)));
    let res = WB.flood(doc.strokes, near, scaleFor(near), wx, wy);
    if (res.status === 'open' && clipped) res = WB.flood(doc.strokes, full, scaleFor(full), wx, wy);
    if (res.status !== 'ok') return none();
    const s = { tool: 'fill', color, width: 0, opacity: 1, under: res.under, rings: res.rings };
    finishFill();
    doc.strokes.push(s);
    if (reduceMotion.matches) { if (!baseDirty) { worldTransform(bctx); WB.paint(bctx, s); } }
    else {
      // Pour it: the paint runs outward from the drop point along the flow field worked out during the flood.
      const fl = res.flow, img = document.createElement('canvas');
      img.width = fl.gw; img.height = fl.gh;
      const reach = fl.max * fl.cw * z;     // how far the paint travels, in screen pixels
      fillAnim = { s, flow: fl, img, ictx: img.getContext('2d'), px: new ImageData(fl.gw, fl.gh), t0: performance.now(), dur: clamp(380 + reach * 0.8, 460, 1000) };
    }
    record({ type: 'add', stroke: s });
    requestFrame();
  }
  /* The fill that is still spreading. It stays out of `base` until it has finished. */
  let fillAnim = null;
  function finishFill() {
    const a = fillAnim;
    if (!a) return;
    fillAnim = null;
    if (!baseDirty && doc.strokes[doc.strokes.length - 1] === a.s) { worldTransform(bctx); WB.paint(bctx, a.s); }
    else baseDirty = true;
  }
  function drawFillAnim(now) {
    const a = fillAnim, f = a.flow, t = clamp((now - a.t0) / a.dur, 0, 1);
    // Thick paint: one smooth, even swell out of the drop point that eases gently to rest at the outline.
    const u = Math.min(1, t / 0.2), ease = (1 - Math.pow(1 - t, 2.2)) * u * (2 - u);   // soft start, long smooth settle
    const front = (f.max + 5) * ease, d = f.dist, px = a.px.data;
    for (let i = 0, o = 3; i < d.length; i++, o += 4) {
      const v = (front - d[i]) * 0.4;              // a rounded edge about two and a half cells wide
      px[o] = v <= 0 ? 0 : v >= 1 ? 255 : v * 255;
    }
    a.ictx.putImageData(a.px, 0, 0);
    // Paint the finished fill, keep only the part the liquid has reached, then lay it on the board.
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.globalCompositeOperation = 'source-over'; sctx.globalAlpha = 1;
    sctx.clearRect(0, 0, scratch.width, scratch.height);
    worldTransform(sctx);
    sctx.fillStyle = a.s.color; sctx.globalAlpha = a.s.opacity;
    sctx.fill(WB.pathOf(a.s), 'evenodd');
    sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'destination-in';
    sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
    sctx.drawImage(a.img, f.x, f.y, f.gw * f.cw, f.gh * f.ch);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = a.s.under ? 'destination-over' : 'source-over';
    ctx.drawImage(scratch, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    requestFrame();
  }

  /* Drag a colour out of the dock and drop it on the canvas to fill. A plain tap still just picks the colour. */
  function dragToFill(el, getColor) {
    const blob = $('#drop-blob');
    let d = null, suppress = false;
    el.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false };
      try { el.setPointerCapture(e.pointerId); } catch (err) {}
    });
    el.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      if (!d.on) {
        if (hyp(e.clientX - d.x, e.clientY - d.y) < 8) return;
        d.on = true; closePopovers();
        blob.style.setProperty('--c', getColor()); blob.classList.add('on');
      }
      blob.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
    });
    const end = (e) => {
      if (!d || e.pointerId !== d.id) return;
      const was = d; d = null;
      if (!was.on) return;
      blob.classList.remove('on');
      suppress = true; setTimeout(() => { suppress = false; }, 80);
      if (e.type === 'pointerup' && document.elementFromPoint(e.clientX, e.clientY) === canvas) fillAt(e.clientX, e.clientY, getColor());
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('click', (e) => { if (suppress) { suppress = false; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  }

  /* ---- Selection -----------------------------------------------------
     A click selects the object under the pointer, a drag draws a lasso.
     With Ctrl/Cmd held a click toggles one object and a lasso adds to the selection. */
  const selection = new Set();
  let selDrag = null;   // { id, x, y, add, lasso: [world points] | null }

  function selectAt(cx, cy, add) {
    const z = view.zoom, x = (cx - view.x) / z, y = (cy - view.y) / z;
    // Topmost object wins; fills poured beneath the ink count as below everything else.
    let hit = null, under = null;
    for (let i = doc.strokes.length - 1; i >= 0 && !hit; i--) {
      const s = doc.strokes[i];
      if (!WB.hit(s, x, y, 6 / z)) continue;
      if (s.tool === 'fill' && s.under) under = under || s; else hit = s;
    }
    hit = hit || under;
    if (add) { if (hit && !selection.delete(hit)) selection.add(hit); }
    else { selection.clear(); if (hit) selection.add(hit); }
    selectionChanged();
  }
  function selectLasso(poly, add) {
    if (!add) selection.clear();
    if (poly.length >= 6) for (const s of doc.strokes) if (WB.inLasso(s, poly)) selection.add(s);
    selectionChanged();
  }
  function clearSelection() { if (selection.size) { selection.clear(); selectionChanged(); } }

  /* Is this screen point on the highlight box of something already selected? (Pressing there drags the selection.) */
  function onSelection(cx, cy) {
    const z = view.zoom, x = (cx - view.x) / z, y = (cy - view.y) / z, pad = 6 / z;
    for (const s of selection) {
      const b = WB.boundsOf(s);
      if (x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad) return true;
    }
    return false;
  }
  function translate(items, dx, dy) {
    for (const s of items) {
      if (s.tool === 'text') { s.x += dx; s.y += dy; }
      else for (const p of s.rings || [s.points]) for (let i = 0; i < p.length; i += 2) { p[i] += dx; p[i + 1] += dy; }
      delete s._path; delete s._b;
    }
    invalidate();
  }
  /* Abandon a lasso or move in progress, putting moved objects back. */
  function cancelSelDrag() {
    const d = selDrag;
    selDrag = null;
    if (d && d.moved) translate(selection, -d.dx, -d.dy);
    requestFrame();
  }
  function selectionChanged() {
    const n = selection.size;
    $('#sel-bar').classList.toggle('on', n > 0);
    if (n) $('#sel-count').textContent = tr('selected', { n });
    requestFrame();
  }
  function deleteSelection() {
    const items = [...selection].map((s) => ({ i: doc.strokes.indexOf(s), s })).filter((it) => it.i >= 0).sort((a, b) => a.i - b.i);
    if (!items.length) return;
    for (let k = items.length - 1; k >= 0; k--) doc.strokes.splice(items[k].i, 1);
    clearSelection();
    record({ type: 'remove', items });
    invalidate();
    toast(tr('deleted'), tr('undo'), undo);
  }
  function drawSelection() {
    const z = view.zoom, accent = getComputedStyle(root).getPropertyValue('--accent').trim() || '#007aff';
    worldTransform(ctx);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = ctx.fillStyle = accent; ctx.lineWidth = 1.5 / z;
    const pad = 5 / z;
    for (const s of selection) {
      const b = WB.boundsOf(s);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad, 6 / z);
      else ctx.rect(b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad);
      ctx.globalAlpha = 0.08; ctx.fill();
      ctx.globalAlpha = 1; ctx.stroke();
    }
    const l = selDrag && selDrag.lasso;
    if (l && l.length >= 4) {
      ctx.beginPath(); ctx.moveTo(l[0], l[1]);
      for (let i = 2; i < l.length; i += 2) ctx.lineTo(l[i], l[i + 1]);
      ctx.closePath();
      ctx.globalAlpha = 0.1; ctx.fill();
      ctx.globalAlpha = 1; ctx.setLineDash([6 / z, 5 / z]); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  /* ---- Text ----------------------------------------------------------
     While a text is being typed it lives in a borderless <textarea> laid exactly over
     its place on the board (so the keyboard, IME and caret are the platform's own).
     On commit it becomes a text object in the drawing order; strokes and erasing done
     over it later stay on top, and editing it again simply re-renders the board. */
  const ta = $('#text-edit'), textBar = $('#text-bar');
  const FONT_KEYS = { sans: 'fSans', serif: 'fSerif', mono: 'fMono', rounded: 'fRounded', hand: 'fHand' };
  const TEXT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 96, 128, 160];
  let edit = null;      // { s: existing object | null, x, y, font, size, color }
  let textDown = null;  // pointer that went down with the text tool

  /* The topmost text object at a screen point, if any. */
  function textUnder(cx, cy) {
    const z = view.zoom, wx = (cx - view.x) / z, wy = (cy - view.y) / z, m = 4 / z;
    for (let i = doc.strokes.length - 1; i >= 0; i--) {
      const o = doc.strokes[i];
      if (o.tool !== 'text') continue;
      const b = WB.boundsOf(o);
      if (wx >= b.x0 - m && wx <= b.x1 + m && wy >= b.y0 - m && wy <= b.y1 + m) return o;
    }
    return null;
  }
  /* Start typing at a screen point: edits the text there if there is one (caret at the end), otherwise starts a new one. */
  function startText(cx, cy) {
    if (edit) commitText();
    const z = view.zoom, wx = (cx - view.x) / z, wy = (cy - view.y) / z, T = tools.text;
    const s = textUnder(cx, cy);
    clearSelection(); inkDrop();
    edit = s ? { s, x: s.x, y: s.y, font: s.font, size: s.size, color: s.color }
      : { s: null, x: wx, y: wy - (T.size / z) * WB.LINE / 2, font: T.font, size: T.size / z, color: T.color };
    ta.value = s ? s.text : '';
    ta.classList.add('on'); textBar.classList.add('on');
    hint.classList.add('gone');
    layoutEdit();
    if (s) invalidate();                       // the object is hidden from the board while it is in the editor
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }

  function layoutEdit() {
    const e = edit, z = view.zoom, fs = e.size * z;
    const L = WB.textLayout({ text: ta.value, font: e.font, size: e.size });
    const sx = e.x * z + view.x, sy = e.y * z + view.y;
    ta.style.font = `${fs}px/${WB.LINE} ${WB.FONTS[e.font]}`;
    ta.style.color = e.color;
    ta.style.width = Math.ceil(L.w * z + fs * 1.2) + 'px';
    ta.style.height = Math.ceil(L.h * z + 2) + 'px';
    ta.style.transform = `translate(${sx}px, ${sy}px)`;
    $('#tb-font').textContent = tr(FONT_KEYS[e.font]);
    $('#tb-size').textContent = Math.round(fs);
    $('#tb-color').style.setProperty('--c', e.color);
    let by = sy - 58;
    if (by < 70) by = sy + L.h * z + 14;        // no room above: sit below the text instead
    textBar.style.transform = `translate(${clamp(sx, 8, Math.max(8, W - textBar.offsetWidth - 8))}px, ${clamp(by, 8, Math.max(8, H - 56))}px)`;
  }

  function commitText() {
    const e = edit;
    if (!e) return;
    edit = null;
    ta.classList.remove('on'); textBar.classList.remove('on');
    $('#font-menu').classList.remove('open');
    WB.picker.close();
    if (document.activeElement === ta) ta.blur();
    const text = ta.value.replace(/[ \t]+$/gm, '').replace(/\n+$/, '');
    if (e.s) {
      const s = e.s, before = { text: s.text, font: s.font, size: s.size, color: s.color }, after = { text, font: e.font, size: e.size, color: e.color };
      if (!text.trim()) {
        const i = doc.strokes.indexOf(s);
        if (i >= 0) { doc.strokes.splice(i, 1); selection.delete(s); record({ type: 'remove', items: [{ i, s }] }); }
      } else if (Object.keys(after).some((k) => after[k] !== before[k])) {
        retext(s, after);
        record({ type: 'edit', s, before, after });
      }
    } else if (text.trim()) {
      const s = { tool: 'text', x: e.x, y: e.y, text, font: e.font, size: e.size, color: e.color, opacity: 1, width: 0 };
      doc.strokes.push(s);
      record({ type: 'add', stroke: s });
    }
    invalidate(); updateChrome(); selectionChanged();
  }
  function retext(s, props) { Object.assign(s, props); delete s._t; delete s._b; }

  /* Change the font, size or colour of the text being typed (and remember it for the next one). */
  function styleText(props) {
    if (!edit) return;
    Object.assign(edit, props);
    tools.text.font = edit.font; tools.text.color = edit.color; tools.text.size = Math.round(edit.size * view.zoom);
    store.set('wb.tools', tools);
    layoutEdit();
  }
  function stepTextSize(dir) {
    const cur = edit.size * view.zoom;
    const next = dir > 0 ? TEXT_SIZES.find((v) => v > cur + 0.5) : [...TEXT_SIZES].reverse().find((v) => v < cur - 0.5);
    if (next) styleText({ size: next / view.zoom });
  }

  function initText() {
    ta.addEventListener('input', layoutEdit);
    // Using the bar must not take the caret out of the text.
    for (const el of [textBar, $('#font-menu')]) el.addEventListener('pointerdown', (e) => e.preventDefault());
    $('#tb-smaller').addEventListener('click', () => stepTextSize(-1));
    $('#tb-bigger').addEventListener('click', () => stepTextSize(1));
    $('#tb-color').addEventListener('click', (e) => {
      WB.picker.toggle({ anchor: e.currentTarget, color: edit.color, onChange: (c) => styleText({ color: c }), onClose: () => { if (edit) ta.focus({ preventScroll: true }); } });
    });
    const fm = $('#font-menu');
    for (const k in WB.FONTS) {
      const b = document.createElement('button');
      b.className = 'mi'; b.dataset.font = k; b.dataset.i18n = FONT_KEYS[k]; b.style.fontFamily = WB.FONTS[k];
      b.setAttribute('role', 'menuitemradio');
      fm.appendChild(b);
    }
    fm.addEventListener('click', (e) => {
      const b = e.target.closest('[data-font]');
      if (b) { styleText({ font: b.dataset.font }); fm.classList.remove('open'); }
    });
    $('#tb-font').addEventListener('click', (e) => {
      const r = e.currentTarget.getBoundingClientRect(), open = !fm.classList.contains('open');
      $$('.mi', fm).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.font === edit.font)));
      fm.style.left = clamp(r.left - 4, 8, W - 190) + 'px';
      fm.style.top = (r.bottom + 244 > H ? Math.max(8, r.top - 214) : r.bottom + 10) + 'px';
      fm.classList.toggle('open', open);
    });
  }

  /* ---- Handwriting to text -------------------------------------------
     With the setting on, pen strokes are collected while the user keeps writing. After a
     pause they are split into characters, recognised, and replaced by text: appended to a
     text object on the same row if one is close by, otherwise started as a new one (lined
     up with any text already on that row). The whole swap is a single undo step, and undo
     brings the handwriting back. */
  let inkPending = [], inkTimer = 0, inkLast = null, inkSize = 0, altTimer = 0;
  const inkDelayMs = () => clamp(+settings.inkDelay || 1, 0.2, 10) * 1000;
  const inkScript = () => settings.inkScript || (['ru', 'uk'].includes(WB.lang()) ? 'cyrillic' : 'latin');

  function ptsBox(strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) {
      const p = s.points;
      for (let i = 0; i < p.length; i += 2) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; }
    }
    return { x0, y0, x1, y1 };
  }
  function inkAdd(s) {
    if (inkPending.length) {
      const g = ptsBox(inkPending), b = ptsBox([s]), h = Math.max(g.y1 - g.y0, 14 / view.zoom);
      if (b.x0 > g.x1 + 1.6 * h || b.x1 < g.x0 - 1.6 * h || b.y0 > g.y1 + 0.9 * h || b.y1 < g.y0 - 0.9 * h) inkConvert();   // writing moved elsewhere
    }
    inkPending.push(s);
    clearTimeout(inkTimer); inkTimer = setTimeout(inkConvert, inkDelayMs());
    WB.ink.prepare();
  }
  function inkDrop() { clearTimeout(inkTimer); inkPending = []; inkLast = null; hideAlts(); }

  function inkConvert() {
    clearTimeout(inkTimer);
    const strokes = inkPending.filter((s) => doc.strokes.includes(s));
    inkPending = [];
    if (!strokes.length) return;
    if (live || edit) { inkPending = strokes; inkTimer = setTimeout(inkConvert, 300); return; }
    if (!WB.ink.ready) WB.ink.prepare();
    if (!WB.ink.ready) return;                  // no recognition model available: the ink simply stays
    const z = view.zoom, script = inkScript(), list = [];
    const segs = WB.ink.segment(strokes, script);
    let last = null, chain = null, lineH = 0;
    for (const seg of segs) { const b = ptsBox(seg); lineH = Math.max(lineH, b.y1 - b.y0); }
    for (const seg of segs) {
      const b = ptsBox(seg), px = Math.max(b.x1 - b.x0, b.y1 - b.y0) * z;
      if (px > 0.5 * Math.min(W, H)) continue;                       // far too big to be writing
      // Characters written in one go stay together in one text, in the order written; whether a
      // space goes between two of them is judged from the gap in the handwriting itself (typed
      // text is more compact than writing, so measuring against it would see gaps everywhere).
      let row;
      if (chain) {
        const o = chain.o, L = WB.textLayout(o);
        row = { o, L, line: chain.line, kind: 'append', gap: b.x0 - chain.box.x1 > 0.5 * lineH ? o.size : 0, size: o.size, top: o.y + chain.line * L.lh };
      } else row = findRow(b);
      const opts = { script, px };
      if (row) {
        opts.relH = (b.y1 - b.y0) / row.size;
        opts.relBelow = (b.y1 - (row.top + row.L.base)) / row.size;
        opts.relMid = ((b.y0 + b.y1) / 2 - row.top) / row.L.lh;
        opts.prev = row.kind === 'append' ? row.L.lines[row.line].trimEnd().slice(-1) : '';
        opts.rowText = row.L.lines[row.line];
      }
      const r = WB.ink.recognize(seg, opts);
      if (!r) continue;                                              // not a character: leave the ink as drawn
      const items = seg.map((s) => ({ i: doc.strokes.indexOf(s), s })).sort((a, c) => a.i - c.i);
      for (let k = items.length - 1; k >= 0; k--) doc.strokes.splice(items[k].i, 1);
      list.push({ type: 'remove', items });
      const placed = placeChar(r.ch, b, row, seg[0].color);
      list.push(placed.action);
      last = { s: placed.s, index: placed.index, len: r.ch.length, r, box: b };
      chain = row && row.kind === 'prepend' ? null : { o: placed.s, line: row && row.kind === 'append' ? row.line : 0, box: b };
    }
    if (!list.length) return;
    finishFill();
    record({ type: 'batch', list });
    invalidate();
    showAlts(last);
  }

  /* The text row this ink belongs to, if any: { o, L, line, kind: 'append' | 'prepend' | 'align', gap, size, top }. */
  function findRow(b) {
    const cy = (b.y0 + b.y1) / 2;
    let best = null;
    for (const o of doc.strokes) {
      if (o.tool !== 'text') continue;
      const L = WB.textLayout(o), size = o.size;
      if (cy < o.y - 0.15 * L.lh || cy > o.y + L.h + 0.15 * L.lh) continue;         // not level with this text
      const line = clamp(Math.floor((cy - o.y) / L.lh), 0, L.lines.length - 1);
      const gapR = b.x0 - (o.x + L.widths[line]), gapL = o.x - b.x1;
      let kind = null, d = 0;
      if (gapR > -0.35 * size && gapR < 2.2 * size) { kind = 'append'; d = Math.abs(gapR); }
      else if (L.lines.length === 1 && gapL > -0.35 * size && gapL < 2.2 * size) { kind = 'prepend'; d = Math.abs(gapL) + size; }
      else if (Math.min(Math.abs(gapR), Math.abs(gapL)) < 40 * size) { kind = 'align'; d = 1e6 + Math.min(Math.abs(gapR), Math.abs(gapL)); }
      if (kind && (!best || d < best.d)) best = { o, L, line, kind, d, gap: kind === 'prepend' ? gapL : gapR, size, top: o.y + line * L.lh };
    }
    return best;
  }

  /* Put a recognised character on the board. Returns { s, index, action } (action is the history step). */
  function placeChar(ch, b, row, color) {
    if (row && row.kind !== 'align') {
      const o = row.o, lines = row.L.lines.slice(), space = row.gap > 0.55 * row.size ? ' ' : '';
      const before = { text: o.text, x: o.x };
      let index = 0;
      if (row.kind === 'append') {
        index = lines.slice(0, row.line + 1).join('\n').length + space.length;
        lines[row.line] += space + ch;
        retext(o, { text: lines.join('\n') });
      } else {
        const add = ch + space;
        retext(o, { text: add + o.text, x: o.x - WB.textLayout({ text: add, font: o.font, size: o.size }).w });
      }
      return { s: o, index, action: { type: 'edit', s: o, before, after: { text: o.text, x: o.x } } };
    }
    // A new text object. Its size comes from the row it lines up with, or from how big the character was written.
    const font = tools.text.font, g = WB.glyphBox(ch, font), inkH = g.asc + g.desc, z = view.zoom;
    let size = row ? row.size : inkH > 0.3 ? (b.y1 - b.y0) / inkH : inkSize || 28 / z;
    size = clamp(size, 9 / z, 400 / z);
    if (!row && inkH > 0.3) inkSize = size;
    const base = WB.textLayout({ text: ch, font, size }).base;
    const s = { tool: 'text', x: b.x0 + g.left * size, y: row ? row.top : b.y0 - (base - g.asc * size), text: ch, font, size, color, opacity: 1, width: 0 };
    doc.strokes.push(s);
    return { s, index: 0, action: { type: 'add', stroke: s } };
  }

  /* Other readings of the last converted character. Picking one fixes the text and teaches the recogniser. */
  function showAlts(p) {
    inkLast = p;
    const bar = $('#ink-alts');
    if (!p || !p.r.alts.length) return hideAlts();
    bar.textContent = '';
    for (const a of p.r.alts) {
      const btn = document.createElement('button');
      btn.textContent = a;
      btn.addEventListener('click', () => pickAlt(a));
      bar.appendChild(btn);
    }
    bar.classList.add('on');
    const z = view.zoom, x = p.box.x0 * z + view.x, y = p.box.y1 * z + view.y + 16;
    bar.style.transform = `translate(${clamp(x, 8, Math.max(8, W - bar.offsetWidth - 8))}px, ${clamp(y, 70, Math.max(70, H - 130))}px)`;
    clearTimeout(altTimer); altTimer = setTimeout(hideAlts, 6000);
  }
  function hideAlts() { clearTimeout(altTimer); $('#ink-alts').classList.remove('on'); }
  function pickAlt(a) {
    const p = inkLast;
    hideAlts(); inkLast = null;
    if (!p || !doc.strokes.includes(p.s)) return;
    const o = p.s, before = { text: o.text };
    retext(o, { text: o.text.slice(0, p.index) + a + o.text.slice(p.index + p.len) });
    record({ type: 'edit', s: o, before, after: { text: o.text } });
    WB.ink.learn(p.r.cloud, a);
    invalidate();
  }

  /* ---- Language ------------------------------------------------------ */
  let smSync = () => {}, scriptSync = () => {};
  function applyLang() {
    WB.setLang(settings.lang || WB.systemLang());
    WB.localize();
    const cur = WB.LANGS.find((l) => l[0] === WB.lang()), en = cur[0] === 'en';
    // Everything about language is shown in the active language and in English.
    $('#lang-title').textContent = $('#lbl-lang').textContent = en ? 'Language' : tr('language') + ' · Language';
    $('#lang-btn').textContent = en ? 'English' : cur[1] + ' · ' + cur[2];
    $$('#lang-menu .mi').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === cur[0])));
    titleEl.value = shownTitle();
    smSync(); scriptSync(); syncExport(); updateChrome(); selectionChanged();
    $('#btn-export').textContent = tr('export');
    if (edit) layoutEdit();
  }
  function initLang() {
    const menu = $('#lang-menu'), btn = $('#lang-btn');
    for (const [code, own, english] of WB.LANGS) {
      const b = document.createElement('button');
      b.className = 'mi'; b.dataset.lang = code; b.lang = code;
      b.setAttribute('role', 'menuitemradio');
      const name = document.createElement('span');
      name.textContent = own;
      if (code !== 'en') { const e = document.createElement('i'); e.lang = 'en'; e.textContent = english; name.appendChild(e); }
      b.appendChild(name);
      menu.appendChild(b);
    }
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lang]');
      if (!b) return;
      settings.lang = b.dataset.lang; saveSettings();
      menu.classList.remove('open');
      applyLang();
    });
    btn.addEventListener('click', () => {
      const open = !menu.classList.contains('open'), r = btn.getBoundingClientRect();
      closePopovers();
      menu.style.left = clamp(r.right - menu.offsetWidth, 8, Math.max(8, W - menu.offsetWidth - 8)) + 'px';
      menu.style.top = clamp(r.bottom + 8, 8, Math.max(8, H - menu.offsetHeight - 12)) + 'px';
      menu.classList.toggle('open', open);
    });
  }

  /* ---- Pan and pinch ------------------------------------------------- */
  let panId = null, panSamples = [], pinch = null;

  function beginPan(id, x, y) {
    mode = 'pan'; panId = id; panSamples = [{ x, y, t: performance.now() }];
    canvas.classList.add('panning');
  }
  function movePan(x, y) {
    const l = panSamples[panSamples.length - 1];
    view.x += x - l.x; view.y += y - l.y;
    panSamples.push({ x, y, t: performance.now() });
    if (panSamples.length > 10) panSamples.shift();
    invalidate();
  }
  function endPan() {
    mode = null; canvas.classList.remove('panning');
    const now = performance.now(), l = panSamples[panSamples.length - 1], f = panSamples.find((s) => now - s.t < 100);
    if (f && f !== l && now - l.t < 60 && !reduceMotion.matches) {
      const dt = l.t - f.t, vx = (l.x - f.x) / dt, vy = (l.y - f.y) / dt;   // hand the release velocity to the glide
      if (dt > 0 && hyp(vx, vy) > 0.15) { motion = { type: 'glide', vx, vy }; lastFrame = now; }
    }
    requestFrame();
  }
  function beginPinch() {
    const [a, b] = [...touches.values()];
    mode = 'pinch'; canvas.classList.remove('panning');
    pinch = { d: hyp(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }
  function movePinch() {
    const [a, b] = [...touches.values()];
    if (!b) return;
    const d = hyp(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    const zoom = clamp(view.zoom * d / pinch.d, ZOOM_MIN, ZOOM_MAX), k = zoom / view.zoom;
    view.x = cx - (pinch.cx - view.x) * k; view.y = cy - (pinch.cy - view.y) * k; view.zoom = zoom;
    pinch = { d, cx, cy };
    invalidate();
  }

  /* ---- Pointer input -------------------------------------------------
     Pen and mouse draw. Touch draws with one finger (optional), pans and zooms
     with two. Touches are ignored while a pen is down or hovering (palm rejection).
     Two-finger tap undoes, three-finger tap redoes. */
  const touches = new Map();
  let tap = null, penDown = false, lastPen = -1e9, spaceHeld = false, cursorPos = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button === 2) return;
    e.preventDefault();
    closePopovers(); stopMotion();
    if (edit) commitText();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const now = performance.now();

    if (e.pointerType === 'touch') {
      if (penDown || now - lastPen < 400) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      const n = touches.size;
      if (n === 1) {
        tap = { t: now, max: 1, moved: false };
        if (doubleOnText(e, now)) return;
        if (settings.fingerDraw && tools.tool !== 'hand') beginTool(e, tools.tool);
        else beginPan(e.pointerId, e.clientX, e.clientY);
        return;
      }
      if (tap) tap.max = Math.max(tap.max, n);
      if (mode === 'draw') {
        if (live && live.ptype === 'touch' && now - live.t0 < 450) endStroke(true);  // it was the start of a pinch
        else { touches.delete(e.pointerId); return; }                                // a resting finger mid-stroke
      }
      cancelSelDrag(); textDown = null;                                              // a second finger turns a tap, lasso or move into a pinch
      beginPinch();
      return;
    }

    if (mode === 'draw' && live && live.ptype === 'touch') endStroke(true);
    else if (mode === 'pan' || mode === 'pinch') { mode = null; canvas.classList.remove('panning'); }
    if (mode) return;
    touches.clear(); tap = null;
    if (e.button === 0 && !spaceHeld && doubleOnText(e, now)) { if (e.pointerType === 'pen') { penDown = true; lastPen = now; } return; }

    if (e.pointerType === 'pen') {
      penDown = true; lastPen = now;
      if (e.button === 2 || tools.tool === 'hand') return beginPan(e.pointerId, e.clientX, e.clientY);
      const flipped = e.button === 5 || (e.buttons & 32);    // eraser end of the stylus
      return flipped ? beginStroke(e, 'eraser') : beginTool(e, tools.tool);
    }
    if (e.button === 1 || spaceHeld || tools.tool === 'hand') beginPan(e.pointerId, e.clientX, e.clientY);
    else if (e.button === 0) beginTool(e, tools.tool);
  });

  /* A double-click or double-tap on a text opens it for editing, whatever tool is active.
     Returns true when this press is the second of such a pair (editing starts on release). */
  let lastDown = null;
  function doubleOnText(e, now) {
    const p = lastDown;
    lastDown = { t: now, x: e.clientX, y: e.clientY, type: e.pointerType };
    if (!p || now - p.t > 420 || p.type !== e.pointerType || hyp(e.clientX - p.x, e.clientY - p.y) > 26) return false;
    if (!textUnder(e.clientX, e.clientY)) return false;
    lastDown = null;
    // The first click of the pair may have left a dot (pen) or a dab (eraser): take it back.
    const a = undoStack[undoStack.length - 1], s = a && a.type === 'add' && a.stroke;
    if (s && s.points && s === doc.strokes[doc.strokes.length - 1] && now - (s._at || 0) < 500) {
      const b = WB.boundsOf(s);
      if ((Math.max(b.x1 - b.x0, b.y1 - b.y0) - s.width) * view.zoom < 12) { undoStack.pop(); doc.strokes.pop(); invalidate(); changed(); }
    }
    mode = 'text'; textDown = { id: e.pointerId, x: e.clientX, y: e.clientY };
    return true;
  }

  /* What a press on the board starts, for the active tool. */
  function beginTool(e, tool) {
    if (tool === 'select') {
      const add = e.ctrlKey || e.metaKey;
      mode = 'select';
      selDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, add, lasso: null,
        move: !add && onSelection(e.clientX, e.clientY), moved: false, lx: e.clientX, ly: e.clientY, dx: 0, dy: 0 };
      if (selDrag.move) finishFill();
    }
    else if (tool === 'text') { mode = 'text'; textDown = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
    else beginStroke(e, tool);
  }

  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') {
      const t = touches.get(e.pointerId);
      if (!t) return;
      t.x = e.clientX; t.y = e.clientY;
      if (tap && hyp(t.x - t.sx, t.y - t.sy) > 10) tap.moved = true;
    } else {
      if (e.pointerType === 'pen') lastPen = performance.now();
      cursorPos = { x: e.clientX, y: e.clientY };
      updateCursor();
      canvas.classList.toggle('can-move', tools.tool === 'select' && selection.size > 0 && onSelection(e.clientX, e.clientY));
    }
    if (mode === 'draw' && live && e.pointerId === live.id) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;   // every sample the stylus produced, not one per frame
      if (evs && evs.length) for (const ev of evs) addPoint(ev.clientX, ev.clientY);
      else addPoint(e.clientX, e.clientY);
      requestFrame();
    } else if (mode === 'pan' && e.pointerId === panId) movePan(e.clientX, e.clientY);
    else if (mode === 'pinch' && e.pointerType === 'touch') movePinch();
    else if (mode === 'select' && selDrag && e.pointerId === selDrag.id) {
      const d = selDrag, z = view.zoom;
      if (d.move) {                             // dragging the selection: it follows the pointer 1:1
        if (!d.moved && hyp(e.clientX - d.x, e.clientY - d.y) < 4) return;
        const dx = (e.clientX - d.lx) / z, dy = (e.clientY - d.ly) / z;
        d.moved = true; d.lx = e.clientX; d.ly = e.clientY; d.dx += dx; d.dy += dy;
        translate(selection, dx, dy);
        return;
      }
      if (!d.lasso && hyp(e.clientX - d.x, e.clientY - d.y) > 5) d.lasso = [(d.x - view.x) / z, (d.y - view.y) / z];   // a drag, not a click
      if (d.lasso) { d.lasso.push((e.clientX - view.x) / z, (e.clientY - view.y) / z); requestFrame(); }
    }
  });

  function onUp(e) {
    const cancel = e.type === 'pointercancel', now = performance.now();
    if (e.pointerType === 'pen') { penDown = false; lastPen = now; }
    const isTouch = e.pointerType === 'touch';
    if (isTouch && !touches.delete(e.pointerId)) return;

    if (mode === 'draw' && live && e.pointerId === live.id) endStroke(cancel);
    else if (mode === 'pan' && e.pointerId === panId) endPan();
    else if (mode === 'select' && selDrag && e.pointerId === selDrag.id) {
      const d = selDrag;
      mode = null;
      if (cancel) return cancelSelDrag();
      selDrag = null;
      if (d.moved) record({ type: 'move', items: [...selection], dx: d.dx, dy: d.dy });
      else if (d.lasso) selectLasso(d.lasso, d.add);
      else selectAt(d.x, d.y, d.add);
    } else if (mode === 'text' && textDown && e.pointerId === textDown.id) {
      const d = textDown;
      textDown = null; mode = null;
      if (!cancel && hyp(e.clientX - d.x, e.clientY - d.y) < 10) startText(d.x, d.y);
    } else if (mode === 'pinch' && isTouch) {
      if (touches.size >= 2) beginPinch();
      else if (touches.size === 1) { const [id, t] = [...touches][0]; beginPan(id, t.x, t.y); }
      else { mode = null; requestFrame(); }
    }
    if (isTouch && touches.size === 0 && tap) {
      if (!cancel && !tap.moved && now - tap.t < 350 && tap.max >= 2) { stopMotion(); tap.max === 2 ? undo() : redo(); }
      tap = null;
    }
  }
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && !mode) { cursorPos = null; updateCursor(); } });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    closePopovers(); stopMotion();
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 32; dy *= 32; }
    const notched = e.deltaMode === 1 || (dx === 0 && Math.abs(dy) >= 40);   // a mouse wheel, not a trackpad
    if (e.ctrlKey || e.metaKey || notched) zoomAt(e.clientX, e.clientY, view.zoom * Math.exp(-dy * (notched ? 0.0016 : 0.01)));
    else { view.x -= dx; view.y -= dy; invalidate(); }
  }, { passive: false });
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  function updateCursor() {
    const tool = tools.tool, show = cursorPos && (tool === 'pen' || tool === 'eraser') && !spaceHeld && mode !== 'pan';
    cursorEl.classList.toggle('on', !!show);
    if (!show) return;
    const d = Math.max(5, tools[tool].width);
    cursorEl.style.width = cursorEl.style.height = d + 'px';
    cursorEl.style.transform = `translate3d(${cursorPos.x - d / 2}px, ${cursorPos.y - d / 2}px, 0)`;
  }

  /* ---- History ------------------------------------------------------- */
  const snapshot = () => ({ title: doc.title, created: doc.created, strokes: doc.strokes, handle: fileHandle, gref: WB.gallery.ref });
  function applySnapshot(s) {
    doc.title = s.title; doc.created = s.created; doc.strokes = s.strokes; fileHandle = s.handle;
    WB.gallery.ref = s.gref || null;            // which gallery file this board is, if any
    $('#doc-title').value = shownTitle();
  }
  /* A board that was never named is stored as "Untitled" and shown in the interface language. */
  const untitled = () => !doc.title || doc.title === 'Untitled';
  const shownTitle = () => (untitled() ? tr('untitled') : doc.title);
  function record(a) {
    undoStack.push(a); redoStack.length = 0;
    if (undoStack.length > 2000) undoStack.shift();
    changed();
  }
  /* Actions: add (a new object on top), remove (objects taken out, with their positions
     in the drawing order), edit (a text changed in place), replace (the whole board). */
  function undo() {
    if (live) return;
    if (edit) commitText();
    const a = undoStack.pop();
    if (!a) return;
    fillAnim = null; clearSelection(); inkDrop();
    applyUndo(a);
    redoStack.push(a); invalidate(); changed();
  }
  function redo() {
    if (live) return;
    if (edit) commitText();
    const a = redoStack.pop();
    if (!a) return;
    clearSelection(); inkDrop();
    applyRedo(a);
    undoStack.push(a); invalidate(); changed();
  }
  function applyUndo(a) {
    if (a.type === 'add') doc.strokes.pop();
    else if (a.type === 'remove') for (const it of a.items) doc.strokes.splice(it.i, 0, it.s);
    else if (a.type === 'edit') retext(a.s, a.before);
    else if (a.type === 'move') translate(a.items, -a.dx, -a.dy);
    else if (a.type === 'batch') for (let k = a.list.length - 1; k >= 0; k--) applyUndo(a.list[k]);   // several steps undone as one
    else applySnapshot(a.before);
  }
  function applyRedo(a) {
    if (a.type === 'add') doc.strokes.push(a.stroke);
    else if (a.type === 'remove') for (let k = a.items.length - 1; k >= 0; k--) doc.strokes.splice(a.items[k].i, 1);
    else if (a.type === 'edit') retext(a.s, a.after);
    else if (a.type === 'move') translate(a.items, a.dx, a.dy);
    else if (a.type === 'batch') for (const sub of a.list) applyRedo(sub);
    else applySnapshot(a.after);
  }
  /* Replace the whole board (new, open, clear) as one undoable step. */
  function replaceBoard(next, message) {
    if (live) endStroke(true);
    if (edit) commitText();
    fillAnim = null; clearSelection(); inkDrop();
    const before = snapshot();
    applySnapshot(next);
    record({ type: 'replace', before, after: snapshot() });
    invalidate();
    toast(message, tr('undo'), undo);
  }
  function changed() { updateChrome(); autosave(); }
  function updateChrome() {
    $('#btn-undo').disabled = !undoStack.length;
    $('#btn-redo').disabled = !redoStack.length;
    hint.classList.toggle('gone', !restored || doc.strokes.length > 0 || !!live);
    document.title = shownTitle() + ' – Whiteboard';
  }

  /* ---- Autosave (IndexedDB) ------------------------------------------ */
  const db = new Promise((res) => {
    try {
      const r = indexedDB.open('whiteboard', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  async function dbGet(k) {
    const d = await db;
    if (!d) return null;
    return new Promise((res) => {
      const q = d.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result); q.onerror = () => res(null);
    });
  }
  let saveTimer = 0;
  async function saveNow() {
    clearTimeout(saveTimer);
    const d = await db;
    if (!d) return;
    // Everything but the render caches (keys starting with "_").
    const strokes = doc.strokes.map((s) => { const o = {}; for (const k in s) if (k[0] !== '_') o[k] = s[k]; return o; });
    try { d.transaction('kv', 'readwrite').objectStore('kv').put({ title: doc.title, created: doc.created, view: { ...view }, strokes }, 'board'); } catch (e) {}
  }
  function autosave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 500); }
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);

  /* ---- Files --------------------------------------------------------- */
  const safeName = () => (shownTitle().replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Untitled');

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  /* Returns a file handle, null (no picker: fall back to a download), or false (user cancelled). */
  async function pickSave(name, description, mime, ext) {
    if (!window.showSaveFilePicker) return null;
    try { return await window.showSaveFilePicker({ suggestedName: name, types: [{ description, accept: { [mime]: ['.' + ext] } }] }); }
    catch (e) { return e.name === 'AbortError' ? false : null; }
  }
  async function writeOut(handle, blob, name) {
    if (!handle) return download(blob, name);
    const w = await handle.createWritable();
    await w.write(blob); await w.close();
  }

  /* Where Ctrl S saves: the device file the board was last saved to or opened from ('file'),
     or the gallery ('gallery'). Whichever was used last wins. */
  let saveTarget = 'gallery';
  const BOARD_TYPES = [{ description: 'Whiteboard', accept: { 'application/x-whtbd': ['.whtbd'] } }];
  const canUseFiles = () => typeof window.showSaveFilePicker === 'function' && location.protocol !== 'file:';
  const commitPending = () => { if (edit) commitText(); inkConvert(); };

  /* Write the board into a file the page already has, then read it back to prove it arrived.
     Comparing the text (not just the size) catches a write that silently left the old file in place. */
  async function writeBoardFile(h) {
    let step = 'permission to change "' + h.name + '"';
    const text = WB.serialize(doc, view);
    if (h.queryPermission && (await h.queryPermission({ mode: 'readwrite' })) !== 'granted' &&
        (await h.requestPermission({ mode: 'readwrite' })) !== 'granted') {
      throw Object.assign(new Error('the browser did not allow changing the file'), { name: 'NotAllowedError', step });
    }
    try {
      step = 'opening the file for writing';
      const w = await h.createWritable({ keepExistingData: false });
      step = 'writing';
      await w.write(new Blob([text], { type: 'application/json' }));
      step = 'finishing the file';
      await w.close();
      step = 'checking the result';
      const back = await (await h.getFile()).text();
      if (back !== text) throw new Error(`the file on disk still holds different content (${back.length} characters, expected ${text.length})`);
    } catch (e) { e.step = e.step || step; throw e; }
  }
  function fileSaved(h) {
    fileHandle = h; saveTarget = 'file';
    toast(tr('tSavedFile', { t: h.name }));
  }

  /* "Save": straight back into the file the board came from, with no dialog. */
  async function saveBoardFile() {
    if (!fileHandle) return saveBoardTo();
    commitPending();
    try { await writeBoardFile(fileHandle); fileSaved(fileHandle); }
    catch (e) {
      if (e.name === 'AbortError' || e.name === 'NotAllowedError') return toast(tr('tSaveDenied', { t: fileHandle.name }), tr('mSaveTo'), saveBoardTo, 9000);
      report(tr('tSaveFail'), e.step, e);
    }
  }
  const saveDefault = () => (fileHandle && saveTarget === 'file' ? saveBoardFile() : WB.gallery.save());

  /* "Save to…": always asks where, writes the file there, and checks that it really arrived. */
  async function saveBoardTo() {
    commitPending();
    const name = safeName() + '.whtbd';
    if (!window.showSaveFilePicker) {                           // this browser has no save dialog
      download(new Blob([WB.serialize(doc, view)], { type: 'application/json' }), name);
      return toast(tr('tSavedDl'));
    }
    let h;
    try {
      const opts = { id: 'whiteboard-file', suggestedName: fileHandle ? fileHandle.name : name, types: BOARD_TYPES };
      if (fileHandle) opts.startIn = fileHandle;                // open the dialog next to the board's own file
      h = await window.showSaveFilePicker(opts);
    } catch (e) {
      if (e.name !== 'AbortError') report(tr('tSaveFail'), 'save dialog', e);
      // Opened from a local file, the browser reports a refused overwrite exactly like a cancel.
      else if (location.protocol === 'file:') toast(tr('tLocalSave'), null, null, 9000);
      // Some systems' browsers also cancel when an existing file is chosen to be replaced.
      else toast(tr('tSaveAsAbort'), null, null, 9000);
      return;                                                   // cancelled, or the dialog itself failed: nothing is written anywhere
    }
    // An unnamed board takes the name it was saved under, before the file is written.
    if (untitled()) { doc.title = h.name.replace(/\.whtbd$/i, '') || 'Untitled'; titleEl.value = shownTitle(); updateChrome(); autosave(); }
    try { await writeBoardFile(h); fileSaved(h); }
    catch (e) { report(tr('tSaveFail'), e.step, e); }
  }

  function loadText(text, handle, gref) {
    let d;
    try { d = WB.parse(text); } catch (e) { return toast(tr(e.message)); }
    replaceBoard({ title: d.title, created: d.created, strokes: d.strokes, handle: handle || null, gref: gref || null }, '');
    saveTarget = handle ? 'file' : 'gallery';
    toast(tr('tOpened', { t: shownTitle() }), tr('undo'), undo);
    fitView(true);
  }
  /* "Open from…": the browser's file dialog, which also gives the page the file itself, so that
     Save can later write back into it. Where that dialog is missing, the standard file chooser.
     Either is opened directly from the click, with nothing awaited first, because browsers only
     allow it while handling the user's own action. */
  async function openBoard() {
    if (!canUseFiles() || !window.showOpenFilePicker) return $('#file-input').click();
    let h;
    try { [h] = await window.showOpenFilePicker({ id: 'whiteboard-file', types: BOARD_TYPES, excludeAcceptAllOption: false }); }
    catch (e) {
      // A cancel looks exactly like the browser cancelling by itself, which some systems do even
      // after a file was chosen (and then refuse every later dialog at once). The simple file
      // chooser still works there; it needs a fresh tap, so it is offered as a button.
      if (e.name !== 'AbortError') console.error('open dialog', e);
      toast(tr('tOpenFallback'), tr('mOpenFrom'), () => $('#file-input').click(), 10000);
      return;
    }
    try { loadText(await (await h.getFile()).text(), h); } catch (err) { toast(tr('eInvalid')); }
  }
  $('#file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { loadText(await file.text()); } catch (err) { toast(tr('eInvalid')); }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  /* Dropped from the file manager: a folder becomes the gallery; a board opens, and where the
     browser hands over the file itself, Save writes back into it like after "Open from…". */
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    const dt = e.dataTransfer;
    if (!dt) return;
    const item = dt.items && [...dt.items].find((i) => i.kind === 'file');
    const file = dt.files[0];
    // The handle has to be asked for during the event itself, before anything is awaited.
    const pending = item && WB.gallery.canDrop() ? item.getAsFileSystemHandle() : null;
    let handle = null;
    try { handle = pending ? await pending : null; } catch (err) { handle = null; }
    if (handle && handle.kind === 'directory') return WB.gallery.useFolder(handle);
    if (handle) { try { return loadText(await (await handle.getFile()).text(), handle); } catch (err) { /* read it as a plain file */ } }
    if (file) { try { loadText(await file.text()); } catch (err) { toast(tr('eInvalid')); } }
  });

  /* ---- Export -------------------------------------------------------- */
  const FORMATS = {
    png: { mime: 'image/png', name: 'PNG image', note: 'nPng' },
    jpeg: { mime: 'image/jpeg', ext: 'jpg', name: 'JPEG image', note: 'nJpeg', opaque: true },
    webp: { mime: 'image/webp', name: 'WebP image', note: 'nWebp' },
    bmp: { mime: 'image/bmp', name: 'Bitmap image', note: 'nBmp', opaque: true },
    svg: { mime: 'image/svg+xml', name: 'SVG image', note: 'nSvg', vector: true },
    pdf: { mime: 'application/pdf', name: 'PDF document', note: 'nPdf', vector: true },
  };
  const exp = { format: 'png', scale: '2', bg: 'theme' };
  const canvasColor = () => getComputedStyle(root).getPropertyValue('--canvas').trim() || '#ffffff';

  async function doExport() {
    const b0 = WB.contentBounds(doc.strokes);
    if (!b0) return toast(tr('tNothing'));
    const F = FORMATS[exp.format], ext = F.ext || exp.format, name = safeName() + '.' + ext;
    const handle = await pickSave(name, F.name, F.mime, ext);   // ask where first, while the tap is still fresh
    if (handle === false) return;
    const btn = $('#btn-export');
    btn.disabled = true; btn.textContent = tr('exporting');
    try {
      const pad = Math.max(16, Math.max(b0.w, b0.h) * 0.04);
      const b = { x: b0.x - pad, y: b0.y - pad, w: b0.w + 2 * pad, h: b0.h + 2 * pad };
      let bg = exp.bg === 'none' ? null : exp.bg === 'white' ? '#ffffff' : canvasColor();
      if (!bg && F.opaque) bg = canvasColor();
      let blob, shrunk = false;
      if (exp.format === 'svg') blob = new Blob([WB.toSVG(doc.strokes, b, bg)], { type: F.mime });
      else if (exp.format === 'pdf') blob = await WB.toPDF(doc.strokes, b, bg);
      else {
        const r = WB.renderToCanvas(doc.strokes, b, +exp.scale, bg);
        shrunk = r.scale < +exp.scale;
        blob = exp.format === 'bmp' ? WB.canvasToBMP(r.canvas) : await WB.canvasToBlob(r.canvas, F.mime, 0.92);
      }
      await writeOut(handle, blob, name);
      closeSheets();
      toast(shrunk ? tr('tLowRes') : tr('tExported', { t: name }));
    } catch (e) {
      toast(tr('tExportFail'));
    } finally {
      btn.disabled = false; btn.textContent = tr('export');
    }
  }

  /* ---- UI: toast, popovers, sheets ----------------------------------- */
  let toastTimer = 0, toastFn = null;
  /* A failure message that stays long enough to read and says which step failed and how
     the browser describes it, e.g. "Could not save the file — writing: NotAllowedError: …". */
  function report(what, step, e) {
    const detail = e ? `${e.name || 'Error'}${e.message ? ': ' + e.message : ''}` : '';
    console.error(what, step, e);
    toast(`${what} — ${step}${detail ? ': ' + detail : ''}`.slice(0, 260), null, null, 12000);
  }
  function toast(msg, action, fn, ms) {
    const el = $('#toast'), btn = $('#toast-action');
    el.classList.toggle('long', msg.length > 60);
    $('#toast-text').textContent = msg;
    btn.hidden = !action; btn.textContent = action || ''; toastFn = fn || null;
    el.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('on'), ms || (action ? 5000 : 1800));
  }
  $('#toast-action').addEventListener('click', () => { $('#toast').classList.remove('on'); if (toastFn) toastFn(); });

  const POPS = [['#menu', '#btn-menu'], ['#zoom-menu', '#btn-zoom']];
  function closePopovers(except) {
    for (const [m, b] of POPS) if (m !== except) { $(m).classList.remove('open'); $(b).setAttribute('aria-expanded', 'false'); }
    $('#font-menu').classList.remove('open'); $('#lang-menu').classList.remove('open');
  }
  /* The file menu shows "Save to “name.whtbd”" while the board has a device file; Ctrl S goes to whichever save was used last. */
  function refreshFileMenu() {
    const fileItem = $('#mi-save-file'), toFile = !!fileHandle && saveTarget === 'file';
    fileItem.hidden = !fileHandle;
    if (fileHandle) fileItem.firstElementChild.textContent = tr('mSaveFile', { t: fileHandle.name });
    fileItem.lastElementChild.hidden = !toFile;
    $('#mi-save-gallery').lastElementChild.hidden = toFile;
  }
  for (const [m, b] of POPS) {
    $(b).addEventListener('click', () => {
      if (m === '#menu') refreshFileMenu();
      const open = !$(m).classList.contains('open');
      closePopovers(m);
      $(m).classList.toggle('open', open); $(b).setAttribute('aria-expanded', String(open));
    });
  }
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.menu, #btn-menu, #btn-zoom, #tb-font, #lang-btn')) closePopovers();
  }, true);

  function openSheet(id) { closePopovers(); closeSheets(); $(id).classList.add('open'); const f = $('[data-close]', $(id)); if (f) f.focus({ preventScroll: true }); }
  function closeSheets() { $$('.scrim.open').forEach((s) => s.classList.remove('open')); }
  const sheetOpen = () => !!$('.scrim.open');
  $$('.scrim').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s || e.target.closest('[data-close]')) closeSheets(); }));

  const ACTIONS = {
    new: () => replaceBoard({ title: 'Untitled', created: Date.now(), strokes: [], handle: null }, tr('mNew')) || animateView(W / 2, H / 2, 1),
    open: openBoard,
    gallery: () => WB.gallery.open(),
    'save-gallery': () => WB.gallery.save(),
    'save-file': saveBoardFile,
    'save-to': saveBoardTo,
    export: () => openSheet('#export'),
    clear: () => { if (doc.strokes.length) replaceBoard({ ...snapshot(), strokes: [] }, tr('tCleared')); },
    settings: () => openSheet('#settings'),
    'zoom-in': () => zoomStep(1.5),
    'zoom-out': () => zoomStep(1 / 1.5),
    'zoom-100': () => animateView((W / 2 - view.x) / view.zoom, (H / 2 - view.y) / view.zoom, 1),
    'zoom-fit': () => fitView(),
  };
  $$('.menu').forEach((m) => m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (edit) commitText();
    if (!b.dataset.act.startsWith('zoom-') || b.dataset.act === 'zoom-fit' || b.dataset.act === 'zoom-100') closePopovers();
    ACTIONS[b.dataset.act]();
  }));
  $('#btn-undo').addEventListener('click', undo);
  $('#btn-redo').addEventListener('click', redo);
  $('#btn-export').addEventListener('click', doExport);

  const titleEl = $('#doc-title');
  titleEl.addEventListener('input', () => { const v = titleEl.value.trim(); doc.title = v && v !== tr('untitled') ? v : 'Untitled'; updateChrome(); autosave(); });
  titleEl.addEventListener('blur', () => { titleEl.value = shownTitle(); });
  titleEl.addEventListener('focus', () => titleEl.select());

  /* ---- UI: tools, colours, sliders ----------------------------------- */
  const side = $('#side'), preview = $('#preview');
  const sizeT = () => { const [a, b] = SIZE[tools.tool] || SIZE.pen; return Math.sqrt((brush().width - a) / (b - a)); };
  const brush = () => tools[tools.tool === 'eraser' ? 'eraser' : 'pen'];
  const brushKind = () => (tools.tool === 'eraser' ? 'eraser' : 'pen');

  const isBrush = () => tools.tool === 'pen' || tools.tool === 'eraser';
  function setTool(t) {
    if (edit) commitText();
    if (t !== tools.tool) inkConvert();          // finish reading what was written before switching tools
    if (t !== 'select') clearSelection();
    tools.tool = t; store.set('wb.tools', tools); refreshTools();
  }
  function setColor(c) {
    if (edit) commitText();
    tools.pen.color = c;
    if (tools.tool !== 'pen') { clearSelection(); tools.tool = 'pen'; }
    store.set('wb.tools', tools); refreshTools();
  }

  function refreshTools() {
    $$('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tools.tool)));
    const c = tools.pen.color, inPalette = PALETTE.includes(c);
    $$('#swatches .swatch').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === c)));
    const custom = $('.swatch.custom');
    custom.setAttribute('aria-checked', String(!inPalette));
    custom.style.setProperty('--c', c);
    $('#dock').classList.toggle('erasing', tools.tool === 'eraser');
    side.classList.toggle('hidden', !isBrush());
    canvas.classList.toggle('brush', isBrush() && !spaceHeld);
    canvas.classList.toggle('hand', tools.tool === 'hand' || spaceHeld);
    canvas.classList.toggle('t-text', tools.tool === 'text' && !spaceHeld);
    canvas.classList.toggle('t-select', tools.tool === 'select' && !spaceHeld);
    const b = brush(), st = clamp(sizeT(), 0, 1), ot = (b.opacity - 0.05) / 0.95;
    const s1 = $('#sl-size'), s2 = $('#sl-opacity');
    s1.style.setProperty('--t', st); s1.setAttribute('aria-valuenow', Math.round(st * 100)); s1.setAttribute('aria-valuetext', b.width + ' pixels');
    s2.style.setProperty('--t', ot); s2.setAttribute('aria-valuenow', Math.round(ot * 100)); s2.setAttribute('aria-valuetext', Math.round(b.opacity * 100) + ' percent');
    updateCursor();
  }

  function showPreview(kind) {
    const b = brush(), dot = $('#preview-dot'), d = clamp(b.width, 2, 86);
    dot.style.width = dot.style.height = d + 'px';
    dot.className = brushKind();
    dot.style.background = brushKind() === 'pen' ? tools.pen.color : '';
    dot.style.opacity = b.opacity;
    $('#preview-label').textContent = kind === 'size' ? b.width + ' px' : Math.round(b.opacity * 100) + '%';
  }

  /* Vertical slider: tracks the pointer 1:1 from wherever it was grabbed (no jump to the touch point). */
  function vslider(el, kind, get, set) {
    let grab = null, flash = 0;
    const apply = (t) => { set(clamp(t, 0, 1)); refreshTools(); showPreview(kind); };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      grab = { y: e.clientY, t: get() };
      el.classList.add('active'); showPreview(kind); preview.classList.add('on');
    });
    el.addEventListener('pointermove', (e) => { if (grab) apply(grab.t + (grab.y - e.clientY) / el.clientHeight); });
    const end = () => { if (!grab) return; grab = null; el.classList.remove('active'); preview.classList.remove('on'); store.set('wb.tools', tools); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', (e) => {
      const d = { ArrowUp: 0.03, ArrowRight: 0.03, ArrowDown: -0.03, ArrowLeft: -0.03 }[e.key];
      if (!d) return;
      e.preventDefault(); apply(get() + d); store.set('wb.tools', tools);
      preview.classList.add('on'); clearTimeout(flash); flash = setTimeout(() => preview.classList.remove('on'), 900);
    });
  }
  function setSizeT(t) {
    const [a, b] = SIZE[brushKind()], w = a + (b - a) * t * t;
    brush().width = w < 10 ? Math.round(w * 2) / 2 : Math.round(w);
  }
  function nudgeSize(dir) {
    setSizeT(clamp(sizeT() + dir * 0.04, 0, 1)); store.set('wb.tools', tools); refreshTools(); showPreview('size');
    preview.classList.add('on'); clearTimeout(nudgeSize.t); nudgeSize.t = setTimeout(() => preview.classList.remove('on'), 900);
  }

  /* ---- UI: settings controls ----------------------------------------- */
  function seg(name, get, set) {
    const el = $(`[data-seg="${name}"]`);
    const sync = () => $$('button', el).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === String(get()))));
    el.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { set(b.dataset.value); sync(); } });
    sync();
    return sync;
  }
  const saveSettings = () => store.set('wb.settings', settings);

  function applyTheme() {
    const t = resolvedTheme();
    root.dataset.theme = t;
    applyCanvas();
  }
  /* The canvas colour follows the theme unless the user picked light, dark or a custom colour. */
  function applyCanvas() {
    const mode = settings.canvas, st = root.style;
    const vars = ['--canvas', '--grid', '--grid-line', '--on-canvas'];
    if (mode === 'theme') vars.forEach((v) => st.removeProperty(v));
    else {
      const c = mode === 'light' ? '#ffffff' : mode === 'dark' ? '#1c1c1e' : settings.canvasCustom;
      const on = isDark(c) ? '255, 255, 255' : '0, 0, 0';
      st.setProperty('--canvas', c);
      st.setProperty('--grid', `rgba(${on}, 0.16)`);
      st.setProperty('--grid-line', `rgba(${on}, 0.06)`);
      st.setProperty('--on-canvas', `rgba(${on}, 0.55)`);
    }
    const c = canvasColor(), dark = isDark(c);
    $('meta[name="theme-color"]').content = c;
    // Don't leave the pen on the one colour that is invisible against the new canvas.
    const hidden = dark ? '#111111' : '#ffffff', seen = dark ? '#ffffff' : '#111111';
    if (tools.text.color === hidden) tools.text.color = seen;
    if (tools.pen.color === hidden) { tools.pen.color = seen; store.set('wb.tools', tools); refreshTools(); }
    $('#canvas-color').style.setProperty('--c', settings.canvasCustom);
  }
  function isDark(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 < 0.45;
  }
  darkMq.addEventListener('change', applyTheme);

  let syncBg;
  function syncExport() {
    const F = FORMATS[exp.format];
    $('#format-note').textContent = tr(F.note);
    $('#scale-block').hidden = !!F.vector;
    const none = $('[data-seg="bg"] [data-value="none"]');
    none.disabled = !!F.opaque;
    if (F.opaque && exp.bg === 'none') { exp.bg = 'theme'; syncBg(); }
  }

  function initUI() {
    const sw = $('#swatches');
    for (const c of PALETTE) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.dataset.color = c; b.style.setProperty('--c', c);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c);
      dragToFill(b, () => c);
      b.addEventListener('click', () => setColor(c));
      sw.appendChild(b);
    }
    // The rainbow swatch opens the colour picker; like the others it can also be dragged out to fill.
    const customBtn = $('#btn-custom');
    dragToFill(customBtn, () => (PALETTE.includes(tools.pen.color) ? tools.custom : tools.pen.color));
    customBtn.addEventListener('click', () => {
      WB.picker.toggle({ anchor: customBtn, color: PALETTE.includes(tools.pen.color) ? tools.custom : tools.pen.color,
        onChange: (c) => { tools.custom = c; setColor(c); } });
    });
    $$('.tool').forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
    $('#sel-delete').addEventListener('click', deleteSelection);
    initText();
    WB.picker.snapshot = () => {              // what the pipette samples: the board exactly as shown
      const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true }), bg = canvasColor();
      c.width = canvas.width; c.height = canvas.height;
      g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(canvas, 0, 0);
      return { canvas: c, dpr, background: bg };
    };

    vslider($('#sl-size'), 'size', sizeT, setSizeT);
    vslider($('#sl-opacity'), 'opacity', () => (brush().opacity - 0.05) / 0.95, (t) => { brush().opacity = Math.round((0.05 + 0.95 * t) * 100) / 100; });

    seg('theme', () => settings.theme, (v) => { settings.theme = v; saveSettings(); applyTheme(); });
    const cc = $('#canvas-color'), ccRow = $('#canvas-custom');
    ccRow.hidden = settings.canvas !== 'custom';
    const mixCanvas = (toggle) => WB.picker[toggle ? 'toggle' : 'open']({ anchor: cc, color: settings.canvasCustom,
      onChange: (c) => { settings.canvasCustom = c; saveSettings(); applyCanvas(); } });
    seg('canvas', () => settings.canvas, (v) => {
      settings.canvas = v; saveSettings(); applyCanvas();
      ccRow.hidden = v !== 'custom';
      if (v === 'custom') mixCanvas(false); else WB.picker.close();   // go straight to the colour mixer
    });
    cc.addEventListener('click', () => mixCanvas(true));
    $('.sheet', $('#settings')).addEventListener('scroll', () => { WB.picker.close(); closePopovers(); }, { passive: true });

    const sd = $('#snap-delay');
    sd.value = settings.snapDelay;
    sd.addEventListener('change', () => {
      const v = clamp(Math.round((+sd.value || 1) * 10) / 10, 0.2, 10);
      settings.snapDelay = v; sd.value = v; saveSettings();
    });
    seg('grid', () => settings.grid, (v) => { settings.grid = v; saveSettings(); board.dataset.grid = v; });
    seg('format', () => exp.format, (v) => { exp.format = v; syncExport(); });
    seg('scale', () => exp.scale, (v) => { exp.scale = v; });
    syncBg = seg('bg', () => exp.bg, (v) => { exp.bg = v; });
    syncExport();

    const sm = $('#smoothing'), smOut = $('#smoothing-out');
    smSync = () => { smOut.textContent = settings.smoothing > 0 ? settings.smoothing + '%' : tr('off'); };
    sm.value = settings.smoothing; smSync();

    const idl = $('#ink-delay');
    idl.value = settings.inkDelay;
    idl.addEventListener('change', () => {
      const v = clamp(Math.round((+idl.value || 1) * 10) / 10, 0.2, 10);
      settings.inkDelay = v; idl.value = v; saveSettings();
    });
    scriptSync = seg('inkScript', inkScript, (v) => { settings.inkScript = v; saveSettings(); inkDrop(); });
    if (settings.ink) WB.ink.prepare();
    $('#ink-alts').addEventListener('pointerdown', (e) => e.preventDefault());
    initLang();
    // The thumb glides freely; the stored value still lands on steps of 5.
    sm.addEventListener('input', () => { settings.smoothing = Math.round(+sm.value / 5) * 5; smSync(); saveSettings(); });

    $$('[data-switch]').forEach((b) => {
      const k = b.dataset.switch;
      b.setAttribute('aria-checked', String(!!settings[k]));
      b.addEventListener('click', () => {
        settings[k] = !settings[k]; b.setAttribute('aria-checked', String(settings[k])); saveSettings();
        if (k === 'ink') { if (settings.ink) WB.ink.prepare(); else inkDrop(); }
      });
    });

    board.dataset.grid = settings.grid;
    applyTheme(); refreshTools(); applyLang();
  }

  /* ---- Keyboard ------------------------------------------------------ */
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.target === ta) {                      // typing on the board: only Escape and file shortcuts get through
      if (e.key === 'Escape') { commitText(); return; }
      if (!(mod && 'soe'.includes(k))) return;
      commitText();
    }
    const typing = e.target instanceof HTMLInputElement && e.target.type !== 'range';
    if (e.key === 'Escape') { closePopovers(); closeSheets(); clearSelection(); if (typing) e.target.blur(); return; }
    if (typing) { if (e.key === 'Enter') e.target.blur(); return; }
    if (mod) {
      if (k === 'a' && !sheetOpen()) {          // select everything
        e.preventDefault(); setTool('select');
        for (const s of doc.strokes) if (s.tool !== 'eraser') selection.add(s);
        return selectionChanged();
      }
      const act = { z: e.shiftKey ? redo : undo, y: redo, s: e.shiftKey ? saveBoardTo : saveDefault, o: openBoard, g: ACTIONS.gallery, e: ACTIONS.export,
        0: ACTIONS['zoom-100'], 1: ACTIONS['zoom-fit'], '=': ACTIONS['zoom-in'], '+': ACTIONS['zoom-in'], '-': ACTIONS['zoom-out'] }[k];
      if (act) { e.preventDefault(); if (!sheetOpen() || k === 's') act(); }
      return;
    }
    if (e.altKey || sheetOpen()) return;
    if (e.code === 'Space') {
      if (document.activeElement === document.body) { e.preventDefault(); if (!spaceHeld) { spaceHeld = true; refreshTools(); } }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selection.size) { e.preventDefault(); deleteSelection(); }
    else if (k === 'p' || k === 'b') setTool('pen');
    else if (k === 'e') setTool('eraser');
    else if (k === 't') { e.preventDefault(); setTool('text'); }
    else if (k === 'v') setTool('select');
    else if (k === 'h') setTool('hand');
    else if (k === '[' && isBrush()) nudgeSize(-1);
    else if (k === ']' && isBrush()) nudgeSize(1);
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space' && spaceHeld) { spaceHeld = false; refreshTools(); } });
  window.addEventListener('blur', () => { if (spaceHeld) { spaceHeld = false; refreshTools(); } });

  /* ---- Start --------------------------------------------------------- */
  WB.gallery.init({
    serialize: () => WB.serialize(doc, view),
    title: () => shownTitle(),
    load: (text, gref) => loadText(text, null, gref),
    retitle: (label) => { doc.title = label; titleEl.value = shownTitle(); updateChrome(); autosave(); },
    commit: commitPending,
    saved: () => { saveTarget = 'gallery'; },
    canvasColor: () => canvasColor(),
    toast, report, openSheet, closeSheets,
  });
  initUI();
  new ResizeObserver(resize).observe(board);
  window.addEventListener('resize', resize);
  resize();

  dbGet('board').then((saved) => {
    restored = true;
    if (!saved || !Array.isArray(saved.strokes) || doc.strokes.length || live) return updateChrome();
    doc.title = saved.title || 'Untitled'; doc.created = saved.created || Date.now(); doc.strokes = saved.strokes;
    if (saved.view && saved.view.zoom > 0) Object.assign(view, saved.view);
    titleEl.value = shownTitle();
    updateChrome(); invalidate();
  });

  /* Installed-app extras (only when served from a web address; skipped for a file opened from disk). */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});       // offline support
  }
  if ('launchQueue' in window) {                                      // opening a .whtbd file with the installed app
    window.launchQueue.setConsumer(async (p) => {
      if (p.files && p.files.length) loadText(await (await p.files[0].getFile()).text(), p.files[0]);
    });
  }

  WB.app = { doc, view, settings, tools, undo, redo, fitView, invalidate, doExport, exp, selection };
})();
