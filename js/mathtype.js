/* Typeset maths on the canvas: a small LaTeX subset laid out as boxes and painted with fillText
   and lines, in the text's own font (so the "Handwritten" font gives a handwritten look).
   No web fonts and no library, so it works offline, in the single-file build, and in exports.

   A text object with math: true reads its text as lines where $…$ is maths:
     "Area: $A = \pi r^2$"     "$\frac{x+1}{2} = \sqrt{y}$"
   Supported: ^ _ {…}, \frac \dfrac \tfrac \binom, \sqrt and \sqrt[n], \left \right (and plain
   brackets grow to fit what they hold), Greek letters, operators and relations (\cdot \times \pm
   \le \ge \ne \approx \to \Rightarrow \infty …), \sin \cos \log \lim …, \sum \prod \int with
   limits, \text \mathrm \operatorname \mathbb, accents (\vec \hat \bar \overline \dot \tilde),
   spaces (\, \; \quad). Anything unknown is shown as its name rather than failing.

   Boxes are in units of the font size: { w, a (above the baseline), d (below), paint(c, x, y, size) }. */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});
  const mctx = document.createElement('canvas').getContext('2d');

  const SYM = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ',
    iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ', sigma: 'σ', varsigma: 'ς',
    tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
    infty: '∞', partial: '∂', nabla: '∇', degree: '°', circ: '∘', cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮',
    forall: '∀', exists: '∃', emptyset: '∅', varnothing: '∅', angle: '∠', triangle: '△', therefore: '∴', because: '∵', neg: '¬', lnot: '¬',
    prime: '′', hbar: 'ℏ', ell: 'ℓ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', checkmark: '✓', star: '⋆', square: '□',
    '{': '{', '}': '}', '%': '%', '$': '$', '&': '&', '#': '#', '_': '_', '|': '‖',
  };
  const BIN = { cdot: '·', times: '×', div: '÷', pm: '±', mp: '∓', ast: '∗', cup: '∪', cap: '∩', setminus: '∖', land: '∧', wedge: '∧', lor: '∨', vee: '∨', oplus: '⊕', otimes: '⊗', bullet: '•' };
  const REL = {
    le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝',
    to: '→', rightarrow: '→', leftarrow: '←', gets: '←', Rightarrow: '⇒', implies: '⇒', Leftarrow: '⇐', iff: '⇔', Leftrightarrow: '⇔',
    leftrightarrow: '↔', mapsto: '↦', longrightarrow: '⟶', Longrightarrow: '⟹', in: '∈', notin: '∉', ni: '∋', subset: '⊂', subseteq: '⊆',
    supset: '⊃', supseteq: '⊇', perp: '⊥', parallel: '∥', mid: '∣', ll: '≪', gg: '≫', coloneqq: '≔',
  };
  const OPS = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'coth', 'log', 'ln', 'lg', 'exp',
    'lim', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'deg', 'arg', 'dim', 'ker', 'mod', 'bmod', 'Pr', 'liminf', 'limsup']);
  const BIG = { sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂' };
  const LIMITS = new Set(['sum', 'prod', 'coprod', 'bigcup', 'bigcap', 'lim', 'max', 'min', 'sup', 'inf', 'liminf', 'limsup', 'det', 'gcd']);
  const BB = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ', P: 'ℙ' };
  const SPACE = { ',': 0.17, ':': 0.22, '>': 0.22, ';': 0.28, ' ': 0.25, quad: 1, qquad: 2, '!': -0.17, enspace: 0.5 };
  const ACCENT = new Set(['vec', 'hat', 'bar', 'overline', 'dot', 'ddot', 'tilde', 'widehat', 'widetilde', 'underline', 'overrightarrow']);
  const IGNORE = new Set(['left', 'right', 'big', 'Big', 'bigg', 'Bigg', 'bigl', 'bigr', 'Bigl', 'Bigr', 'displaystyle', 'textstyle', 'limits', 'nolimits', 'mathit', 'mathbf', 'boldsymbol', 'bm', 'mathsf', 'mathcal', 'mathscr', 'begin', 'end', 'boxed', 'cancel']);

  /* ---- Parsing --------------------------------------------------------
     Nodes: { t:'ch', c, cls, it } · { t:'grp', items } · { t:'frac', n, d, bar } · { t:'sqrt', a, idx }
     · { t:'text', s } · { t:'op', name } · { t:'big', c, lim } · { t:'sp', w } · { t:'acc', kind, a }
     · and any node may carry sup / sub. cls: ord bin rel open close punct. */
  function parse(src) {
    let i = 0;
    const s = src;
    function readArg() {                         // one argument: a {group} or a single token
      while (s[i] === ' ') i++;
      if (s[i] === '{') { i++; const g = list('}'); return g; }
      if (s[i] === '\\') return { t: 'grp', items: [atom()].filter(Boolean) };
      if (i < s.length) return { t: 'grp', items: [charNode(s[i++])] };
      return { t: 'grp', items: [] };
    }
    function rawArg() {                          // a {group} read as plain text
      while (s[i] === ' ') i++;
      if (s[i] !== '{') return s[i++] || '';
      let d = 0, j = i;
      for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}' && --d === 0) break; }
      const out = s.slice(i + 1, j); i = j + 1; return out;
    }
    function charNode(c) {
      if (/[0-9.]/.test(c)) return { t: 'ch', c, cls: 'ord' };
      if (/[a-zA-Z]/.test(c)) return { t: 'ch', c, cls: 'ord', it: true };
      if (/[α-ωΑ-Ω]/.test(c)) return { t: 'ch', c, cls: 'ord', it: /[α-ω]/.test(c) };
      if ('+-−*×·÷±'.includes(c)) return { t: 'ch', c: c === '-' ? '−' : c === '*' ? '∗' : c, cls: 'bin' };
      if ('=<>≤≥≠≈→⇒⇔∈'.includes(c)) return { t: 'ch', c, cls: 'rel' };
      if ('([{'.includes(c)) return { t: 'ch', c, cls: 'open' };
      if (')]}'.includes(c)) return { t: 'ch', c, cls: 'close' };
      if (c === '|') return { t: 'ch', c, cls: 'bar' };
      if (',;'.includes(c)) return { t: 'ch', c, cls: 'punct' };
      if (c === '\'') return { t: 'ch', c: '′', cls: 'ord' };
      return { t: 'ch', c, cls: 'ord' };
    }
    function atom() {
      const c = s[i];
      if (c === '\\') {
        i++;
        let name = s[i] && /[a-zA-Z]/.test(s[i]) ? s.slice(i).match(/^[a-zA-Z]+/)[0] : s[i] || '';
        i += name.length;
        if (name === '\\') return { t: 'sp', w: 0.5 };
        if (name in SPACE) return { t: 'sp', w: SPACE[name] };
        if (IGNORE.has(name)) {
          if (name === 'begin' || name === 'end') rawArg();
          return null;
        }
        if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') return { t: 'frac', n: readArg(), d: readArg(), bar: true };
        if (name === 'binom') return { t: 'grp', items: [{ t: 'ch', c: '(', cls: 'open' }, { t: 'frac', n: readArg(), d: readArg(), bar: false }, { t: 'ch', c: ')', cls: 'close' }] };
        if (name === 'sqrt') {
          let idx = null;
          if (s[i] === '[') { const j = s.indexOf(']', i); idx = parse(s.slice(i + 1, j < 0 ? s.length : j)); i = j < 0 ? s.length : j + 1; }
          return { t: 'sqrt', a: readArg(), idx };
        }
        if (name === 'text' || name === 'mathrm' || name === 'textrm' || name === 'textit' || name === 'textbf' || name === 'mbox' || name === 'operatorname') {
          const t = rawArg();
          return name === 'operatorname' ? { t: 'op', name: t } : { t: 'text', s: t };
        }
        if (name === 'mathbb') { const t = rawArg(); return { t: 'text', s: [...t].map((ch) => BB[ch] || ch).join('') }; }
        if (ACCENT.has(name)) return { t: 'acc', kind: name, a: readArg() };
        if (name in BIN) return { t: 'ch', c: BIN[name], cls: 'bin' };
        if (name in REL) return { t: 'ch', c: REL[name], cls: 'rel' };
        if (name in BIG) return { t: 'big', c: BIG[name], lim: LIMITS.has(name) };
        if (OPS.has(name)) return { t: 'op', name, lim: LIMITS.has(name) };
        if (name === 'langle') return { t: 'ch', c: '⟨', cls: 'open' };
        if (name === 'rangle') return { t: 'ch', c: '⟩', cls: 'close' };
        if (name === 'lfloor' || name === 'lceil') return { t: 'ch', c: name === 'lfloor' ? '⌊' : '⌈', cls: 'open' };
        if (name === 'rfloor' || name === 'rceil') return { t: 'ch', c: name === 'rfloor' ? '⌋' : '⌉', cls: 'close' };
        if (name === '{') return { t: 'ch', c: '{', cls: 'open' };
        if (name === '}') return { t: 'ch', c: '}', cls: 'close' };
        if (name in SYM) { const ch = SYM[name]; return { t: 'ch', c: ch, cls: 'ord', it: /[α-ω]/.test(ch) }; }
        return name ? { t: 'text', s: name } : null;
      }
      i++;
      if (c === '{') return list('}');
      if (c === ' ' || c === '\t') return null;
      if (c === '~') return { t: 'sp', w: 0.3 };
      if (c === '&') return { t: 'sp', w: 0.5 };
      return charNode(c);
    }
    function list(end) {
      const items = [];
      while (i < s.length) {
        if (end && s[i] === end) { i++; break; }
        if (s[i] === '^' || s[i] === '_') {
          const k = s[i] === '^' ? 'sup' : 'sub'; i++;
          let base = items[items.length - 1];
          if (!base || base[k]) { base = { t: 'grp', items: [] }; items.push(base); }
          base[k] = readArg();
          continue;
        }
        if (s[i] === '\'' && items.length) {           // f'(x): a prime is a superscript
          const base = items[items.length - 1]; i++;
          base.sup = { t: 'grp', items: [...(base.sup ? base.sup.items : []), { t: 'ch', c: '′', cls: 'ord' }] };
          continue;
        }
        const a = atom();
        if (a) items.push(a);
      }
      return { t: 'grp', items };
    }
    return list(null);
  }

  /* ---- Layout ----------------------------------------------------------- */
  const AXIS = 0.27;          // the maths axis (fraction bars, middle of + and −) above the baseline
  const RULE = 0.055;         // fraction bar and root line thickness
  const fontFor = (family, it, bold) => `${it ? 'italic ' : ''}${bold ? 'bold ' : ''}100px ${family}`;
  function glyph(c, family, it, k) {
    mctx.font = fontFor(family, it);
    const m = mctx.measureText(c);
    let a = (m.actualBoundingBoxAscent || 70) / 100, d = (m.actualBoundingBoxDescent || 0) / 100;
    // Ordinary letters and digits sit on one common line height, so a row of them looks even.
    if (c.length === 1 && /[0-9a-zA-Zα-ω]/.test(c)) { a = Math.max(a, 0.5); d = Math.max(d, 0); }
    const w = m.width / 100 + (it ? 0.03 : 0);
    return { w: w * k, a: a * k, d: d * k, paint(cx, x, y, size) {
      cx.save(); cx.translate(x, y); cx.scale((size * k) / 100, (size * k) / 100);
      cx.font = fontFor(family, it); cx.textBaseline = 'alphabetic'; cx.textAlign = 'left'; cx.fillText(c, 0, 0); cx.restore();
    } };
  }
  function textBox(str, family, k) {
    mctx.font = fontFor(family, false);
    const m = mctx.measureText(str), M = mctx.measureText('Mg');
    const a = Math.max(m.actualBoundingBoxAscent || 0, (M.actualBoundingBoxAscent || 70)) / 100, d = Math.max(m.actualBoundingBoxDescent || 0, M.actualBoundingBoxDescent || 20) / 100;
    return { w: (m.width / 100) * k, a: a * k, d: d * k, paint(cx, x, y, size) {
      cx.save(); cx.translate(x, y); cx.scale((size * k) / 100, (size * k) / 100);
      cx.font = fontFor(family, false); cx.textBaseline = 'alphabetic'; cx.textAlign = 'left'; cx.fillText(str, 0, 0); cx.restore();
    } };
  }
  const empty = (w) => ({ w: w || 0, a: 0, d: 0, paint() {} });
  function rule(w, th, up) { return { w, a: up + th, d: -up, paint(cx, x, y, size) { cx.fillRect(x, y - (up + th) * size, w * size, th * size); } }; }

  /* A bracket stretched to cover height a + d (around the axis). */
  function stretch(c, family, a, d, k) {
    const g = glyph(c, family, false, k), gh = g.a + g.d, need = Math.max(a, d + 2 * AXIS * k) + Math.max(d, a - 2 * AXIS * k);
    if (need <= gh * 1.15) return g;
    const sy = need / gh, sx = Math.min(1 + 0.18 * (sy - 1), 1.7), mid = AXIS * k, top = mid + need / 2;
    return { w: g.w * sx, a: top, d: need - top, paint(cx, x, y, size) {
      cx.save(); cx.translate(x, y - (top - g.a * sy) * size); cx.scale(sx, sy); g.paint(cx, 0, 0, size); cx.restore();
    } };
  }
  function hbox(boxes) {
    let w = 0, a = 0, d = 0;
    for (const b of boxes) { w += b.w; a = Math.max(a, b.a + (b.dy || 0)); d = Math.max(d, b.d - (b.dy || 0)); }
    return { w, a, d, paint(cx, x, y, size) { let px = x; for (const b of boxes) { b.paint(cx, px, y - (b.dy || 0) * size, size); px += b.w * size; } } };
  }
  function shift(b, dy) { return { w: b.w, a: b.a + dy, d: b.d - dy, paint(cx, x, y, size) { b.paint(cx, x, y - dy * size, size); } }; }
  function overlay(base, top, dx, dy) {
    return { w: base.w, a: Math.max(base.a, top.a + dy), d: base.d, paint(cx, x, y, size) { base.paint(cx, x, y, size); top.paint(cx, x + dx * size, y - dy * size, size); } };
  }

  function layout(node, family, k, plain) {
    const L = (n, kk) => layout(n, family, kk, plain);
    let box;
    switch (node.t) {
      case 'grp': box = row(node.items, family, k, plain); break;
      case 'ch': box = glyph(node.c, family, node.it && !plain, k); break;
      case 'text': box = textBox(node.s, family, k); break;
      case 'op': box = textBox(node.name, family, k); break;
      case 'sp': box = empty(node.w * k); break;
      case 'big': { const g = glyph(node.c, family, false, k * 1.45); box = shift(g, (AXIS * k) - (g.a - g.d) / 2); break; }
      case 'frac': {
        const kk = k >= 0.9 ? k * 0.92 : k * 0.78, n = L(node.n, kk), d = L(node.d, kk), w = Math.max(n.w, d.w) + 0.2 * k, gap = 0.12 * k, th = node.bar ? RULE * k : 0;
        const ax = AXIS * k, nUp = ax + th / 2 + gap + n.d, dDown = ax - th / 2 - gap - d.a;
        box = { w: w + 0.1 * k, a: nUp + n.a, d: -dDown + d.d, paint(cx, x, y, size) {
          n.paint(cx, x + ((w - n.w) / 2 + 0.05 * k) * size, y - nUp * size, size);
          d.paint(cx, x + ((w - d.w) / 2 + 0.05 * k) * size, y - dDown * size, size);
          if (th) cx.fillRect(x + 0.05 * k * size, y - (ax + th / 2) * size, w * size, th * size);
        } };
        break;
      }
      case 'sqrt': {
        const a = L(node.a, k), gap = 0.12 * k, th = RULE * k, top = a.a + gap + th, bottom = Math.max(a.d, 0.05 * k);
        const hook = 0.62 * k, idx = node.idx ? L(node.idx, k * 0.55) : null, lead = idx ? Math.max(0, idx.w - 0.3 * k) : 0;
        box = { w: lead + hook + a.w + 0.1 * k, a: top + 0.02 * k, d: bottom, paint(cx, x, y, size) {
          const S = size, x0 = x + lead * S, yb = y + bottom * S, yt = y - (top - th / 2) * S;
          cx.save(); cx.lineWidth = th * S * 1.05; cx.lineJoin = 'round'; cx.lineCap = 'round';
          cx.strokeStyle = cx.fillStyle;
          cx.beginPath();
          cx.moveTo(x0 + 0.04 * k * S, y - (AXIS * k * 0.9) * S);
          cx.lineTo(x0 + 0.2 * k * S, y - (AXIS * k * 1.15) * S);
          cx.lineTo(x0 + 0.36 * k * S, yb);
          cx.lineTo(x0 + (hook - 0.04 * k) * S, yt);
          cx.lineTo(x0 + (hook + a.w + 0.06 * k) * S, yt);
          cx.stroke(); cx.restore();
          a.paint(cx, x0 + hook * S, y, S);
          if (idx) idx.paint(cx, x, y - (AXIS * k * 1.6 + idx.d) * S, S);
        } };
        break;
      }
      case 'acc': {
        const a = L(node.a, k), kind = node.kind;
        if (kind === 'overline' || kind === 'bar' || kind === 'underline') {
          const th = RULE * k;
          box = kind === 'underline'
            ? { w: a.w, a: a.a, d: a.d + 0.15 * k, paint(cx, x, y, size) { a.paint(cx, x, y, size); cx.fillRect(x, y + (a.d + 0.08 * k) * size, a.w * size, th * size); } }
            : { w: a.w, a: a.a + 0.12 * k + th, d: a.d, paint(cx, x, y, size) { a.paint(cx, x, y, size); cx.fillRect(x + 0.04 * k * size, y - (a.a + 0.1 * k + th) * size, (a.w - 0.04 * k) * size, th * size); } };
        } else {
          const mark = { vec: '→', overrightarrow: '→', hat: 'ˆ', widehat: 'ˆ', dot: '˙', ddot: '¨', tilde: '˜', widetilde: '˜' }[kind] || '';
          const g = glyph(mark, family, false, k * (kind === 'vec' || kind === 'overrightarrow' ? 0.6 : 1));
          const dy = a.a + 0.06 * k - (kind === 'vec' || kind === 'overrightarrow' ? g.d - 0.05 * k : g.a * 0.55);
          box = overlay(a, g, (a.w - g.w) / 2, dy);
        }
        break;
      }
      default: box = empty();
    }
    if (node.sup || node.sub) box = scripts(box, node, family, k, plain);
    return box;
  }
  function scripts(base, node, family, k, plain) {
    const kk = k * (k >= 0.9 ? 0.68 : 0.8);
    if (node.lim && (node.t === 'big' || node.t === 'op')) {        // limits above and below: \sum_{i=1}^{n}, \lim_{x\to 0}
      const up = node.sup ? layout(node.sup, family, kk, plain) : null, dn = node.sub ? layout(node.sub, family, kk, plain) : null;
      const w = Math.max(base.w, up ? up.w : 0, dn ? dn.w : 0), g = 0.1 * k;
      return { w, a: base.a + (up ? g + up.a + up.d : 0), d: base.d + (dn ? g + dn.a + dn.d : 0), paint(cx, x, y, size) {
        base.paint(cx, x + ((w - base.w) / 2) * size, y, size);
        if (up) up.paint(cx, x + ((w - up.w) / 2) * size, y - (base.a + g + up.d) * size, size);
        if (dn) dn.paint(cx, x + ((w - dn.w) / 2) * size, y + (base.d + g + dn.a) * size, size);
      } };
    }
    const up = node.sup ? layout(node.sup, family, kk, plain) : null, dn = node.sub ? layout(node.sub, family, kk, plain) : null;
    const tall = base.a > 0.85 * k;
    let upY = up ? Math.max(0.4 * k, tall ? base.a - 0.35 * k : 0, up.d + 0.25 * k) : 0;
    let dnY = dn ? Math.max(0.18 * k, tall ? base.d - 0.1 * k : 0, dn.a - 0.45 * k) : 0;
    if (up && dn && (upY - up.d) - (dn.a - dnY) < 0.12 * k) { const fix = 0.12 * k - ((upY - up.d) - (dn.a - dnY)); upY += fix / 2; dnY += fix / 2; }
    const sw = Math.max(up ? up.w : 0, dn ? dn.w : 0) + 0.04 * k;
    return { w: base.w + sw, a: Math.max(base.a, up ? upY + up.a : 0), d: Math.max(base.d, dn ? dnY + dn.d : 0), paint(cx, x, y, size) {
      base.paint(cx, x, y, size);
      if (up) up.paint(cx, x + (base.w + 0.02 * k) * size, y - upY * size, size);
      if (dn) dn.paint(cx, x + (base.w + 0.02 * k) * size, y + dnY * size, size);
    } };
  }
  /* A row of nodes, with TeX-like spacing around operators and relations, and brackets grown to fit. */
  function row(items, family, k, plain) {
    const boxes = [], cls = [], src = [];        // per box: its class and the node it came from (spacers: null)
    let prev = null, bars = 0;
    for (const n of items) {
      let c = n.t === 'ch' ? n.cls : n.t === 'op' || n.t === 'big' ? 'op' : 'ord';
      if (c === 'bin' && (!prev || ['bin', 'rel', 'open', 'bar-open', 'punct', 'op'].includes(prev))) c = 'ord';   // a sign, not an operation
      if (c === 'bar') { c = bars > 0 && prev && !['bin', 'rel', 'open', 'bar-open', 'punct'].includes(prev) ? 'bar-close' : 'bar-open'; bars += c === 'bar-open' ? 1 : -1; }
      if (prev) {
        const sm = k < 0.9;                      // tighter in scripts
        const gap = (c === 'rel' || prev === 'rel') ? (sm ? 0.12 : 0.28) : (c === 'bin' || prev === 'bin') ? (sm ? 0.1 : 0.22)
          : prev === 'punct' ? 0.17 : (c === 'op' && prev !== 'open') || (prev === 'op' && c !== 'open' && c !== 'close') ? 0.17 : 0;
        if (gap) { boxes.push(empty(gap * k)); cls.push('sp'); src.push(null); }
      }
      boxes.push(layout(n, family, k, plain)); cls.push(c); src.push(n);
      prev = c;
    }
    // Grow brackets around tall contents: match each opener with its closer.
    const stack = [];
    for (let j = 0; j < boxes.length; j++) {
      const c = cls[j];
      if (c === 'open' || c === 'bar-open') stack.push(j);
      else if ((c === 'close' || c === 'bar-close') && stack.length) {
        const o = stack.pop();
        let a = 0, d = 0;
        for (let q = o + 1; q < j; q++) { a = Math.max(a, boxes[q].a); d = Math.max(d, boxes[q].d); }
        if (a + d > 1.05 * k) {
          for (const q of [o, j]) { const n = src[q]; if (n && n.t === 'ch' && !n.sup && !n.sub) boxes[q] = stretch(n.c, family, a, d, k); }
        }
      }
    }
    return hbox(boxes);
  }

  /* One source line of a maths text: plain text with $…$ maths, as one box (units of the font size). */
  function lineBox(line, family, plain) {
    const parts = [], re = /\$\$?((?:[^$\\]|\\.)*)\$\$?/g;
    let last = 0, m;
    while ((m = re.exec(line))) {
      if (m.index > last) parts.push(textBox(line.slice(last, m.index), family, 1));
      parts.push(layout(parse(m[1]), family, 1, plain));
      last = re.lastIndex;
    }
    if (last < line.length) parts.push(textBox(line.slice(last), family, 1));
    if (!parts.length) parts.push(textBox('', family, 1));
    return hbox(parts);
  }

  /* Layout of a maths text object, in the shape WB.textLayout returns (plus rows to paint). */
  WB.mathLayout = function (s) {
    const family = WB.FONTS[s.font] || WB.FONTS.sans, plain = s.font === 'hand' || s.font === 'mono', size = s.size;
    const lines = s.text.split('\n'), lh = WB.LINE * size, rows = [], widths = [];
    let y = 0;
    for (const line of lines) {
      const b = lineBox(line, family, plain), a = b.a * size, d = b.d * size;
      const h = Math.max(lh, a + d + 0.3 * size), base = (h - a - d) / 2 + a;
      rows.push({ b, top: y, base });
      widths.push(b.w * size);
      y += h;
    }
    return { lines, widths, w: Math.max(0, ...widths), h: y, lh, base: rows.length ? rows[0].base : lh * 0.75, rows };
  };
  /* Paint in the text's own frame (origin at its top-left, unturned); fillStyle already set. */
  WB.paintMath = function (c, s, L) {
    for (const r of L.rows) r.b.paint(c, 0, r.top + r.base, s.size);
  };
})();
