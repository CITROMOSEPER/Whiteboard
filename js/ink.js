/* Handwriting recognition, fully on-device and with no third-party code.

   A small neural network (three convolution layers, two dense layers) reads each character.
   It was trained by the scripts in training/ on public handwriting datasets plus characters
   drawn from fonts; its weights live in js/ink-model.js and are run here in plain JavaScript.

   Around the network:
   - Accents are handled structurally: small strokes above a letter are classified (dot,
     acute, two dots, ...) and combined with the letter underneath, so "o" + two ticks gives "ő".
   - A burst of writing is split into characters by trying the plausible groupings and
     keeping the one the network is most confident about overall.
   - Things shape alone cannot tell (c or C, 0 or o) are settled from size and neighbours.
   - Corrections the user makes are remembered as samples of their own handwriting and win
     over the network when the same shape is written again. */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});
  const hyp = Math.hypot;
  const COST = 0.03;                    // cost of a reading = COST * -ln(probability)
  const REJECT = COST * -Math.log(0.12);   // less likely than 12%: not a character, the ink is left alone
  const LEARNED_MATCH = 0.07;           // how closely writing must match one of the user's own samples

  const SETS = {
    digit: '0123456789',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    latinX: 'ßıȷ',
    punct: '.,;:!?\'"()[]{}/\\|-_+=*<>%&@#~^$€£',
    math: '±×÷·≠≈≡≤≥≪≫∞∝√∫∬∮∑∏∂∇∈∉∋⊂⊃⊆⊇∪∩∅∀∃∄¬∧∨⊕⊗→←↔⇒⇐⇔↦↑↓∠⊥∥°′ℝℕℤℚℂ∴∵∘…ℏ‰',
    greek: 'αβγδεζηθικλμνξπρσςτυφϕχψωϑΓΔΘΛΞΦΨΩ',
    cyr: 'абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ',   // one class per letter; capital or small is decided from size
  };
  /* Extra cost per character group, by alphabet in use. null = not considered at all
     (Latin and Cyrillic share too many shapes to compete). Ties between look-alikes
     (x / × / χ) therefore go to the everyday character. */
  const PRIOR = {
    latin: { digit: 0, lower: 0, upper: 0.003, latinX: 0.004, punct: 0.004, math: 0.012, greek: 0.014, cyr: null },
    cyrillic: { digit: 0, lower: null, upper: null, latinX: null, punct: 0.004, math: 0.012, greek: 0.016, cyr: 0 },
  };
  const SET_OF = {};
  for (const set in SETS) for (const ch of SETS[set]) SET_OF[ch] = set;

  /* Shapes the network cannot tell apart on its own. Their probabilities are pooled, so a
     confident "it is a c or a C" counts as confident; rules below then pick the member. */
  const POOLS = ['cC', 'oO0', 'sS', 'uU', 'vV', 'wW', 'xX', 'zZ', 'kK', 'pP', 'yY', 'mM', 'lI1|ı', '-_', ",'′", '°∘'];
  const POOL_OF = {};
  POOLS.forEach((g, i) => { for (const ch of g) POOL_OF[ch] = i; });

  /* Look-alike groups: offered as alternatives after a conversion. */
  const HOMO = ['xX×χх', 'uU∪μυ', 'n∩ηп', 'vV∨ν√', 'oO0°∘о', 'cC⊂(с', 'l1|Iı', 'eε∈є€', 'aα∝а', 'wWωш', 'pPρр', 'yYγу', 't+τ', 'EΣ∑∈',
    'AΛ∧∀', 'sS5∫', 'zZ2', 'B8β', 'kKκк', 'i!;', '-_−~', ".,'·", 'TΓ⊥', 'D0O', 'hℏ', 'gq9', '6бσ', 'rΓг', 'mMм', 'Hн', '=≡≈', '<≤≪', '>≥≫'];

  /* ---- The network --------------------------------------------------- */
  let net = null, labels = [], SIZE = 32, BOX = 24;

  function loadModel() {
    const M = WB.INK_MODEL;
    if (!M) return false;
    const bin = atob(M.data), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ints = new Int8Array(bytes.buffer);
    net = M.layers.map((L) => {
      const W = new Float32Array(L.n);
      for (let i = 0; i < L.n; i++) W[i] = ints[L.w + i] * L.scale;          // 8-bit weights back to real numbers
      return { k: L.k, cin: L.cin, cout: L.cout, W, B: new Float32Array(bytes.buffer.slice(L.b, L.b + 4 * L.cout)) };
    });
    labels = [...M.labels]; SIZE = M.size; BOX = M.box;
    return true;
  }

  /* 3x3 convolution (zero padded) + ReLU + 2x2 max-pool. Images are stored row by row, channels last. */
  function convBlock(a, h, w, L) {
    const cin = L.cin, cout = L.cout, W = L.W, B = L.B, K = 9 * cin;
    const full = new Float32Array(h * w * cout), patch = new Float32Array(K);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let p = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if (yy < 0 || yy >= h || xx < 0 || xx >= w) { for (let c = 0; c < cin; c++) patch[p++] = 0; }
            else { const s = (yy * w + xx) * cin; for (let c = 0; c < cin; c++) patch[p++] = a[s + c]; }
          }
        }
        const o0 = (y * w + x) * cout;
        for (let o = 0, wi = 0; o < cout; o++) {
          let sum = B[o];
          for (let k = 0; k < K; k++) sum += patch[k] * W[wi++];
          full[o0 + o] = sum > 0 ? sum : 0;
        }
      }
    }
    const h2 = h >> 1, w2 = w >> 1, out = new Float32Array(h2 * w2 * cout);
    for (let y = 0; y < h2; y++) {
      for (let x = 0; x < w2; x++) {
        const a0 = (2 * y * w + 2 * x) * cout, a1 = a0 + cout, a2 = a0 + w * cout, a3 = a2 + cout, o0 = (y * w2 + x) * cout;
        for (let o = 0; o < cout; o++) out[o0 + o] = Math.max(full[a0 + o], full[a1 + o], full[a2 + o], full[a3 + o]);
      }
    }
    return out;
  }
  function dense(a, L, relu) {
    const out = new Float32Array(L.cout), W = L.W, n = L.cin;
    for (let o = 0, wi = 0; o < L.cout; o++) {
      let sum = L.B[o];
      for (let i = 0; i < n; i++) sum += a[i] * W[wi++];
      out[o] = relu && sum < 0 ? 0 : sum;
    }
    return out;
  }
  /* 32x32 image (0..1, ink bright) -> one score per label. */
  function forward(img) {
    let a = img, h = SIZE, w = SIZE;
    for (let i = 0; i < net.length; i++) {
      const L = net[i];
      if (L.k === 'conv') { a = convBlock(a, h, w, L); h >>= 1; w >>= 1; }
      else a = dense(a, L, i < net.length - 1);
    }
    return a;
  }

  /* Draw pen strokes the way the training images look: white on black, cropped to the ink,
     scaled to fit the middle 24x24 of a 32x32 image with proportions kept. */
  const rc = document.createElement('canvas');
  rc.width = rc.height = 32;
  const rx = rc.getContext('2d', { willReadFrequently: true });
  const PEN = 2.3;
  function render(strokes) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) { const b = boxOf(s.points); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    const span = Math.max(x1 - x0, y1 - y0), k = span > 0 ? (BOX - PEN) / span : 1;
    const ox = SIZE / 2 - ((x0 + x1) / 2) * k, oy = SIZE / 2 - ((y0 + y1) / 2) * k;
    rx.setTransform(1, 0, 0, 1, 0, 0);
    rx.fillStyle = '#000'; rx.fillRect(0, 0, SIZE, SIZE);
    rx.strokeStyle = rx.fillStyle = '#fff'; rx.lineWidth = PEN; rx.lineCap = 'round'; rx.lineJoin = 'round';
    for (const s of strokes) {
      const p = s.points;
      rx.beginPath();
      rx.moveTo(p[0] * k + ox, p[1] * k + oy);
      if (p.length === 2) rx.lineTo(p[0] * k + ox + 0.01, p[1] * k + oy);
      for (let i = 2; i < p.length; i += 2) rx.lineTo(p[i] * k + ox, p[i + 1] * k + oy);
      rx.stroke();
    }
    const d = rx.getImageData(0, 0, SIZE, SIZE).data, img = new Float32Array(SIZE * SIZE);
    for (let i = 0; i < img.length; i++) img[i] = d[i * 4] / 255;
    return img;
  }

  /* ---- The user's own samples (point clouds compared by shape) -------- */
  const N = 36;
  function normalise(raw) {
    const n = raw.length / 4;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < raw.length; i += 4) {
      if (raw[i] < x0) x0 = raw[i]; if (raw[i] > x1) x1 = raw[i];
      if (raw[i + 1] < y0) y0 = raw[i + 1]; if (raw[i + 1] > y1) y1 = raw[i + 1];
    }
    const w = x1 - x0, h = y1 - y0, s = Math.max(w, h) || 1, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const c = new Float32Array(raw.length);
    for (let i = 0; i < raw.length; i += 4) { c[i] = (raw[i] - cx) / s; c[i + 1] = (raw[i + 1] - cy) / s; c[i + 2] = raw[i + 2]; c[i + 3] = raw[i + 3]; }
    return { c, n, asp: Math.min(8, Math.max(0.125, (w + s * 0.04) / (h + s * 0.04))) };
  }
  function strokeCloud(strokes) {
    let total = 0;
    const lens = strokes.map((s) => { const p = s.points; let l = 0; for (let i = 2; i < p.length; i += 2) l += hyp(p[i] - p[i - 2], p[i + 1] - p[i - 1]); total += l; return l; });
    const step = total > 0 ? total / N : 1, raw = [];
    strokes.forEach((s, k) => {
      const p = s.points, len = lens[k];
      if (len < step * 0.5) { raw.push(p[0], p[1], 0, 0); return; }          // a dot: one point, no direction
      const count = Math.max(2, Math.round(len / step));
      let seg = 2, acc = 0;
      for (let j = 0; j < count; j++) {
        const target = (len * (j + 0.5)) / count;
        while (seg < p.length - 2 && acc + hyp(p[seg] - p[seg - 2], p[seg + 1] - p[seg - 1]) < target) { acc += hyp(p[seg] - p[seg - 2], p[seg + 1] - p[seg - 1]); seg += 2; }
        const dx = p[seg] - p[seg - 2], dy = p[seg + 1] - p[seg - 1], l = hyp(dx, dy) || 1, t = Math.min(1, Math.max(0, (target - acc) / l));
        const a = Math.max(0, seg - 6), b = Math.min(p.length - 2, seg + 4), wx = p[b] - p[a], wy = p[b + 1] - p[a + 1], wl = hyp(wx, wy) || 1;
        raw.push(p[seg - 2] + dx * t, p[seg - 1] + dy * t, wx / wl, wy / wl);
      }
    });
    return normalise(Float32Array.from(raw));
  }
  function oneWay(a, b) {
    const A = a.c, B = b.c;
    let sum = 0;
    for (let i = 0; i < A.length; i += 4) {
      const ax = A[i], ay = A[i + 1], atx = A[i + 2], aty = A[i + 3], dir = atx !== 0 || aty !== 0;
      let best = 1e9;
      for (let j = 0; j < B.length; j += 4) {
        const dx = ax - B[j], dy = ay - B[j + 1];
        let d = Math.sqrt(dx * dx + dy * dy);
        if (dir && (B[j + 2] !== 0 || B[j + 3] !== 0)) d += 0.1 * (1 - Math.abs(atx * B[j + 2] + aty * B[j + 3]));
        if (d < best) best = d;
      }
      sum += best;
    }
    return sum / a.n;
  }
  const cloudDist = (a, b) => 0.5 * (oneWay(a, b) + oneWay(b, a)) + 0.05 * Math.min(1.5, Math.abs(Math.log(a.asp / b.asp)));

  let learned = [];       // { ch, c, n, asp }
  try {
    learned = (JSON.parse(localStorage.getItem('wb.inkLearned')) || []).map((u) => ({ ch: u.ch, n: u.c.length / 4, asp: u.asp, c: Float32Array.from(u.c) }));
  } catch (e) { learned = []; }

  /* ---- Reading one group of strokes ----------------------------------
     Returns { ranked: [{ ch, cost, learned }] best first, junk: probability it is not one character }. */
  function read(strokes, cloud, script) {
    const P = PRIOR[script] || PRIOR.latin, z = forward(render(strokes)), n = labels.length;
    // Only the labels of the alphabet in use take part.
    let max = -Infinity;
    const on = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const set = SET_OF[labels[i]];
      on[i] = set === undefined || P[set] !== null ? 1 : 0;      // the "junk" label has no set and always takes part
      if (on[i] && z[i] > max) max = z[i];
    }
    let sum = 0;
    const p = new Float32Array(n);
    for (let i = 0; i < n; i++) if (on[i]) { p[i] = Math.exp(z[i] - max); sum += p[i]; }
    const pool = new Float32Array(POOLS.length);
    let junk = 0;
    for (let i = 0; i < n; i++) {
      p[i] /= sum;
      if (SET_OF[labels[i]] === undefined) junk = p[i];
      else if (POOL_OF[labels[i]] !== undefined) pool[POOL_OF[labels[i]]] += p[i];
    }
    const ranked = [];
    for (let i = 0; i < n; i++) {
      const ch = labels[i], set = SET_OF[ch];
      if (!on[i] || set === undefined || p[i] < 0.004) continue;
      // The strongest member of a look-alike pool carries the pool's confidence.
      const g = POOL_OF[ch], conf = g !== undefined ? Math.max(p[i], pool[g] * (p[i] / pool[g] > 0.34 ? 1 : p[i] / pool[g])) : p[i];
      ranked.push({ ch, cost: COST * -Math.log(conf) + P[set], learned: false });
    }
    ranked.sort((a, b) => a.cost - b.cost);
    // One of the user's own samples, if this is clearly the same shape, wins outright.
    let mine = null;
    for (const u of learned) {
      const set = SET_OF[u.ch.normalize('NFD')[0]] || SET_OF[u.ch];
      if (set !== undefined && P[set] === null) continue;
      const c = cloudDist(cloud, u);
      if (c < LEARNED_MATCH && (!mine || c < mine.c)) mine = { c, ch: u.ch };
    }
    if (mine) { junk = 0; ranked.unshift({ ch: mine.ch, cost: 0, learned: true }); }
    return { ranked, junk };
  }

  /* ---- Accents ------------------------------------------------------- */
  function boxOf(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < p.length; i += 2) { if (p[i] < x0) x0 = p[i]; if (p[i] > x1) x1 = p[i]; if (p[i + 1] < y0) y0 = p[i + 1]; if (p[i + 1] > y1) y1 = p[i + 1]; }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, size: Math.max(x1 - x0, y1 - y0) };
  }
  function markKind(p, b, ref) {
    if (b.size < 0.16 * ref) return 'dot';
    const n = p.length, dx = p[n - 2] - p[0], dy = p[n - 1] - p[1], chord = hyp(dx, dy);
    let len = 0;
    for (let i = 2; i < n; i += 2) len += hyp(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    if (chord > 0.82 * len) {                                  // a straight tick
      if (Math.abs(dx) > 3 * Math.abs(dy)) return null;        // flat bars are part of the letter (T, 5, J), not accents
      return dx * dy < 0 || Math.abs(dx) < 0.35 * Math.abs(dy) ? 'acute' : 'grave';   // rising to the right (y grows downward)
    }
    if (chord < 0.3 * len) return 'ring';
    // Bent stroke: which side of the chord does it bulge to, and does it change sides?
    let up = 0, down = 0;
    for (let i = 2; i < n - 2; i += 2) {
      const off = ((p[i] - p[0]) * dy - (p[i + 1] - p[1]) * dx) / (chord || 1) * (dx >= 0 ? 1 : -1);
      if (off > 0.12 * chord) up++; else if (off < -0.12 * chord) down++;
    }
    if (up && down) return 'tilde';
    return up ? 'circ' : 'caron';
  }
  const COMB = { dot: '̇', 'dot+dot': '̈', acute: '́', 'acute+acute': '̋', grave: '̀', circ: '̂', caron: '̌', tilde: '̃', ring: '̊' };
  const VLINE = 'ıl|I1', letter = /\p{L}/u;

  function compose(base, kinds, script) {
    const key = kinds.slice().sort().join('+'), cyr = script === 'cyrillic';
    let comb = COMB[key];
    if (!comb) return null;
    if (VLINE.includes(base) || base === 'і') { base = cyr ? 'і' : 'i'; if (key === 'dot') return base; }   // a stem with a dot is an i
    if (base === 'ȷ' || base === 'j') { base = 'j'; if (key === 'dot') return base; }
    if (!letter.test(base)) return null;
    if (key === 'caron' && 'gGиИуУaA'.includes(base)) comb = '̆';   // breve: ğ, й, ў, ă
    const r = (base + comb).normalize('NFC');
    return [...r].length === 1 ? r : null;
  }

  /* Split a character's strokes into the letter body and accent marks above it. */
  function splitMarks(strokes) {
    if (strokes.length < 2) return null;
    const info = strokes.map((s) => ({ s, b: boxOf(s.points) }));
    const main = info.reduce((a, o) => (o.b.size > a.b.size ? o : a));
    const body = [], kinds = [];
    for (const o of info) {
      let kind = null;
      if (o !== main && o.b.size < 0.5 * main.b.size && (o.b.y0 + o.b.y1) / 2 < main.b.y0 - 0.03 * main.b.size) kind = markKind(o.s.points, o.b, main.b.size);
      if (kind) kinds.push(kind); else body.push(o.s);
    }
    return kinds.length ? { body, kinds } : null;
  }

  /* ---- Context rules -------------------------------------------------
     opts.relH = ink height / font size of the row it joins (absent when it stands alone),
     opts.relBelow = how far it dips below that row's baseline, opts.relMid = vertical centre
     within the line (0..1), opts.prev = the character before it. */
  const SAME = new Set('cosuvwxzkpym' + SETS.cyr);
  function refine(top, cloud, opts) {
    let ch = top.ch;
    if (top.learned) return ch;
    const cyr = opts.script === 'cyrillic', rel = opts.relH, low = ch.toLowerCase(), before = opts.prev || '';
    // "In a number": right after a digit, or after an operator on a line that already has digits (14+7=…).
    const numeric = /\d/.test(before) || (/[+\-=×÷·<>≤≥≠(.,]/.test(before) && /\d/.test(opts.rowText || ''));
    if ('oO0о°∘'.includes(ch)) {
      // In a number it is a zero, next to a letter an o; otherwise go by how narrow it is.
      const tall = numeric ? true : letter.test(before) ? false : cloud.asp < 0.74;
      if (rel == null) return tall ? '0' : cyr ? 'о' : 'o';
      if (rel < 0.34 && opts.relMid < 0.4) return '°';
      if (numeric) return '0';
      if (rel > 0.6) return tall ? '0' : cyr ? 'О' : 'O';
      return cyr ? 'о' : 'o';
    }
    if (VLINE.includes(ch) && cloud.asp < 0.22 && opts.strokes === 1) {
      if (numeric) return '1';
      return letter.test(before) && !cyr ? 'l' : '|';
    }
    if (ch === 'ı') return 'i';
    if (ch === 'ȷ') return 'j';
    if ('-_'.includes(ch)) return rel != null && opts.relMid > 0.82 ? '_' : '-';
    if (",'′".includes(ch)) return rel != null && opts.relMid < 0.45 ? "'" : ',';
    if (SAME.has(low) && low !== ch.toUpperCase()) {
      let upper = false;
      if (rel != null) upper = 'pyру'.includes(low) ? rel > 0.55 && opts.relBelow < 0.08 : rel > 0.6;
      return upper ? low.toUpperCase() : low;
    }
    return ch;
  }

  /* ---- Analysis of one group of strokes, cached ---------------------- */
  const cache = new Map(), ids = new WeakMap();
  let nextId = 1;
  function analyse(strokes, script) {
    const key = script + ':' + strokes.map((s) => { let i = ids.get(s); if (!i) ids.set(s, (i = nextId++)); return i; }).sort((a, b) => a - b).join();
    let a = cache.get(key);
    if (a) return a;
    let travel = 0, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) {
      const p = s.points, b = boxOf(p);
      x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1);
      for (let i = 2; i < p.length; i += 2) travel += hyp(p[i] - p[i - 2], p[i + 1] - p[i - 1]);
    }
    const size = Math.max(x1 - x0, y1 - y0);
    // Far more pen travel than any character needs for its size: a scribble or a drawing, not writing.
    a = { cloud: strokeCloud(strokes), size, reject: travel > 9 * size, whole: [], m: null };
    if (!a.reject) {
      const r = read(strokes, a.cloud, script);
      a.whole = r.ranked;
      a.reject = r.junk > 0.55 || !r.ranked.length;
      a.m = splitMarks(strokes);
      if (a.m) { a.bodyCloud = strokeCloud(a.m.body); a.bodyRank = read(a.m.body, a.bodyCloud, script).ranked; }
    }
    if (cache.size > 400) cache.clear();
    cache.set(key, a);
    return a;
  }

  /* How well a group of strokes reads as ONE character (lower is better). */
  function score(strokes, script, H) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) { const b = boxOf(s.points); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    if (Math.max(x1 - x0, y1 - y0) < 0.14 * H) return 0.01;          // a full stop or comma
    const a = analyse(strokes, script), worst = REJECT + 0.04;
    let c = a.reject || !a.whole.length ? worst : a.whole[0].cost;
    if (a.m && a.bodyRank.length) {                                  // an accented letter is as good as its body
      const r = a.bodyRank.slice(0, 6).find((r) => compose(r.ch, a.m.kinds, script));
      if (r && r.cost < c) c = r.cost;
    }
    return Math.min(c, worst);
  }

  /* ---- Public API ---------------------------------------------------- */
  let ready = false;
  function prepare(done) {
    if (!ready) ready = loadModel();
    if (done) done();
  }

  /* Split what was written into characters, left to right.
     1. Strokes are gathered into pieces that certainly belong together: they overlap
        horizontally (the two strokes of an x, the bars of =), or one is a small mark
        sitting above or below the other (the dot of an i, an accent, the dot of !).
     2. Neighbouring pieces that touch or nearly touch may still be one character written
        in several strokes (the stem and arms of K, the stem and bowl of P). Every way of
        joining such neighbours is tried, and the reading that fits best overall wins. */
  function segment(strokes, script) {
    script = script || 'latin';
    cache.clear();
    const items = strokes.map((s) => ({ s, b: boxOf(s.points) }));
    let H = 0, big = 0;
    for (const o of items) { H = Math.max(H, o.b.h); big = Math.max(big, o.b.size); }
    H = Math.max(H, 0.4 * big, 1e-6);                                  // height of the line of writing
    const floor = 0.08 * H;                                            // an upright stroke still has some "width"
    let atoms = [];
    for (const o of items) {
      const w = Math.max(o.b.w, floor), cx = (o.b.x0 + o.b.x1) / 2, cy = (o.b.y0 + o.b.y1) / 2;
      const hits = atoms.filter((a) => {
        const aw = Math.max(a.x1 - a.x0, floor), acx = (a.x0 + a.x1) / 2;
        const overlap = Math.min(cx + w / 2, acx + aw / 2) - Math.max(cx - w / 2, acx - aw / 2);
        if (overlap >= 0.35 * Math.min(w, aw)) return true;
        if (o.b.size >= 0.4 * Math.max(a.y1 - a.y0, a.x1 - a.x0)) return false;
        const ah = a.y1 - a.y0;
        if (cy < a.y0 + 0.2 * ah) return cx > a.x0 - 0.15 * H && cx < a.x1 + 0.15 * H;   // a mark above
        return cy > a.y1 - 0.05 * ah && cx > a.x0 && cx < a.x1;                          // a mark directly below
      });
      const atom = { strokes: [o.s], x0: o.b.x0, y0: o.b.y0, x1: o.b.x1, y1: o.b.y1 };
      for (const a of hits) {
        atom.strokes = a.strokes.concat(atom.strokes);
        atom.x0 = Math.min(atom.x0, a.x0); atom.y0 = Math.min(atom.y0, a.y0); atom.x1 = Math.max(atom.x1, a.x1); atom.y1 = Math.max(atom.y1, a.y1);
      }
      atoms = atoms.filter((a) => !hits.includes(a));
      atoms.push(atom);
    }
    atoms.sort((a, b) => a.x0 + a.x1 - (b.x0 + b.x1));
    const n = atoms.length;
    if (n === 1) return [atoms[0].strokes];
    // Best way to read atoms[0..i) as characters of 1 to 3 neighbouring pieces each.
    const PER_CHAR = 0.012, MAX = n > 24 ? 1 : 3;
    const best = new Float64Array(n + 1).fill(Infinity), take = new Int8Array(n + 1);
    best[0] = 0;
    for (let i = 1; i <= n; i++) {
      let group = [];
      for (let k = 1; k <= MAX && k <= i; k++) {
        const a = atoms[i - k];
        if (k > 1 && atoms[i - k + 1].x0 - a.x1 > 0.12 * H) break;      // a real gap: these are separate characters
        group = a.strokes.concat(group);
        const c = best[i - k] + score(group, script, H) + PER_CHAR;
        if (c < best[i]) { best[i] = c; take[i] = k; }
      }
    }
    const out = [];
    for (let i = n; i > 0; i -= take[i]) {
      let group = [];
      for (let k = take[i]; k >= 1; k--) group = group.concat(atoms[i - k].strokes);
      out.unshift(group);
    }
    return out;
  }

  /* Recognise one character. opts: { script, px (its size on screen), relH, relBelow, relMid, prev }.
     Returns { ch, alts: [other candidates], cloud } or null when it does not look like a character. */
  function recognize(strokes, opts) {
    if (!ready || !strokes.length) return null;
    const script = opts.script || 'latin';
    let cloud = null;
    const finish = (ch, alts) => ({ ch, alts: [...new Set(alts)].filter((a) => a !== ch).slice(0, 7), cloud });
    if (opts.px < 7) {                                  // a tap or a tiny mark
      cloud = strokeCloud(strokes);
      const ch = opts.relH != null && opts.relMid < 0.6 ? '·' : '.';
      return finish(ch, ['.', ',', '·', "'", ':']);
    }
    const an = analyse(strokes, script);
    cloud = an.cloud;
    const whole = an.whole, m = an.m;
    let ranked = an.reject ? [] : whole, ch = null;
    if (m && an.bodyRank.length) {
      const bodyCloud = an.bodyCloud, bodyRank = an.bodyRank;
      // Capital or small is judged on the letter without its accent.
      let top = Infinity, bottom = -Infinity, bTop = Infinity, bBottom = -Infinity;
      for (const s of strokes) { const b = boxOf(s.points); top = Math.min(top, b.y0); bottom = Math.max(bottom, b.y1); }
      for (const s of m.body) { const b = boxOf(s.points); bTop = Math.min(bTop, b.y0); bBottom = Math.max(bBottom, b.y1); }
      const bodyOpts = { ...opts, script, strokes: m.body.length, relH: opts.relH == null ? null : (opts.relH * (bBottom - bTop)) / Math.max(bottom - top, 1e-9) };
      const composed = [];
      for (const r of bodyRank.slice(0, 6)) {
        const base = refine(r, bodyCloud, bodyOpts);
        const c = compose(letter.test(base) ? base : r.ch.toLowerCase(), m.kinds, script);
        if (c) composed.push({ ch: c, cost: r.cost, learned: false });
      }
      // The network has never seen accented letters, so a letter with marks above it is read
      // as letter + accent unless the whole thing is clearly something else (÷, ;, i, j, =).
      const wholeBest = ranked.length ? ranked[0] : null;
      if (composed.length && !(wholeBest && (wholeBest.learned || (wholeBest.cost < composed[0].cost - 0.01 && !letter.test(wholeBest.ch.normalize('NFD')[0])) || 'ijй'.includes(wholeBest.ch)))) {
        ranked = composed.concat(bodyRank.slice(0, 3)); ch = composed[0].ch;
      }
    }
    if (!ranked.length || ranked[0].cost > REJECT) return null;
    // The character before it settles digit/letter look-alikes that are nearly tied:
    // after a digit prefer the digit reading (5 rather than S), after a letter the letter.
    if (ch === null && !ranked[0].learned && opts.prev) {
      const kind = (c) => (/\d/.test(c) ? 'digit' : letter.test(c) ? 'letter' : '');
      const want = kind(opts.prev), have = kind(ranked[0].ch);
      if (want && have && want !== have) {
        const alt = ranked.find((r) => kind(r.ch) === want && r.cost < ranked[0].cost + 0.02);
        if (alt) ranked = [alt].concat(ranked.filter((r) => r !== alt));
      }
    }
    if (ch === null) ch = refine(ranked[0], cloud, { ...opts, script, strokes: strokes.length });
    const alts = ranked.slice(0, 6).map((r) => r.ch);
    for (const g of HOMO) if (g.includes(ch) || g.includes(ranked[0].ch)) for (const c of g) alts.push(c);
    const P = PRIOR[script] || PRIOR.latin;
    return finish(ch, alts.filter((c) => SET_OF[c] === undefined || P[SET_OF[c]] !== null));
  }

  /* Remember how this user writes `ch` (called when they correct a conversion). */
  function learn(cloud, ch) {
    learned.push({ ch, c: cloud.c, n: cloud.n, asp: cloud.asp });
    if (learned.length > 300) learned.shift();
    cache.clear();
    try {
      localStorage.setItem('wb.inkLearned', JSON.stringify(learned.map((u) => ({ ch: u.ch, asp: +u.asp.toFixed(3), c: Array.from(u.c, (v) => +v.toFixed(3)) }))));
    } catch (e) {}
  }

  WB.ink = {
    prepare, segment, recognize, learn,
    get ready() { return ready; },
    _forward: forward, _render: render, _labels: () => labels, _read: read, _strokeCloud: strokeCloud,
  };
})();
