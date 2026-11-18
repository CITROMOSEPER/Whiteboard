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
  const sheet = document.createElement('canvas'), shctx = sheet.getContext('2d');     // a sheet's pages, edges and the tint around them, under the ink
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  // iPhone and iPad (an iPad's Safari says it is a Mac, but has touch).
  const IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const darkMq = matchMedia('(prefers-color-scheme: dark)');

  const holdMs = () => clamp(+settings.snapDelay || 1, 0.2, 10) * 1000;   // hold still this long to snap a stroke into a shape
  const ZOOM_MIN = 0.02, ZOOM_MAX = 64;
  const PALETTE = ['#111111', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#007aff', '#af52de'];
  const HL_PALETTE = ['#ffee00', '#b8ff1f', '#2bff88', '#1fe0ff', '#4d9dff', '#c56bff', '#ff4fd8', '#ff8c1a'];   // neon, like highlighter pens
  const SIZE = { pen: [1, 60], eraser: [4, 200], highlighter: [4, 160] };

  /* ---- State --------------------------------------------------------- */
  const store = {
    get(k, def) { try { return Object.assign(def, JSON.parse(localStorage.getItem(k)) || {}); } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const settings = store.get('wb.settings', { theme: 'system', smoothing: 0, snap: true, fingerDraw: true, scratch: true, pressure: false, filesCopy: false, grid: 'dots', canvas: 'theme', canvasCustom: '#f4f1e8', snapDelay: 1,
    lang: null });                              // interface language (null = follow the system)
  const tr = WB.t;
  WB.setLang(settings.lang || WB.systemLang());
  const resolvedTheme = () => (settings.theme === 'system' ? (darkMq.matches ? 'dark' : 'light') : settings.theme);
  const ink0 = resolvedTheme() === 'dark' ? '#ffffff' : '#111111';
  const tools = store.get('wb.tools', {
    tool: 'pen',
    pen: { color: ink0, width: 4, opacity: 1 },
    eraser: { width: 28, opacity: 1 },
    highlighter: { color: '#ffee00', width: 24, opacity: 0.5 },
    text: { font: 'sans', size: 24, color: ink0 },
    custom: '#ff2d55',              // last colour mixed in the picker
  });

  const doc = { title: 'Untitled', created: Date.now(), strokes: [], pages: [] };   // pages: a sheet's fixed areas (see WB.paintPages)
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
    canvas.width = base.width = scratch.width = sheet.width = Math.max(1, Math.round(W * dpr));
    canvas.height = base.height = scratch.height = sheet.height = Math.max(1, Math.round(H * dpr));
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
    renderSheet(x0, y0, x1, y1);
    baseView.x = view.x; baseView.y = view.y; baseView.zoom = view.zoom;
    baseDirty = false;
    renderCost = performance.now() - t0;
  }
  /* A sheet: what lies outside the pages is tinted (it is never exported), each page has a clear
     edge, and an opened PDF's page pictures lie beneath the ink. */
  function renderSheet(x0, y0, x1, y1) {
    shctx.setTransform(1, 0, 0, 1, 0, 0);
    shctx.clearRect(0, 0, sheet.width, sheet.height);
    if (!doc.pages.length) return;
    worldTransform(shctx);
    const seen = doc.pages.filter((p) => p.x < x1 && p.x + p.w > x0 && p.y < y1 && p.y + p.h > y0);
    // A decoded page picture takes about 17 MB; a long PDF scrolled through would keep them all.
    // Pages more than a screen away from the view let theirs go (decoded again when they return).
    const mx = x1 - x0, my = y1 - y0;
    for (const p of doc.pages) {
      if (p._img && !p._lent && !(p.x < x1 + mx && p.x + p.w > x0 - mx && p.y < y1 + my && p.y + p.h > y0 - my)) { p._img.onload = null; p._img.src = ''; delete p._img; }
    }
    shctx.beginPath();
    shctx.rect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
    for (const p of doc.pages) shctx.rect(p.x, p.y, p.w, p.h);
    shctx.fillStyle = isDark(canvasColor()) ? 'rgba(0, 0, 0, 0.32)' : 'rgba(96, 96, 104, 0.13)';
    shctx.fill('evenodd');
    WB.paintPages(shctx, seen, null);
    shctx.lineWidth = 1 / view.zoom;
    shctx.strokeStyle = isDark(canvasColor()) ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.22)';
    for (const p of seen) shctx.strokeRect(p.x, p.y, p.w, p.h);
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
    if (baseDirty) {
      const k = view.zoom / baseView.zoom;
      ctx.setTransform(k, 0, 0, k, (view.x - baseView.x * k) * dpr, (view.y - baseView.y * k) * dpr);
    }
    if (doc.pages.length) ctx.drawImage(sheet, 0, 0);
    if (live && live.hl) {                    // a highlighter in progress lies between the paper and the ink
      const t = ctx.getTransform();
      paintLive(); ctx.setTransform(t);
    }
    ctx.drawImage(base, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fillAnim) drawFillAnim(now);
    if (selection.size || (selDrag && selDrag.lasso)) drawSelection();
    if (plotActive) drawPlotActive();
    placePlotBar();
    if (live && !live.hl) paintLive();
    if (WB.live.on()) { paintGhosts(); drawHeld(); }
    if (laser.trail.length) drawLaser(now);
    if (pointers.size) drawPointers(now);
    syncView();
    placePageButtons();
  }

  /* ---- Adding pages to a sheet --------------------------------------------
     A "+" button sits just above the top page and just below the bottom one. They move and scale
     with the board, like part of the sheet, and add a page of the same size there (undoable). */
  /* Next to it, while the end page is empty (nothing drawn on it, not a PDF page) and isn't the
     only one, a delete button; the two then sit side by side, centred together. */
  const pageBtns = { top: $('#page-add-top'), bottom: $('#page-add-bottom') };
  const delBtns = { top: $('#page-del-top'), bottom: $('#page-del-bottom') };
  let pageKey = '', emptyKey = '', empty = { top: false, bottom: false }, docRev = 0;
  const ends = () => ({
    top: doc.pages.reduce((a, p) => (p.y < a.y ? p : a)),
    bottom: doc.pages.reduce((a, p) => (p.y + p.h > a.y + a.h ? p : a)),
  });
  function pageEmpty(p) {
    if (p.src || doc.pages.length < 2) return false;
    return !doc.strokes.some((s) => {
      if (s.tool === 'eraser') return false;
      const b = WB.boundsOf(s);
      return b.x1 > p.x && b.x0 < p.x + p.w && b.y1 > p.y && b.y0 < p.y + p.h;
    });
  }
  function placePageButtons() {
    if (!doc.pages.length) {
      if (pageKey) { for (const b of [pageBtns.top, pageBtns.bottom, delBtns.top, delBtns.bottom]) b.classList.remove('on'); pageKey = ''; }
      return;
    }
    const E = ends();
    const ek = docRev + ':' + doc.pages.length + ':' + doc.strokes.length;
    if (ek !== emptyKey) { emptyKey = ek; empty = { top: pageEmpty(E.top), bottom: E.bottom !== E.top && pageEmpty(E.bottom) }; }
    const z = view.zoom, k = clamp(z, 0.45, 1.6), gap = 32 * k, half = 26 * k;
    const at = { top: [view.x + (E.top.x + E.top.w / 2) * z, view.y + E.top.y * z - gap], bottom: [view.x + (E.bottom.x + E.bottom.w / 2) * z, view.y + (E.bottom.y + E.bottom.h) * z + gap] };
    const key = [at.top, at.bottom, k, empty.top, empty.bottom].join();
    if (key === pageKey) return;
    pageKey = key;
    for (const w of ['top', 'bottom']) {
      const [x, y] = at[w], d = empty[w] ? half : 0;
      pageBtns[w].style.transform = `translate(${x - d}px, ${y}px) translate(-50%, -50%) scale(${k})`;
      delBtns[w].style.transform = `translate(${x + d}px, ${y}px) translate(-50%, -50%) scale(${k})`;
      pageBtns[w].classList.add('on');
      delBtns[w].classList.toggle('on', empty[w]);
    }
  }
  function deletePage(where) {
    commitPending();
    const p = ends()[where];
    if (!pageEmpty(p)) return;
    const before = snapshot();
    doc.pages = doc.pages.filter((q) => q !== p);
    record({ type: 'replace', before, after: snapshot() });
    invalidate();
    toast(tr('tPageDeleted'), tr('undo'), undo);
  }
  delBtns.top.addEventListener('click', () => deletePage('top'));
  delBtns.bottom.addEventListener('click', () => deletePage('bottom'));
  function addPage(where) {
    commitPending();
    const pages = doc.pages.slice().sort((a, b) => a.y - b.y);
    const ref = where === 'top' ? pages[0] : pages[pages.length - 1], gap = 40;
    const p = { x: onGrid(ref.x, 0), y: where === 'top' ? onGrid(ref.y - gap - ref.h, -1) : onGrid(ref.y + ref.h + gap, 1), w: ref.w, h: ref.h };
    const before = snapshot();
    doc.pages = where === 'top' ? [p, ...pages] : [...pages, p];
    record({ type: 'replace', before, after: snapshot() });
    invalidate();
    animateView(p.x + p.w / 2, p.y + p.h / 2, view.zoom);       // glide to the new page
    toast(tr('tPageAdded'), tr('undo'), undo);
  }
  pageBtns.top.addEventListener('click', () => addPage('top'));
  pageBtns.bottom.addEventListener('click', () => addPage('bottom'));

  /* On a live board: send my line in progress, and draw the others' lines in progress. */
  function paintGhosts() {
    WB.live.streamInk(live);
    const gs = WB.live.inkGhosts();
    if (!gs.length) return;
    worldTransform(ctx);
    for (const g of gs) { const p = new Path2D(); WB.trace(g, p); WB.paint(ctx, g, p, true); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /* What others are working on (moving, resizing, editing): a dashed frame in their colour. */
  function drawHeld() {
    const list = WB.live.held();
    if (!list.length) return;
    const z = view.zoom, pad = 6 / z;
    worldTransform(ctx);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.lineWidth = 2 / z; ctx.setLineDash([7 / z, 5 / z]);
    for (const h of list) {
      const b = WB.contentBounds(h.list);
      if (!b) continue;
      ctx.strokeStyle = h.color;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad, 6 / z); else ctx.rect(b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  function paintLive() {
    worldTransform(ctx);
    const p = new Path2D(); (WB.hasPress(live) ? WB.traceVar : WB.trace)(live, p);
    WB.paint(ctx, live, p, true);
  }

  /* ---- Laser pointer -----------------------------------------------------
     A red dot with a glow follows the pen, finger or mouse (the #laser element), trailing a short
     fading streak. Dragging moves the board, as with the hand tool. Nothing is drawn on the board. */
  const laser = { el: $('#laser'), trail: [] };
  function laserAt(x, y) {
    laser.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    laser.el.classList.add('on');
    if (WB.live.on()) {
      laser.el.style.setProperty('--lc', WB.live.myColor());
      const g = plotActive && doc.strokes.includes(plotActive) && inPlot(plotActive, x, y) ? plotActive : null;
      if (g) { const L = plotLocal(g, x, y), u = g.w / g.span; WB.live.pointer({ g, mx: g.cx + L.x / u, my: g.cy - L.y / u }); }
      else WB.live.pointer({ x: (x - view.x) / view.zoom, y: (y - view.y) / view.zoom });
    }
    // Dragging the board: the dot is held still over the board, so it leaves no streak.
    if (mode === 'pan') { laser.trail.length = 0; requestFrame(); return; }
    const t = performance.now(), l = laser.trail[laser.trail.length - 1];
    if (!l || l.x !== x || l.y !== y) laser.trail.push({ x, y, t });
    requestFrame();
  }
  function laserOff() { laser.el.classList.remove('on'); WB.live.pointer(null); }
  /* Others' laser pointers on a live board: a dot each, in their colour, with its streak. They are
     kept in board coordinates, so they stay on the right spot while the board is moved or zoomed. */
  const pointers = new Map();     // peer -> { el, trail: [{ x, y, t }], color, x, y }
  function remotePointer(id, p) {
    let q = pointers.get(id);
    if (!p) { if (q) { q.el.remove(); pointers.delete(id); requestFrame(); } return; }
    if (!q) {
      q = { el: document.createElement('div'), trail: [] };
      q.el.className = 'laser on'; q.el.setAttribute('aria-hidden', 'true');
      laser.el.after(q.el);
      pointers.set(id, q);
    }
    if ((p.plot || null) !== (q.plot || null)) q.trail = [];   // moved onto a graph or off it
    q.color = p.color; q.plot = p.plot || null;
    if (q.plot) { q.x = p.mx; q.y = p.my; } else { q.x = p.x; q.y = p.y; }
    q.el.style.setProperty('--lc', p.color);
    if (p.name) q.el.dataset.name = p.name; else delete q.el.dataset.name;
    const l = q.trail[q.trail.length - 1];
    if (!l || l.x !== q.x || l.y !== q.y) q.trail.push({ x: q.x, y: q.y, t: performance.now() });
    requestFrame();
  }
  /* A point of a pointer -> screen, or null where it can't be seen (off its graph's view). */
  function pointerScreen(q, p) {
    if (!q.plot) return { x: p.x * view.zoom + view.x, y: p.y * view.zoom + view.y, t: p.t };
    const s = q.plot;
    if (!doc.strokes.includes(s)) return null;
    const u = s.w / s.span, lx = (p.x - s.cx) * u, ly = -(p.y - s.cy) * u;
    if (Math.abs(lx) > s.w / 2 || Math.abs(ly) > s.h / 2) return null;
    const w = WB.toWorld(s, lx, ly);
    return { x: w.x * view.zoom + view.x, y: w.y * view.zoom + view.y, t: p.t };
  }
  function drawPointers(now) {
    for (const q of pointers.values()) {
      const at = pointerScreen(q, q);
      q.el.classList.toggle('on', !!at);
      if (!at) continue;
      q.el.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
      if (q.trail.length) drawTrail(q.trail, q.color, now, (p) => pointerScreen(q, p));
    }
  }
  function clearPointers() { for (const id of [...pointers.keys()]) remotePointer(id, null); }
  /* The streak is one tapered ribbon, filled once: narrow and old at the tail, widest at the dot.
     (Drawn as separate overlapping pieces it showed brighter dots wherever the pieces met.) */
  function drawLaser(now) { drawTrail(laser.trail, WB.live.on() ? WB.live.myColor() : '#ff2a2a', now, null); }
  function drawTrail(tr0, color, now, toScreen) {
    const T = 175;
    while (tr0.length && now - tr0[0].t > T) tr0.shift();
    const P = [];
    for (const p0 of tr0) { const p = toScreen ? toScreen(p0) : p0, l = P[P.length - 1]; if (p && (!l || Math.hypot(p.x - l.x, p.y - l.y) > 0.75)) P.push(p); }
    if (P.length < 2) { if (tr0.length) requestFrame(); return; }
    const n = P.length, L = [], Rt = [];
    for (let i = 0; i < n; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len;
      const k = Math.max(0, 1 - (now - P[i].t) / T), hw = 0.2 + 1.8 * k * (0.35 + 0.65 * i / (n - 1));
      L.push(P[i].x + nx * hw, P[i].y + ny * hw); Rt.push(P[i].x - nx * hw, P[i].y - ny * hw);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 0.7;
    const c = parseInt(color.slice(1), 16);
    ctx.shadowColor = `rgba(${c >> 16}, ${(c >> 8) & 255}, ${c & 255}, 0.75)`; ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(L[0], L[1]);
    for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]);
    for (let i = Rt.length - 2; i >= 0; i -= 2) ctx.lineTo(Rt[i], Rt[i + 1]);
    ctx.closePath();
    ctx.fill('nonzero');
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    requestFrame();
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
    const b = doc.pages.length ? WB.pagesBounds(doc.pages) : WB.contentBounds(doc.strokes);   // a sheet fits its pages
    if (!b) return animateView(W / 2, H / 2, 1, instant);
    const z = Math.min((W - 150) / b.w, (H - 210) / b.h, 2);
    animateView(b.x + b.w / 2, b.y + b.h / 2, Math.max(z, ZOOM_MIN), instant);
  }

  /* ---- Drawing ------------------------------------------------------- */
  let mode = null;      // 'draw' | 'pan' | 'pinch'
  let live = null;      // stroke in progress
  let holdTimer = 0;

  function beginStroke(e, tool) {
    mode = 'draw';
    const t = tools[tool], z = view.zoom, now = performance.now();
    const x = (e.clientX - view.x) / z, y = (e.clientY - view.y) / z;
    const hl = tool === 'highlighter';
    // A highlighter is wide with a square tip: raw pointer jitter (a diagonal mouse drag comes in
    // as a staircase) would make its edges wobble and its tip flip, so it is always smoothed a little.
    const sm = hl ? Math.max(settings.smoothing / 100, 0.3) : settings.smoothing / 100;
    // Pressure, when it is on: only from a stylus, and only for the pen (not the highlighter or eraser).
    const pr = settings.pressure && e.pointerType === 'pen' && tool === 'pen' && !WB.DASHES[tools.pen.dash] ? (e.pressure > 0 ? e.pressure : 0.5) : null;
    live = {
      id: e.pointerId, ptype: e.pointerType, t0: now,
      tool: hl ? 'pen' : tool, hl: hl || undefined, color: hl ? tools.highlighter.color : tools.pen.color, width: t.width / z, opacity: t.opacity,
      dash: tool === 'pen' && WB.DASHES[tools.pen.dash] ? tools.pen.dash : undefined,
      press: pr === null ? undefined : [pr], tp: pr,
      points: [x, y], smooth: sm > 0, closed: false,
      tau: sm * 140, sx: x, sy: y, tx: x, ty: y,
      hold: { x: e.clientX, y: e.clientY, t: now, tol: e.pointerType === 'mouse' ? 3 : 7 },
      snapped: false, morph: null, final: null,
    };
    hint.classList.add('gone');
    scheduleHold(holdMs());
    requestFrame();
  }

  function addPoint(cx, cy, pressure) {
    const L = live, h = L.hold;
    if (L.press && pressure > 0) L.tp += (pressure - L.tp) * 0.6;   // a little smoothing: raw pressure jitters
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
    if (p[n - 2] !== x || p[n - 1] !== y) { p.push(x, y); if (L.press) L.press.push(L.tp); }
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
        if (L.press) L.press.push(L.tp);
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
    if (L.tau > 0 && L.press) L.press.push(L.tp);
    const res = WB.recognize(p);
    if (!res) { if (L.tau > 0) { p.length -= 2; if (L.press) L.press.length--; } return false; }
    L.snapped = true; L.final = res; L.press = undefined;      // a clean shape has an even line
    const pivot = res.closed ? WB.centroid(res.points) : [res.points[0], res.points[1]];
    L.xf = { px: pivot[0], py: pivot[1], cx: L.hold.x, cy: L.hold.y, ax: 0, ay: 0, ang: 0, sc: 1, active: false };
    L.theta0 = shapeAngle(res); L.extra = new Set(); L.shift = false;
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
  /* The angle a snapped shape is measured by: from its start to its end for open shapes (line,
     polyline, curve), its longest side for polygons, its long axis for an ellipse. A circle has none. */
  function shapeAngle(res) {
    const p = res.points, n = p.length >> 1;
    if (res.type === 'circle' || n < 2) return null;
    if (!res.closed) return Math.atan2(p[2 * n - 1] - p[1], p[2 * n - 2] - p[0]);
    if (res.type === 'ellipse') {
      const c = WB.centroid(p);
      let far = 0, a = 0;
      for (let i = 0; i < n; i++) { const d = hyp(p[2 * i] - c[0], p[2 * i + 1] - c[1]); if (d > far) { far = d; a = Math.atan2(p[2 * i + 1] - c[1], p[2 * i] - c[0]); } }
      return a;
    }
    let long = 0, a = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, dx = p[2 * j] - p[2 * i], dy = p[2 * j + 1] - p[2 * i + 1], d = hyp(dx, dy);
      if (d > long) { long = d; a = Math.atan2(dy, dx); }
    }
    return a;
  }
  /* Another finger on the screen (put down after the shape snapped) or Shift snaps the shape's
     angle to 45° steps, like turning a selection; lifting it lets the shape turn freely again. */
  const snap45 = (L) => L.theta0 != null && (L.shift || (L.extra && L.extra.size > 0));
  function resnap() {
    const L = live;
    if (!L || !L.snapped) return;
    if (!L.morph) applyXf(L);
    requestFrame();
  }
  /* points = base rotated and scaled about the pivot. */
  function applyXf(L) {
    const X = L.xf, b = L.base, p = L.points;
    let ang = X.ang;
    if (snap45(L)) { const q = Math.PI / 4, t = L.theta0 + ang; ang += Math.round(t / q) * q - t; }
    const c = Math.cos(ang) * X.sc, s = Math.sin(ang) * X.sc;
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
    if (L.deselect && performance.now() - L.t0 < 350) {          // the tap that deselected: not a dot
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < L.points.length; i += 2) { x0 = Math.min(x0, L.points[i]); x1 = Math.max(x1, L.points[i]); y0 = Math.min(y0, L.points[i + 1]); y1 = Math.max(y1, L.points[i + 1]); }
      if (Math.max(x1 - x0, y1 - y0) * view.zoom < 6) return updateChrome();
    }
    if (L.final) applyFinal(L);
    else if (L.tau > 0 && !L.snapped) { L.points.push(L.tx, L.ty); if (L.press) L.press.push(L.tp); }   // smoothing lags the pen: finish at the pen (never on a snapped shape)
    if (L.tool === 'eraser') { applyEraser(L); return updateChrome(); }
    const s = { tool: L.tool, color: L.color, width: L.width, opacity: L.opacity, points: L.points, smooth: L.smooth, closed: L.closed };
    if (L.shape) s.shape = L.shape;
    if (L.dash) s.dash = L.dash;
    if (L.hl) {
      s.hl = true;
      // Settle the finished line: drop the small wiggles and draw it as a smooth curve.
      if (!s.shape && s.points.length > 4) {
        const pairs = [];
        for (let i = 0; i < s.points.length; i += 2) pairs.push([s.points[i], s.points[i + 1]]);
        const kept = WB.rdp(pairs, s.width * 0.06);
        s.points = kept.flat(); s.smooth = true;
      }
    }
    if (L.press && L.press.length === s.points.length >> 1) s.press = L.press.map((v) => Math.round(v * 100) / 100);
    if (s.tool === 'pen' && !s.hl && !s.shape && settings.scratch && scratchOut(s, performance.now() - L.t0)) return;
    s._at = performance.now();
    doc.strokes.push(s);
    if (!baseDirty) { worldTransform(bctx); WB.paint(bctx, s); }
    record({ type: 'add', stroke: s });
  }

  /* ---- Erasing ------------------------------------------------------------
     An eraser stroke becomes part of every object it passes over (see WB.paint), so it moves,
     turns and gets copied with them. A line erased away completely is removed instead, and an
     eraser that touched nothing leaves nothing behind. One undo step. */
  function applyEraser(L) {
    const E = { tool: 'eraser', width: L.width, opacity: L.opacity, smooth: !!L.smooth, points: L.points.slice() };
    const len = WB.pathLength(E.points), eb = WB.boundsOf(E);
    const pts = WB.resampleFlat(E.points, Math.max(2, Math.min(400, Math.ceil(len / Math.max(1e-6, E.width / 3)) + 1)));
    const edits = [], gone = [];
    doc.strokes.forEach((o, i) => {
      if (o.tool === 'eraser' || WB.live.heldByOther(o)) return;
      const b = WB.boundsOf(o);
      if (b.x1 < eb.x0 || b.x0 > eb.x1 || b.y1 < eb.y0 || b.y0 > eb.y1) return;
      let touch = false;
      for (let k = 0; k < pts.length && !touch; k += 2) touch = WB.hit(o, pts[k], pts[k + 1], E.width / 2);
      if (!touch) return;
      const after = (o.erase || []).map((e) => e).concat(plainEraser(E));
      if (E.opacity >= 0.5 && erasedAway(o, after)) gone.push({ i, s: o });
      else edits.push({ type: 'edit', s: o, before: { erase: o.erase }, after: { erase: after } });
    });
    if (!edits.length && !gone.length) return;
    for (const a of edits) retext(a.s, a.after);
    for (let k = gone.length - 1; k >= 0; k--) { doc.strokes.splice(gone[k].i, 1); selection.delete(gone[k].s); }
    record({ type: 'batch', list: edits.concat(gone.length ? [{ type: 'remove', items: gone }] : []) });
    invalidate();
    if (selection.size) selectionChanged();
  }
  /* Is all of this line covered by its erasing (its whole width, along its whole length)? */
  function erasedAway(o, erase) {
    if (!o.points || o.rings || o.tool !== 'pen') return false;
    const test = { erase }, len = WB.pathLength(o.points);
    const pts = o.points.length > 2 ? WB.resampleFlat(o.points, Math.max(2, Math.min(800, Math.ceil(len / Math.max(1e-6, o.width / 2)) + 1))) : o.points;
    for (let k = 0; k < pts.length; k += 2) if (!WB.covered(test, pts[k], pts[k + 1], o.width * 0.8)) return false;
    return true;
  }

  /* ---- Scratching out ---------------------------------------------------
     A quick, tight back-and-forth scribble over something, like crossing out a mistake on
     paper, deletes what it covers instead of being drawn. It has to be fast (under 1.6 s),
     reverse direction sharply at least four times, and go back and forth over a small area
     (its length several times its size). Only objects the scribble really covers go: it has
     to pass over them repeatedly and cover most of their extent. If nothing qualifies, the
     scribble is kept as an ordinary line. Undo brings everything back. */
  function scratchOut(s, ms) {
    if (ms > 1600) return false;
    const p = s.points, n = p.length >> 1;
    if (n < 12) return false;
    let len = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = p[2 * i], y = p[2 * i + 1];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      if (i) len += hyp(x - p[2 * i - 2], y - p[2 * i - 1]);
    }
    const size = Math.max(x1 - x0, y1 - y0);
    if (size * view.zoom < 12 || len < size * 3.2) return false;
    // Sharp reversals, counted along the path resampled at an even spacing (so jitter doesn't count).
    const R = WB.resampleFlat(p, Math.min(160, Math.max(24, Math.round(len * view.zoom / 6))));
    let turns = 0, lastTurn = -9;
    for (let i = 2; i < R.length / 2 - 2; i++) {
      const ax = R[2 * i] - R[2 * i - 4], ay = R[2 * i + 1] - R[2 * i - 3], bx = R[2 * i + 4] - R[2 * i], by = R[2 * i + 5] - R[2 * i + 1];
      const la = hyp(ax, ay), lb = hyp(bx, by);
      if (!la || !lb) continue;
      if ((ax * bx + ay * by) / (la * lb) < -0.5 && i - lastTurn > 2) { turns++; lastTurn = i; }   // turned by more than 120°
    }
    if (turns < 4) return false;
    // What it covers: the scribble passes over it often, and spans most of it.
    const tol = Math.max(s.width, 4 / view.zoom), victims = [];
    for (let i = 0; i < doc.strokes.length; i++) {
      const o = doc.strokes[i];
      if (o.tool === 'eraser' || WB.live.heldByOther(o)) continue;
      let hits = 0;
      for (let k = 0; k < R.length; k += 2) if (WB.hit(o, R[k], R[k + 1], tol)) hits++;
      if (hits < 3) continue;
      const b = WB.boundsOf(o), ow = b.x1 - b.x0, oh = b.y1 - b.y0;
      const cw = Math.max(0, Math.min(b.x1, x1 + tol) - Math.max(b.x0, x0 - tol)), ch = Math.max(0, Math.min(b.y1, y1 + tol) - Math.max(b.y0, y0 - tol));
      const covered = (ow < 1e-6 || cw / ow >= 0.6) && (oh < 1e-6 || ch / oh >= 0.6);
      if (covered) victims.push({ i, s: o });
    }
    if (!victims.length) return false;
    for (let k = victims.length - 1; k >= 0; k--) { doc.strokes.splice(victims[k].i, 1); selection.delete(victims[k].s); }
    record({ type: 'remove', items: victims });
    invalidate(); selectionChanged();
    toast(tr('tScratched'), tr('undo'), undo);
    try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {}
    return true;
  }

  /* ---- Flood fill ----------------------------------------------------
     Fill the closed shape under a screen point. If nothing encloses the point
     the fill is cancelled rather than flooding the canvas. */
  function fillAt(cx, cy, color) {
    if (live) return;
    const z = view.zoom, wx = (cx - view.x) / z, wy = (cy - view.y) / z;
    // Dropped on a line, a text or an earlier fill: that object takes the colour (and a dashed
    // line stays dashed), rather than a filled copy of its shape being laid over it.
    const target = objectAt(wx, wy, 3 / z);
    if (target) {
      if (target.color !== color) { const before = { color: target.color }; retext(target, { color }); record({ type: 'edit', s: target, before, after: { color } }); invalidate(); }
      return;
    }
    const cb = WB.contentBounds(doc.strokes), none = () => toast(tr('tNoShape'));
    if (!cb) return none();
    const m = 6 / z, full = { x: cb.x - m, y: cb.y - m, w: cb.w + 2 * m, h: cb.h + 2 * m };
    if (wx < full.x || wy < full.y || wx > full.x + full.w || wy > full.y + full.h) return none();
    // Look around the drop point at screen resolution first. If the shape runs off that area,
    // look again in a wider area, and so on until the whole drawing is covered. The resolution
    // only drops when an area gets too big to check at screen resolution, so a small shape
    // drawn while zoomed far in is filled as finely as it was drawn.
    const scaleFor = (b) => Math.min(z * dpr, Math.sqrt(16e6 / (b.w * b.h)));
    const clip = (hw, hh) => {
      const x0 = Math.max(full.x, wx - hw), y0 = Math.max(full.y, wy - hh), x1 = Math.min(full.x + full.w, wx + hw), y1 = Math.min(full.y + full.h, wy + hh);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };
    let hw = (W * 0.75) / z, hh = (H * 0.75) / z, res;
    for (;;) {
      const r = clip(hw, hh), whole = r.w >= full.w - 1e-6 && r.h >= full.h - 1e-6;
      res = WB.flood(doc.strokes, r, scaleFor(r), wx, wy);
      if (res.status !== 'open' || whole) break;
      hw *= 3; hh *= 3;
    }
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
  /* The topmost line, text or fill at a board point (pictures and erasers don't count). */
  function objectAt(x, y, tol) {
    for (let i = doc.strokes.length - 1; i >= 0; i--) {
      const s = doc.strokes[i];
      if ((s.tool === 'pen' || s.tool === 'text' || s.tool === 'fill') && !WB.live.heldByOther(s) && WB.hit(s, x, y, tol)) return s;
    }
    return null;
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
  let selDrag = null;
  let plotActive = null, plotDrag = null;   // the graph open for exploring, and the pointers dragging inside it (see "Graphs")   // { id, x, y, add, lasso: [world points] | null }

  function selectAt(cx, cy, add) {
    const z = view.zoom, x = (cx - view.x) / z, y = (cy - view.y) / z;
    // Topmost object wins; fills poured beneath the ink count as below everything else.
    let hit = null, under = null;
    for (let i = doc.strokes.length - 1; i >= 0 && !hit; i--) {
      const s = doc.strokes[i];
      if (WB.live.heldByOther(s) || !WB.hit(s, x, y, 6 / z)) continue;   // (someone else is working on it)
      if (s.tool === 'fill' && s.under) under = under || s; else hit = s;
    }
    hit = hit || under;
    const all = hit ? members(hit) : [];                  // a group is picked (and let go) as a whole
    if (add) { if (hit && selection.has(hit)) for (const m of all) selection.delete(m); else for (const m of all) selection.add(m); }
    else { selection.clear(); for (const m of all) selection.add(m); }
    selectionChanged();
  }
  function selectLasso(poly, add) {
    if (!add) selection.clear();
    if (poly.length >= 6) for (const s of doc.strokes) if (!WB.live.heldByOther(s) && WB.inLasso(s, poly)) selection.add(s);
    selectionChanged();
  }
  function clearSelection() { if (selection.size) { selection.clear(); selectionChanged(); } }

  /* Is this screen point on the highlight box of something already selected? (Pressing there drags the selection.) */
  function onSelection(cx, cy) {
    const z = view.zoom, x = (cx - view.x) / z, y = (cy - view.y) / z, pad = 6 / z, F = selFrame();
    if (!F) return false;
    const L = WB.toLocal(F, x, y);
    return Math.abs(L.x) <= F.w / 2 + pad && Math.abs(L.y) <= F.h / 2 + pad;
  }
  function translate(items, dx, dy) {
    for (const s of items) {
      if (s.tool === 'text' || s.tool === 'image' || s.tool === 'plot') { s.x += dx; s.y += dy; }
      else for (const p of s.rings || [s.points]) for (let i = 0; i < p.length; i += 2) { p[i] += dx; p[i + 1] += dy; }
      if (s.erase) for (const e of s.erase) { const p = e.points; for (let i = 0; i < p.length; i += 2) { p[i] += dx; p[i + 1] += dy; } delete e._path; }   // its erasing goes with it
      delete s._path; delete s._opath; delete s._b; delete s._fb;
    }
    invalidate();
  }
  /* Abandon a lasso or move in progress, putting moved objects back. */
  function cancelSelDrag() {
    const d = selDrag;
    selDrag = null;
    if (d && d.moved) { translate(selection, -d.dx, -d.dy); WB.live.release(); }
    requestFrame();
  }
  function selectionChanged() {
    for (const s of [...selection]) if (outer(s)) for (const m of members(s)) selection.add(m);   // never part of a group
    for (const s of [...selection]) if (WB.live.heldByOther(s)) selection.delete(s);
    const n = units(selection).length;
    $('#sel-bar').classList.toggle('on', n > 0);
    if (n) $('#sel-count').textContent = tr('selected', { n });
    showStyleBar();
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
    const pad = 5 / z, F = !(selDrag && selDrag.lasso) && selFrame();
    if (F) drawHandles(F, accent);
    placeStyleBar();
    const parts = units(selection);
    for (const u of parts) {
      if (parts.length === 1) break;              // one object or group: its frame says it all
      const c = WB.contentBounds(u);
      if (!c) continue;
      const b = { x0: c.x, y0: c.y, x1: c.x + c.w, y1: c.y + c.h };
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

  /* ---- Selection handles -----------------------------------------------
     Whatever is selected gets a frame with handles: the corners scale it keeping its shape,
     the side handles stretch it, and the knob above the frame's top edge turns it. A single
     picture or text has its own (turned) box as the frame; anything else has the box around
     the selection. Another finger on the screen while resizing makes it grow from the middle
     instead of from the opposite side; while turning, it snaps the angle to 45° steps. With a
     mouse, Alt and Shift do the same. Everything is worked out from the state at the start of
     the drag, so a finger can be put down and lifted again freely.

     The drag maps the old frame onto the new one, and every selected object follows: stroke
     and fill points are mapped exactly, line widths and text sizes scale with the frame's
     area, and pictures and texts keep their own box, moved, resized and turned with it. */
  const HANDLES = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
  const ROT_GAP = 30;   // screen px between the top edge and the turning knob
  let xf = null;        // the drag in progress: { id, k (handle), items, start, cur, extra (other pointers), last, keys, off | a0 }

  /* The frame of the selection: { x, y, w, h, rot } (the unturned box, turned by rot about its centre). */
  function selFrame() {
    if (xf) return xf.cur;
    const items = [...selection].filter((s) => doc.strokes.includes(s));
    if (!items.length) return null;
    if (items.length === 1 && (items[0].tool === 'image' || items[0].tool === 'text' || items[0].tool === 'plot')) {
      const F = WB.frameOf(items[0]);
      return { x: F.x, y: F.y, w: F.w, h: F.h, rot: F.rot || 0 };
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of items) {
      const b = WB.boundsOf(s);
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
    }
    return { x: x0, y: y0, w: Math.max(x1 - x0, 1e-6), h: Math.max(y1 - y0, 1e-6), rot: 0 };
  }
  function handlePoints(F) {
    const out = [];
    for (const k in HANDLES) { const [a, b] = HANDLES[k]; out.push({ k, ...WB.toWorld(F, (a * F.w) / 2, (b * F.h) / 2) }); }
    out.push({ k: 'rot', ...WB.toWorld(F, 0, -F.h / 2 - ROT_GAP / view.zoom) });
    return out;
  }
  /* The handle under a screen point, or null. Fingers get a bigger target than a mouse or pen. */
  function handleAt(cx, cy, touch) {
    if (tools.tool !== 'select' || !selection.size) return null;
    const F = selFrame();
    if (!F) return null;
    const z = view.zoom, r = touch ? 24 : 12;
    let best = null, bd = Infinity;
    for (const h of handlePoints(F)) {
      const d = hyp(h.x * z + view.x - cx, h.y * z + view.y - cy);
      if (d <= r && d < bd) { best = h.k; bd = d; }
    }
    return best;
  }
  /* The resize cursor pointing the way a handle pulls, turned with the frame. */
  function handleCursor(k) {
    if (!k) return '';
    if (k === 'rot') return 'grab';
    const [a, b] = HANDLES[k], F = selFrame();
    const ang = Math.atan2(b * F.h, a * F.w) + (F.rot || 0);
    return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][((Math.round(ang / (Math.PI / 4)) % 4) + 4) % 4];
  }
  function drawHandles(F, accent) {
    const z = view.zoom, q = WB.corners(F);
    ctx.beginPath(); ctx.moveTo(q[0], q[1]);
    for (let i = 2; i < 8; i += 2) ctx.lineTo(q[i], q[i + 1]);
    ctx.closePath();
    ctx.globalAlpha = 0.06; ctx.fill();
    ctx.globalAlpha = 1; ctx.stroke();
    const top = WB.toWorld(F, 0, -F.h / 2), pts = handlePoints(F), knob = pts[pts.length - 1];
    ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(knob.x, knob.y); ctx.stroke();
    for (const h of pts) {
      ctx.beginPath(); ctx.arc(h.x, h.y, (h.k === 'rot' ? 6.5 : 5) / z, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = accent;
  }

  /* The geometry of an object, copied, so it can be put back or worked from. */
  function geometry(s) {
    const g = {};
    for (const k of ['x', 'y', 'w', 'h', 'rot', 'size', 'width']) if (s[k] !== undefined) g[k] = s[k];
    if (s.tool === 'image' || s.tool === 'text' || s.tool === 'plot') g.rot = s.rot || 0;   // so putting it back also un-turns it
    if (s.points) g.points = s.points.slice();
    if (s.rings) g.rings = s.rings.map((r) => r.slice());
    if (s.erase) g.erase = s.erase.map(plainEraser);
    return g;
  }
  /* Give object s (whose geometry was g) the shape it has when frame A becomes frame B. */
  function mapObject(s, g, A, B) {
    const sx = B.w / A.w, sy = B.h / A.h, area = Math.sqrt(Math.abs(sx * sy));
    const pt = (x, y) => { const L = WB.toLocal(A, x, y); return WB.toWorld(B, L.x * sx, L.y * sy); };
    const ca = Math.cos(A.rot || 0), sa = Math.sin(A.rot || 0), cb = Math.cos(B.rot || 0), sb = Math.sin(B.rot || 0);
    const vec = (x, y) => { const lx = (x * ca + y * sa) * sx, ly = (-x * sa + y * ca) * sy; return { x: lx * cb - ly * sb, y: lx * sb + ly * cb }; };
    const flat = (p) => { const out = new Array(p.length); for (let i = 0; i < p.length; i += 2) { const q = pt(p[i], p[i + 1]); out[i] = q.x; out[i + 1] = q.y; } return out; };
    if (g.points) { s.points = flat(g.points); s.width = g.width * area; }
    if (g.rings) s.rings = g.rings.map(flat);
    if (g.erase) s.erase = g.erase.map((e) => ({ ...e, width: e.width * area, points: flat(e.points) }));   // erasing is resized and turned with it
    if (s.tool === 'image' || s.tool === 'text' || s.tool === 'plot') {
      const r = g.rot || 0, u = vec(Math.cos(r), Math.sin(r)), v = vec(-Math.sin(r), Math.cos(r));
      const lu = hyp(u.x, u.y), lv = hyp(v.x, v.y);
      s.rot = Math.atan2(u.y, u.x);
      if (s.tool === 'image' || s.tool === 'plot') {
        const c = pt(g.x + g.w / 2, g.y + g.h / 2);
        s.w = g.w * lu; s.h = g.h * lv; s.x = c.x - s.w / 2; s.y = c.y - s.h / 2;
      } else {
        const a = pt(g.x, g.y);
        s.x = a.x; s.y = a.y; s.size = g.size * Math.sqrt(lu * lv);
      }
    }
    delete s._path; delete s._opath; delete s._b; delete s._fb; delete s._t;
  }
  /* An eraser stroke without its drawing caches, safe to copy and to store. */
  const plainEraser = (e) => ({ tool: 'eraser', width: e.width, opacity: e.opacity, smooth: !!e.smooth, points: e.points.slice() });
  function beginXform(e, k) {
    const F = selFrame(), z = view.zoom;
    const px = (e.clientX - view.x) / z, py = (e.clientY - view.y) / z;
    const items = [...selection].filter((s) => doc.strokes.includes(s));
    if (!WB.live.hold(items)) return toast(tr('tLiveBusy'));
    mode = 'xform';
    xf = { id: e.pointerId, k, items, starts: items.map(geometry), start: F, cur: { ...F },
      extra: new Set(), last: { x: e.clientX, y: e.clientY }, keys: { alt: e.altKey, shift: e.shiftKey } };
    if (k === 'rot') xf.a0 = Math.atan2(py - (F.y + F.h / 2), px - (F.x + F.w / 2));
    else {
      // Where on the handle it was grabbed, so the edge does not jump to the pointer.
      const [a, b] = HANDLES[k], L = WB.toLocal(F, px, py);
      xf.off = { x: (a * F.w) / 2 - L.x, y: (b * F.h) / 2 - L.y };
    }
    finishFill();
    hideStyleBar();
  }
  function applyXform() {
    const d = xf, st = d.start, z = view.zoom;
    const px = (d.last.x - view.x) / z, py = (d.last.y - view.y) / z, more = d.extra.size > 0;
    let F;
    if (d.k === 'rot') {
      let rot = st.rot + Math.atan2(py - (st.y + st.h / 2), px - (st.x + st.w / 2)) - d.a0;
      if (more || d.keys.shift) rot = Math.round(rot / (Math.PI / 4)) * (Math.PI / 4);
      F = { ...st, rot: Math.atan2(Math.sin(rot), Math.cos(rot)) };
    } else {
      const [ex, ey] = HANDLES[d.k], L = WB.toLocal(st, px, py), lx = L.x + d.off.x, ly = L.y + d.off.y;
      const centred = more || d.keys.alt, min = 8 / z;
      let w = st.w, h = st.h, cx = 0, cy = 0;     // new size, and the new centre in the old frame
      if (ex && ey) {
        // A corner: one scale factor, measured along the diagonal from the fixed point (opposite corner, or the centre).
        const ax = centred ? 0 : (-ex * st.w) / 2, ay = centred ? 0 : (-ey * st.h) / 2;
        const dx = (ex * st.w) / 2 - ax, dy = (ey * st.h) / 2 - ay;
        const k = Math.max(((lx - ax) * dx + (ly - ay) * dy) / (dx * dx + dy * dy), min / Math.max(Math.min(st.w, st.h), 1e-6));
        w = st.w * k; h = st.h * k;
        if (!centred) { cx = ax + (ex * w) / 2; cy = ay + (ey * h) / 2; }
      } else if (ex) {
        const ax = centred ? 0 : (-ex * st.w) / 2;
        w = Math.max(min, (centred ? 2 : 1) * ex * (lx - ax));
        if (!centred) cx = ax + (ex * w) / 2;
      } else {
        const ay = centred ? 0 : (-ey * st.h) / 2;
        h = Math.max(min, (centred ? 2 : 1) * ey * (ly - ay));
        if (!centred) cy = ay + (ey * h) / 2;
      }
      const c = WB.toWorld(st, cx, cy);
      F = { x: c.x - w / 2, y: c.y - h / 2, w, h, rot: st.rot };
    }
    d.cur = F;
    d.items.forEach((s, i) => mapObject(s, d.starts[i], st, F));
    WB.live.editHeld();
    invalidate();
  }
  for (const type of ['keydown', 'keyup']) {
    window.addEventListener(type, (e) => {
      if (live && live.snapped && live.shift !== e.shiftKey) { live.shift = e.shiftKey; resnap(); }
      if (!xf) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); return endXform(true); }
      xf.keys = { alt: e.altKey, shift: e.shiftKey }; applyXform();
    }, true);
  }
  function endXform(cancel) {
    const d = xf;
    xf = null; mode = null; canvas.style.cursor = '';
    if (cancel) { d.items.forEach((s, i) => retext(s, d.starts[i])); WB.live.release(); invalidate(); showStyleBar(); return; }
    const list = d.items.map((s, i) => ({ type: 'edit', s, before: d.starts[i], after: geometry(s) }));
    if (d.cur.x !== d.start.x || d.cur.y !== d.start.y || d.cur.w !== d.start.w || d.cur.h !== d.start.h || d.cur.rot !== d.start.rot) record({ type: 'batch', list });
    WB.live.release();
    showStyleBar();
  }

  /* ---- Style of the selection ------------------------------------------
     A small bar under the selection changes the colour of
     everything selected that has one (lines, texts, fills), and the thickness and line type of
     the lines. Each change is one undo step; dragging around the colour mixer stays one step. */
  const styleBar = $('#sel-style');
  const selItems = () => [...selection].filter((s) => doc.strokes.includes(s));
  const COLORED = new Set(['pen', 'text', 'fill']);
  let styleRun = null;   // { key, action }: the last style change, so a picker drag can keep extending it
  function showStyleBar() {
    refreshPlotBar();
    const items = selItems(), lines = items.some((s) => s.tool === 'pen'), colors = items.some((s) => COLORED.has(s.tool)), g = groupAction();
    const on = (lines || colors || !!g) && tools.tool === 'select' && !xf && !(selDrag && selDrag.moved);
    styleBar.classList.toggle('on', on);
    if (!on) return;
    styleBar.classList.toggle('no-line', !lines);
    styleBar.classList.toggle('no-color', !colors);
    styleBar.classList.toggle('no-group', !g);
    styleBar.classList.toggle('ungroup', g === 'ungroup');
    $('#ss-group').setAttribute('aria-label', tr(g === 'ungroup' ? 'ungroup' : 'group'));
    refreshStyleBar();
    placeStyleBar();
  }
  function hideStyleBar() { styleBar.classList.remove('on'); hidePlotBar(); }
  function refreshStyleBar() {
    const items = selItems(), pen = items.find((s) => s.tool === 'pen'), col = items.find((s) => COLORED.has(s.tool));
    const c = col ? col.color : null, inPalette = PALETTE.includes(c);
    $$('#ss-colors .swatch[data-color]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color === c)));
    const cu = $('#ss-custom');
    cu.setAttribute('aria-checked', String(!!c && !inPalette));
    cu.style.setProperty('--c', c && !inPalette ? c : tools.custom);
    if (pen) $('#ss-width').textContent = String(Math.round(pen.width * view.zoom * 10) / 10);
    const dash = pen && WB.DASHES[pen.dash] ? pen.dash : 'solid';
    $$('#ss-dashes [data-dash]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.dash === dash)));
  }
  /* Under the selection's frame, or above it when there is no room below (the dock lives there). */
  function placeStyleBar() {
    if (!styleBar.classList.contains('on')) return;
    const F = selFrame();
    if (!F) return;
    const q = WB.corners(F), z = view.zoom;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i += 2) { const x = q[i] * z + view.x, y = q[i + 1] * z + view.y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = styleBar.offsetWidth, h = styleBar.offsetHeight;
    let y = y1 + 18;
    if (y + h > H - 96) y = y0 - ROT_GAP - 24 - h;
    styleBar.style.transform = `translate(${clamp((x0 + x1) / 2 - w / 2, 8, Math.max(8, W - w - 8))}px, ${clamp(y, 8, Math.max(8, H - h - 8))}px)`;
  }
  /* Apply fn(object) -> changed properties (or null) to every selected object, as one undo step.
     With a key, a change right after another one of the same key extends that step instead. */
  function restyle(fn, key) {
    const top = undoStack[undoStack.length - 1];
    const extend = key && styleRun && styleRun.key === key && top === styleRun.action;
    const list = extend ? top.list : [];
    for (const s of selItems()) {
      const after = fn(s);
      if (!after) continue;
      const old = extend && list.find((a) => a.s === s);
      if (old) { old.after = after; retext(s, after); continue; }
      const before = {};
      for (const k in after) before[k] = s[k];
      retext(s, after);
      list.push({ type: 'edit', s, before, after });
    }
    if (!extend && list.length) { const action = { type: 'batch', list }; record(action); styleRun = { key, action }; }
    else if (extend) { WB.live.touch(list.map((a) => a.s)); changed(); }
    invalidate(); refreshStyleBar();
  }
  const recolor = (c, key) => restyle((s) => (COLORED.has(s.tool) ? { color: c } : null), key);
  function initStyleBar() {
    const box = $('#ss-colors');
    for (const c of PALETTE) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.dataset.color = c; b.style.setProperty('--c', c); b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c);
      b.addEventListener('click', () => recolor(c));
      box.appendChild(b);
    }
    const cu = document.createElement('button');
    cu.className = 'swatch custom'; cu.id = 'ss-custom'; cu.setAttribute('aria-label', tr('customColor'));
    cu.addEventListener('click', () => {
      const col = selItems().find((s) => COLORED.has(s.tool)), run = {};    // one undo step per opening of the mixer
      WB.picker.toggle({ anchor: cu, color: col ? col.color : tools.custom, onChange: (c) => { tools.custom = c; recolor(c, run); } });
    });
    box.appendChild(cu);
    const step = (f) => restyle((s) => (s.tool === 'pen' ? { width: clamp(s.width * f, 0.5 / view.zoom, 400 / view.zoom) } : null));
    $('#ss-thinner').addEventListener('click', () => step(0.8));
    $('#ss-thicker').addEventListener('click', () => step(1.25));
    const dashes = $('#ss-dashes');
    for (const k of Object.keys(WB.DASHES)) {
      const b = document.createElement('button');
      b.className = 'ibtn'; b.dataset.dash = k; b.setAttribute('role', 'radio'); b.setAttribute('aria-label', tr('dash_' + k)); b.title = tr('dash_' + k);
      b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M3 12h18"${DASH_ICON[k] !== 'none' ? ` stroke-dasharray="${DASH_ICON[k]}"` : ''}/></svg>`;
      b.addEventListener('click', () => restyle((s) => (s.tool === 'pen' ? { dash: k === 'solid' ? undefined : k } : null)));
      dashes.appendChild(b);
    }
    $('#ss-group').addEventListener('click', () => { const g = groupAction(); if (g === 'group') groupSelection(); else if (g === 'ungroup') ungroupSelection(); });
    styleBar.addEventListener('pointerdown', (e) => e.stopPropagation());
  }

  /* ---- Groups -----------------------------------------------------------
     Objects in a group carry s.group: the ids of the groups they are in, outermost first (whole
     numbers, unique on the board). They stay ordinary objects in the drawing order, so drawing,
     erasing and exporting need nothing new; selecting picks the whole outermost group, so a group
     is moved, resized, turned, styled, copied and deleted as one. Grouping puts the selection
     (loose objects and groups alike) into a new outer group, so groups can hold groups; ungrouping
     takes that outer one away again, leaving the groups that were inside it. */
  const outer = (s) => (s.group && s.group.length ? s.group[0] : 0);
  function members(s) { const g = outer(s); return g ? doc.strokes.filter((o) => outer(o) === g) : [s]; }
  /* The selection as what it is made of: each loose object alone, each group as its objects together. */
  function units(items) {
    const out = [], by = new Map();
    for (const s of items) {
      const g = outer(s);
      if (!g) { out.push([s]); continue; }
      if (!by.has(g)) { by.set(g, []); out.push(by.get(g)); }
      by.get(g).push(s);
    }
    return out;
  }
  /* 'ungroup' when the selection is one group, 'group' when it is two or more things, else null. */
  function groupAction() {
    const items = selItems();
    if (!items.length) return null;
    if (units(items).length === 1) return outer(items[0]) ? 'ungroup' : null;
    return 'group';
  }
  const nextGroupId = () => { if (WB.live.on()) return WB.live.groupId(); let m = 0; for (const s of doc.strokes) if (s.group) for (const g of s.group) m = Math.max(m, g); return m + 1; };
  function groupSelection() {
    const id = nextGroupId();
    styleRun = null;
    restyle((s) => ({ group: [id].concat(s.group || []) }));
    selectionChanged();
  }
  function ungroupSelection() {
    styleRun = null;
    restyle((s) => (s.group && s.group.length ? { group: s.group.length > 1 ? s.group.slice(1) : undefined } : null));
    selectionChanged();
  }
  /* Copies put on the board (duplicates, stickers) get group ids of their own, so they are not
     part of the groups they were copied from. Returns the next free id. */
  function freshGroups(items) {
    const map = new Map();
    let id = nextGroupId();
    for (const s of items) if (s.group) s.group = s.group.map((g) => (map.has(g) ? map.get(g) : (map.set(g, id), id++)));
    return id;
  }

  /* ---- Stickers ---------------------------------------------------------
     "Save as sticker" copies the selection, moved to start at 0, 0, into the sticker gallery.
     Choosing a sticker there puts a copy on the board, centred in view (shrunk to fit if it is
     bigger than most of the screen), selected so it can be moved, resized or turned at once. */
  function saveSticker() {
    const items = selItems().sort((a, b) => doc.strokes.indexOf(a) - doc.strokes.indexOf(b));
    if (!items.length) return;
    commitPending();
    const copies = items.map(cloneObject), b = WB.contentBounds(copies);
    if (!b) return;
    for (const c of copies) mapObject(c, geometry(c), { x: b.x, y: b.y, w: b.w, h: b.h, rot: 0 }, { x: 0, y: 0, w: b.w, h: b.h, rot: 0 });
    const label = tr('sticker');
    WB.stickers.save(WB.serialize({ title: label, created: Date.now(), strokes: copies }, { x: 0, y: 0, zoom: 1 }), label);
  }
  async function placeSticker(text, opt) {
    let d;
    try { d = WB.parse(text); } catch (e) { return toast(tr(e.message)); }
    const items = d.strokes, b = WB.contentBounds(items);
    if (!b) return toast(tr('tNothing'));
    // Shrunk to fit the screen if it is big; a built-in sticker keeps its size (it is drawn for 100 %).
    const z = view.zoom, k = opt && opt.exact ? 1 : Math.min(1, (0.6 * W) / z / Math.max(b.w, 1e-6), (0.6 * H) / z / Math.max(b.h, 1e-6));
    const w = b.w * k, h = b.h * k, cx = (W / 2 - view.x) / z, cy = (H / 2 - view.y) / z;
    for (const s of items) mapObject(s, geometry(s), { x: b.x, y: b.y, w: b.w, h: b.h, rot: 0 }, { x: cx - w / 2, y: cy - h / 2, w, h, rot: 0 });
    await WB.loadImages(items);
    if (live) endStroke(true);
    const id = freshGroups(items);
    if (opt && opt.group && items.length > 1) for (const s of items) s.group = [id].concat(s.group || []);   // a built-in sticker comes as one group
    for (const s of items) doc.strokes.push(s);
    record({ type: 'batch', list: items.map((s) => ({ type: 'add', stroke: s })) });
    setTool('select');
    selection.clear(); for (const s of items) selection.add(s);
    selectionChanged(); invalidate();
    toast(tr('tStickerAdded'), tr('undo'), undo);
  }

  /* ---- Duplicate --------------------------------------------------------
     Copies of the selection, a little down and to the right, on top of everything, selected. */
  const cloneObject = (s) => { const c = JSON.parse(JSON.stringify(s, (k, v) => (k && k[0] === '_' ? undefined : v))); delete c.id; return c; };   // (a copy is a new object on a live board)
  function duplicateSelection() {
    const items = selItems().sort((a, b) => doc.strokes.indexOf(a) - doc.strokes.indexOf(b));
    if (!items.length) return;
    const copies = items.map(cloneObject), d = 16 / view.zoom;
    freshGroups(copies);
    translate(copies, d, d);
    for (const c of copies) doc.strokes.push(c);
    record({ type: 'batch', list: copies.map((c) => ({ type: 'add', stroke: c })) });
    selection.clear(); for (const c of copies) selection.add(c);
    selectionChanged(); invalidate();
    toast(tr('tDuplicated'), tr('undo'), undo);
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
      if (o.tool === 'text' && WB.hit(o, wx, wy, m)) return o;
    }
    return null;
  }
  /* Start typing at a screen point: edits the text there if there is one (caret at the end), otherwise starts a new one. */
  function startText(cx, cy) {
    if (edit) commitText();
    const z = view.zoom, wx = (cx - view.x) / z, wy = (cy - view.y) / z, T = tools.text;
    const s = textUnder(cx, cy);
    if (s && !WB.live.hold([s])) return toast(tr('tLiveBusy'));   // someone else is editing it
    clearSelection();
    edit = s ? { s, x: s.x, y: s.y, rot: s.rot || 0, font: s.font, size: s.size, color: s.color }
      : { s: null, x: wx, y: wy - (T.size / z) * WB.LINE / 2, rot: 0, font: T.font, size: T.size / z, color: T.color };
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
    ta.style.transformOrigin = '0 0';
    ta.style.transform = `translate(${sx}px, ${sy}px)` + (e.rot ? ` rotate(${e.rot}rad)` : '');
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
    if (e.s) WB.live.release();
    invalidate(); updateChrome(); selectionChanged();
  }
  function retext(s, props) { Object.assign(s, props); delete s._t; delete s._b; delete s._fb; delete s._path; delete s._opath; }

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
    ta.addEventListener('input', () => { if (edit && edit.s) WB.live.typing(edit.s, ta.value); });
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

  /* ---- Language ------------------------------------------------------ */
  let smSync = () => {};
  function applyLang() {
    WB.setLang(settings.lang || WB.systemLang());
    WB.localize();
    const cur = WB.LANGS.find((l) => l[0] === WB.lang()), en = cur[0] === 'en';
    // Everything about language is shown in the active language and in English.
    $('#lang-title').textContent = $('#lbl-lang').textContent = en ? 'Language' : tr('language') + ' · Language';
    $('#lang-btn').textContent = en ? 'English' : cur[1] + ' · ' + cur[2];
    $$('#lang-menu .mi').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.lang === cur[0])));
    titleEl.value = shownTitle();
    smSync(); syncExport(); updateChrome(); selectionChanged();
    buildSheets();
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

  /* tap: the pan started with this press (not the finger left over from a pinch), so if it never
     moves it counts as a tap on the board (see endPan). */
  let panTap = null;
  function beginPan(id, x, y, tap) {
    mode = 'pan'; panId = id; panSamples = [{ x, y, t: performance.now() }];
    panTap = tap ? { x, y, t: performance.now(), far: 0 } : null;
    canvas.classList.add('panning');
  }
  /* Touchscreens now and then report a point far from where the finger really is (a missed
     sample, two contacts briefly swapped). Taken at face value, one such point throws the board
     across the screen, and its speed sends the glide after a flick off into the distance.
     A sample that jumps further than a finger plausibly moves (over JUMP px, faster than
     JUMP_SPEED px/ms) is not followed: the gesture re-anchors there instead, so the board stays
     put and carries on smoothly from the next sample. */
  const JUMP = 60, JUMP_SPEED = 3, GLIDE_MAX = 3;   // px, px/ms, px/ms
  const isJump = (dx, dy, dt) => { const d = hyp(dx, dy); return d > JUMP && d / Math.max(dt, 8) > JUMP_SPEED; };
  function movePan(x, y) {
    const l = panSamples[panSamples.length - 1], now = performance.now();
    if (isJump(x - l.x, y - l.y, now - l.t)) { panSamples = [{ x, y, t: now }]; return; }   // a glitch: re-anchor, don't move
    view.x += x - l.x; view.y += y - l.y;
    if (panTap) panTap.far = Math.max(panTap.far, hyp(x - panTap.x, y - panTap.y));
    panSamples.push({ x, y, t: now });
    if (panSamples.length > 10) panSamples.shift();
    invalidate();
  }
  function endPan() {
    mode = null; canvas.classList.remove('panning');
    const now = performance.now(), l = panSamples[panSamples.length - 1], f = panSamples.find((s) => now - s.t < 100);
    // A tap that only started a pan (one finger moves the board, or the hand tool): with the select
    // tool it selects what is under it; otherwise a tap on nothing lets go of the selection.
    const t = panTap;
    panTap = null;
    if (t && t.far < 8 && now - t.t < 400 && tools.tool !== 'laser') {
      if (tools.tool === 'select') return selectAt(t.x, t.y, false);
      const z = view.zoom, wx = (t.x - view.x) / z, wy = (t.y - view.y) / z;
      if (selection.size && !doc.strokes.some((o) => WB.hit(o, wx, wy, 6 / z))) clearSelection();
      return;
    }
    if (f && f !== l && now - l.t < 60 && !reduceMotion.matches) {
      const dt = l.t - f.t;
      let vx = (l.x - f.x) / dt, vy = (l.y - f.y) / dt;                  // hand the release velocity to the glide
      const v = hyp(vx, vy);
      if (v > GLIDE_MAX) { vx *= GLIDE_MAX / v; vy *= GLIDE_MAX / v; }   // never faster than a real, hard flick
      if (dt > 0 && v > 0.15) { motion = { type: 'glide', vx, vy }; lastFrame = now; }
    }
    requestFrame();
  }
  /* Pinch: always the same two fingers (the first two down; a palm or third finger doesn't take
     over), until one of them lifts. Fingers very close together give a distance too noisy to zoom
     by, so then the board only moves; and one sample never zooms by more than about a fifth. */
  const PINCH_MIN = 40;   // px between the fingers before their distance is trusted
  function beginPinch() {
    const [ia, ib] = [...touches.keys()], a = touches.get(ia), b = touches.get(ib);
    mode = 'pinch'; canvas.classList.remove('panning');
    pinch = { a: ia, b: ib, d: hyp(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, t: performance.now() };
  }
  function movePinch() {
    const a = touches.get(pinch.a), b = touches.get(pinch.b);
    if (!a || !b) return touches.size >= 2 ? beginPinch() : undefined;
    const now = performance.now(), d = hyp(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
    if (isJump(cx - pinch.cx, cy - pinch.cy, now - pinch.t) || (d > PINCH_MIN && pinch.d > PINCH_MIN && Math.abs(Math.log(d / pinch.d)) > 0.7)) {
      Object.assign(pinch, { d, cx, cy, t: now });                        // a glitch: re-anchor, don't move or zoom
      return;
    }
    const ratio = d > PINCH_MIN && pinch.d > PINCH_MIN ? clamp(d / pinch.d, 0.82, 1.22) : 1;
    const zoom = clamp(view.zoom * ratio, ZOOM_MIN, ZOOM_MAX), k = zoom / view.zoom;
    view.x = cx - (pinch.cx - view.x) * k; view.y = cy - (pinch.cy - view.y) * k; view.zoom = zoom;
    Object.assign(pinch, { d, cx, cy, t: now });
    invalidate();
  }

  /* Two- and three-finger taps (undo, redo) only count when they really are two or three
     distinct, steady fingers: set down together (within TAP_TOGETHER ms), apart from each other
     (at least TAP_APART px), none moving, lifted quickly, and no other contact joining in. A palm
     landing first, which the screen sees as several touches close together, never undoes anything.
     (Contact sizes are not used: screens report them so differently that a finger can look as big
     as a palm.) */
  const TAP_TOGETHER = 150, TAP_APART = 36;   // ms, px
  function tapCounts(t, now) {
    const n = t.downs.length;
    if (t.moved || now - t.t >= 350 || (n !== 2 && n !== 3) || t.max !== n) return 0;
    if (t.downs[n - 1].t - t.downs[0].t > TAP_TOGETHER) return 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      if (hyp(t.downs[i].x - t.downs[j].x, t.downs[i].y - t.downs[j].y) < TAP_APART) return 0;
    }
    return n;
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
    if (opening) { if (!openingSaid) { openingSaid = true; toast(tr('tOpening'), null, null, 60000); } return; }   // see restoreBoard
    closePopovers(); stopMotion();
    if (edit) commitText();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const now = performance.now();
    if (plotPanelFor) closePlotPanel();
    // A graph open for exploring: pointers inside it move and zoom its view (any tool); a press outside closes it.
    if (plotActive && !doc.strokes.includes(plotActive)) exitPlot();
    if (plotActive && !(e.pointerType === 'touch' && (penDown || now - lastPen < 400))) {
      if (mode === 'plot' || (!mode && !(e.pointerType === 'mouse' && e.button !== 0) && inPlot(plotActive, e.clientX, e.clientY) && !handleAt(e.clientX, e.clientY, e.pointerType === 'touch'))) {
        if (e.pointerType === 'pen') { penDown = true; lastPen = now; }
        return beginPlotDrag(e);
      }
      if (!mode) exitPlot();
    }

    // A snapped shape still in hand: another finger snaps its angle (see shapeAngle), it never pinches.
    if (e.pointerType === 'touch' && mode === 'draw' && live && live.snapped && e.pointerId !== live.id) { live.extra.add(e.pointerId); return resnap(); }
    // Resizing or turning a picture: another finger changes how (see "Picture handles"), it never pinches.
    if (mode === 'xform') { if (e.pointerId !== xf.id) { xf.extra.add(e.pointerId); applyXform(); } return; }
    const palm = e.pointerType === 'touch' && (penDown || now - lastPen < 400);
    if (!mode && !palm && !(e.pointerType === 'mouse' && e.button !== 0)) {
      const k = handleAt(e.clientX, e.clientY, e.pointerType === 'touch');
      if (k) {
        if (e.pointerType === 'pen') { penDown = true; lastPen = now; }
        touches.clear(); tap = null;
        return beginXform(e, k);
      }
    }

    if (e.pointerType === 'touch') {
      if (penDown || now - lastPen < 400) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
      const n = touches.size;
      const down = { x: e.clientX, y: e.clientY, t: now };
      if (n === 1) {
        tap = { t: now, max: 1, moved: false, downs: [down] };
        if (doubleOnText(e, now)) return;
        if (tools.tool === 'laser' || (settings.fingerDraw && tools.tool !== 'hand')) beginTool(e, tools.tool);
        else beginPan(e.pointerId, e.clientX, e.clientY, true);
        return;
      }
      if (tap) { tap.max = Math.max(tap.max, n); tap.downs.push(down); }
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
      if (e.button === 2 || tools.tool === 'hand') return beginPan(e.pointerId, e.clientX, e.clientY, true);
      const flipped = e.button === 5 || (e.buttons & 32);    // eraser end of the stylus
      return flipped ? beginStroke(e, 'eraser') : beginTool(e, tools.tool);
    }
    if (e.button === 1 || spaceHeld || tools.tool === 'hand') beginPan(e.pointerId, e.clientX, e.clientY, true);
    else if (e.button === 0) beginTool(e, tools.tool);
  });

  /* A double-click or double-tap on a text opens it for editing, whatever tool is active.
     Returns true when this press is the second of such a pair (editing starts on release). */
  let lastDown = null;
  function doubleOnText(e, now) {
    const p = lastDown;
    lastDown = { t: now, x: e.clientX, y: e.clientY, type: e.pointerType };
    if (!p || now - p.t > 420 || p.type !== e.pointerType || hyp(e.clientX - p.x, e.clientY - p.y) > 26) return false;
    const txt = textUnder(e.clientX, e.clientY), graph = !txt && plotUnder(e.clientX, e.clientY);   // a graph opens for exploring instead
    if (!txt && !graph) return false;
    lastDown = null;
    // The first click of the pair may have left a dot (pen) or a dab (eraser): take it back.
    const a = undoStack[undoStack.length - 1], s = a && a.type === 'add' && a.stroke;
    if (s && s.points && s === doc.strokes[doc.strokes.length - 1] && now - (s._at || 0) < 500) {
      const b = WB.boundsOf(s);
      if ((Math.max(b.x1 - b.x0, b.y1 - b.y0) - s.width) * view.zoom < 12) { undoStack.pop(); doc.strokes.pop(); invalidate(); changed(); }
    }
    if (graph) { enterPlot(graph); return true; }
    mode = 'text'; textDown = { id: e.pointerId, x: e.clientX, y: e.clientY };
    return true;
  }

  /* What a press on the board starts, for the active tool. */
  function beginTool(e, tool) {
    if (tool === 'laser') { beginPan(e.pointerId, e.clientX, e.clientY); return laserAt(e.clientX, e.clientY); }
    if (tool === 'select') {
      const add = e.ctrlKey || e.metaKey;
      mode = 'select';
      selDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, add, lasso: null,
        move: !add && onSelection(e.clientX, e.clientY), moved: false, lx: e.clientX, ly: e.clientY, dx: 0, dy: 0 };
      if (selDrag.move) finishFill();
    }
    else if (tool === 'text') { mode = 'text'; textDown = { id: e.pointerId, x: e.clientX, y: e.clientY }; }
    else {
      // Something is selected and another tool presses the board: the selection goes. A mere tap
      // only deselects (no dot is left); a real stroke is drawn as usual.
      const had = selection.size > 0;
      if (had) clearSelection();
      beginStroke(e, tool);
      if (had && live) live.deselect = true;
    }
  }

  canvas.addEventListener('pointermove', (e) => {
    if (mode === 'plot') return movePlotDrag(e);
    if (mode === 'xform') {
      if (e.pointerId === xf.id) { xf.last = { x: e.clientX, y: e.clientY }; xf.keys = { alt: e.altKey, shift: e.shiftKey }; applyXform(); }
      return;
    }
    if (e.pointerType === 'touch') {
      const t = touches.get(e.pointerId);
      if (!t) return;
      t.x = e.clientX; t.y = e.clientY;
      if (tools.tool === 'laser' && touches.size === 1) laserAt(e.clientX, e.clientY);
      if (tap && hyp(t.x - t.sx, t.y - t.sy) > 10) tap.moved = true;
    } else {
      if (e.pointerType === 'pen') lastPen = performance.now();
      cursorPos = { x: e.clientX, y: e.clientY };
      updateCursor();
      canvas.classList.toggle('can-move', tools.tool === 'select' && selection.size > 0 && onSelection(e.clientX, e.clientY));
      if (!mode) canvas.style.cursor = handleCursor(handleAt(e.clientX, e.clientY, false));
    }
    if (mode === 'draw' && live && e.pointerId === live.id) {
      if (live.snapped && live.shift !== e.shiftKey) { live.shift = e.shiftKey; resnap(); }
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : null;   // every sample the stylus produced, not one per frame
      if (evs && evs.length) for (const ev of evs) addPoint(ev.clientX, ev.clientY, ev.pressure);
      else addPoint(e.clientX, e.clientY, e.pressure);
      requestFrame();
    } else if (mode === 'pan' && e.pointerId === panId) movePan(e.clientX, e.clientY);
    else if (mode === 'pinch' && e.pointerType === 'touch') movePinch();
    else if (mode === 'select' && selDrag && e.pointerId === selDrag.id) {
      const d = selDrag, z = view.zoom;
      if (d.move) {                             // dragging the selection: it follows the pointer 1:1
        if (!d.moved && hyp(e.clientX - d.x, e.clientY - d.y) < 4) return;
        const dx = (e.clientX - d.lx) / z, dy = (e.clientY - d.ly) / z;
        if (!d.moved) {
          if (!WB.live.hold(selItems())) { selDrag = null; mode = null; toast(tr('tLiveBusy')); return; }
          hideStyleBar();
        }
        d.moved = true; d.lx = e.clientX; d.ly = e.clientY; d.dx += dx; d.dy += dy;
        translate(selection, dx, dy);
        WB.live.moveHeld(d.dx, d.dy);
        return;
      }
      if (!d.lasso && hyp(e.clientX - d.x, e.clientY - d.y) > 5) d.lasso = [(d.x - view.x) / z, (d.y - view.y) / z];   // a drag, not a click
      if (d.lasso) { d.lasso.push((e.clientX - view.x) / z, (e.clientY - view.y) / z); requestFrame(); }
    }
  });

  function onUp(e) {
    const cancel = e.type === 'pointercancel', now = performance.now();
    if (e.pointerType === 'pen') { penDown = false; lastPen = now; }
    if (live && live.extra && live.extra.delete(e.pointerId)) return resnap();
    if (mode === 'plot') return endPlotDrag(e);
    if (mode === 'xform') {
      if (e.pointerId === xf.id) endXform(cancel);
      else if (xf.extra.delete(e.pointerId)) applyXform();   // the other finger lifted: back to the normal way
      return;
    }
    const isTouch = e.pointerType === 'touch';
    if (isTouch && !touches.delete(e.pointerId)) return;
    if (isTouch && touches.size === 0) laserOff();

    if (mode === 'draw' && live && e.pointerId === live.id) endStroke(cancel);
    else if (mode === 'pan' && e.pointerId === panId) endPan();
    else if (mode === 'select' && selDrag && e.pointerId === selDrag.id) {
      const d = selDrag;
      mode = null;
      if (cancel) return cancelSelDrag();
      selDrag = null;
      if (d.moved) { record({ type: 'move', items: [...selection], dx: d.dx, dy: d.dy }); WB.live.release(); showStyleBar(); }
      else if (d.lasso) selectLasso(d.lasso, d.add);
      else { plotPointTap(d.x, d.y); selectAt(d.x, d.y, d.add); }
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
      const fingers = cancel ? 0 : tapCounts(tap, now);
      if (fingers) { stopMotion(); fingers === 2 ? undo() : redo(); }
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
    if (plotActive && doc.strokes.includes(plotActive) && inPlot(plotActive, e.clientX, e.clientY)) {   // over a graph being explored: its own view moves
      const L = plotLocal(plotActive, e.clientX, e.clientY);
      if (e.ctrlKey || e.metaKey || notched) WB.plotZoom(plotActive, Math.exp(dy * (notched ? 0.0016 : 0.01)), L.x, L.y);
      else { const d = plotVec(plotActive, -dx, -dy); WB.plotPan(plotActive, d.x, d.y); }
      plotViewChanged();
      return;
    }
    if (e.ctrlKey || e.metaKey || notched) zoomAt(e.clientX, e.clientY, view.zoom * Math.exp(-dy * (notched ? 0.0016 : 0.01)));
    else { view.x -= dx; view.y -= dy; invalidate(); }
  }, { passive: false });
  window.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });

  function updateCursor() {
    const tool = tools.tool, show = cursorPos && isBrush() && !spaceHeld && mode !== 'pan';
    if (tool === 'laser' && cursorPos) laserAt(cursorPos.x, cursorPos.y); else if (!(tool === 'laser' && touches.size)) laserOff();
    cursorEl.classList.toggle('on', !!show);
    cursorEl.classList.toggle('hl', tool === 'highlighter');
    if (!show) return;
    const d = Math.max(5, tools[tool].width);
    cursorEl.style.width = cursorEl.style.height = d + 'px';
    // The highlighter's square tip turns to follow the direction it moves in.
    // Only a quick, deliberate move turns it (faster than 0.35 px/ms over at least 8 px), so the
    // small jitter of a slow or steady hand doesn't make it twitch.
    const c = cursorDir, t = performance.now();
    if (tool === 'highlighter') {
      if (c.x === null) { c.x = cursorPos.x; c.y = cursorPos.y; c.t = t; }
      const dx = cursorPos.x - c.x, dy = cursorPos.y - c.y, dist = Math.hypot(dx, dy);
      if (dist > 8) {
        if (dist / Math.max(1, t - c.t) > 0.35) c.a = Math.atan2(dy, dx);
        c.x = cursorPos.x; c.y = cursorPos.y; c.t = t;
      } else if (t - c.t > 120) { c.x = cursorPos.x; c.y = cursorPos.y; c.t = t; }   // a pause starts a new measurement
    }
    cursorEl.style.transform = `translate3d(${cursorPos.x - d / 2}px, ${cursorPos.y - d / 2}px, 0)` + (tool === 'highlighter' ? ` rotate(${c.a}rad)` : '');
  }
  const cursorDir = { x: null, y: null, t: 0, a: 0 };

  /* ---- History ------------------------------------------------------- */
  const snapshot = () => ({ title: doc.title, created: doc.created, strokes: doc.strokes, pages: doc.pages, handle: fileHandle, gref: WB.gallery.ref });
  function applySnapshot(s) {
    doc.title = s.title; doc.created = s.created; doc.strokes = s.strokes; doc.pages = s.pages || []; fileHandle = s.handle;
    WB.gallery.ref = s.gref || null;            // which gallery file this board is, if any
    $('#doc-title').value = shownTitle();
  }
  /* A board that was never named is stored as "Untitled" and shown in the interface language. */
  const untitled = () => !doc.title || doc.title === 'Untitled';
  const shownTitle = () => (untitled() ? tr('untitled') : doc.title);
  function record(a) {
    undoStack.push(a); redoStack.length = 0;
    if (undoStack.length > 2000) undoStack.shift();
    WB.live.touch(touchedBy(a));
    changed();
  }
  /* The objects an undo step is about (for the live board, which sends them as they are now). */
  function touchedBy(a, out = []) {
    if (!a) return out;
    if (a.type === 'add') out.push(a.stroke);
    else if (a.type === 'remove') for (const it of a.items) out.push(it.s);
    else if (a.type === 'move') for (const s of a.items) out.push(s);
    else if (a.type === 'edit') out.push(a.s);
    else if (a.type === 'batch') for (const x of a.list) touchedBy(x, out);
    return out;
  }
  /* Actions: add (a new object on top), remove (objects taken out, with their positions
     in the drawing order), edit (a text changed in place), replace (the whole board). */
  function undo() {
    if (live || xf) return;
    if (edit) commitText();
    const a = undoStack.pop();
    if (!a) return;
    fillAnim = null; clearSelection();
    applyUndo(a);
    redoStack.push(a); invalidate(); WB.live.touch(touchedBy(a)); changed();
  }
  function redo() {
    if (live || xf) return;
    if (edit) commitText();
    const a = redoStack.pop();
    if (!a) return;
    clearSelection();
    applyRedo(a);
    undoStack.push(a); invalidate(); WB.live.touch(touchedBy(a)); changed();
  }
  function applyUndo(a) {
    if (a.type === 'add') { const i = doc.strokes.lastIndexOf(a.stroke); if (i >= 0) doc.strokes.splice(i, 1); }   // (on a live board, others may have added things since)
    else if (a.type === 'remove') for (const it of a.items) { if (!doc.strokes.includes(it.s)) doc.strokes.splice(Math.min(it.i, doc.strokes.length), 0, it.s); }
    else if (a.type === 'edit') retext(a.s, a.before);
    else if (a.type === 'move') translate(a.items, -a.dx, -a.dy);
    else if (a.type === 'batch') for (let k = a.list.length - 1; k >= 0; k--) applyUndo(a.list[k]);   // several steps undone as one
    else { leaveIfReplaced(a.before); applySnapshot(a.before); }
  }
  function applyRedo(a) {
    if (a.type === 'add') doc.strokes.push(a.stroke);
    else if (a.type === 'remove') for (let k = a.items.length - 1; k >= 0; k--) { const i = doc.strokes.indexOf(a.items[k].s); if (i >= 0) doc.strokes.splice(i, 1); }
    else if (a.type === 'edit') retext(a.s, a.after);
    else if (a.type === 'move') translate(a.items, a.dx, a.dy);
    else if (a.type === 'batch') for (const sub of a.list) applyRedo(sub);
    else { leaveIfReplaced(a.after); applySnapshot(a.after); }
  }
  /* Bringing back another board (not just other pages of this one) leaves the live board first. */
  function leaveIfReplaced(snap) { if (WB.live.on() && snap.strokes !== doc.strokes) stopLive(tr('tLiveLeftBoard')); }
  /* Replace the whole board (new, open, clear) as one undoable step. */
  function replaceBoard(next, message) {
    if (WB.live.on()) stopLive(tr('tLiveLeftBoard'));          // another board: the live one stays with the others
    if (live) endStroke(true);
    if (edit) commitText();
    fillAnim = null; clearSelection();
    const before = snapshot();
    applySnapshot(next);
    record({ type: 'replace', before, after: snapshot() });
    invalidate();
    toast(message, tr('undo'), undo);
  }
  /* unsaved: the board has changes that are in no file or gallery entry (it only lives in the
     browser's autosave). Then something that would replace it, like a share link, asks first. */
  let unsaved = false;
  function changed() { docRev++; unsaved = true; updateChrome(); autosave(); WB.live.changed(); }
  const markSaved = () => { unsaved = false; autosave(); };
  function updateChrome() {
    $('#btn-undo').disabled = !undoStack.length;
    $('#btn-redo').disabled = !redoStack.length;
    hint.classList.toggle('gone', !restored || doc.strokes.length > 0 || !!live || doc.pages.some((p) => p.src));
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
  /* Several values in one transaction (in the order of keys; missing ones are undefined). */
  async function dbGetMany(keys) {
    const d = await db;
    if (!d || !keys.length) return keys.map(() => undefined);
    return new Promise((res) => {
      const st = d.transaction('kv').objectStore('kv'), out = new Array(keys.length);
      let left = keys.length;
      keys.forEach((k, i) => {
        const q = st.get(k);
        q.onsuccess = () => { out[i] = q.result; if (!--left) res(out); };
        q.onerror = () => { if (!--left) res(out); };
      });
    });
  }
  let saveTimer = 0;
  async function saveNow() {
    clearTimeout(saveTimer);
    if (opening) return;                  // the saved board isn't back yet: saving now would replace it with an empty one
    const d = await db;
    if (!d) return;
    // Everything but the render caches (keys starting with "_").
    const strokes = doc.strokes.map((s) => {
      const o = {};
      for (const k in s) if (k[0] !== '_') o[k] = s[k];
      if (s.tool === 'image') { delete o.src; o.img = imgKey(s); }         // pictures too are stored once (below)
      if (s.erase) o.erase = s.erase.map(plainEraser);                       // without their drawing caches
      return o;
    });
    // A PDF's page pictures (and other pictures) are large and never change, so each is stored
    // once under its own key ("img:" + a fingerprint) and the board only names it: saving an
    // 80-page PDF board after a stroke is a small write, not tens of MB.
    // All in one transaction, which either completes entirely or not at all:
    //  - which pictures exist is read from the store each time (key names only, cheap), and the
    //    missing ones are written, so a picture is never assumed stored before it really is;
    //  - "imgIndex" records when each picture was last used by any tab. Another tab may be showing
    //    a board whose pictures this one doesn't use, so a picture is only removed once no tab has
    //    used it for a week (an open tab rewrites anything missing on its next save).
    const pages = doc.pages.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h, img: p.src ? imgKey(p) : undefined }));
    const used = new Map();
    for (const p of doc.pages.concat(doc.strokes.filter((s) => s.tool === 'image'))) if (p.src) used.set(imgKey(p), p.src);
    const record = { title: doc.title, created: doc.created, view: { ...view }, strokes, pages, unsaved, room: WB.live.room() || undefined, roomColor: WB.live.on() ? WB.live.colorIndex() : undefined };
    try {
      const tx = d.transaction('kv', 'readwrite'), st = tx.objectStore('kv'), now = Date.now();
      tx.onabort = () => storageFailed(tx.error);
      const keysReq = st.getAllKeys(), idxReq = st.get('imgIndex');
      idxReq.onsuccess = () => {
        const present = new Set((keysReq.result || []).filter((k) => String(k).startsWith('img:')));
        const idx = idxReq.result || {};
        for (const [k, src] of used) { if (!present.has(k)) st.put(src, k); idx[k] = now; }
        for (const k of present) {
          if (used.has(k)) continue;
          if (!(k in idx)) idx[k] = now;                                  // unknown (an older version stored it): start its week
          else if (now - idx[k] > 7 * 864e5) { st.delete(k); delete idx[k]; }
        }
        for (const k in idx) if (!present.has(k) && !used.has(k)) delete idx[k];
        st.put(idx, 'imgIndex');
        st.put(record, 'board');
      };
    } catch (e) { storageFailed(e); }
  }
  /* The browser refused to store the board (usually: its storage for this site is full, which a
     big PDF can do on iPhone and iPad). Nothing was half-written, but say so, at most every few minutes. */
  let storageWarned = 0;
  function storageFailed(e) {
    console.error('autosave', e);
    if (Date.now() - storageWarned < 3 * 60e3) return;
    storageWarned = Date.now();
    toast(tr('tStorageFull'), null, null, 12000);
  }
  const imgKey = (p) => p._key || (p._key = 'img:' + fingerprint(p.src));
  function fingerprint(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + t.length.toString(36); }
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
    if (!handle && IOS) {
      // iPhone and iPad: the share sheet, with "Save Image" (to Photos) and "Save to Files".
      const file = new File([blob], name, { type: blob.type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        const go = () => navigator.share({ files: [file] }).catch((e) => { if (e.name === 'NotAllowedError') toast(tr('tExportReady'), tr('gShare'), go, 15000); });
        return go();
      }
    }
    if (!handle) return download(blob, name);
    const w = await handle.createWritable();
    await w.write(blob); await w.close();
  }

  /* Where Ctrl S saves: the device file the board was last saved to or opened from ('file'),
     or the gallery ('gallery'). Whichever was used last wins. */
  let saveTarget = 'gallery';
  const BOARD_TYPES = [{ description: 'Whiteboard', accept: { 'application/x-whtbd': ['.whtbd'] } }];
  const OPEN_TYPES = [{ description: 'Whiteboard, PDF', accept: { 'application/x-whtbd': ['.whtbd'], 'application/pdf': ['.pdf'] } }];
  const canUseFiles = () => typeof window.showSaveFilePicker === 'function' && location.protocol !== 'file:';
  const commitPending = () => { if (edit) commitText(); };

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
    fileHandle = h; saveTarget = 'file'; markSaved();
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
    replaceBoard({ title: d.title, created: d.created, strokes: d.strokes, pages: d.pages, handle: handle || null, gref: gref || null }, '');
    saveTarget = handle ? 'file' : 'gallery'; markSaved();
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
    try { [h] = await window.showOpenFilePicker({ id: 'whiteboard-file', types: OPEN_TYPES, excludeAcceptAllOption: false }); }
    catch (e) {
      // A cancel looks exactly like the browser cancelling by itself, which some systems do even
      // after a file was chosen (and then refuse every later dialog at once). The simple file
      // chooser still works there; it needs a fresh tap, so it is offered as a button.
      if (e.name !== 'AbortError') console.error('open dialog', e);
      toast(tr('tOpenFallback'), tr('mOpenFrom'), () => $('#file-input').click(), 10000);
      return;
    }
    try { await openFile(await h.getFile(), h); } catch (err) { toast(tr('eInvalid')); }
  }
  $('#file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { await openFile(file); } catch (err) { toast(tr('eInvalid')); }
  });

  /* A board file opens as it is. A PDF this app exported opens the board inside it; any other PDF
     becomes a sheet: a board the size of the PDF's pages, with the pages beneath the ink. */
  const pdfProgress = (i, n) => toast(tr('tPdfReading', { n: i, t: n }), null, null, 60000);
  const isPdfBytes = (buf) => buf.byteLength > 4 && String.fromCharCode(...new Uint8Array(buf, 0, 5)) === '%PDF-';
  async function openFile(file, handle) {
    const buf = await file.arrayBuffer();
    if (isPdfBytes(buf)) {
      const text = await WB.extractBoard(buf, pdfProgress);
      return text ? loadText(text) : openPdf(buf, file.name);
    }
    loadText(new TextDecoder().decode(buf), handle);
  }
  async function readPdfPages(buf) {
    try {
      const pages = await WB.readPdf(buf, (i, n) => toast(tr('tPdfReading', { n: i, t: n }), null, null, 60000));
      $('#toast').classList.remove('on');
      return pages.length ? pages : null;
    } catch (e) { report(tr('tPdfFail'), 'reading the PDF', e); return null; }
  }
  async function openPdf(buf, name) {
    commitPending();
    if ((doc.strokes.length || doc.pages.length) && !(await ask(tr('confirmPdf'), tr('openPdf')))) return;
    const read = await readPdfPages(buf);
    if (!read) return;
    // Pages one under the other, centred, each starting on a step of the canvas pattern (see onGrid).
    const maxW = Math.max(...read.map((p) => p.w));
    let y = 0;
    const pages = read.map((p) => { const o = { x: onGrid((maxW - p.w) / 2, 0), y, w: p.w, h: p.h, src: p.src }; y = onGrid(y + p.h + 40, 1); return o; });
    await WB.loadImages([], pages);
    replaceBoard({ title: name.replace(/\.pdf$/i, '').trim() || 'Untitled', created: Date.now(), strokes: [], pages, handle: null, gref: null }, '');
    saveTarget = 'gallery'; markSaved();
    toast(tr('tOpened', { t: shownTitle() }), tr('undo'), undo);
    fitPage(pages[0], true);
  }
  /* Pages start on a step of the canvas pattern, so the lines, grid and dots fall the same way on
     every page: a horizontal line along its top edge, a vertical one along its left. Zoomed out,
     the pattern on screen skips to every 2nd or 4th step, so pages go on every 4th step (128
     units), which keeps them lined up down to about 15 % zoom. dir rounds down (-1), up (1) or
     to the nearest (0). */
  const PAGE_STEP = 4 * WB.GRID;
  const onGrid = (v, dir) => (dir < 0 ? Math.floor : dir > 0 ? Math.ceil : Math.round)(v / PAGE_STEP) * PAGE_STEP;
  /* The view on one page: the whole page, as large as fits. */
  function fitPage(p, instant) {
    const z = Math.min((W - 150) / p.w, (H - 210) / p.h, 2);
    animateView(p.x + p.w / 2, p.y + p.h / 2, Math.max(z, ZOOM_MIN), instant);
  }

  /* ---- Confirmation ------------------------------------------------------ */
  let asking = null;
  function ask(text, ok) {
    $('#confirm-text').textContent = text;
    $('#confirm-ok').textContent = ok;
    openSheet('#confirm');
    return new Promise((res) => { asking = res; });
  }
  $('#confirm-ok').addEventListener('click', () => { const r = asking; asking = null; closeSheets(); if (r) r(true); });
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
    if (handle) { try { return await openFile(await handle.getFile(), handle); } catch (err) { /* read it as a plain file */ } }
    if (file) { try { await openFile(file); } catch (err) { toast(tr('eInvalid')); } }
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
  const exp = { format: 'png', scale: '2', bg: 'theme', pattern: false };
  const canvasColor = () => getComputedStyle(root).getPropertyValue('--canvas').trim() || '#ffffff';

  async function doExport() {
    commitPending();
    const sheetPages = doc.pages.length ? doc.pages : null;      // a sheet exports exactly its pages
    const b0 = sheetPages ? WB.pagesBounds(sheetPages) : WB.contentBounds(doc.strokes);
    if (!b0) return toast(tr('tNothing'));
    const F = FORMATS[exp.format], ext = F.ext || exp.format, name = safeName() + '.' + ext;
    const handle = await pickSave(name, F.name, F.mime, ext);   // ask where first, while the tap is still fresh
    if (handle === false) return;
    const btn = $('#btn-export');
    btn.disabled = true; btn.textContent = tr('exporting');
    try {
      const pad = sheetPages ? 0 : Math.max(16, Math.max(b0.w, b0.h) * 0.04);
      const b = { x: b0.x - pad, y: b0.y - pad, w: b0.w + 2 * pad, h: b0.h + 2 * pad };
      let bg = exp.bg === 'none' ? null : exp.bg === 'white' ? '#ffffff' : canvasColor();
      if (!bg && F.opaque) bg = canvasColor();
      // The board's dots, lines or grid, when asked for, in a colour that shows on the background.
      const pattern = exp.pattern ? WB.patternStyle(settings.grid, bg || canvasColor()) : null;
      let blob, shrunk = false;
      // Pictures and PDF pages are decoded one at a time while each is drawn (not all up front: a
      // long PDF decoded at once can exceed an iPad's memory). SVG and PDF use them as they are.
      // The board rides along inside the file, so Import can give it back editable; a PDF export
      // doesn't repeat its page pictures in it (see WB.pdfPayloadDoc).
      const payload = await WB.boardPayload(WB.serialize(exp.format === 'pdf' ? WB.pdfPayloadDoc(doc) : doc, view));
      if (exp.format === 'svg') blob = new Blob([WB.toSVG(doc.strokes, b, bg, payload, sheetPages, pattern)], { type: F.mime });
      else if (exp.format === 'pdf') blob = await WB.toPDF(doc.strokes, b, bg, payload, sheetPages, pattern);
      else {
        const r = await WB.renderToCanvasAsync(doc.strokes, b, +exp.scale, bg, sheetPages, pattern);
        shrunk = r.scale < +exp.scale;
        blob = exp.format === 'bmp' ? WB.canvasToBMP(r.canvas) : await WB.canvasToBlob(r.canvas, F.mime, 0.92);
        blob = await WB.embedPayload(blob, payload, r.canvas.width, r.canvas.height);
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

  /* ---- Import ---------------------------------------------------------
     Export in reverse. A file this app exported carries its board, which opens just as
     "Open from…" would (editable, undoable). Any other picture is placed on the current
     board as a picture object, centred in view and selected so it can be moved at once. */
  function importFile() { commitPending(); $('#import-input').click(); }
  $('#import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const text = await WB.extractBoard(buf, pdfProgress);
      if (text) return loadText(text);
      if (isPdfBytes(buf)) { const pages = await readPdfPages(buf); if (pages) await placePages(pages); return; }
      const pic = await WB.pictureFromFile(file);
      if (!pic) return toast(tr('tImportFail'), null, null, 9000);
      await placePicture(pic);
    } catch (err) { report(tr('tImportFail'), 'importing "' + file.name + '"', err); }
  });
  /* A PDF's pages, one picture each, top to bottom in the middle of the view, all selected. */
  async function placePages(pages) {
    const z = view.zoom, f0 = pages[0], k = Math.min(1, (0.8 * W) / f0.w, (0.8 * H) / f0.h) / z;
    const cx = (W / 2 - view.x) / z;
    let y = (H / 2 - view.y) / z - (f0.h * k) / 2;
    const items = pages.map((p) => {
      const w = p.w * k, h = p.h * k, s = { tool: 'image', x: cx - w / 2, y, w, h, opacity: 1, src: p.src, width: 0 };
      y += h + 24 / z;
      return s;
    });
    await WB.loadImages(items);
    doc.strokes.push(...items);
    record({ type: 'batch', list: items.map((s) => ({ type: 'add', stroke: s })) });
    invalidate();
    setTool('select');
    selection.clear(); for (const s of items) selection.add(s); selectionChanged();
    toast(tr('tImportedPdf', { n: items.length }), tr('undo'), undo);
  }
  async function placePicture(pic) {
    // Its natural size on screen, shrunk to fit within most of the visible board.
    const z = view.zoom, k = Math.min(1, (0.8 * W) / pic.w, (0.8 * H) / pic.h);
    const w = (pic.w * k) / z, h = (pic.h * k) / z;
    const cx = (W / 2 - view.x) / z, cy = (H / 2 - view.y) / z;
    const s = { tool: 'image', x: cx - w / 2, y: cy - h / 2, w, h, opacity: 1, src: pic.src, width: 0 };
    await WB.loadImages([s]);
    doc.strokes.push(s);
    record({ type: 'add', stroke: s });
    invalidate();
    setTool('select');
    selection.clear(); selection.add(s); selectionChanged();
    toast(tr('tImported'), tr('undo'), undo);
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

  const POPS = [['#menu', '#btn-menu'], ['#zoom-menu', '#btn-zoom'], ['#dash-menu', '#btn-dash'], ['#ai-menu', '#sel-ai'], ['#people-menu', '#live-pill']];
  function closePopovers(except) {
    for (const [m, b] of POPS) if (m !== except) { $(m).classList.remove('open'); $(b).setAttribute('aria-expanded', 'false'); }
    $('#font-menu').classList.remove('open'); $('#lang-menu').classList.remove('open'); closeModelMenu();
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
    if (!e.target.closest('.menu, #btn-menu, #btn-zoom, #tb-font, #lang-btn, #sel-ai, #ai-list, #ai-model, #live-pill')) closePopovers();
  }, true);

  function openSheet(id) { closePopovers(); closeSheets(); $(id).classList.add('open'); const f = $('[data-close]', $(id)); if (f) f.focus({ preventScroll: true }); }
  function closeSheets() {
    $$('.scrim.open').forEach((s) => s.classList.remove('open'));
    if (asking) { const r = asking; asking = null; r(false); }
  }
  const sheetOpen = () => !!$('.scrim.open');
  $$('.scrim').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s || e.target.closest('[data-close]')) closeSheets(); }));

  const ACTIONS = {
    new: () => replaceBoard({ title: 'Untitled', created: Date.now(), strokes: [], pages: [], handle: null }, tr('mNew')) || animateView(W / 2, H / 2, 1),
    sheet: () => openSheet('#sheets'),
    share: openShare,
    'open-link': () => { $('#open-link-input').value = ''; openSheet('#open-link'); setTimeout(() => $('#open-link-input').focus(), 50); },
    open: openBoard,
    gallery: () => WB.gallery.open(),
    stickers: () => WB.stickers.open(),
    'save-gallery': () => WB.gallery.save(),
    'save-file': saveBoardFile,
    'save-to': saveBoardTo,
    export: () => { syncExport(); openSheet('#export'); },
    import: importFile,
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
  $('#sel-duplicate').addEventListener('click', duplicateSelection);
  $('#btn-sticker').addEventListener('click', () => WB.stickers.open());
  $('#sel-sticker').addEventListener('click', () => saveSticker());

  const titleEl = $('#doc-title');
  titleEl.addEventListener('input', () => { const v = titleEl.value.trim(); doc.title = v && v !== tr('untitled') ? v : 'Untitled'; updateChrome(); autosave(); });
  titleEl.addEventListener('blur', () => { titleEl.value = shownTitle(); });
  titleEl.addEventListener('focus', () => titleEl.select());

  /* ---- New sheet -------------------------------------------------------
     A board of a fixed paper size. Sizes in mm, inches or pixels, given portrait (short side first);
     the orientation switch turns them. Board units are CSS pixels: 96 per inch. */
  const SHEET_SIZES = [
    ['catA', 'mm', [['A0', 841, 1189], ['A1', 594, 841], ['A2', 420, 594], ['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148]]],
    ['catB', 'mm', [['B0', 1000, 1414], ['B1', 707, 1000], ['B2', 500, 707], ['B3', 353, 500], ['B4', 250, 353], ['B5', 176, 250], ['B6', 125, 176]]],
    ['catUS', 'in', [['szLetter', 8.5, 11], ['szLegal', 8.5, 14], ['szTabloid', 11, 17], ['szExecutive', 7.25, 10.5], ['szHalfLetter', 5.5, 8.5], ['szIndex', 3, 5]]],
    ['catScreen', 'px', [['szSlide169', 1080, 1920], ['szSlide43', 768, 1024], ['szSquare', 1080, 1080]]],
  ];
  const UNIT = { mm: 96 / 25.4, in: 96, px: 1 };
  function buildSheets() {
    const list = $('#sz-list'), land = settings.sheetOrient === 'landscape';
    list.textContent = '';
    for (const [cat, unit, sizes] of SHEET_SIZES) {
      const h3 = document.createElement('h3'); h3.textContent = tr(cat); list.appendChild(h3);
      const grid = document.createElement('div'); grid.className = 'sz-grid'; list.appendChild(grid);
      for (const [key, a, b] of sizes) {
        const w = land ? b : a, h = land ? a : b, name = /^[AB]\d$/.test(key) ? key : tr(key);
        const btn = document.createElement('button'); btn.className = 'sz-tile';
        const shape = document.createElement('i'), k = 40 / Math.max(w, h);
        shape.style.width = Math.round(w * k) + 'px'; shape.style.height = Math.round(h * k) + 'px';
        shape.style.margin = `${Math.round((44 - h * k) / 2)}px 0 ${Math.round((44 - h * k) / 2) + 4}px`;   // centred in a 44 px box
        const label = document.createElement('b'); label.textContent = name;
        const dims = document.createElement('small'); dims.textContent = `${w} × ${h} ${unit}`;
        btn.append(shape, label, dims);
        btn.addEventListener('click', () => {
          closeSheets();
          const page = { x: 0, y: 0, w: Math.round(w * UNIT[unit] * 100) / 100, h: Math.round(h * UNIT[unit] * 100) / 100 };
          replaceBoard({ title: 'Untitled', created: Date.now(), strokes: [], pages: [page], handle: null, gref: null }, tr('tNewSheet', { t: name }));
          fitPage(page);
        });
        grid.appendChild(btn);
      }
    }
  }

  /* ---- Share links ---------------------------------------------------------
     The board travels in the link's fragment (after #), which browsers never send to a server:
     GitHub Pages never sees it. See js/share.js for the encoding. */
  let shareLink = '';
  const shareSite = () => (location.protocol.startsWith('http') ? location.origin + location.pathname : 'https://citromoseper.github.io/Whiteboard/');
  async function openShare() {
    commitPending();
    let r;
    try { r = await WB.share.encode(doc); } catch (e) { return report(tr('tShareFail'), 'making the link', e); }
    const site = shareSite();
    // Sharing makes the board live (when the browser can): the same link both carries a copy of
    // the board and lets whoever opens it draw on this one with you while it is open here.
    if (WB.p2p.supported && !WB.live.on()) await startLive(WB.p2p.newRoom(), { seeded: false, color: 0 });   // the one who starts it points in red
    const room = WB.live.room();
    shareLink = site + '#b=' + r.text + (room ? '&r=' + room : '');
    $('#share-link').value = shareLink;
    $('#share-stats').textContent = tr('shareChars', { n: shareLink.length.toLocaleString(WB.lang()) });
    const warn = [];
    if (shareLink.length > 8000) warn.push(tr('shareLong'));
    if (room && (r.images || r.pdf)) warn.push(tr('shareNoPicsLive'));
    else {
      if (r.images) warn.push(tr('shareNoPics', { n: r.images }));
      if (r.pdf) warn.push(tr('shareNoPdf'));
    }
    const ul = $('#share-warn'); ul.textContent = '';
    for (const w of warn) { const li = document.createElement('li'); li.textContent = w; ul.appendChild(li); }
    ul.hidden = !warn.length;
    $('#share-send').hidden = !navigator.share;
    refreshLive();
    openSheet('#share');
  }

  /* ---- Live boards ---------------------------------------------------------
     See js/live.js and js/p2p.js. While a board is live, the address ends in #r=<room>, so a
     reload joins again (with the board from the autosave, which remembers its room). */
  let savedRoom = null, savedColor = null, liveBlockedSaid = false, loadingMsg = '', loadTimer = 0;
  const turnStore = { get: () => store.get('wb.turn', {}), set: (v) => store.set('wb.turn', v) };
  WB.live.init({
    doc,
    turn: () => turnStore.get(),
    requestFrame,
    unselect: (s) => selection.delete(s),
    remoteChanged() { docRev++; unsaved = true; updateChrome(); autosave(); invalidate(); if (selection.size) selectionChanged(); },
    metaChanged() { docRev++; unsaved = true; titleEl.value = shownTitle(); updateChrome(); autosave(); invalidate(); },
    peerJoined() { if (!loadingMsg) toast(tr('tLiveJoined')); refreshLive(); },   // (the loading message stays until the board is here)
    pointer: remotePointer,
    exploring: (s) => s === plotActive,
    translate: (list, dx, dy) => { if (list.length && (dx || dy)) translate(list, dx, dy); },
    retext: (s, props) => { retext(s, props); invalidate(); },
    /* Someone else got hold of what I was working on at the same moment: they keep it. */
    yieldHold() {
      if (selDrag && selDrag.moved) { const d = selDrag; selDrag = null; mode = null; translate(selection, -d.dx, -d.dy); }
      if (xf) { const d = xf; xf = null; mode = null; d.items.forEach((s, i) => retext(s, d.starts[i])); }
      if (edit && edit.s) { ta.value = edit.s.text; commitText(); }
      if (plotPanelFor) { const s = plotPanelFor; s.fns = plotPanelBefore; plotPanelBefore = fnsOf(s); closePlotPanel(); }
      clearSelection(); invalidate();
      toast(tr('tLiveBusy'));
    },
    colorChanged(c) { savedColor = c; autosave(); if (laser.el.classList.contains('on')) laser.el.style.setProperty('--lc', WB.live.myColor()); },
    nickname: () => store.get('wb.nick', { name: '' }).name,
    peopleChanged() { refreshLive(); if ($('#people-menu').classList.contains('open')) renderPeople(); },
    /* Joined, and the board is on its way: say so at the bottom until it is here (k: how much of it, 0-1). */
    loading(k) {
      clearTimeout(loadTimer);
      const el = $('#toast'), shown = el.classList.contains('on') && loadingMsg && $('#toast-text').textContent === loadingMsg;
      if (k == null) { if (shown) el.classList.remove('on'); loadingMsg = ''; return; }
      loadingMsg = k > 0.02 && k < 1 ? tr('tLiveLoadingPct', { p: Math.round(k * 100) }) : tr('tLiveLoading');
      toast(loadingMsg, null, null, 600000);
      // Nobody with the board there after a while: say that instead of loading forever.
      loadTimer = setTimeout(() => { if (WB.live.on() && !WB.live.status().peers) { loadingMsg = tr('tLiveNobody'); toast(loadingMsg, null, null, 600000); } }, 20000);
    },
    peerLeft() { toast(tr('tLiveLeft')); refreshLive(); },
    status(st) {
      refreshLive();
      if (st.failed && !st.peers && !liveBlockedSaid) { liveBlockedSaid = true; toast(tr('liveBlocked'), null, null, 9000); }
    },
  });
  async function startLive(room, opt) {
    if (!WB.p2p.supported) { toast(tr('tLiveUnsupported'), null, null, 6000); return false; }
    liveBlockedSaid = false;
    savedColor = opt.color != null ? opt.color : null;
    try { await WB.live.start(room, opt); }
    catch (e) { report(tr('tLiveFail'), 'joining the live board', e); return false; }
    history.replaceState(null, '', location.pathname + location.search + '#r=' + room);
    savedRoom = room;
    autosave(); refreshLive();
    return true;
  }
  function stopLive(message) {
    if (!WB.live.on()) return;
    WB.live.stop();
    savedRoom = null; savedColor = null;
    clearPointers(); laser.el.style.removeProperty('--lc');
    if (location.hash.startsWith('#r=')) history.replaceState(null, '', location.pathname + location.search);
    autosave(); refreshLive(); requestFrame();
    if (message) toast(message, null, null, 5000);
  }
  /* The top bar's "Live" badge and the share window's status line. */
  function refreshLive() {
    const on = WB.live.on(), st = WB.live.status(), pill = $('#live-pill');
    pill.hidden = !on;
    $('#live-box').hidden = !on;
    if (!on) return;
    let text;
    if (st.peers) text = tr('liveConnected', { n: st.peers });
    else if (st.failed && st.others) text = tr('liveBlocked');
    else if (st.connecting) text = tr('liveConnecting');
    else if (!st.trackers) text = tr('liveNoTrackers');
    else text = tr('liveWaiting');
    $('#live-state').textContent = text;
    pill.querySelector('span').textContent = st.peers ? String(st.peers + 1) : tr('livePill');
    const room = WB.live.room();
    if ($('#live-code').textContent !== room) {
      // For phones: the board's address with only the room in it (a whole board doesn't fit in a QR code).
      const url = shareSite() + '#r=' + room;
      $('#live-code').textContent = room;
      try { $('#live-qr').innerHTML = WB.qrSvg(url, 3); } catch (e) { $('#live-qr').textContent = ''; }
      $('#live-qr').title = url;
    }
    $('#live-qr-note').textContent = tr('liveQrNote', { m: tr('mOpenLink').replace(/…$/, '') });
    pill.classList.toggle('alone', !st.peers);
    $('#live-box').classList.toggle('alone', !st.peers);
    pill.title = text;
  }
  /* ---- Who is here ----
     The Live badge opens a list of everyone on the board, each with their pointer colour and name.
     Tapping your own name lets you type a nickname, which the others see in the list and by your
     pointer. It is kept on this device for the next live board. */
  function renderPeople() {
    const list = $('#people-list');
    list.textContent = '';
    for (const p of WB.live.people()) {
      const li = document.createElement('li');
      const dot = document.createElement('i'); dot.style.background = p.color;
      const name = document.createElement(p.me ? 'button' : 'span');
      name.className = 'pp-name';
      name.textContent = p.name || tr('peopleGuest', { n: p.index + 1 });
      li.append(dot, name);
      if (p.me) {
        const you = document.createElement('small'); you.textContent = tr('peopleYou') + (p.name ? '' : ' · ' + tr('peopleSetName'));
        li.append(you);
        li.classList.add('me');
        name.title = tr('peopleSetName');
        name.addEventListener('click', () => editNickname(li, name));
      }
      list.appendChild(li);
    }
  }
  function editNickname(li, name) {
    const input = document.createElement('input');
    input.className = 'field pp-edit'; input.maxLength = 24; input.value = WB.live.myName(); input.placeholder = tr('peopleNamePh');
    input.spellcheck = false; input.autocomplete = 'off';
    name.replaceWith(input);
    input.focus();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      if (save) { store.set('wb.nick', { name: input.value.trim().slice(0, 24) }); WB.live.setName(input.value); }
      renderPeople();
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); else if (e.key === 'Escape') { e.stopPropagation(); finish(false); } });
    input.addEventListener('blur', () => finish(true));
  }
  $('#people-share').addEventListener('click', () => { closePopovers(); openShare(); });
  $('#live-pill').addEventListener('click', () => { if ($('#people-menu').classList.contains('open')) renderPeople(); });
  $('#live-stop').addEventListener('click', () => { stopLive(tr('tLiveStopped')); });
  function initTurn() {
    const t = turnStore.get(), f = { url: $('#turn-url'), username: $('#turn-user'), credential: $('#turn-pass') };
    for (const k in f) {
      f[k].value = t[k] || '';
      f[k].addEventListener('change', () => { const v = turnStore.get(); v[k] = f[k].value.trim(); turnStore.set(v); });
    }
  }
  initTurn();
  $('#share-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareLink); }
    catch (e) { const i = $('#share-link'); i.focus(); i.select(); try { document.execCommand('copy'); } catch (e2) { return; } }
    toast(tr('tCopied'));
  });
  $('#share-send').addEventListener('click', () => { navigator.share({ title: shownTitle(), url: shareLink }).catch(() => {}); });
  $('#share-link').addEventListener('focus', (e) => e.target.select());
  /* Opening a share link: the board replaces the current one (undoable), and the fragment is
     dropped from the address so a reload doesn't open it again. */
  function openShared() {
    const q = linkParts(location.hash);
    if (!q || (q.room && q.room === WB.live.room())) return;
    history.replaceState(null, '', location.pathname + location.search);
    if (q.code) openShareCode(q.code, q.room);
    else joinRoom(q.room);
  }
  /* "#b=<board>&r=<room>" (either part may be missing) -> { code, room } or null. */
  function linkParts(v) {
    v = (v || '').trim();
    const i = v.indexOf('#');
    const q = {};
    for (const part of (i >= 0 ? v.slice(i + 1) : v).split('&')) { const k = part.indexOf('='); if (k > 0) q[part.slice(0, k)] = part.slice(k + 1); }
    const code = /^[A-Za-z0-9_-]{8,}$/.test(q.b || '') ? q.b : null, room = q.r ? WB.p2p.roomOf(decodeURIComponent(q.r)) : null;
    return code || room ? { code, room } : null;
  }
  /* A link with only the room (the address of a live board, after a reload or copied from the
     address bar): the board comes from the others. This board joins only if it is that board. */
  async function joinRoom(room) {
    if (savedRoom === room) return startLive(room, { seeded: false, color: savedColor, joining: true });
    const overUnsaved = doc.strokes.length && unsaved, overPdf = doc.pages.some((p) => p.src);
    if ((overUnsaved || overPdf) && !(await ask(tr(overUnsaved ? 'confirmShared' : 'confirmSharedPdf'), tr('openSharedBtn')))) return;
    replaceBoard({ title: 'Untitled', created: Date.now(), strokes: [], pages: [], handle: null, gref: null }, '');
    saveTarget = 'gallery'; markSaved();
    startLive(room, { seeded: false, joining: true });
  }
  /* A board drawn but not saved anywhere would be lost to the autosave of the shared one, so that
     case asks first (as opening a PDF does). Undo still brings the old board back. */
  async function openShareCode(code, room) {
    let d;
    try { d = await WB.share.decode(code); } catch (e) { console.error('share link', e); return toast(tr('tShareBad'), null, null, 6000); }
    // Also over an opened PDF: the file is still on the device, but its place in the work isn't.
    const overUnsaved = doc.strokes.length && unsaved, overPdf = doc.pages.some((p) => p.src);
    if ((overUnsaved || overPdf) && !(await ask(tr(overUnsaved ? 'confirmShared' : 'confirmSharedPdf'), tr('openSharedBtn')))) return;
    replaceBoard({ title: d.title, created: Date.now(), strokes: d.strokes, pages: d.pages, handle: null, gref: null }, '');
    saveTarget = 'gallery'; markSaved();
    toast(tr('tSharedOpened'), tr('undo'), undo, 6000);
    fitView(true);
    if (room) startLive(room, { seeded: true, joining: true });           // the link's copy shows at once; the live board replaces it when it arrives
  }
  /* "Open share link…": for when there's no address bar to paste into (the installed app). */
  function openLink() {
    let v = $('#open-link-input').value.trim();
    const typed = !v.includes('#') && !v.includes('=') && v.length <= 12 && WB.p2p.roomOf(v);   // a live board's code, typed in
    if (typed) { closeSheets(); return joinRoom(typed); }
    if (v && !v.includes('#') && !v.includes('=')) v = 'b=' + v;          // just the board's code
    const q = linkParts(v);
    if (!q) return toast(tr('tLinkBad'), null, null, 5000);
    closeSheets();
    if (q.code) openShareCode(q.code, q.room); else joinRoom(q.room);
  }
  $('#open-link-go').addEventListener('click', openLink);
  $('#open-link-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); openLink(); } });

  /* ---- UI: tools, colours, sliders ----------------------------------- */
  const side = $('#side'), preview = $('#preview');
  const BRUSHES = ['pen', 'eraser', 'highlighter'];
  const brushKind = () => (BRUSHES.includes(tools.tool) ? tools.tool : 'pen');
  const brush = () => tools[brushKind()];
  const sizeT = () => { const [a, b] = SIZE[brushKind()]; return Math.sqrt((brush().width - a) / (b - a)); };
  const isBrush = () => BRUSHES.includes(tools.tool);
  /* The dock's colours: the highlighter has its own neon set and its own colour. */
  const palette = () => (tools.tool === 'highlighter' ? HL_PALETTE : PALETTE);
  const curColor = () => (tools.tool === 'highlighter' ? tools.highlighter.color : tools.pen.color);
  function setTool(t) {
    if (edit) commitText();
    if (t !== 'select') clearSelection();
    tools.tool = t; store.set('wb.tools', tools); refreshTools();
  }
  function setColor(c) {
    if (edit) commitText();
    if (tools.tool === 'highlighter') tools.highlighter.color = c;
    else {
      tools.pen.color = c;
      if (tools.tool !== 'pen') { clearSelection(); tools.tool = 'pen'; }
    }
    store.set('wb.tools', tools); refreshTools();
  }

  function refreshTools() {
    $$('.tool').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tools.tool)));
    const c = curColor(), pal = palette(), inPalette = pal.includes(c);
    $$('#swatches .swatch').forEach((b, i) => {
      if (b.dataset.color !== pal[i]) { b.dataset.color = pal[i]; b.style.setProperty('--c', pal[i]); b.setAttribute('aria-label', pal[i]); }
      b.setAttribute('aria-checked', String(pal[i] === c));
    });
    const custom = $('.swatch.custom');
    custom.setAttribute('aria-checked', String(!inPalette));
    custom.style.setProperty('--c', c);
    $('#dock').classList.toggle('erasing', tools.tool === 'eraser');
    side.classList.toggle('hidden', !isBrush());
    side.classList.toggle('erasing', tools.tool === 'eraser');
    side.classList.toggle('no-dash', tools.tool !== 'pen');
    const dash = WB.DASHES[tools.pen.dash] ? tools.pen.dash : 'solid';
    $('#dash-icon').setAttribute('stroke-dasharray', DASH_ICON[dash]);
    $$('#dash-menu [data-dash]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.dash === dash)));
    canvas.classList.toggle('brush', isBrush() && !spaceHeld);
    canvas.classList.toggle('hand', tools.tool === 'hand' || spaceHeld);
    canvas.classList.toggle('t-text', tools.tool === 'text' && !spaceHeld);
    canvas.classList.toggle('t-select', tools.tool === 'select' && !spaceHeld);
    canvas.classList.toggle('t-laser', tools.tool === 'laser' && !spaceHeld);
    const b = brush(), st = clamp(sizeT(), 0, 1), ot = (b.opacity - 0.05) / 0.95;
    const s1 = $('#sl-size'), s2 = $('#sl-opacity');
    s1.style.setProperty('--t', st); s1.setAttribute('aria-valuenow', Math.round(st * 100)); s1.setAttribute('aria-valuetext', b.width + ' pixels');
    s2.style.setProperty('--t', ot); s2.setAttribute('aria-valuenow', Math.round(ot * 100)); s2.setAttribute('aria-valuetext', Math.round(b.opacity * 100) + ' percent');
    updateCursor();
  }

  /* Line type: a button under the opacity slider opens the list of types. */
  const DASH_ICON = { solid: 'none', dotted: '0 4.5', dashed: '5 5', long: '10 5', dashdot: '8 4.5 0 4.5' };
  $('#btn-dash').addEventListener('click', () => {
    const r = $('#btn-dash').getBoundingClientRect(), m = $('#dash-menu');
    m.style.left = r.right + 10 + 'px';
    m.style.top = Math.max(8, Math.min(innerHeight - m.offsetHeight - 8, r.top + r.height / 2 - m.offsetHeight / 2)) + 'px';
  });
  $('#dash-menu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dash]');
    if (!b) return;
    tools.pen.dash = b.dataset.dash; store.set('wb.tools', tools);
    closePopovers(); refreshTools();
  });

  function showPreview(kind) {
    const b = brush(), dot = $('#preview-dot'), d = clamp(b.width, 2, 86);
    dot.style.width = dot.style.height = d + 'px';
    dot.className = brushKind();
    dot.style.background = brushKind() === 'eraser' ? '' : brush().color;
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
    // The pattern switch only means something when the canvas has one.
    $('#exp-pattern-block').hidden = settings.grid === 'none';
    $('#exp-pattern').setAttribute('aria-checked', String(exp.pattern));
  }

  function initUI() {
    const sw = $('#swatches');
    for (const c of PALETTE) {
      const b = document.createElement('button');
      b.className = 'swatch'; b.dataset.color = c; b.style.setProperty('--c', c);
      b.setAttribute('role', 'radio'); b.setAttribute('aria-label', c);
      dragToFill(b, () => b.dataset.color);
      b.addEventListener('click', () => setColor(b.dataset.color));
      sw.appendChild(b);
    }
    // The rainbow swatch opens the colour picker; like the others it can also be dragged out to fill.
    const customBtn = $('#btn-custom');
    dragToFill(customBtn, () => (palette().includes(curColor()) ? tools.custom : curColor()));
    customBtn.addEventListener('click', () => {
      WB.picker.toggle({ anchor: customBtn, color: palette().includes(curColor()) ? tools.custom : curColor(),
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
    seg('orient', () => settings.sheetOrient || 'portrait', (v) => { settings.sheetOrient = v; saveSettings(); buildSheets(); });
    buildSheets();
    seg('format', () => exp.format, (v) => { exp.format = v; syncExport(); });
    seg('scale', () => exp.scale, (v) => { exp.scale = v; });
    syncBg = seg('bg', () => exp.bg, (v) => { exp.bg = v; });
    $('#exp-pattern').addEventListener('click', () => { exp.pattern = !exp.pattern; syncExport(); });
    syncExport();

    const sm = $('#smoothing'), smOut = $('#smoothing-out');
    smSync = () => { smOut.textContent = settings.smoothing > 0 ? settings.smoothing + '%' : tr('off'); };
    sm.value = settings.smoothing; smSync();

    initLang();
    // The thumb glides freely; the stored value still lands on steps of 5.
    sm.addEventListener('input', () => { settings.smoothing = Math.round(+sm.value / 5) * 5; smSync(); saveSettings(); });

    $$('[data-switch]').forEach((b) => {
      const k = b.dataset.switch;
      b.setAttribute('aria-checked', String(!!settings[k]));
      b.addEventListener('click', () => {
        settings[k] = !settings[k]; b.setAttribute('aria-checked', String(settings[k])); saveSettings();
      });
    });

    board.dataset.grid = settings.grid;
    applyTheme(); refreshTools(); applyLang();
  }

  /* ---- Graphs --------------------------------------------------------------
     A graph (js/plot.js) is selected, moved, resized and turned like a picture. Double-clicking or
     double-tapping it (or "Explore" in its bar) opens it for exploring: then dragging inside it
     moves its view, two fingers pinch-zoom it, and the wheel zooms it, whatever tool is chosen.
     A press outside it, or Escape, closes it again. View changes are saved with the board but are
     not undo steps (like scrolling the board itself). */
  const plotBar = $('#plot-bar');
  let plotPanelFor = null, plotPanelBefore = null;
  const plotLocal = (s, cx, cy) => WB.toLocal(s, (cx - view.x) / view.zoom, (cy - view.y) / view.zoom);
  /* A screen-space movement as a movement in the graph's own (turned) frame, in world units. */
  function plotVec(s, dx, dy) {
    const c = Math.cos(s.rot || 0), n = Math.sin(s.rot || 0), z = view.zoom;
    return { x: (dx * c + dy * n) / z, y: (-dx * n + dy * c) / z };
  }
  function inPlot(s, cx, cy) { const L = plotLocal(s, cx, cy); return Math.abs(L.x) <= s.w / 2 && Math.abs(L.y) <= s.h / 2; }
  function plotUnder(cx, cy) {
    for (let i = doc.strokes.length - 1; i >= 0; i--) { const o = doc.strokes[i]; if (o.tool === 'plot' && inPlot(o, cx, cy)) return o; }
    return null;
  }
  function enterPlot(s) { plotActive = s; textDown = null; mode = null; WB.live.view(s); refreshPlotBar(); requestFrame(); }
  function exitPlot() { if (!plotActive) return; plotActive = null; plotDrag = null; if (mode === 'plot') mode = null; WB.live.view(null); refreshPlotBar(); requestFrame(); }
  function plotViewChanged() { invalidate(); unsaved = true; updateChrome(); autosave(); }
  function drawPlotActive() {
    const s = plotActive, z = view.zoom, accent = getComputedStyle(root).getPropertyValue('--accent').trim() || '#007aff';
    if (!doc.strokes.includes(s)) return;
    worldTransform(ctx);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.translate(s.x + s.w / 2, s.y + s.h / 2); if (s.rot) ctx.rotate(s.rot);
    ctx.strokeStyle = accent; ctx.lineWidth = 3 / z;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-s.w / 2 - 2 / z, -s.h / 2 - 2 / z, s.w + 4 / z, s.h + 4 / z, Math.min(12, s.w / 12, s.h / 12) + 2 / z);
    else ctx.rect(-s.w / 2, -s.h / 2, s.w, s.h);
    ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  /* Pointers dragging inside the graph: one moves its view, two (or more) also zoom it about their middle. */
  function plotGrip() {
    let x = 0, y = 0, n = 0;
    for (const p of plotDrag.pts.values()) { x += p.x; y += p.y; n++; }
    x /= n; y /= n;
    let d = 0;
    for (const p of plotDrag.pts.values()) d += hyp(p.x - x, p.y - y);
    return { x, y, d: n > 1 ? d / n : 0 };
  }
  function beginPlotDrag(e) {
    if (!plotDrag || mode !== 'plot') plotDrag = { pts: new Map(), start: { x: e.clientX, y: e.clientY }, far: 0, many: false };
    else plotDrag.many = true;
    plotDrag.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    plotDrag.grip = plotGrip();
    if (tools.tool === 'laser' && plotDrag.pts.size === 1) laserAt(e.clientX, e.clientY);
    mode = 'plot'; tap = null;
    canvas.classList.add('panning');
  }
  function movePlotDrag(e) {
    const p = plotDrag && plotDrag.pts.get(e.pointerId), s = plotActive;
    if (!p || !s) return;
    p.x = e.clientX; p.y = e.clientY;
    if (tools.tool === 'laser' && plotDrag.pts.size === 1) laserAt(e.clientX, e.clientY);
    plotDrag.far = Math.max(plotDrag.far, hyp(p.x - plotDrag.start.x, p.y - plotDrag.start.y));
    if (plotDrag.far < 4 && !plotDrag.many) return;      // not moving yet: may still be a tap on a point
    const g0 = plotDrag.grip, g1 = plotGrip(), d = plotVec(s, g1.x - g0.x, g1.y - g0.y);
    WB.plotPan(s, d.x, d.y);
    if (g0.d > 0 && g1.d > 0) { const L = plotLocal(s, g1.x, g1.y); WB.plotZoom(s, g0.d / g1.d, L.x, L.y); }
    plotDrag.grip = g1;
    plotViewChanged();
  }
  function endPlotDrag(e) {
    if (!plotDrag) { mode = null; return; }
    plotDrag.pts.delete(e.pointerId);
    if (plotDrag.pts.size) { plotDrag.grip = plotGrip(); return; }
    const d = plotDrag;
    plotDrag = null; mode = null;
    canvas.classList.remove('panning');
    if (tools.tool === 'laser' && e.pointerType === 'touch') laserOff();
    if (!d.many && d.far < 6) plotPointTap(d.start.x, d.start.y);   // a tap, not a drag: on a special point, show its coordinates
  }
  /* A tap at a screen point on a graph's special point shows or hides its coordinates. True if it was on one. */
  function plotPointTap(cx, cy) {
    for (let i = doc.strokes.length - 1; i >= 0; i--) {
      const o = doc.strokes[i];
      if (o.tool !== 'plot' || !inPlot(o, cx, cy)) continue;
      const L = plotLocal(o, cx, cy), q = WB.plotPointAt(o, L.x, L.y, 12 / view.zoom);
      if (!q) return false;
      WB.plotTogglePin(o, q); invalidate();
      return true;
    }
    return false;
  }

  /* The graph the bar is for: the one being explored, or a graph selected on its own. */
  function barPlot() {
    if (plotActive && doc.strokes.includes(plotActive)) return plotActive;
    const it = selItems();
    return it.length === 1 && it[0].tool === 'plot' && tools.tool === 'select' ? it[0] : null;
  }
  function hidePlotBar() { plotBar.classList.remove('on'); }
  function refreshPlotBar() {
    const s = barPlot(), on = !!s && !xf && !(selDrag && selDrag.moved);
    plotBar.classList.toggle('on', on);
    if (plotPanelFor && plotPanelFor !== s) closePlotPanel();
    if (!on) return;
    $('#pb-explore').setAttribute('aria-pressed', String(plotActive === s));
    placePlotBar();
  }
  function placePlotBar() {
    if (!plotBar.classList.contains('on')) return;
    const s = barPlot();
    if (!s) return hidePlotBar();
    const q = WB.corners(s), z = view.zoom;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i += 2) { const x = q[i] * z + view.x, y = q[i + 1] * z + view.y; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const w = plotBar.offsetWidth, h = plotBar.offsetHeight;
    let y = y1 + 16;
    if (y + h > H - 96) y = y0 - (selection.has(s) ? ROT_GAP + 22 : 12) - h;
    if (y < 8) y = Math.min(H - h - 96, Math.max(8, y0 + 12));     // a graph filling the screen: the bar rests inside it
    plotBar.style.transform = `translate(${clamp((x0 + x1) / 2 - w / 2, 8, Math.max(8, W - w - 8))}px, ${clamp(y, 8, Math.max(8, H - h - 8))}px)`;
  }
  /* Editing the functions: one per line, drawn as they are typed; closing it is one undo step. */
  const fnsOf = (s) => s.fns.map((f) => ({ src: f.src, color: f.color }));
  function openPlotPanel(s) {
    if (!WB.live.hold([s], true)) return toast(tr('tLiveBusy'));   // on a live board: one person edits a graph's functions at a time
    plotPanelFor = s; plotPanelBefore = fnsOf(s);
    const t = $('#pb-fns');
    t.value = s.fns.map((f) => f.src).join('\n');
    t.rows = Math.min(8, Math.max(3, s.fns.length + 1));
    $('#pb-panel').hidden = false; $('#pb-edit').setAttribute('aria-expanded', 'true');
    placePlotBar();
    t.focus({ preventScroll: true });
  }
  function closePlotPanel() {
    const s = plotPanelFor;
    if (!s) return;
    plotPanelFor = null;
    $('#pb-panel').hidden = true; $('#pb-edit').setAttribute('aria-expanded', 'false');
    if (document.activeElement === $('#pb-fns')) $('#pb-fns').blur();
    const after = fnsOf(s);
    if (JSON.stringify(after) !== JSON.stringify(plotPanelBefore) && doc.strokes.includes(s)) record({ type: 'edit', s, before: { fns: plotPanelBefore }, after: { fns: after } });
    WB.live.release();
    placePlotBar();
  }
  function initPlotBar() {
    plotBar.addEventListener('pointerdown', (e) => { if (e.target.id !== 'pb-fns') e.preventDefault(); });
    const zoomBy = (k) => { const s = barPlot(); if (s) { WB.plotZoom(s, k); plotViewChanged(); } };
    $('#pb-in').addEventListener('click', () => zoomBy(1 / 1.5));
    $('#pb-out').addEventListener('click', () => zoomBy(1.5));
    $('#pb-home').addEventListener('click', () => { const s = barPlot(); if (s) { s.cx = 0; s.cy = 0; s.span = WB.PLOT_SPAN; plotViewChanged(); } });
    $('#pb-explore').addEventListener('click', () => { const s = barPlot(); if (!s) return; if (plotActive === s) exitPlot(); else enterPlot(s); });
    $('#pb-edit').addEventListener('click', () => { const s = barPlot(); if (!s) return; if (plotPanelFor) closePlotPanel(); else openPlotPanel(s); });
    $('#pb-fns').addEventListener('input', () => {
      const s = plotPanelFor;
      if (!s) return;
      const old = s.fns, lines = $('#pb-fns').value.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 12);
      s.fns = lines.map((src, i) => ({ src, color: (old[i] && old[i].color) || WB.PLOT_COLORS[i % WB.PLOT_COLORS.length] }));
      WB.live.editHeld();
      invalidate();
    });
  }

  /* ---- AI actions ------------------------------------------------------------
     The AI button on the selection bar: tidy handwriting into typed text with typeset maths, solve
     a written problem showing the working, or turn a written function into a graph. The model only
     reads (js/ai.js); answers are checked and graphs drawn on the device. Each result is one undo step. */
  const aiBtn = $('#sel-ai'), aiMenu = $('#ai-menu');
  let aiJob = null;
  function openAiSettings() {
    openSheet('#settings');
    setTimeout(() => { $('#ai-title').scrollIntoView({ block: 'start', behavior: reduceMotion.matches ? 'auto' : 'smooth' }); if (!WB.ai.key() && WB.ai.get().provider !== 'custom') $('#ai-key').focus({ preventScroll: true }); }, 60);
  }
  function aiError(e) {
    if (e.status === 401 || e.status === 403) return tr('tAiKeyBad');
    if (e.status === 429) return tr('tAiQuota');
    if (e instanceof TypeError) return tr('tAiNetwork');       // offline, blocked, or the server refused the browser (CORS)
    return tr('tAiFailed', { e: String(e.message || e).slice(0, 180) });
  }
  /* Where the handwriting is, how big it is written and in what colour. */
  function inkInfo(items) {
    const b = WB.contentBounds(items) || { x: 0, y: 0, w: 0, h: 0 }, hs = [], colors = new Map();
    for (const s of items) {
      if (s.tool === 'pen' && !s.hl) {
        const q = WB.boundsOf(s), h = q.y1 - q.y0 - s.width;
        if (h > 0) hs.push(h);
        colors.set(s.color, (colors.get(s.color) || 0) + s.points.length);
      } else if (s.tool === 'text') { hs.push(s.size * 0.72); colors.set(s.color, (colors.get(s.color) || 0) + 50 * s.text.length); }
    }
    hs.sort((a, c) => a - c);
    const med = hs.length ? hs[hs.length >> 1] : 24 / view.zoom;
    const size = clamp(med * 1.35, 10 / view.zoom, Math.max(10 / view.zoom, b.h || med * 1.35));
    let color = tools.text.color, best = -1;
    for (const [c, n] of colors) if (n > best) { best = n; color = c; }
    return { b, size, color };
  }
  /* Take items off the board and put others on, as one undo step. */
  function swapIn(items, adds) {
    const removed = items.map((s) => ({ i: doc.strokes.indexOf(s), s })).filter((it) => it.i >= 0).sort((a, b) => a.i - b.i);
    for (let k = removed.length - 1; k >= 0; k--) doc.strokes.splice(removed[k].i, 1);
    for (const a of adds) doc.strokes.push(a);
    const list = (removed.length ? [{ type: 'remove', items: removed }] : []).concat(adds.map((a) => ({ type: 'add', stroke: a })));
    record({ type: 'batch', list });
    selection.clear(); for (const a of adds) selection.add(a);
    if (adds.length) setTool('select');
    selectionChanged(); invalidate();
  }
  function makePlot(items, srcs) {
    const { b } = inkInfo(items), z = view.zoom;
    const w = Math.max(b.w * 1.15, 380 / z), h = Math.round(w * 0.68 * 100) / 100;
    const s = { tool: 'plot', x: b.x, y: b.y, w, h, rot: 0, opacity: 1, width: 0, cx: 0, cy: 0, span: WB.PLOT_SPAN,
      fns: srcs.map((src, i) => ({ src, color: WB.PLOT_COLORS[i % WB.PLOT_COLORS.length] })) };
    swapIn(items, [s]);
    toast(tr('tAiPlotted'), tr('undo'), undo, 6000);
  }
  async function aiAction(task) {
    closePopovers();
    if (task === 'settings') return openAiSettings();
    if (aiJob) return;
    const items = selItems().sort((a, b) => doc.strokes.indexOf(a) - doc.strokes.indexOf(b));
    if (!items.length) return toast(tr('tAiNothing'));
    // Typed functions need no AI: a graph straight away.
    if (task === 'plot' && items.every((s) => s.tool === 'text')) {
      const srcs = items.flatMap((s) => s.text.split('\n')).map((l) => WB.mx.plainOf(l).trim()).filter((l) => l && !WB.mx.plotFn(l).error);
      if (srcs.length) return makePlot(items, srcs);
    }
    if (!WB.ai.ready()) return toast(tr('tAiNoKey'), tr('aiSettingsMenu'), openAiSettings, 6000);
    const png = WB.ai.picture(items);
    if (!png) return toast(tr('tAiNothing'));
    const ctrl = new AbortController();
    aiJob = ctrl; aiBtn.classList.add('busy');
    toast(tr('tAiReading'), tr('cancel'), () => ctrl.abort(), 180000);
    let res;
    try { res = await WB.ai.run(task, png, ctrl.signal); }
    catch (e) {
      if (e.name === 'AbortError') $('#toast').classList.remove('on');
      else { console.error('AI', task, e); toast(aiError(e), null, null, 8000); }
      return;
    } finally { aiJob = null; aiBtn.classList.remove('busy'); }
    const still = items.filter((s) => doc.strokes.includes(s));      // the board may have changed while waiting
    const { b, size, color } = inkInfo(still.length ? still : items);
    if (task === 'tidy') {
      const lines = (Array.isArray(res.lines) ? res.lines : []).map((l) => String(l).replace(/\s+$/, '')).filter((l) => l.trim());
      if (!lines.length) return toast(tr('tAiEmpty'));
      const t = { tool: 'text', x: b.x, y: b.y, text: lines.join('\n').slice(0, 20000), font: tools.text.font, size, color, opacity: 1, width: 0, math: true };
      swapIn(still, [t]);
      return toast(tr('tAiTidied'), tr('undo'), undo, 6000);
    }
    if (task === 'solve') {
      const steps = (Array.isArray(res.steps) ? res.steps : []).map((l) => String(l).trim()).filter(Boolean).slice(0, 20);
      const answer = res.answer ? String(res.answer).trim() : '';
      const flat = (l) => l.replace(/\s|\\[,;:!]/g, '');
      const lines = steps.map((l) => '$' + l + '$');
      if (answer && (!steps.length || flat(steps[steps.length - 1]) !== flat(answer))) lines.push('$' + answer + '$');
      if (!lines.length) return toast(tr('tAiEmpty'));
      // The model wrote the working; whether its answer is right is checked here, by putting it back into the problem.
      const sols = Array.isArray(res.solutions) ? res.solutions.filter((v) => v && typeof v === 'object') : [];
      const verdicts = res.plain && sols.length ? sols.map((v) => WB.mx.check(res.plain, v)) : [];
      const verdict = verdicts.includes(false) ? false : verdicts.length && verdicts.every((v) => v === true) ? true : null;
      if (verdict === true) lines[lines.length - 1] += '  ✓';
      if (verdict === false) lines.push('⚠ ' + tr('aiCheckFail'));
      const t = { tool: 'text', x: b.x, y: b.y + b.h + size * 0.5, text: lines.join('\n').slice(0, 20000), font: 'hand', size, color, opacity: 1, width: 0, math: true };
      swapIn([], [t]);
      return toast(tr(verdict === true ? 'tAiChecked' : verdict === false ? 'tAiCheckFailed' : 'tAiSolved'), tr('undo'), undo, verdict === false ? 9000 : 6000);
    }
    if (task === 'plot') {
      const srcs = (Array.isArray(res.functions) ? res.functions : []).filter((f) => f && f.plain)
        .map((f) => (f.name ? String(f.name).trim() + ' = ' : 'y = ') + String(f.plain).trim()).filter((src) => !WB.mx.plotFn(src).error).slice(0, 12);
      if (!srcs.length) return toast(tr('tAiNoFn'));
      return makePlot(still, srcs);
    }
  }

  /* The models a provider offers this key, as the app's own menu under the model field: everything
     when opened from "Show available" (the current one ticked), narrowed down while typing. */
  const models = {};          // provider -> model ids, fetched once per visit
  const modelList = () => models[WB.ai.get().provider];
  let modelMenuAt = 0;        // where the model field was when its list opened
  function openModelMenu(filter) {
    const menu = $('#ai-model-menu'), input = $('#ai-model'), list = modelList() || [], cur = input.value.trim();
    const q = (filter || '').toLowerCase(), shown = q && !list.includes(filter) ? list.filter((m) => m.toLowerCase().includes(q)) : list;
    menu.textContent = '';
    for (const m of shown) {
      const b = document.createElement('button');
      b.className = 'mi'; b.dataset.model = m; b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(m === cur));
      const t = document.createElement('span'); t.textContent = m; b.appendChild(t);
      menu.appendChild(b);
    }
    if (!shown.length) return closeModelMenu();
    const r = input.getBoundingClientRect();
    modelMenuAt = r.top;
    menu.style.minWidth = menu.style.width = r.width + 'px';
    menu.style.left = clamp(r.left, 8, Math.max(8, W - r.width - 8)) + 'px';
    const below = H - r.bottom - 16, above = r.top - 16;
    const room = below >= 180 || below >= above ? below : above;
    menu.style.maxHeight = Math.max(120, Math.min(320, room)) + 'px';
    menu.classList.add('open');
    const h = menu.offsetHeight;
    menu.style.top = (room === below ? r.bottom + 6 : r.top - 6 - h) + 'px';
    input.setAttribute('aria-expanded', 'true');
    const sel = $('.mi[aria-selected="true"]', menu);
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function closeModelMenu() {
    const menu = $('#ai-model-menu');
    if (!menu || !menu.classList.contains('open')) return;
    menu.classList.remove('open');
    $('#ai-model').setAttribute('aria-expanded', 'false');
  }

  /* Settings → AI: provider, key, model (and the server for an OpenAI-compatible one). */
  function initAi() {
    const ai = WB.ai;
    aiMenu.addEventListener('click', (e) => { const b = e.target.closest('[data-ai]'); if (b) aiAction(b.dataset.ai); });
    aiBtn.addEventListener('click', () => {       // after the popover toggle (POPS): place the menu under the button
      const r = aiBtn.getBoundingClientRect(), w = aiMenu.offsetWidth || 220;
      aiMenu.style.left = clamp(r.left + r.width / 2 - w / 2, 8, Math.max(8, W - w - 8)) + 'px';
      aiMenu.style.top = r.bottom + 10 + 'px';
    });
    const sync = () => {
      const c = ai.get(), p = c.provider, P = ai.PROVIDERS[p];
      $$('#ai-provider [role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === p)));
      $('#ai-key').value = c.keys[p] || '';
      $('#ai-model').value = c.models[p] || '';
      $('#ai-model').placeholder = P.model || 'model name';
      $('#ai-base-row').hidden = p !== 'custom';
      $('#ai-base').value = c.baseUrl;
      const link = $('#ai-key-link');
      if (P.keyUrl) link.href = P.keyUrl; else link.removeAttribute('href');
      closeModelMenu();
    };
    $('#ai-provider').addEventListener('click', (e) => { const b = e.target.closest('[data-value]'); if (b) { ai.set({ provider: b.dataset.value }); sync(); } });
    $('#ai-key').addEventListener('input', (e) => ai.setKey(ai.get().provider, e.target.value.trim()));
    $('#ai-model').addEventListener('input', (e) => { ai.setModel(ai.get().provider, e.target.value.trim()); if (modelList()) openModelMenu(e.target.value.trim()); });
    $('#ai-model').addEventListener('focus', () => { if (modelList()) openModelMenu(); });
    $('#ai-model').addEventListener('keydown', (e) => {
      const menu = $('#ai-model-menu');
      if (e.key === 'ArrowDown' && menu.classList.contains('open')) { e.preventDefault(); const b = $('.mi', menu); if (b) b.focus(); }
      else if (e.key === 'Escape' && menu.classList.contains('open')) { e.stopPropagation(); closeModelMenu(); }
    });
    $('#ai-model-menu').addEventListener('keydown', (e) => {
      const items = $$('#ai-model-menu .mi'), i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const j = i + (e.key === 'ArrowDown' ? 1 : -1); if (j < 0) $('#ai-model').focus(); else if (items[j]) items[j].focus(); }
      else if (e.key === 'Escape') { e.stopPropagation(); closeModelMenu(); $('#ai-model').focus(); }
    });
    $('#ai-model-menu').addEventListener('click', (e) => {
      const b = e.target.closest('[data-model]');
      if (!b) return;
      $('#ai-model').value = b.dataset.model; ai.setModel(ai.get().provider, b.dataset.model);
      closeModelMenu();
    });
    // Scrolling the settings moves the field away from its list: close it (unless the field did not actually move).
    $('#settings .sheet').addEventListener('scroll', () => { if (Math.abs($('#ai-model').getBoundingClientRect().top - modelMenuAt) > 2) closeModelMenu(); }, { passive: true });
    $('#ai-base').addEventListener('input', (e) => ai.set({ baseUrl: e.target.value.trim() }));
    $('#ai-list').addEventListener('click', async () => {
      if ($('#ai-model-menu').classList.contains('open')) return closeModelMenu();
      if (modelList()) return openModelMenu();
      const btn = $('#ai-list'), p = ai.get().provider;
      btn.disabled = true; btn.textContent = '…';
      try {
        models[p] = await ai.listModels();
        if (ai.get().provider === p) openModelMenu();
        if (!models[p].length) toast(tr('tAiModels', { n: 0 }));
      } catch (e) { toast(aiError(e), null, null, 6000); }
      finally { btn.disabled = false; btn.textContent = tr('aiListModels'); }
    });
    $('#ai-forget').addEventListener('click', () => { ai.forget(); sync(); toast(tr('tAiForgot')); });
    sync();
    initPlotBar();
  }


  /* ---- Keyboard ------------------------------------------------------ */
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (e.target.id === 'pb-fns') { if (e.key === 'Escape') { closePlotPanel(); e.preventDefault(); } return; }   // typing a graph's functions
    if (e.target === ta) {                      // typing on the board: only Escape and file shortcuts get through
      if (e.key === 'Escape') { commitText(); return; }
      if (!(mod && 'soe'.includes(k))) return;
      commitText();
    }
    const typing = e.target instanceof HTMLInputElement && e.target.type !== 'range';
    if (e.key === 'Escape') { if (plotActive) exitPlot(); closePopovers(); closeSheets(); clearSelection(); if (typing) e.target.blur(); return; }
    if (typing) { if (e.key === 'Enter') e.target.blur(); return; }
    if (mod) {
      if (k === 'a' && !sheetOpen()) {          // select everything
        e.preventDefault(); setTool('select');
        for (const s of doc.strokes) if (s.tool !== 'eraser') selection.add(s);
        return selectionChanged();
      }
      if (k === 'd' && selection.size && !sheetOpen()) { e.preventDefault(); return duplicateSelection(); }
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
    else if (k === 'm') setTool('highlighter');
    else if (k === 'l') setTool('laser');
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
    placeSticker: (text, opt) => placeSticker(text, opt),
    saved: () => { saveTarget = 'gallery'; markSaved(); },
    filesCopy: () => IOS && settings.filesCopy,
    canvasColor: () => canvasColor(),
    toast, report, openSheet, closeSheets,
  });
  initUI();
  initStyleBar();
  initAi();
  WB.onImageReady = invalidate;                             // a picture finished decoding: draw it
  // iPhone and iPad only offer files whose type the system knows, and .whtbd is not one of them,
  // so there the chooser takes any file and the app checks it after choosing.
  if (IOS) $('#file-input').removeAttribute('accept');
  $('#files-copy-row').hidden = !IOS;          // "Save a copy to Files" is for iPhone and iPad only

  /* iPhone and iPad in the browser (not opened from the Home Screen): once, a tip. iOS keeps the
     storage of a Home Screen app far more reliably, and that is where the gallery lives there. */
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (IOS && !standalone && location.protocol.startsWith('http')) {
    let seen = false;
    try { seen = localStorage.getItem('wb.homeTip') === '1'; } catch (e) {}
    if (!seen) setTimeout(() => {
      toast(tr('tHomeTip'), tr('gotIt'), null, 20000);
      try { localStorage.setItem('wb.homeTip', '1'); } catch (e) {}
    }, 4000);
  }
  new ResizeObserver(resize).observe(board);
  window.addEventListener('resize', resize);
  resize();

  /* Bringing back the last board. Until it is in, the board ignores the pen ("Opening your
     board…"): a big PDF's pictures take a moment to read on an iPad, and a stroke drawn on the
     still-empty board would otherwise win, so the next autosave would replace the board for good.
     The pictures are read all at once, in one transaction. */
  let opening = true, openingSaid = false;
  async function restoreBoard() {
    const rev = docRev;
    const saved = await dbGet('board');
    if (!saved || !Array.isArray(saved.strokes)) return;
    const pages = Array.isArray(saved.pages) ? saved.pages : [];
    const holders = pages.filter((p) => p.img).concat(saved.strokes.filter((s) => s.tool === 'image' && s.img));
    const srcs = await dbGetMany(holders.map((h) => h.img));
    holders.forEach((h, i) => { h._key = h.img; delete h.img; if (srcs[i]) h.src = srcs[i]; else delete h.src; });
    saved.strokes = saved.strokes.filter((s) => s.tool !== 'image' || s.src);
    WB.adoptErasers(saved.strokes);                             // an older board's separate eraser strokes
    if (docRev !== rev || doc.strokes.length) return;           // a board was opened meanwhile (from a file, say): keep that
    doc.title = saved.title || 'Untitled'; doc.created = saved.created || Date.now(); doc.strokes = saved.strokes;
    doc.pages = pages;
    savedRoom = typeof saved.room === 'string' ? saved.room : null;
    savedColor = Number.isInteger(saved.roomColor) ? saved.roomColor : null;
    unsaved = saved.unsaved !== false;                           // older autosaves didn't say: assume unsaved
    if (saved.view && saved.view.zoom > 0) Object.assign(view, saved.view);
    titleEl.value = shownTitle();
    invalidate();
  }
  restoreBoard().catch((e) => console.error('restoring the board', e)).finally(() => {
    opening = false; restored = true;
    if (openingSaid) $('#toast').classList.remove('on');
    updateChrome();
  }).then(openShared);
  window.addEventListener('hashchange', openShared);

  /* Installed-app extras (only when served from a web address; skipped for a file opened from disk). */
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});       // offline support
  }
  if ('launchQueue' in window) {                                      // opening a .whtbd file with the installed app
    window.launchQueue.setConsumer(async (p) => {
      if (p.files && p.files.length) await openFile(await p.files[0].getFile(), p.files[0]);
    });
  }

  WB.app = { doc, view, settings, tools, undo, redo, fitView, invalidate, doExport, exp, selection };
})();
