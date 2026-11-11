/* Handwriting recognition, fully on-device.

   How it works: every supported character is drawn with a few fonts (two handwriting-style,
   one plain), thinned to its centre line and stored as a small cloud of points with stroke
   directions. Something the user writes is reduced to the same kind of cloud and compared
   with all of them; the closest shape wins. Accents are handled structurally: small strokes
   above a letter are classified (dot, acute, two dots, ...) and combined with the letter
   underneath, so "o" + two ticks gives "ő" without needing a separate template.
   Corrections the user makes are remembered as extra templates of their own handwriting. */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});
  const hyp = Math.hypot;
  const N = 36;          // points per template cloud
  const G = 72;          // glyph raster size (px)
  const REJECT = 0.11;   // worse than this is "not a character": the ink is left alone

  const SETS = {
    digit: '0123456789',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    latinX: 'ßıȷ',
    punct: '.,;:!?\'"()[]{}/\\|-_+=*<>%&@#~^$€£',
    math: '±×÷·≠≈≡≤≥≪≫∞∝√∫∬∮∑∏∂∇∈∉∋⊂⊃⊆⊇∪∩∅∀∃∄¬∧∨⊕⊗→←↔⇒⇐⇔↦↑↓∠⊥∥°′ℝℕℤℚℂ∴∵∘…ℏ‰',
    greek: 'αβγδεζηθικλμνξπρσςτυφϕχψωϑΓΔΘΛΞΦΨΩ',
    cyrL: 'абвгдежзийклмнопрстуфхцчшщъыьэюяёєіїґ',
    cyrU: 'АБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯЁЄІЇҐ',
  };
  /* Extra cost per character group, by alphabet in use. null = not considered at all.
     Ties between look-alikes (x / × / χ) therefore go to the everyday character. */
  const PRIOR = {
    latin: { digit: 0, lower: 0, upper: 0.004, latinX: 0.004, punct: 0.004, math: 0.012, greek: 0.014, cyrL: null, cyrU: null, user: 0 },
    cyrillic: { digit: 0, lower: 0.02, upper: 0.024, latinX: null, punct: 0.004, math: 0.012, greek: 0.016, cyrL: 0, cyrU: 0.004, user: 0 },
  };
  /* Reference writing styles (Windows names first, then Apple equivalents). The more varied
     these are, the better an unfamiliar hand is matched; identical results are stored once. */
  const FONTS = [
    '"Segoe Print", "Bradley Hand", "Chalkboard SE", cursive',
    '"Ink Free", "Noteworthy", cursive',
    '"Comic Sans MS", "Comic Sans", "Chalkboard", cursive',
    '"MV Boli", "Marker Felt", cursive',
    '"Segoe Script", "Snell Roundhand", cursive',
    '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif',
  ];

  /* Look-alike groups: offered as alternatives after a conversion. */
  const HOMO = ['xX×χх', 'uU∪μυ', 'n∩ηп', 'vV∨ν√', 'oO0°∘оО', 'cC⊂(сС', 'l1|Iı', 'eε∈є€', 'aα∝а', 'wWωшШ', 'pPρрР', 'yYγуУ', 't+τ', 'EΣ∑∈Е',
    'AΛ∧∀', 'sS5∫', 'zZ2', 'B8β', 'kKκк', 'i!;', '-_−~', ".,'·", 'TΓ⊥', 'DО0', 'hℏ', 'gq9', '6бσ', 'rΓг', 'mMм', 'HНн', 'CС⊂', '=≡≈', '<≤≪', '>≥≫'];

  /* ---- Glyph -> centre-line cloud ------------------------------------ */
  const gc = document.createElement('canvas');
  gc.width = gc.height = G;
  const gx = gc.getContext('2d', { willReadFrequently: true });

  function thin(m) {   // Zhang–Suen thinning, in place
    const del = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let pass = 0; pass < 2; pass++) {
        del.length = 0;
        for (let y = 1; y < G - 1; y++) {
          for (let x = 1, i = y * G + 1; x < G - 1; x++, i++) {
            if (!m[i]) continue;
            const p2 = m[i - G], p3 = m[i - G + 1], p4 = m[i + 1], p5 = m[i + G + 1], p6 = m[i + G], p7 = m[i + G - 1], p8 = m[i - 1], p9 = m[i - G - 1];
            const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
            if (B < 2 || B > 6) continue;
            const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
            if (A !== 1) continue;
            if (pass === 0 ? (p2 * p4 * p6 === 0 && p4 * p6 * p8 === 0) : (p2 * p4 * p8 === 0 && p2 * p6 * p8 === 0)) del.push(i);
          }
        }
        if (del.length) { changed = true; for (const i of del) m[i] = 0; }
      }
    }
  }

  /* Build a normalised cloud {c:[x,y,tx,ty,...], n, asp} from raw points with tangents. */
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

  function glyphCloud(ch, font) {
    gx.clearRect(0, 0, G, G);
    gx.font = `${G * 0.5}px ${font}`;
    gx.textAlign = 'center'; gx.textBaseline = 'alphabetic'; gx.fillStyle = '#000';
    gx.fillText(ch, G / 2, G * 0.68);
    const d = gx.getImageData(0, 0, G, G).data, m = new Uint8Array(G * G);
    let any = 0;
    for (let i = 0; i < m.length; i++) if (d[i * 4 + 3] > 100) { m[i] = 1; any++; }
    if (!any) return null;
    thin(m);
    const px = [];
    for (let i = 0; i < m.length; i++) if (m[i]) px.push(i % G, (i / G) | 0);
    const M = px.length / 2;
    if (!M) return null;
    // Farthest-point sampling: N points spread evenly over the skeleton.
    const sel = [0], dmin = new Float32Array(M).fill(1e9);
    for (let k = 1; k < N; k++) {
      const lx = px[2 * sel[k - 1]], ly = px[2 * sel[k - 1] + 1];
      let best = 0, bd = -1;
      for (let j = 0; j < M; j++) {
        const dd = (px[2 * j] - lx) ** 2 + (px[2 * j + 1] - ly) ** 2;
        if (dd < dmin[j]) dmin[j] = dd;
        if (dmin[j] > bd) { bd = dmin[j]; best = j; }
      }
      sel.push(best);
    }
    // Stroke direction at each point, from the neighbouring skeleton pixels.
    const raw = new Float32Array(N * 4);
    for (let k = 0; k < N; k++) {
      const x = px[2 * sel[k]], y = px[2 * sel[k] + 1];
      let sxx = 0, syy = 0, sxy = 0, cnt = 0;
      for (let j = 0; j < M; j++) {
        const dx = px[2 * j] - x, dy = px[2 * j + 1] - y;
        if (dx * dx + dy * dy > 12.5) continue;
        sxx += dx * dx; syy += dy * dy; sxy += dx * dy; cnt++;
      }
      let tx = 0, ty = 0;
      if (cnt > 2) { const a = 0.5 * Math.atan2(2 * sxy, sxx - syy); tx = Math.cos(a); ty = Math.sin(a); }
      raw[4 * k] = x; raw[4 * k + 1] = y; raw[4 * k + 2] = tx; raw[4 * k + 3] = ty;
    }
    return normalise(raw);
  }

  /* ---- Pen strokes -> cloud ------------------------------------------ */
  function strokeCloud(strokes) {
    let total = 0;
    const lens = strokes.map((s) => { const p = s.points; let l = 0; for (let i = 2; i < p.length; i += 2) l += hyp(p[i] - p[i - 2], p[i + 1] - p[i - 1]); total += l; return l; });
    const step = total > 0 ? total / N : 1, raw = [];
    strokes.forEach((s, k) => {
      const p = s.points, len = lens[k];
      if (len < step * 0.5) {                 // a dot (or nearly): one point, no direction
        raw.push(p[0], p[1], 0, 0);
        return;
      }
      const count = Math.max(2, Math.round(len / step));
      let seg = 2, acc = 0;
      for (let j = 0; j < count; j++) {
        const target = (len * (j + 0.5)) / count;
        while (seg < p.length - 2 && acc + hyp(p[seg] - p[seg - 2], p[seg + 1] - p[seg - 1]) < target) { acc += hyp(p[seg] - p[seg - 2], p[seg + 1] - p[seg - 1]); seg += 2; }
        const dx = p[seg] - p[seg - 2], dy = p[seg + 1] - p[seg - 1], l = hyp(dx, dy) || 1, t = Math.min(1, Math.max(0, (target - acc) / l));
        // direction from a slightly wider window, so pen jitter does not dominate
        const a = Math.max(0, seg - 6), b = Math.min(p.length - 2, seg + 4), wx = p[b] - p[a], wy = p[b + 1] - p[a + 1], wl = hyp(wx, wy) || 1;
        raw.push(p[seg - 2] + dx * t, p[seg - 1] + dy * t, wx / wl, wy / wl);
      }
    });
    return normalise(Float32Array.from(raw));
  }

  /* ---- Matching ------------------------------------------------------ */
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
  const cost = (a, b) => 0.5 * (oneWay(a, b) + oneWay(b, a)) + 0.05 * Math.min(1.5, Math.abs(Math.log(a.asp / b.asp)));

  const templates = [];   // { ch, set, c, n, asp }
  let learned = [];       // the user's own corrections: { ch, c, n, asp }
  try {
    learned = (JSON.parse(localStorage.getItem('wb.inkLearned')) || []).map((u) => ({ ch: u.ch, n: u.c.length / 4, asp: u.asp, c: Float32Array.from(u.c) }));
  } catch (e) { learned = []; }

  /* All characters ranked by closeness: [{ ch, cost, learned }], best first. */
  function classify(cloud, script) {
    const P = PRIOR[script] || PRIOR.latin, best = new Map();
    const offer = (ch, c, isLearned) => { const o = best.get(ch); if (!o || c < o.cost) best.set(ch, { ch, cost: c, learned: isLearned }); };
    let lead = Infinity;
    for (const t of templates) {
      const p = P[t.set];
      if (p === null || p === undefined) continue;
      // Skip shapes that cannot end up near the top: very different proportions, or already far off one way.
      const asp = 0.05 * Math.min(1.5, Math.abs(Math.log(cloud.asp / t.asp)));
      if (asp > 0.05) continue;
      const ab = oneWay(cloud, t);
      if (0.5 * ab + asp + p > lead + 0.05) continue;
      const c = 0.5 * (ab + oneWay(t, cloud)) + asp + p;
      if (c < lead) lead = c;
      offer(t.ch, c, false);
    }
    for (const u of learned) offer(u.ch, cost(cloud, u) * 0.8 - 0.004, true);
    return [...best.values()].sort((a, b) => a.cost - b.cost);
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
     Things shape alone cannot tell: capital or small (c/C), 0 or o, comma or apostrophe.
     opts.relH = ink height / font size of the row it joins (absent when it stands alone),
     opts.relBelow = how far it dips below that row's baseline, opts.relMid = vertical centre within the line (0..1). */
  const SAME = new Set('cosuvwxzkpy' + 'вгджзийклмнопрстхцчшщъыьэюяєґ');
  function refine(top, cloud, opts) {
    let ch = top.ch;
    if (top.learned) return ch;
    const cyr = opts.script === 'cyrillic', rel = opts.relH, low = ch.toLowerCase();
    if ('oO0оО°∘'.includes(ch)) {
      const tall = cloud.asp < 0.74;
      if (rel == null) return tall ? '0' : cyr ? 'о' : 'o';
      if (rel < 0.34 && opts.relMid < 0.4) return '°';
      if (rel > 0.6) return tall ? '0' : cyr ? 'О' : 'O';
      return cyr ? 'о' : 'o';
    }
    if (VLINE.includes(ch) && cloud.asp < 0.22 && opts.strokes === 1) {
      const prev = opts.prev || '';
      if (/\d/.test(prev)) return '1';
      return letter.test(prev) ? 'l' : '|';
    }
    if ('-_−'.includes(ch)) return rel != null && opts.relMid > 0.82 ? '_' : '-';
    if (",'′`".includes(ch)) return rel != null && opts.relMid < 0.45 ? "'" : ',';
    if (SAME.has(low) && low !== ch.toUpperCase()) {
      let upper = false;
      if (rel != null) upper = 'pyру'.includes(low) ? rel > 0.55 && opts.relBelow < 0.08 : rel > 0.6;
      return upper ? ch.toUpperCase() : low;
    }
    return ch;
  }

  /* ---- Public API ---------------------------------------------------- */
  let ready = false, building = false;
  const waiting = [];

  /* Build the templates in small batches so the app never stalls. */
  function prepare(done) {
    if (ready) return done && done();
    if (done) waiting.push(done);
    if (building) return;
    building = true;
    const jobs = [];
    for (const set in SETS) for (const ch of SETS[set]) for (const font of FONTS) jobs.push([ch, set, font]);
    const seen = new Set();
    let i = 0;
    (function batch() {
      const until = performance.now() + 12;
      while (i < jobs.length && performance.now() < until) {
        const [ch, set, font] = jobs[i++], c = glyphCloud(ch, font);
        if (!c) continue;
        const key = ch + Array.from(c.c.subarray(0, 24), (v) => v.toFixed(2)).join();   // same glyph from a fallback font
        if (seen.has(key)) continue;
        seen.add(key);
        c.ch = ch; c.set = set; templates.push(c);
      }
      if (i < jobs.length) return setTimeout(batch, 0);
      ready = true; building = false;
      waiting.splice(0).forEach((f) => f());
    })();
  }

  /* Everything worked out about one group of strokes, kept so that trying a grouping
     while splitting and then reading it for real does the matching only once. */
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
    a = { cloud: strokeCloud(strokes), size, scribble: travel > 9 * size, whole: [], m: null };
    if (!a.scribble) {
      a.whole = classify(a.cloud, script);
      a.m = splitMarks(strokes);
      if (a.m) { a.bodyCloud = strokeCloud(a.m.body); a.bodyRank = classify(a.bodyCloud, script); }
    }
    if (cache.size > 400) cache.clear();
    cache.set(key, a);
    return a;
  }

  /* How well a group of strokes reads as ONE character (lower is better). */
  function score(strokes, script, H) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of strokes) { const b = boxOf(s.points); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
    if (Math.max(x1 - x0, y1 - y0) < 0.14 * H) return 0.03;          // a full stop or comma
    const a = analyse(strokes, script);
    if (a.scribble || !a.whole.length) return REJECT + 0.04;
    let c = a.whole[0].cost;
    if (a.m) {
      const r = a.bodyRank.slice(0, 6).find((r) => compose(r.ch, a.m.kinds, script));
      if (r && r.cost < c - 0.008) c = r.cost;
    }
    return Math.min(c, REJECT + 0.04);
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
    const PER_CHAR = 0.015, MAX = n > 24 ? 1 : 3;
    const best = new Float64Array(n + 1).fill(Infinity), take = new Int8Array(n + 1);
    best[0] = 0;
    for (let i = 1; i <= n; i++) {
      let group = [];
      for (let k = 1; k <= MAX && k <= i; k++) {
        const a = atoms[i - k];
        if (k > 1 && atoms[i - k + 1].x0 - a.x1 > 0.08 * H) break;      // a real gap: these are separate characters
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
    if (an.scribble || !an.whole.length) return null;
    cloud = an.cloud;
    const whole = an.whole, m = an.m;
    let ranked = whole, ch = null;
    if (m) {
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
      if (composed.length && composed[0].cost < whole[0].cost - 0.008 && !whole[0].learned) { ranked = composed.concat(bodyRank.slice(0, 3)); ch = composed[0].ch; }
    }
    if (!ranked.length || ranked[0].cost > REJECT) return null;
    if (ch === null) ch = refine(ranked[0], cloud, { ...opts, script, strokes: strokes.length });
    const alts = ranked.slice(0, 6).map((r) => r.ch);
    for (const g of HOMO) if (g.includes(ch) || g.includes(ranked[0].ch)) for (const c of g) alts.push(c);
    const P = PRIOR[script] || PRIOR.latin;
    const allowed = (c) => { for (const set in SETS) if (SETS[set].includes(c)) return P[set] !== null; return true; };
    return finish(ch, alts.filter(allowed));
  }

  /* Remember how this user writes `ch` (called when they correct a conversion). */
  function learn(cloud, ch) {
    learned.push({ ch, c: cloud.c, n: cloud.n, asp: cloud.asp });
    if (learned.length > 300) learned.shift();
    try {
      localStorage.setItem('wb.inkLearned', JSON.stringify(learned.map((u) => ({ ch: u.ch, asp: +u.asp.toFixed(3), c: Array.from(u.c, (v) => +v.toFixed(3)) }))));
    } catch (e) {}
  }

  WB.ink = {
    prepare, segment, recognize, learn,
    get ready() { return ready; },
    _glyphCloud: glyphCloud, _classify: classify, _strokeCloud: strokeCloud, _templates: templates, _sets: SETS,
  };
})();
