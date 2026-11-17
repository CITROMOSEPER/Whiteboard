/* Whiteboard: live boards. Everyone who opened the same share link draws on the same board,
   with the changes going straight between the browsers (js/p2p.js).

   Every object gets an id ("<session>.<n>") and a version: a Lamport clock with the session as
   tie-breaker. A change sends the whole object as it is now (in the .whtbd file form, so what
   arrives goes through the same checks as an opened file); the newer version wins, and a deleted
   object leaves a tombstone so an older copy of it can't come back. A newcomer and the people
   already there swap everything they have, and both end up with the newest of each object.
   Pictures travel once each, by fingerprint, when someone is missing one.

   The app tells this module what changed (touch, changed) and gets changes from others through
   its host functions. Undo only ever undoes your own steps: others' changes never enter your
   undo history. Ink in progress is streamed too, so others see a line while it is drawn. */
(function () {
  const WB = window.WB;
  const TINY = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const IMG_RE = /^data:image\/(png|jpeg|webp|gif|bmp);base64,[A-Za-z0-9+/=]+$/;
  const HEX = /^#[0-9a-f]{6}$/i;
  let host = null, room = null, code = '', sid = '', n = 0, clock = 0;
  let vers = new Map();          // id -> { t, p, dead }
  let objs = new Map();          // id -> the object (also ones no longer on the board, so undo can bring them back)
  let known = new Set();         // the objects on the board as last synced
  let seeds = null;              // objects from the share link itself, until the live board arrives
  let metaV = { t: 0, p: '' }, metaSig = '';
  let dirty = new Map(), flushTimer = 0;
  const images = new Map();      // fingerprint -> picture data, for pictures others ask for
  const waiting = new Map();     // fingerprint -> [ops] that wait for that picture
  const asked = new Set();
  const ghosts = new Map();      // peer -> { s, seq, t }: their line in progress
  let ink = null;                // { L, seq, sent }: my line in progress, as streamed
  let inkSeq = 0, inkTime = 0;
  let st = { peers: 0, connecting: 0, trackers: 0, others: false, failed: 0 };
  /* Laser pointer colours: red for whoever started the live board, a different one for each person
     who joined. Each person says their colour when connecting; a newcomer takes the first one nobody
     has, and if two picked the same at once, the one with the larger id picks again. So everyone
     sees each pointer, their own too, in the same colour. */
  const COLORS = ['#ff3b30', '#34c759', '#007aff', '#ff9500', '#af52de', '#ff2d55', '#30b0c7', '#ffcc00', '#5856d6', '#a2845e', '#00c7be', '#8e8e93', '#ff6482'];
  let myColor = null, me = '';
  const colors = new Map();      // peer -> colour number
  let ptr = null, ptrSent = 0, ptrTimer = 0;

  const newer = (a, b) => !b || a.t > b.t || (a.t === b.t && a.p > b.p);
  const doc = () => host.doc;
  function fingerprint(t) { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return 'i' + (h >>> 0).toString(36) + t.length.toString(36); }
  const keyOf = (o) => (o._lkey && o._lsrc === o.src ? o._lkey : ((o._lsrc = o.src), (o._lkey = fingerprint(o.src))));

  function ensureId(s) {
    if (!s.id || typeof s.id !== 'string') s.id = sid + '.' + (++n).toString(36);
    objs.set(s.id, s);
    return s.id;
  }

  /* ---- Joining and leaving ---- */
  async function start(r, opt) {
    stop();
    code = r;
    sid = Math.random().toString(36).slice(2, 10);
    n = 0; clock = 0; vers = new Map(); objs = new Map(); dirty = new Map(); ghosts.clear(); asked.clear(); waiting.clear();
    seeds = opt && opt.seeded ? new Set(doc().strokes) : null;
    myColor = opt && Number.isInteger(opt.color) && opt.color >= 0 && opt.color < COLORS.length ? opt.color : null;
    colors.clear(); ptr = null;
    for (const s of doc().strokes) if (!seeds) { ensureId(s); vers.set(s.id, { t: 0, p: '' }); }
    known = new Set(doc().strokes);
    metaV = { t: 0, p: '' }; metaSig = sig();
    st = { peers: 0, connecting: 0, trackers: 0, others: false, failed: 0 };
    const ice = [];
    const t = host.turn();
    if (t && t.url) ice.push({ urls: t.url.split(/[\s,]+/).filter(Boolean), username: t.username || undefined, credential: t.credential || undefined });
    const my = room = { pending: true };
    let rm;
    try {
      rm = await WB.p2p.join(r, {
        ice,
        onPeer: (id) => { send({ k: 'hello', c: myColor }, id); if (ptr) send({ k: 'ptr', x: ptr.x, y: ptr.y }, id); sendState(id); host.peerJoined(); },
        onLeave: (id) => { ghosts.delete(id); colors.delete(id); host.pointer(id, null); host.peerLeft(); host.requestFrame(); },
        onMessage: (id, m) => { if (room === rm) handle(id, m); },
        onStatus: (s) => { if (room === rm) { st = s; host.status(st); } },
      });
    } catch (e) { if (room === my) room = null; throw e; }
    if (room !== my) { rm.leave(); return; }
    room = rm;
    me = rm.me;
    host.status(st);
  }
  function stop() {
    if (room && room.leave) room.leave();
    room = null; code = ''; seeds = null;
    clearTimeout(flushTimer); dirty.clear(); ghosts.clear(); ink = null;
  }
  const on = () => !!room;

  /* ---- What I changed ---- */
  function touch(list) {
    if (!room) return;
    for (const s of list) {
      if (!s || (seeds && seeds.has(s))) continue;
      const inDoc = doc().strokes.includes(s);
      if (!inDoc && !(s.id && vers.has(s.id) && !vers.get(s.id).dead)) continue;   // never was part of the live board
      ensureId(s);
      dirty.set(s.id, s);
    }
    schedule();
  }
  /* After any change: what was added or taken away, and the board's name and pages. */
  function changed() {
    if (!room) return;
    const now = new Set(doc().strokes), list = [];
    for (const s of now) if (!known.has(s)) list.push(s);
    for (const s of known) if (!now.has(s)) list.push(s);
    known = now;
    touch(list);
    const g = sig();
    if (g !== metaSig) { metaSig = g; metaV = { t: ++clock, p: sid }; send({ k: 'meta', ...metaMsg() }); }
  }
  function schedule() { if (!flushTimer && dirty.size) flushTimer = setTimeout(flush, 40); }
  function flush() {
    flushTimer = 0;
    if (!room || !dirty.size) return;
    const strokes = doc().strokes, ops = [];
    const at = new Map(strokes.map((s, i) => [s, i]));
    for (const [id, s] of dirty) {
      const v = { t: ++clock, p: sid };
      const i = at.get(s);
      if (i == null) { vers.set(id, { ...v, dead: true }); ops.push({ id, t: v.t, p: v.p, dead: 1 }); }
      else {
        vers.set(id, v);
        const prev = i > 0 ? strokes[i - 1] : null;
        ops.push({ id, t: v.t, p: v.p, after: prev && !(seeds && seeds.has(prev)) ? ensureId(prev) : null, s });
      }
    }
    dirty.clear();
    wireAll(ops);
    send({ k: 'ops', ops });
  }
  /* Objects into their file form (pictures by fingerprint), in place on the ops. */
  function wireAll(ops) {
    const live = ops.filter((o) => o.s);
    if (!live.length) return;
    const copies = live.map((o) => (o.s.tool === 'image' ? Object.assign({}, o.s, { src: TINY }) : o.s));
    const file = JSON.parse(WB.serialize({ title: '', created: 0, strokes: copies, pages: [] }, { x: 0, y: 0, zoom: 1 }));
    live.forEach((o, i) => {
      o.o = file.strokes[i];
      if (o.s.tool === 'image') { const k = keyOf(o.s); images.set(k, o.s.src); o.o.img = k; }
      delete o.s;
    });
  }
  function sig() {
    const d = doc();
    return JSON.stringify([d.title, d.pages.map((p) => [p.x, p.y, p.w, p.h, p.src ? keyOf(p) : 0])]);
  }
  function metaMsg() {
    const d = doc();
    return { t: metaV.t, p: metaV.p, title: d.title, pages: d.pages.map((p) => {
      const q = { x: p.x, y: p.y, w: p.w, h: p.h };
      if (p.src) { q.img = keyOf(p); images.set(q.img, p.src); }
      return q;
    }) };
  }
  function send(m, to) { if (room && room.send) room.send(m, to); }

  /* Everything I have, for someone who just connected. */
  function sendState(to) {
    flush();
    const strokes = doc().strokes, items = [];
    strokes.forEach((s, i) => {
      if (seeds && seeds.has(s)) return;
      const id = ensureId(s), v = vers.get(id) || { t: 0, p: '' };
      const prev = i > 0 ? strokes[i - 1] : null;
      items.push({ id, t: v.t, p: v.p, after: prev && !(seeds && seeds.has(prev)) ? ensureId(prev) : null, s });
    });
    for (const [id, v] of vers) if (v.dead) items.push({ id, t: v.t, p: v.p, dead: 1 });
    wireAll(items);
    send({ k: 'state', sid, seeded: !!(seeds && seeds.size), items, meta: metaMsg() }, to);
  }

  /* ---- What others changed ---- */
  function handle(from, m) {
    if (m.k === 'ops' && Array.isArray(m.ops)) { ghosts.delete(from); applyOps(from, m.ops); }
    else if (m.k === 'state' && Array.isArray(m.items)) {
      if (seeds) settleSeeds(m);
      applyOps(from, m.items);
      if (m.meta) applyMeta(from, m.meta);
    } else if (m.k === 'meta') applyMeta(from, m);
    else if (m.k === 'need' && Array.isArray(m.keys)) {
      for (const k of m.keys.slice(0, 500)) { const src = findImage(k); if (src) send({ k: 'img', key: k, src }, from); }
    } else if (m.k === 'img' && typeof m.key === 'string' && typeof m.src === 'string') gotImage(m.key, m.src);
    else if (m.k === 'ink') gotInk(from, m);
    else if (m.k === 'inkEnd') { const g = ghosts.get(from); if (g) g.end = Date.now(); host.requestFrame(); }
    else if (m.k === 'hello') gotColor(from, m.c);
    else if (m.k === 'ptr') {
      if (m.off) host.pointer(from, null);
      else if (isFinite(m.x) && isFinite(m.y) && Math.abs(m.x) < 1e9 && Math.abs(m.y) < 1e9) host.pointer(from, { x: +m.x, y: +m.y, color: colorOf(from) });
    }
  }
  /* The share link's own copy of the board was only there to show something at once. When the
     live board arrives it takes over; if nobody has a live board yet, the copy becomes it (only
     one of two people who both opened the link with nobody else there brings theirs in). */
  function settleSeeds(m) {
    const theirs = m.items.some((it) => it && !it.dead);
    const s = seeds;
    seeds = null;
    if (theirs || (m.seeded && String(m.sid) < sid)) {
      const strokes = doc().strokes;
      for (let i = strokes.length - 1; i >= 0; i--) if (s.has(strokes[i])) { host.unselect(strokes[i]); strokes.splice(i, 1); }
      known = new Set(strokes);
      host.remoteChanged();
    } else {
      for (const o of s) { ensureId(o); vers.set(o.id, { t: 0, p: '' }); }
      touch([...s]);
    }
  }
  function applyOps(from, ops) {
    const strokes = doc().strokes;
    let index = null, touched = false, loads = [];
    const indexOf = (s) => { if (!index) index = new Map(strokes.map((o, i) => [o, i])); return index.get(s); };
    for (const op of ops.slice(0, 100000)) {
      if (!op || typeof op.id !== 'string' || op.id.length > 40 || !(op.t >= 0) || typeof op.p !== 'string') continue;
      const v = { t: +op.t, p: op.p.slice(0, 16) }, cur = vers.get(op.id);
      if (cur && !newer(v, cur)) continue;
      clock = Math.max(clock, v.t);
      const s = objs.get(op.id), at = s ? indexOf(s) : undefined;
      if (op.dead) {
        vers.set(op.id, { ...v, dead: true });
        if (at != null) { strokes.splice(at, 1); host.unselect(s); index = null; touched = true; }
        continue;
      }
      if (!op.o || typeof op.o !== 'object') continue;
      let obj;
      try { obj = WB.normalize({ strokes: [op.o] }).strokes[0]; } catch (e) { obj = null; }
      if (!obj) continue;
      if (obj.tool === 'image') {
        const k = typeof op.o.img === 'string' ? op.o.img : '', src = images.get(k);
        if (!src) { wait(from, k, op); continue; }
        obj.src = src;
        loads.push(obj);
      }
      vers.set(op.id, v);
      obj.id = op.id;
      if (s) { for (const key of Object.keys(s)) delete s[key]; Object.assign(s, obj); if (obj.tool === 'image') loads[loads.length - 1] = s; }
      const target = s || obj;
      objs.set(op.id, target);
      if (at == null) {
        const after = op.after && objs.get(op.after), ai = after ? indexOf(after) : undefined;
        strokes.splice(ai != null ? ai + 1 : strokes.length, 0, target);
        index = null;
      }
      touched = true;
    }
    if (loads.length) WB.loadImages(loads);
    if (touched) { known = new Set(strokes); host.remoteChanged(); }
  }
  function applyMeta(from, m) {
    const v = { t: +m.t || 0, p: String(m.p || '').slice(0, 16) };
    if (!newer(v, metaV) || !Array.isArray(m.pages)) return;
    const pages = [];
    for (const p of m.pages.slice(0, 2000)) {
      if (!p || !(p.w > 0 && p.h > 0) || !isFinite(p.x) || !isFinite(p.y)) continue;
      const q = { x: +p.x, y: +p.y, w: +p.w, h: +p.h };
      if (typeof p.img === 'string') { const src = images.get(p.img); if (!src) { wait(from, p.img, { meta: m }); return; } q.src = src; }
      pages.push(q);
    }
    clock = Math.max(clock, v.t);
    metaV = v;
    const d = doc();
    if (typeof m.title === 'string' && m.title.trim()) d.title = m.title.slice(0, 80);
    d.pages = pages;
    metaSig = sig();
    host.metaChanged();
  }
  /* ---- Pictures ---- */
  function wait(from, k, op) {
    if (!k) return;
    if (!waiting.has(k)) waiting.set(k, []);
    waiting.get(k).push({ from, op });
    if (!asked.has(k)) { asked.add(k); send({ k: 'need', keys: [k] }, from); setTimeout(() => asked.delete(k), 20000); }
  }
  function gotImage(k, src) {
    if (!waiting.has(k) || !IMG_RE.test(src) || src.length > 60e6 || fingerprint(src) !== k) return;
    images.set(k, src);
    const list = waiting.get(k);
    waiting.delete(k);
    for (const w of list) { if (w.op.meta) applyMeta(w.from, w.op.meta); else applyOps(w.from, [w.op]); }
  }
  function findImage(k) {
    if (images.has(k)) return images.get(k);
    const d = doc();
    for (const o of d.strokes.concat(d.pages)) if (o.src && (o.tool === 'image' || !o.tool) && keyOf(o) === k) { images.set(k, o.src); return o.src; }
    return null;
  }

  /* ---- Lines in progress ---- */
  const r2 = (v) => Math.round(v * 100) / 100;
  /* Called every frame with the line being drawn (or null): sends what is new, ~25 times a second. */
  function streamInk(L) {
    if (!room || !st.peers) { ink = null; return; }
    if (!L || L.tool !== 'pen') {
      if (ink) { send({ k: 'inkEnd', n: ink.seq }); ink = null; }
      return;
    }
    const now = performance.now();
    if (ink && ink.L === L && now - inkTime < 40) return;
    inkTime = now;
    const p = L.points;
    if (!ink || ink.L !== L) ink = { L, seq: ++inkSeq, sent: 0 };
    let from = ink.sent;
    if (from > p.length || (from >= 2 && (p[from - 2] !== ink.lx || p[from - 1] !== ink.ly))) from = 0;   // reshaped (snapped): send it all again
    if (from === p.length && from) return;
    const m = { k: 'ink', n: ink.seq, from, pts: Array.from(p.slice(from), r2) };
    if (!from) Object.assign(m, { color: L.color, width: L.width, opacity: L.opacity, hl: !!L.hl, dash: L.dash || null, smooth: !!L.smooth });
    send(m);
    ink.sent = p.length; ink.lx = p[p.length - 2]; ink.ly = p[p.length - 1];
  }
  function gotInk(from, m) {
    if (!Array.isArray(m.pts) || m.pts.length > 200000) return;
    let g = ghosts.get(from);
    if (!m.from) {
      if (!HEX.test(m.color) || !(m.width > 0 && m.width < 5000)) return;
      g = { seq: m.n, s: { tool: 'pen', color: m.color.toLowerCase(), width: +m.width, opacity: Math.min(1, Math.max(0.01, +m.opacity || 1)), hl: !!m.hl, dash: WB.DASHES[m.dash] ? m.dash : undefined, smooth: !!m.smooth, points: [] } };
      ghosts.set(from, g);
    } else if (!g || g.seq !== m.n || g.s.points.length !== m.from) return;
    for (const v of m.pts) if (!isFinite(v)) return;
    g.s.points.push(...m.pts);
    delete g.s._path;
    g.t = Date.now(); g.end = 0;
    host.requestFrame();
  }
  /* Others' lines in progress, to draw over the board. */
  function inkGhosts() {
    const now = Date.now(), out = [];
    for (const [id, g] of ghosts) {
      if ((g.end && now - g.end > 600) || now - g.t > 8000) { ghosts.delete(id); continue; }
      if (g.s.points.length >= 2) out.push(g.s);
    }
    if (ghosts.size) setTimeout(host.requestFrame, 200);
    return out;
  }

  /* ---- Pointer colours ---- */
  function gotColor(from, c) {
    colors.set(from, Number.isInteger(c) && c >= 0 && c < COLORS.length ? c : null);
    const clash = myColor != null && myColor !== 0 && colors.get(from) === myColor && from < me;
    if (myColor == null || clash) pickColor();
  }
  function pickColor() {
    const used = new Set(colors.values());
    let c = 1;
    while (used.has(c) && c < COLORS.length - 1) c++;
    myColor = c;
    send({ k: 'hello', c });
    host.colorChanged(c);
  }
  const colorOf = (id) => { const c = colors.get(id); return COLORS[c == null ? 0 : c]; };
  /* My laser pointer, in board coordinates (null when I'm not pointing), ~30 times a second at most. */
  function pointer(p) {
    if (!room) return;
    if (!p) {
      if (ptr) { ptr = null; clearTimeout(ptrTimer); ptrTimer = 0; send({ k: 'ptr', off: 1 }); }
      return;
    }
    ptr = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
    if (ptrTimer) return;
    const go = () => { ptrTimer = 0; if (ptr) { ptrSent = performance.now(); send({ k: 'ptr', x: ptr.x, y: ptr.y }); } };
    const wait = 33 - (performance.now() - ptrSent);
    if (wait <= 0) go(); else ptrTimer = setTimeout(go, wait);
  }

  WB.live = {
    init(h) { host = h; },
    start, stop, on, touch, changed, streamInk, inkGhosts, pointer,
    /* My pointer colour on the live board (red until I have one). */
    myColor: () => COLORS[myColor == null ? 0 : myColor],
    colorIndex: () => myColor,
    room: () => code,
    status: () => st,
    /* A group number nobody else is likely to pick at the same moment. */
    groupId: () => 1 + Math.floor(Math.random() * 2e9),
  };
})();
