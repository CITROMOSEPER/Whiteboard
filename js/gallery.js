/* Gallery: the app's own file explorer, confined to one folder named "Whiteboard gallery".

   Where that folder lives:
   - On computers whose browser can work with real folders (Chrome, Edge), the user picks a
     place once (the picker opens in Documents) and "Whiteboard gallery" is created there.
     The choice is remembered. A web page cannot write to Documents without being shown it.
   - Everywhere else (phones, tablets, Firefox, Safari) the gallery lives in the browser's
     own private storage for this app. It works the same but is not visible to other apps.

   Names: what the gallery shows is a board's title or a folder's label, so two entries may
   show the same name. On disk each gets a readable, valid, unique file name derived from it
   ("Lesson 3.whtbd", "Lesson 3 (2).whtbd"). Folder labels that differ from the folder's
   real name are kept in a small ".gallery.json" file beside them. */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});
  const $ = (s, r = document) => r.querySelector(s);
  const tr = (k, v) => WB.t(k, v);
  const DIR_NAME = 'Whiteboard gallery', INDEX = '.gallery.json', EXT = '.whtbd';

  let host = null;        // set by the app: how to read and replace the open board
  let root = null;        // the gallery folder
  let parentName = '';    // the folder that holds it, when known (a folder can only be seen downwards)
  let kind = null;        // 'folder' (a real folder) | 'browser' (private browser storage)
  let path = [];          // folders entered below the root: [{ handle, label }]
  let moving = null;      // { item, from } while choosing a destination
  let saving = false;     // choosing the folder for a board that is not in the gallery yet
  let renameNext = null;  // name of a just-created entry whose label should open for typing
  let pendingSave = false, token = 0;

  /* ---- Small key-value store (remembers the chosen folder) ------------ */
  const dbp = new Promise((res) => {
    try {
      const r = indexedDB.open('whiteboard', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
    } catch (e) { res(null); }
  });
  async function kvGet(k) {
    const d = await dbp;
    if (!d) return null;
    return new Promise((res) => { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(null); });
  }
  async function kvSet(k, v) {
    const d = await dbp;
    if (!d) return;
    // Remembering is best effort: if the browser will not store it, the gallery still works for this visit.
    return new Promise((res) => {
      try { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = t.onerror = t.onabort = () => res(); }
      catch (e) { res(); }
    });
  }

  /* ---- A folder tree kept in the browser's database -------------------
     Used where the browser offers no file storage at all, which is the case for a page opened
     straight from a local file. It imitates the parts of the folder interface the gallery uses,
     so everything else works unchanged. The whole tree is one record, rewritten on each change. */
  let tree = null;
  const flush = () => kvSet('galleryTree', tree);
  const missing = (name) => Object.assign(new Error('"' + name + '" was not found'), { name: 'NotFoundError' });
  class VFile {
    constructor(node, name) { this.node = node; this.name = name; this.kind = 'file'; }
    async getFile() { return new File([this.node.files.get(this.name) || ''], this.name); }
    async createWritable() {
      let data = '';
      return {
        write: async (d) => { data = typeof d === 'string' ? d : await d.text(); },
        close: async () => { this.node.files.set(this.name, data); await flush(); },
      };
    }
  }
  class VDir {
    constructor(node, name) { this.node = node; this.name = name; this.kind = 'directory'; }
    async *entries() {
      for (const [n, d] of this.node.dirs) yield [n, new VDir(d, n)];
      for (const n of this.node.files.keys()) yield [n, new VFile(this.node, n)];
    }
    async *keys() { for (const n of this.node.dirs.keys()) yield n; for (const n of this.node.files.keys()) yield n; }
    async *values() { for await (const [, h] of this.entries()) yield h; }
    async getFileHandle(name, o) {
      if (!this.node.files.has(name)) { if (!(o && o.create)) throw missing(name); this.node.files.set(name, ''); await flush(); }
      return new VFile(this.node, name);
    }
    async getDirectoryHandle(name, o) {
      if (!this.node.dirs.has(name)) { if (!(o && o.create)) throw missing(name); this.node.dirs.set(name, { dirs: new Map(), files: new Map() }); await flush(); }
      return new VDir(this.node.dirs.get(name), name);
    }
    async removeEntry(name) {
      if (!this.node.files.delete(name) && !this.node.dirs.delete(name)) throw missing(name);
      await flush();
    }
    async isSameEntry(o) { return !!o && o.node === this.node; }
    async resolve(o) {                       // the path from here down to `o`, or null when it is not inside
      const find = (n, p) => {
        if (n === o.node) return p;
        for (const [k, d] of n.dirs) { const r = find(d, p.concat(k)); if (r) return r; }
        return null;
      };
      return find(this.node, []);
    }
  }
  async function virtualRoot() {
    const saved = await kvGet('galleryTree');
    tree = saved && saved.dirs instanceof Map ? saved : { dirs: new Map(), files: new Map() };
    return new VDir(tree, DIR_NAME);
  }

  /* ---- Where the gallery lives ---------------------------------------- */
  /* A page opened straight from a local file may show the folder dialog, but the browser then
     refuses to let it change anything that already exists, so real folders are only offered
     when the app runs from a web address or as an installed app. */
  const fromLocalFile = location.protocol === 'file:';
  const canPickFolder = () => typeof window.showDirectoryPicker === 'function' && !fromLocalFile;
  const canUseBrowser = () => typeof indexedDB !== 'undefined';
  /* Folders can be dragged in from the file manager (Chrome and Edge on computers). */
  const canDrop = () => canPickFolder() && typeof DataTransferItem !== 'undefined' && 'getAsFileSystemHandle' in DataTransferItem.prototype;

  async function useBrowser() {
    let dir = null;
    try { dir = await (await navigator.storage.getDirectory()).getDirectoryHandle(DIR_NAME, { create: true }); }
    catch (e) { dir = await virtualRoot(); }      // no file storage here (local file): keep it in the database
    root = dir; kind = 'browser'; path = [];
    await kvSet('galleryDir', { kind: 'browser' });
    return true;
  }
  /* 'ready' | 'setup' (nothing chosen yet) | 'allow' (the folder needs permission again) | 'none' (no storage at all) */
  async function connect(ask) {
    if (root) return 'ready';
    const saved = await kvGet('galleryDir');
    try {
      if (saved && saved.kind === 'folder' && saved.handle) {
        let p = await saved.handle.queryPermission({ mode: 'readwrite' });
        if (p !== 'granted' && ask) p = await saved.handle.requestPermission({ mode: 'readwrite' });
        if (p !== 'granted') return 'allow';
        root = saved.handle; kind = 'folder'; parentName = saved.parent || '';
        return 'ready';
      }
      if ((saved && saved.kind === 'browser') || !canPickFolder()) return canUseBrowser() && (await useBrowser()) ? 'ready' : 'none';
    } catch (e) { return canPickFolder() ? 'setup' : 'none'; }
    return 'setup';
  }

  /* ---- Names ----------------------------------------------------------- */
  /* A label as a valid file or folder name on every system. */
  function clean(label) {
    let s = String(label).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '').slice(0, 80).trim();
    if (!s) s = 'Untitled';
    if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(s)) s += '_';
    return s;
  }
  async function namesIn(dir) {
    const used = new Set();
    for await (const n of dir.keys()) used.add(n.toLowerCase());
    return used;
  }
  /* base + ext, or "base (2)" + ext, ... whichever is free in dir. `keep` is a name that may be reused. */
  async function freeName(dir, base, ext, keep) {
    const used = await namesIn(dir);
    if (keep) used.delete(keep.toLowerCase());
    let name = base + ext;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})${ext}`;
    return name;
  }
  const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();   // Windows and macOS treat these as one file
  const stem = (name) => name.slice(0, -EXT.length);

  /* ---- Files ----------------------------------------------------------- */
  async function writeFile(dir, name, data) {
    const h = await dir.getFileHandle(name, { create: true });
    const w = await h.createWritable();
    await w.write(data); await w.close();
    return h;
  }
  async function copyTree(src, dst) {
    for await (const [n, h] of src.entries()) {
      if (h.kind === 'directory') await copyTree(h, await dst.getDirectoryHandle(n, { create: true }));
      else await writeFile(dst, n, await h.getFile());
    }
  }
  async function readIndex(dir) {
    try { return JSON.parse(await (await (await dir.getFileHandle(INDEX)).getFile()).text()) || {}; } catch (e) { return {}; }
  }
  /* What the index knows about a folder: its label (when it differs from the real name) and its colour. */
  const metaOf = (idx, name) => { const v = idx[name]; return typeof v === 'string' ? { label: v } : v || {}; };
  /* Record a folder's label and colour (meta null = forget it). `oldName` drops the entry of a renamed folder. */
  async function setMeta(dir, name, meta, oldName) {
    const idx = await readIndex(dir), m = {};
    if (oldName) delete idx[oldName];
    if (meta && meta.label && meta.label !== name) m.label = meta.label;
    if (meta && meta.color) m.color = meta.color;
    if (m.color) idx[name] = m; else if (m.label) idx[name] = m.label; else delete idx[name];
    if (Object.keys(idx).length) await writeFile(dir, INDEX, JSON.stringify(idx, null, 1));
    else { try { await dir.removeEntry(INDEX); } catch (e) {} }
  }
  /* Entries of a folder: [{ kind: 'dir' | 'file', name, handle, label, color }], folders first. */
  async function list(dir) {
    const idx = await readIndex(dir), out = [];
    for await (const [name, handle] of dir.entries()) {
      if (handle.kind === 'directory') { const m = metaOf(idx, name); out.push({ kind: 'dir', name, handle, label: m.label || name, color: m.color || '' }); }
      else if (name.toLowerCase().endsWith(EXT)) out.push({ kind: 'file', name, handle, label: stem(name) });
    }
    return out.sort((a, b) => (a.kind === b.kind ? a.label.localeCompare(b.label, undefined, { numeric: true }) : a.kind === 'dir' ? -1 : 1));
  }
  const here = () => (path.length ? path[path.length - 1].handle : root);

  /* ---- Operations ------------------------------------------------------ */
  async function isOpenBoard(dir, name) {
    const r = WB.gallery.ref;
    return !!r && sameName(r.name, name) && (await r.dir.isSameEntry(dir));
  }
  async function rename(dir, item, label) {
    label = label.trim();
    if (!label || label === item.label) return;
    if (item.kind === 'file') {
      const d = WB.parse(await (await item.handle.getFile()).text());
      d.title = label;
      let name = await freeName(dir, clean(label), EXT, item.name);
      if (sameName(name, item.name)) name = item.name;                 // only the letter case changed: keep the file
      await writeFile(dir, name, WB.serialize(d, d.view));
      if (name !== item.name) await dir.removeEntry(item.name);
      if (await isOpenBoard(dir, item.name)) { WB.gallery.ref = { dir, name }; host.retitle(label); }
      return;
    }
    let name = await freeName(dir, clean(label), '', item.name);
    if (sameName(name, item.name)) name = item.name;
    if (name !== item.name) {                                          // folders cannot be renamed in place: copy, then remove
      await copyTree(item.handle, await dir.getDirectoryHandle(name, { create: true }));
      await dir.removeEntry(item.name, { recursive: true });
    }
    await setMeta(dir, name, { label, color: item.color }, item.name);
  }
  async function remove(dir, item) {
    await dir.removeEntry(item.name, { recursive: true });
    if (item.kind === 'dir') await setMeta(dir, item.name, null);
    else if (await isOpenBoard(dir, item.name)) WB.gallery.ref = null;
  }
  async function duplicate(dir, item) {
    const label = tr('gCopy', { t: item.label });
    if (item.kind === 'file') {
      const d = WB.parse(await (await item.handle.getFile()).text());
      d.title = label;
      await writeFile(dir, await freeName(dir, clean(label), EXT), WB.serialize(d, d.view));
    } else {
      const name = await freeName(dir, clean(label), '');
      await copyTree(item.handle, await dir.getDirectoryHandle(name, { create: true }));
      await setMeta(dir, name, { label, color: item.color });
    }
  }
  async function move(item, from, to) {
    if (await from.isSameEntry(to)) return;
    if (item.kind === 'dir' && ((await item.handle.isSameEntry(to)) || (await item.handle.resolve(to)))) return;   // not into itself
    if (item.kind === 'file') {
      const name = await freeName(to, clean(stem(item.name)), EXT), wasOpen = await isOpenBoard(from, item.name);
      await writeFile(to, name, await item.handle.getFile());
      await from.removeEntry(item.name);
      if (wasOpen) WB.gallery.ref = { dir: to, name };
    } else {
      const name = await freeName(to, clean(item.label), '');
      await copyTree(item.handle, await to.getDirectoryHandle(name, { create: true }));
      await from.removeEntry(item.name, { recursive: true });
      await setMeta(from, item.name, null);
      await setMeta(to, name, { label: item.label, color: item.color });
    }
  }

  /* Save the open board into the gallery: over its own file if it came from here, otherwise as a new one. */
  async function save() {
    host.commit();
    const state = await connect(true);
    if (state !== 'ready') { pendingSave = true; return open(); }       // choose the folder first, then the save goes ahead
    pendingSave = false;
    const base = clean(host.title());
    let ref = WB.gallery.ref;
    try { if (ref) await ref.dir.getFileHandle(ref.name); } catch (e) { ref = null; }
    if (ref) {
      // Already in the gallery: save over its file. If the board was renamed since, it becomes
      // a new file next to the old one, which is left as it was.
      const unchanged = sameName(stem(ref.name).replace(/ \(\d+\)$/, ''), base);
      return writeBoard(ref.dir, unchanged ? ref.name : await freeName(ref.dir, base, EXT));
    }
    // Not in the gallery yet. With folders to choose from, ask where it goes; otherwise it goes straight in.
    let folders = false;
    try { for await (const h of root.values()) if (h.kind === 'directory') { folders = true; break; } } catch (e) { return fail(e, 'reading the gallery'); }
    if (!folders) return writeBoard(root, await freeName(root, base, EXT));
    saving = true; moving = null; path = [];
    host.openSheet('#gallery');
    show();
  }
  async function writeBoard(dir, name) {
    try {
      const text = host.serialize(), h = await writeFile(dir, name, text);
      if ((await h.getFile()).size === 0 && text.length) throw new Error('the file is empty after writing');
      WB.gallery.ref = { dir, name };
      if (host.saved) host.saved();
      host.toast(tr('tSavedGallery'));
      if ($('#gallery').classList.contains('open')) show();
    } catch (e) { host.report(tr('tSaveFail'), 'saving to the gallery', e); }
  }

  /* ---- The window ------------------------------------------------------ */
  const FOLDER_ICON = '<svg viewBox="0 0 64 52" aria-hidden="true"><path d="M4 10a6 6 0 0 1 6-6h13.5a6 6 0 0 1 4.6 2.2L31 10h23a6 6 0 0 1 6 6v26a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="currentColor"/><path d="M4 18h56v24a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="#fff" fill-opacity="0.28"/></svg>';
  const FOLDER_COLORS = ['', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#ffcc00', '#ff2d55', '#8e8e93'];   // '' = the default blue
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  async function open() {
    host.commit();
    saving = false;
    host.openSheet('#gallery');
    await show(true);
  }

  /* ---- Drag and drop ---------------------------------------------------
     Pick up a tile by its picture and drop it on a folder, on a step of the path at the top,
     or on the back arrow. With a mouse or pen it lifts as soon as it moves; with a finger it
     lifts after a short press, so that a swipe still scrolls the list. */
  const hyp = Math.hypot;
  let dragging = false, dragged = false;       // dragged: a drag just ended, swallow the click that follows
  document.addEventListener('touchmove', (e) => { if (dragging) e.preventDefault(); }, { passive: false });
  function draggable(icon, tile, item) {
    const ghost = $('#g-ghost');
    let d = null;
    const target = (x, y) => {
      const t = document.elementFromPoint(x, y);
      if (!t) return null;
      const over = t.closest('.g-tile');
      if (over && over !== tile && over._dir) return over;
      const step = t.closest('.g-crumb, #g-back');
      return step && step._dir ? step : null;
    };
    const mark = (t) => { document.querySelectorAll('.drop').forEach((n) => n.classList.remove('drop')); if (t) t.classList.add('drop'); };
    const place = (x, y) => { ghost.style.transform = `translate3d(${x + 14}px, ${y + 14}px, 0)`; mark(target(x, y)); };
    const lift = () => {
      d.on = true; dragging = true;
      try { icon.setPointerCapture(d.id); } catch (e) {}
      ghost.textContent = item.label; ghost.classList.add('on'); tile.classList.add('dragging');
      $('#g-menu').classList.remove('open');
    };
    icon.addEventListener('pointerdown', (e) => {
      if (e.button || moving || saving) return;
      d = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, touch: e.pointerType === 'touch', timer: 0 };
      if (d.touch) d.timer = setTimeout(() => { if (d && !d.on) { lift(); place(d.x, d.y); } }, 380);
    });
    icon.addEventListener('pointermove', (e) => {
      if (!d || e.pointerId !== d.id) return;
      const far = hyp(e.clientX - d.x, e.clientY - d.y) > 8;
      if (!d.on) {
        if (d.touch) { if (far) { clearTimeout(d.timer); d = null; } return; }   // moved before lifting: it is a scroll
        if (!far) return;
        lift();
      }
      place(e.clientX, e.clientY);
    });
    const end = async (e) => {
      if (!d || e.pointerId !== d.id) return;
      const was = d;
      d = null; clearTimeout(was.timer);
      if (!was.on) return;
      dragging = false; ghost.classList.remove('on'); tile.classList.remove('dragging');
      const t = e.type === 'pointerup' ? target(e.clientX, e.clientY) : null;
      mark(null);
      dragged = true; setTimeout(() => { dragged = false; }, 150);
      if (!t) return;
      try { await move(item, here(), t._dir); } catch (err) { fail(err, 'moving'); }
      show();
    };
    icon.addEventListener('pointerup', end);
    icon.addEventListener('pointercancel', end);
  }
  /* Say what went wrong and at which step, in the browser's own words, so a failure is never silent.
     The same line stays visible in the gallery window until something succeeds. */
  let lastError = '';
  function fail(e, step) {
    step = step || 'gallery';
    lastError = `${step}: ${e ? (e.name || 'Error') + (e.message ? ': ' + e.message : '') : 'failed'}`;
    host.report(tr('gError'), step, e);
  }

  /* Draw the current state: setup, permission request, or the folder being browsed. */
  async function show(ask) {
    const my = ++token, grid = $('#g-grid'), msg = $('#g-msg');
    let state;
    try { state = await connect(!!ask); } catch (e) { state = 'setup'; }
    if (my !== token) return;
    const browsing = state === 'ready';
    grid.hidden = !browsing; msg.hidden = browsing;
    $('#g-crumbs').hidden = $('#g-new').hidden = $('#g-new-board').hidden = !browsing;
    const back = $('#g-back');
    back.disabled = !browsing || !path.length;
    back._dir = browsing && path.length ? (path.length > 1 ? path[path.length - 2].handle : root) : null;   // also a drop target
    renderBar(); renderFoot(browsing);
    if (!browsing) {
      msg.textContent = '';
      msg.appendChild(el('p', '', tr(state === 'allow' ? 'gAllow' : state === 'none' ? 'gError' : 'gSetup')));
      if (state === 'setup' && canDrop()) msg.appendChild(el('p', '', tr('gDrop')));
      const row = el('div', 'g-actions');
      if (state === 'allow') row.appendChild(button(tr('gAllowBtn'), 'primary', () => show(true)));
      if (state === 'setup' || state === 'allow') row.appendChild(button(tr(state === 'allow' ? 'gChange' : 'gChoose'), state === 'allow' ? 'pill-btn quiet' : 'primary', pickFolder));
      if (state === 'setup' && canUseBrowser()) row.appendChild(button(tr('gPrivate'), 'pill-btn quiet', async () => { try { await useBrowser(); afterConnect(); } catch (e) { fail(e); } }));
      msg.appendChild(row);
      if (lastError) msg.appendChild(el('p', 'g-error', lastError));
      return;
    }
    // Breadcrumbs
    const crumbs = $('#g-crumbs');
    crumbs.textContent = '';
    [{ label: tr('mGallery') }, ...path].forEach((p, i) => {
      if (i) crumbs.appendChild(el('span', 'g-sep', '›'));
      const b = el('button', i === path.length ? 'g-crumb here' : 'g-crumb', p.label);
      b._dir = p.handle || root;
      b.addEventListener('click', () => { path = path.slice(0, i); show(); });
      crumbs.appendChild(b);
    });
    // Tiles
    let items;
    try { items = await list(here()); }
    catch (e) {
      // The folder is gone or unreadable. Back to the top once; if the gallery folder itself fails, ask for it again.
      fail(e);
      if (path.length) { path = []; return show(); }
      root = null; await kvSet('galleryDir', null);
      return show();
    }
    if (my !== token) return;
    grid.textContent = '';
    if (!items.length) grid.appendChild(el('p', 'g-empty', tr('gEmpty')));
    const files = [];
    for (const item of items) {
      const tile = el('div', 'g-tile'), icon = el('button', 'g-icon'), more = el('button', 'g-more', '⋯'), name = el('button', 'g-name', item.label);
      if (item.kind === 'dir') { icon.innerHTML = FOLDER_ICON; if (item.color) icon.style.color = item.color; tile._dir = item.handle; }
      else files.push({ item, icon, name });
      icon.setAttribute('aria-label', tr('gOpen') + ': ' + item.label);
      icon.addEventListener('click', () => { if (dragged) { dragged = false; return; } openItem(item); });
      draggable(icon, tile, item);
      if (renameNext === item.name) { renameNext = null; setTimeout(() => { if (name.isConnected) editName(item, name); }, 0); }
      name.addEventListener('click', () => editName(item, name));
      more.setAttribute('aria-label', item.label);
      more.addEventListener('click', (e) => { e.stopPropagation(); itemMenu(item, more); });
      tile.addEventListener('contextmenu', (e) => { e.preventDefault(); itemMenu(item, more); });
      tile.append(icon, more, name);
      grid.appendChild(tile);
    }
    // Previews and real titles, one file at a time so a big folder stays responsive.
    for (const f of files) {
      if (my !== token) return;
      try {
        const d = WB.parse(await (await f.item.handle.getFile()).text());
        if (my !== token) return;
        if (d.title && d.title !== 'Untitled') { f.item.label = d.title; if (f.name.isConnected && f.name.tagName === 'BUTTON') f.name.textContent = d.title; }
        f.icon.appendChild(preview(d.strokes));
      } catch (e) { f.icon.classList.add('broken'); }
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  function button(text, cls, fn) { const b = el('button', cls, text); b.addEventListener('click', fn); return b; }

  function preview(strokes) {
    const b = WB.contentBounds(strokes), bg = host.canvasColor();
    let c;
    if (b) {
      const pad = Math.max(b.w, b.h) * 0.08 + 4, box = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
      c = WB.renderToCanvas(strokes, box, Math.min(360 / box.w, 270 / box.h, 4), bg).canvas;
    } else {
      c = document.createElement('canvas'); c.width = 8; c.height = 6;
      const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, 8, 6);
    }
    c.style.background = bg;
    return c;
  }

  function openItem(item) {
    if (item.kind === 'dir') { path.push({ handle: item.handle, label: item.label }); return show(); }
    if (moving || saving) return;
    const dir = here();
    item.handle.getFile().then((f) => f.text()).then((text) => {
      host.closeSheets();
      host.load(text, { dir, name: item.name });
    }).catch(fail);
  }

  /* Rename in place: the name becomes a text field. */
  function editName(item, nameEl) {
    const input = el('input', 'g-name-edit');
    input.type = 'text'; input.value = item.label; input.maxLength = 80; input.spellcheck = false;
    nameEl.replaceWith(input);
    input.focus(); input.select();
    let done = false;
    const finish = async (commit) => {
      if (done) return;
      done = true;
      const dir = here();
      if (commit && input.value.trim() && input.value.trim() !== item.label) { try { await rename(dir, item, input.value); } catch (e) { fail(e); } }
      show();
    };
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  }

  function itemMenu(item, anchor) {
    const menu = $('#g-menu'), dir = here();
    menu.textContent = '';
    const add = (label, fn, danger) => { const b = el('button', 'mi' + (danger ? ' danger' : ''), label); b.addEventListener('click', () => { menu.classList.remove('open'); fn(); }); menu.appendChild(b); };
    add(tr('gOpen'), () => openItem(item));
    add(tr('gRename'), () => { const n = [...document.querySelectorAll('#g-grid .g-name')].find((b) => b.previousSibling === anchor); if (n) editName(item, n); });
    add(tr('gDuplicate'), async () => { try { await duplicate(dir, item); } catch (e) { fail(e); } show(); });
    add(tr('gMove'), () => { moving = { item, from: dir }; renderBar(); });
    add(tr('delete'), () => { renderBar({ ask: tr('gDeleteAsk', { t: item.label }), yes: tr('delete'), danger: true, run: async () => { try { await remove(dir, item); } catch (e) { fail(e); } show(); } }); }, true);
    if (item.kind === 'dir') {                                         // folder colour
      const row = el('div', 'g-colors');
      for (const c of FOLDER_COLORS) {
        const b = el('button', 'swatch');
        b.style.setProperty('--c', c || 'var(--accent)');
        b.setAttribute('aria-checked', String((item.color || '') === c));
        b.setAttribute('aria-label', c || 'blue');
        b.addEventListener('click', async () => {
          menu.classList.remove('open');
          try { await setMeta(dir, item.name, { label: item.label, color: c }); } catch (e) { fail(e, 'colouring'); }
          show();
        });
        row.appendChild(b);
      }
      menu.appendChild(row);
    }
    const r = anchor.getBoundingClientRect();
    menu.classList.add('open');
    menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
    menu.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - menu.offsetHeight - 8)) + 'px';
  }

  /* The strip at the bottom: asks before deleting, or shows where a move is going. */
  function renderBar(confirm) {
    const bar = $('#g-bar');
    bar.textContent = '';
    if (confirm) {
      bar.appendChild(el('span', '', confirm.ask));
      bar.appendChild(button(tr('cancel'), 'pill-btn quiet', () => renderBar()));
      bar.appendChild(button(confirm.yes, 'pill-btn' + (confirm.danger ? ' danger' : ''), () => { renderBar(); confirm.run(); }));
    } else if (saving) {
      bar.appendChild(el('span', '', tr('gSaving', { t: host.title() })));
      bar.appendChild(button(tr('cancel'), 'pill-btn quiet', () => { saving = false; host.closeSheets(); }));
      bar.appendChild(button(tr('gSaveHere'), 'pill-btn', async () => {
        saving = false;
        const dir = here();
        host.closeSheets();
        writeBoard(dir, await freeName(dir, clean(host.title()), EXT));
      }));
    } else if (moving) {
      bar.appendChild(el('span', '', tr('gMoving', { t: moving.item.label })));
      bar.appendChild(button(tr('cancel'), 'pill-btn quiet', () => { moving = null; renderBar(); }));
      bar.appendChild(button(tr('gMoveHere'), 'pill-btn', async () => {
        const m = moving; moving = null;
        try { await move(m.item, m.from, here()); } catch (e) { fail(e); }
        show();
      }));
    }
    bar.hidden = !bar.childNodes.length;
  }
  function renderFoot(browsing) {
    const foot = $('#g-foot');
    foot.textContent = '';
    if (!browsing) return;
    foot.appendChild(el('span', '', kind === 'browser' ? tr(fromLocalFile ? 'gLocalNote' : 'gBrowserNote') + (canDrop() ? ' ' + tr('gDropShort') : '') : parentName));
    if (canPickFolder()) foot.appendChild(button(tr(kind === 'browser' ? 'gChoose' : 'gChange'), 'g-link', pickFolder));
  }
  /* Choose the gallery folder, checking each step so that a failure names the step that failed. */
  async function pickFolder() {
    let step = 'folder dialog';
    try {
      const picked = await window.showDirectoryPicker({ id: 'whiteboard-gallery', mode: 'readwrite', startIn: 'documents' });
      step = 'permission to change files in "' + picked.name + '"';
      if ((await picked.queryPermission({ mode: 'readwrite' })) !== 'granted') {
        throw Object.assign(new Error('the browser did not grant it'), { name: 'NotAllowedError' });
      }
      step = 'creating the folder "' + DIR_NAME + '"';
      const dir = picked.name === DIR_NAME ? picked : await picked.getDirectoryHandle(DIR_NAME, { create: true });
      step = 'writing a test file in the folder';
      await writeFile(dir, '.gallery-test', 'ok');
      step = 'removing the test file';
      await dir.removeEntry('.gallery-test');
      root = dir; kind = 'folder'; path = [];
      parentName = dir === picked ? '' : picked.name;          // picked "Whiteboard gallery" itself: its parent is not visible
      step = 'remembering the folder';
      await kvSet('galleryDir', { kind: 'folder', handle: root, parent: parentName });
    } catch (e) {
      if (e && e.name === 'AbortError') {
        // Either a real cancel, or the browser cancelled by itself (it does on some systems even
        // after a folder was chosen). Dragging the folder in works without the dialog.
        lastError = tr('gPickAbort');
        return show();
      }
      fail(e, step);
      return show();
    }
    lastError = '';
    WB.gallery.ref = null;
    afterConnect();
  }
  /* A folder dragged in from the file manager becomes the gallery itself. This needs no folder
     dialog, which some systems' browsers cancel no matter what is chosen. Editing it still needs
     the browser's permission; that question can only be asked right after a click, so when the
     drop alone cannot ask, the gallery shows its Allow button and asks on that click. */
  async function useFolder(handle) {
    host.commit();
    lastError = '';
    try {
      await kvSet('galleryDir', { kind: 'folder', handle });
      root = null; path = []; parentName = ''; WB.gallery.ref = null;
      let p = await handle.queryPermission({ mode: 'readwrite' });
      if (p !== 'granted') { try { p = await handle.requestPermission({ mode: 'readwrite' }); } catch (e) { /* needs a click: the Allow button asks */ } }
      if (p === 'granted') {
        await writeFile(handle, '.gallery-test', 'ok');
        await handle.removeEntry('.gallery-test');
        root = handle; kind = 'folder';
      }
    } catch (e) { fail(e, 'using the folder "' + handle.name + '"'); }
    if (!$('#gallery').classList.contains('open')) host.openSheet('#gallery');
    if (root) afterConnect(); else show();
  }
  function afterConnect() {
    if (pendingSave) { host.closeSheets(); return save(); }
    show();
  }

  function init(h) {
    host = h;
    // New folder / new board: created in the folder being shown, with the name ready to be typed over.
    $('#g-new').addEventListener('click', async () => {
      const dir = here(), label = tr('gNewFolder');
      try {
        const name = await freeName(dir, clean(label), '');
        await dir.getDirectoryHandle(name, { create: true });
        await setMeta(dir, name, { label });
        renameNext = name;
      } catch (e) { fail(e, 'creating a folder'); }
      show();
    });
    $('#g-new-board').addEventListener('click', async () => {
      const dir = here(), label = tr('untitled');
      try {
        const name = await freeName(dir, clean(label), EXT);
        await writeFile(dir, name, WB.serialize({ title: 'Untitled', created: Date.now(), strokes: [] }, { x: 0, y: 0, zoom: 1 }));
        renameNext = name;
      } catch (e) { fail(e, 'creating a board'); }
      show();
    });
    $('#g-back').addEventListener('click', () => { if (path.length) { path.pop(); show(); } });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('#g-menu, .g-more')) $('#g-menu').classList.remove('open'); }, true);
    $('#g-grid').addEventListener('scroll', () => $('#g-menu').classList.remove('open'), { passive: true });
  }

  WB.gallery = { init, open, save, useFolder, canDrop, ref: null, /* the open board's file in the gallery: { dir, name } */ _clean: clean, _state: () => ({ kind, root: root && root.name, path: path.map((p) => p.label) }) };
})();
