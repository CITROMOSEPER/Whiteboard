/* Colour picker popover (hue slider, saturation/brightness map, numeric fields)
   and the pipette with its magnifying loupe. */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /* ---- Colour maths -------------------------------------------------- */
  function hsv2rgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255); };
    return [f(5), f(3), f(1)];
  }
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
    let h = 0;
    if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx];
  }
  function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    return [rgb2hsv(r * 255, g * 255, b * 255)[0], d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  }
  function hsl2rgb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => { const k = (n + h / 30) % 12; return Math.round((l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255); };
    return [f(0), f(8), f(4)];
  }
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

  /* ---- Markup -------------------------------------------------------- */
  const el = document.createElement('div');
  el.id = 'picker'; el.className = 'glass';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Color picker');
  el.innerHTML =
    '<div class="pk-sv" role="slider" tabindex="0" aria-label="Saturation and brightness"><div class="pk-thumb"></div></div>' +
    '<div class="pk-hue" role="slider" tabindex="0" aria-label="Hue" aria-valuemin="0" aria-valuemax="360"><div class="pk-thumb"></div></div>' +
    '<div class="pk-row">' +
      '<button class="ibtn pk-btn" id="pk-pipette" aria-label="Pick a color from the board" title="Pick a color from the board">' +
        '<svg viewBox="0 0 24 24"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z"/></svg></button>' +
      '<div class="pk-fields"></div>' +
      '<button class="ibtn pk-btn" id="pk-swap" aria-label="Change color format" title="Change color format">' +
        '<svg viewBox="0 0 24 24"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg></button>' +
    '</div>';
  document.body.appendChild(el);
  const sv = el.querySelector('.pk-sv'), hue = el.querySelector('.pk-hue'), fields = el.querySelector('.pk-fields');
  const svThumb = sv.firstChild, hueThumb = hue.firstChild;

  /* ---- State --------------------------------------------------------- */
  const FORMATS = ['hex', 'rgb', 'hsl'];
  let format = 'hex';
  try { const s = localStorage.getItem('wb.pickerFormat'); if (FORMATS.includes(s)) format = s; } catch (e) {}
  let cur = null;                       // { anchor, onChange, onClose }
  let h = 0, s = 0, v = 0;              // hue is kept separately so greys do not lose it
  const hex = () => rgb2hex(...hsv2rgb(h, s, v));

  function buildFields() {
    const names = format === 'hex' ? ['HEX'] : format === 'rgb' ? ['R', 'G', 'B'] : ['H', 'S', 'L'];
    fields.className = 'pk-fields ' + format;
    fields.innerHTML = names.map((n) => `<label><input type="text" inputmode="${format === 'hex' ? 'text' : 'numeric'}" spellcheck="false" autocomplete="off" aria-label="${n}"><span>${n}</span></label>`).join('');
  }
  function render(skipFields) {
    const c = hex(), pure = rgb2hex(...hsv2rgb(h, 1, 1));
    sv.style.setProperty('--hue', pure);
    svThumb.style.left = s * 100 + '%'; svThumb.style.top = (1 - v) * 100 + '%'; svThumb.style.background = c;
    hueThumb.style.left = (h / 360) * 100 + '%'; hueThumb.style.background = pure;
    hue.setAttribute('aria-valuenow', Math.round(h));
    if (skipFields) return;
    const [r, g, b] = hsv2rgb(h, s, v), ins = fields.querySelectorAll('input');
    let vals;
    if (format === 'hex') vals = [c.toUpperCase()];
    else if (format === 'rgb') vals = [r, g, b];
    else { const L = rgb2hsl(r, g, b); vals = [Math.round(s && v ? L[0] : h) % 360, Math.round(L[1] * 100), Math.round(L[2] * 100)]; }
    ins.forEach((inp, i) => { if (document.activeElement !== inp) inp.value = vals[i]; });
  }
  function setRGB(r, g, b) {
    const n = rgb2hsv(r, g, b);
    if (n[1] > 0 && n[2] > 0) h = n[0];
    s = n[1]; v = n[2];
  }
  function emit() { if (cur && cur.onChange) cur.onChange(hex()); }

  /* ---- Dragging the map and the hue slider --------------------------- */
  function drag(target, apply) {
    let on = false;
    const move = (e) => { const r = target.getBoundingClientRect(); apply(clamp((e.clientX - r.left) / r.width, 0, 1), clamp((e.clientY - r.top) / r.height, 0, 1)); render(); emit(); };
    target.addEventListener('pointerdown', (e) => { e.preventDefault(); target.focus({ preventScroll: true }); try { target.setPointerCapture(e.pointerId); } catch (err) {} on = true; target.classList.add('active'); move(e); });
    target.addEventListener('pointermove', (e) => { if (on) move(e); });
    const end = () => { on = false; target.classList.remove('active'); };
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }
  drag(sv, (x, y) => { s = x; v = 1 - y; });
  drag(hue, (x) => { h = Math.min(359.999, x * 360); });
  const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  sv.addEventListener('keydown', (e) => { const a = ARROWS[e.key]; if (!a) return; e.preventDefault(); s = clamp(s + a[0] * 0.02, 0, 1); v = clamp(v + a[1] * 0.02, 0, 1); render(); emit(); });
  hue.addEventListener('keydown', (e) => { const a = ARROWS[e.key]; if (!a) return; e.preventDefault(); h = clamp(h + (a[0] + a[1]) * 3, 0, 359.999); render(); emit(); });

  /* ---- Numeric fields ------------------------------------------------ */
  fields.addEventListener('change', () => {
    const t = [...fields.querySelectorAll('input')].map((i) => i.value.trim());
    if (format === 'hex') {
      let m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(t[0]);
      if (m) { let x = m[1]; if (x.length === 3) x = x.replace(/./g, '$&$&'); setRGB(...hex2rgb('#' + x)); }
    } else {
      const n = t.map(Number);
      if (n.every(isFinite)) {
        if (format === 'rgb') setRGB(...n.map((x) => clamp(Math.round(x), 0, 255)));
        else { const hh = ((n[0] % 360) + 360) % 360; setRGB(...hsl2rgb(hh, clamp(n[1], 0, 100) / 100, clamp(n[2], 0, 100) / 100)); h = hh; }
      }
    }
    if (document.activeElement && fields.contains(document.activeElement)) document.activeElement.blur();
    render(); emit();
  });
  fields.addEventListener('focusin', (e) => { if (e.target.select) e.target.select(); });
  el.querySelector('#pk-swap').addEventListener('click', () => {
    format = FORMATS[(FORMATS.indexOf(format) + 1) % FORMATS.length];
    try { localStorage.setItem('wb.pickerFormat', format); } catch (e) {}
    buildFields(); render();
  });

  /* ---- Open / close -------------------------------------------------- */
  function place() {
    const r = cur.anchor.getBoundingClientRect(), pw = el.offsetWidth, ph = el.offsetHeight, mid = r.left + r.width / 2;
    const x = clamp(mid - pw / 2, 8, Math.max(8, innerWidth - pw - 8));
    let y = r.top - ph - 12, above = true;
    if (y < 8) { y = r.bottom + 12; above = false; }
    y = clamp(y, 8, Math.max(8, innerHeight - ph - 8));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    el.style.transformOrigin = `${mid - x}px ${above ? ph + 12 : -12}px`;   // grow out of the control that opened it
  }
  function open(o) {
    if (cur) close();
    cur = o;
    setRGB(...hex2rgb(o.color)); buildFields(); render();
    place();
    el.classList.add('open');
  }
  function close() {
    if (!cur) return;
    const c = cur; cur = null;
    el.classList.remove('open');
    if (c.onClose) c.onClose();
  }
  document.addEventListener('pointerdown', (e) => {
    if (cur && !pip && !el.contains(e.target) && !cur.anchor.contains(e.target)) close();
  }, true);
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (pip) { e.stopImmediatePropagation(); endPipette(null); }
    else if (cur) { e.stopImmediatePropagation(); close(); }
  }, true);
  window.addEventListener('resize', () => { if (cur) place(); });

  /* ---- Pipette --------------------------------------------------------
     A full-screen layer over a snapshot of the board. The loupe magnifies the pixels
     around the pointer; its ring shows the current colour on the left half and the
     colour under the crosshair on the right. The sample is taken on release. */
  const LOUPE = 148, RING = 12, N = 11;   // loupe diameter and ring width (CSS px), pixels across the lens
  let pip = null;

  function startPipette() {
    if (!cur || !WB.picker.snapshot) return;
    const snap = WB.picker.snapshot();           // { canvas, dpr, background }
    const layer = document.createElement('div');
    layer.id = 'pipette';
    const loupe = document.createElement('canvas');
    const ld = Math.min(window.devicePixelRatio || 1, 3);
    loupe.width = loupe.height = LOUPE * ld;
    layer.appendChild(loupe);
    document.body.appendChild(layer);
    document.body.classList.add('pipetting');
    el.classList.remove('open');
    pip = { snap, layer, loupe, g: loupe.getContext('2d'), ld, sg: snap.canvas.getContext('2d', { willReadFrequently: true }), from: hex(), color: null, down: false };

    const at = (e) => {
      const p = pip, px = clamp(Math.floor(e.clientX * snap.dpr), 0, snap.canvas.width - 1), py = clamp(Math.floor(e.clientY * snap.dpr), 0, snap.canvas.height - 1);
      const d = p.sg.getImageData(px, py, 1, 1).data;
      p.color = rgb2hex(d[0], d[1], d[2]);
      drawLoupe(px, py);
      // Under a finger or pen tip the loupe sits above the contact point so it stays visible.
      let cx = e.clientX, cy = e.clientY;
      if (e.pointerType !== 'mouse') { cy -= LOUPE / 2 + 34; if (cy < LOUPE / 2 + 6) cy = e.clientY + LOUPE / 2 + 34; }
      loupe.style.transform = `translate3d(${cx - LOUPE / 2}px, ${cy - LOUPE / 2}px, 0)`;
      loupe.classList.add('on');
    };
    layer.addEventListener('pointerdown', (e) => { e.preventDefault(); try { layer.setPointerCapture(e.pointerId); } catch (err) {} pip.down = true; at(e); });
    layer.addEventListener('pointermove', (e) => { if (pip && (pip.down || e.pointerType === 'mouse')) at(e); });
    layer.addEventListener('pointerup', (e) => { if (pip && pip.down) { at(e); endPipette(pip.color); } });
    layer.addEventListener('pointercancel', () => endPipette(null));
    layer.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  function drawLoupe(px, py) {
    const { g, ld, snap, from, color } = pip, c = LOUPE / 2, R = c - 1, r = R - RING, cell = (2 * r) / N;
    g.setTransform(ld, 0, 0, ld, 0, 0);
    g.clearRect(0, 0, LOUPE, LOUPE);
    g.save();
    g.beginPath(); g.arc(c, c, r, 0, 2 * Math.PI); g.clip();
    g.fillStyle = snap.background; g.fillRect(0, 0, LOUPE, LOUPE);
    g.imageSmoothingEnabled = false;
    g.drawImage(snap.canvas, px - (N - 1) / 2, py - (N - 1) / 2, N, N, c - r, c - r, 2 * r, 2 * r);
    // Crosshair, with the exact sampled pixel boxed in the middle.
    const a = c - cell / 2, b = c + cell / 2;
    for (const [col, w] of [['rgba(0,0,0,0.45)', 3], ['rgba(255,255,255,0.95)', 1]]) {
      g.strokeStyle = col; g.lineWidth = w;
      g.beginPath();
      g.moveTo(c, c - r); g.lineTo(c, a - 3); g.moveTo(c, b + 3); g.lineTo(c, c + r);
      g.moveTo(c - r, c); g.lineTo(a - 3, c); g.moveTo(b + 3, c); g.lineTo(c + r, c);
      g.stroke();
      g.strokeRect(a - 0.5, a - 0.5, cell + 1, cell + 1);
    }
    g.restore();
    // Ring: left half = colour before picking, right half = colour under the crosshair.
    g.lineWidth = RING;
    g.strokeStyle = from; g.beginPath(); g.arc(c, c, r + RING / 2, Math.PI / 2, Math.PI * 1.5); g.stroke();
    g.strokeStyle = color; g.beginPath(); g.arc(c, c, r + RING / 2, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.arc(c, c, r, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); g.arc(c, c, R - 0.5, 0, 2 * Math.PI); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.arc(c, c, R + 0.5, 0, 2 * Math.PI); g.stroke();
  }

  function endPipette(color) {
    if (!pip) return;
    pip.layer.remove(); pip = null;
    document.body.classList.remove('pipetting');
    if (!cur) return;
    if (color) { setRGB(...hex2rgb(color)); render(); emit(); }
    place();
    el.classList.add('open');
  }
  el.querySelector('#pk-pipette').addEventListener('click', startPipette);

  WB.picker = {
    open,
    close,
    /* Open for this anchor, or close if it is already open for it. */
    toggle(o) { if (cur && cur.anchor === o.anchor) close(); else open(o); },
    get isOpen() { return !!cur; },
    snapshot: null,   // set by the app: () => ({ canvas, dpr, background })
  };
})();
