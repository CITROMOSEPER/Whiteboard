/* Maths expressions: a small parser, evaluator and LaTeX printer, all local.
   The AI only reads the handwriting; anything computed (plots, checking a solution) is done here,
   so numbers are exact and work offline.

   Syntax (calculator style, forgiving): numbers, x and other one-letter variables, pi, e,
   + - * / ^ !, parentheses, |x|, implicit multiplication (2x, 3sin x, (x+1)(x-1)), functions
   sin cos tan sec csc cot asin acos atan (arcsin…) sinh cosh tanh sqrt cbrt abs ln log exp
   floor ceil round sign min max. Common Unicode (× · ÷ − π √ ² ³) and simple LaTeX
   (\frac{a}{b}, \sqrt{x}, \cdot, \sin, \left( \right)) are read too.

   WB.mx.parse(text) -> AST (throws Error with a readable message)
   WB.mx.compile(ast) -> (env) => number
   WB.mx.tex(ast) -> LaTeX
   WB.mx.plotFn(src) -> { name, ast, f(x), tex } or { error } */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});

  const FUNCS = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => 1 / Math.tan(x),
    asin: Math.asin, acos: Math.acos, atan: Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
    sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
    sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, ln: Math.log, log: Math.log10, lg: Math.log10, exp: Math.exp,
    floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign, sgn: Math.sign,
    min: Math.min, max: Math.max,
  };
  const CONSTS = { pi: Math.PI, e: Math.E, tau: 2 * Math.PI };
  const NAMES = Object.keys(FUNCS).concat(Object.keys(CONSTS)).sort((a, b) => b.length - a.length);

  /* Gamma by Lanczos, for factorials of non-integers. */
  function gamma(z) {
    if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
    const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    z -= 1;
    let x = c[0];
    for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
    const t = z + g + 0.5;
    return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
  }
  const fact = (n) => (n >= 0 && Number.isInteger(n) && n < 171 ? (function () { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; })() : gamma(n + 1));

  /* Brace group starting at s[i] === '{': returns [content, index after the closing brace]. */
  function braced(s, i) {
    let d = 0;
    for (let j = i; j < s.length; j++) {
      if (s[j] === '{') d++;
      else if (s[j] === '}' && --d === 0) return [s.slice(i + 1, j), j + 1];
    }
    return [s.slice(i + 1), s.length];
  }
  /* Simple LaTeX and Unicode to calculator syntax. */
  function plainOf(src) {
    let s = String(src);
    s = s.replace(/\$/g, '').replace(/\\left|\\right|\\big|\\Big|\\bigg|\\Bigg/g, '').replace(/\\[,;:! ]|~/g, ' ');
    // \frac{a}{b} and \sqrt[n]{a}, innermost first so nesting works.
    for (let guard = 0; guard < 200; guard++) {
      const i = s.search(/\\[dtc]?frac\s*\{|\\sqrt\s*(\[[^\]]*\])?\s*\{/);
      if (i < 0) break;
      const m = s.slice(i).match(/^\\([dtc]?frac|sqrt)\s*(\[([^\]]*)\])?\s*/);
      let j = i + m[0].length;
      if (m[1].endsWith('frac')) {
        const [a, j1] = braced(s, j); let k = j1; while (s[k] === ' ') k++;
        const [b, j2] = s[k] === '{' ? braced(s, k) : ['1', k];
        s = s.slice(0, i) + `((${a})/(${b}))` + s.slice(j2);
      } else {
        const [a, j1] = braced(s, j);
        s = s.slice(0, i) + (m[3] ? `((${a})^(1/(${m[3]})))` : `sqrt(${a})`) + s.slice(j1);
      }
    }
    s = s.replace(/\\(cdot|times|ast)/g, '*').replace(/\\div/g, '/').replace(/\\pi/g, 'pi').replace(/\\infty/g, 'Infinity')
      .replace(/\\operatorname\{(\w+)\}/g, '$1').replace(/\\(mathrm|text)\{([^}]*)\}/g, '$2')
      .replace(/\\([a-zA-Z]+)/g, '$1').replace(/[{}]/g, (c) => (c === '{' ? '(' : ')'));
    s = s.replace(/[−–—]/g, '-').replace(/[×·⋅∙]/g, '*').replace(/÷/g, '/').replace(/π/g, 'pi').replace(/√/g, 'sqrt')
      .replace(/²/g, '^2').replace(/³/g, '^3').replace(/\*\*/g, '^').replace(/,(?=\d{3}\b)/g, '');
    return s;
  }

  function lex(src) {
    const s = plainOf(src), out = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9.]/.test(c)) {
        const m = s.slice(i).match(/^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/);
        if (!m) throw new Error('unexpected "' + c + '"');
        out.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if (/[a-zA-Z_]/.test(c)) {
        const m = s.slice(i).match(/^[a-zA-Z_]+/)[0];
        if (m === 'Infinity') { out.push({ t: 'num', v: Infinity }); i += m.length; continue; }
        // A run of letters: known names greedily, anything else one letter at a time ("xsin" = x sin).
        let k = 0;
        while (k < m.length) {
          const low = m.slice(k).toLowerCase(), name = NAMES.find((n) => low.startsWith(n));
          if (name) { out.push({ t: FUNCS[name] ? 'fn' : 'const', v: name }); k += name.length; }
          else { out.push({ t: 'var', v: m[k] }); k++; }
        }
        i += m.length; continue;
      }
      if ('+-*/^!(),|=<>[]'.includes(c)) { out.push({ t: 'op', v: c === '[' ? '(' : c === ']' ? ')' : c }); i++; continue; }
      throw new Error('unexpected "' + c + '"');
    }
    return out;
  }

  function parse(src) {
    const tk = lex(src);
    let p = 0, absDepth = 0;
    const peek = () => tk[p], next = () => tk[p++];
    const isOp = (v) => tk[p] && tk[p].t === 'op' && tk[p].v === v;
    const startsPrimary = () => {
      const t = tk[p];
      if (!t) return false;
      if (t.t !== 'op') return true;
      return t.v === '(' || (t.v === '|' && absDepth === 0);
    };
    function sum() {
      let a = term();
      while (isOp('+') || isOp('-')) { const op = next().v; a = { k: 'bin', op, a, b: term() }; }
      return a;
    }
    function term() {
      let a = unary();
      for (;;) {
        if (isOp('*') || isOp('/')) { const op = next().v; a = { k: 'bin', op, a, b: unary() }; }
        else if (startsPrimary()) a = { k: 'bin', op: '*', a, b: power(), imp: true };
        else return a;
      }
    }
    function unary() {
      if (isOp('-')) { next(); return { k: 'neg', a: unary() }; }
      if (isOp('+')) { next(); return unary(); }
      return power();
    }
    function power() {
      const a = postfix();
      if (isOp('^')) { next(); return { k: 'bin', op: '^', a, b: unary() }; }
      return a;
    }
    function postfix() {
      let a = primary();
      while (isOp('!')) { next(); a = { k: 'fact', a }; }
      return a;
    }
    function primary() {
      const t = next();
      if (!t) throw new Error('the expression ends too early');
      if (t.t === 'num') return { k: 'num', v: t.v };
      if (t.t === 'const') return { k: 'const', n: t.v };
      if (t.t === 'var') return { k: 'var', n: t.v };
      if (t.t === 'fn') {
        let ex = null;
        if (isOp('^')) { next(); ex = unary(); }            // sin^2 x
        let args;
        if (isOp('(')) {
          next(); args = [sum()];
          while (isOp(',')) { next(); args.push(sum()); }
          if (!isOp(')')) throw new Error('a ")" is missing'); next();
        } else {                                            // sin x, sin 2x (= sin(2x)), but sin x cos x = sin(x)·cos(x)
          let a = power();
          while (tk[p] && (tk[p].t === 'var' || tk[p].t === 'const')) a = { k: 'bin', op: '*', a, b: power(), imp: true };
          args = [a];
        }
        const f = { k: 'fn', n: t.v, args };
        return ex ? { k: 'bin', op: '^', a: f, b: ex } : f;
      }
      if (t.v === '(') {
        const a = sum();
        if (!isOp(')')) throw new Error('a ")" is missing');
        next(); return { ...a, par: true };
      }
      if (t.v === '|') {
        absDepth++; const a = sum(); absDepth--;
        if (!isOp('|')) throw new Error('a "|" is missing');
        next(); return { k: 'fn', n: 'abs', args: [a] };
      }
      throw new Error('unexpected "' + t.v + '"');
    }
    const ast = sum();
    if (p < tk.length) throw new Error('unexpected "' + tk[p].v + '"');
    return ast;
  }

  function compile(ast) {
    switch (ast.k) {
      case 'num': { const v = ast.v; return () => v; }
      case 'const': { const v = CONSTS[ast.n]; return () => v; }
      case 'var': { const n = ast.n; return (env) => (n in env ? env[n] : NaN); }
      case 'neg': { const a = compile(ast.a); return (env) => -a(env); }
      case 'fact': { const a = compile(ast.a); return (env) => fact(a(env)); }
      case 'fn': {
        const f = FUNCS[ast.n], args = ast.args.map(compile);
        if (args.length === 1) { const a = args[0]; return (env) => f(a(env)); }
        return (env) => f(...args.map((g) => g(env)));
      }
      case 'bin': {
        const a = compile(ast.a), b = compile(ast.b);
        if (ast.op === '+') return (env) => a(env) + b(env);
        if (ast.op === '-') return (env) => a(env) - b(env);
        if (ast.op === '*') return (env) => a(env) * b(env);
        if (ast.op === '/') return (env) => a(env) / b(env);
        // Odd roots of negative numbers are real: (-8)^(1/3) = -2, as people expect on a graph.
        return (env) => {
          const x = a(env), y = b(env);
          if (x < 0 && !Number.isInteger(y)) {
            for (const q of [3, 5, 7, 9]) {
              const r = y * q;
              if (Math.abs(r - Math.round(r)) < 1e-9) { const v = Math.pow(-x, y); return Math.round(r) % 2 ? -v : v; }
            }
          }
          return Math.pow(x, y);
        };
      }
    }
    throw new Error('cannot evaluate');
  }
  /* Every variable name the expression uses. */
  function vars(ast, out = new Set()) {
    if (ast.k === 'var') out.add(ast.n);
    for (const c of [ast.a, ast.b].concat(ast.args || [])) if (c) vars(c, out);
    return out;
  }

  /* ---- LaTeX ---------------------------------------------------------- */
  const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 4 };
  const TEX_FN = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'ln', 'log', 'exp', 'lg', 'min', 'max']);
  const prec = (n) => (n.k === 'bin' ? PREC[n.op] : n.k === 'neg' ? 1.5 : 9);
  const numTex = (v) => (v === Infinity ? '\\infty' : String(+v.toPrecision(12)).replace(/e\+?(-?\d+)/, '\\cdot 10^{$1}'));
  function tex(n) {
    const wrap = (c, p) => (prec(c) < p ? `\\left(${tex(c)}\\right)` : tex(c));
    switch (n.k) {
      case 'num': return numTex(n.v);
      case 'const': return n.n === 'pi' ? '\\pi' : n.n === 'tau' ? '\\tau' : 'e';
      case 'var': return n.n;
      case 'neg': return '-' + wrap(n.a, 2);
      case 'fact': return wrap(n.a, 9) + '!';
      case 'fn': {
        const a = n.args.map(tex).join(', ');
        if (n.n === 'sqrt') return `\\sqrt{${a}}`;
        if (n.n === 'cbrt') return `\\sqrt[3]{${a}}`;
        if (n.n === 'abs') return `\\left|${a}\\right|`;
        const name = n.n === 'asin' ? 'arcsin' : n.n === 'acos' ? 'arccos' : n.n === 'atan' ? 'arctan' : n.n;
        const head = TEX_FN.has(name) ? '\\' + name : `\\operatorname{${name}}`;
        const simple = n.args.length === 1 && (n.args[0].k === 'var' || n.args[0].k === 'num' || n.args[0].k === 'const');
        return simple && name !== 'exp' ? `${head} ${a}` : `${head}\\left(${a}\\right)`;
      }
      case 'bin': {
        if (n.op === '/') return `\\frac{${tex(n.a)}}{${tex(n.b)}}`;
        if (n.op === '^') {
          const base = n.a.k === 'fn' && n.a.n !== 'abs' && n.a.n !== 'sqrt' ? `\\left(${tex(n.a)}\\right)` : wrap(n.a, 5);
          return `${base}^{${tex(n.b)}}`;
        }
        if (n.op === '*') {
          const l = wrap(n.a, 2), r = wrap(n.b, 2);
          // Juxtapose where it reads naturally (2x, 3\sin x, x(x+1)); a dot between two numbers.
          const rightNum = /^-?[\d.]/.test(r);
          return rightNum ? `${l} \\cdot ${r}` : `${l}${/[a-zA-Z]$/.test(l) && /^[a-zA-Z]/.test(r) ? ' ' : ''}${r}`;
        }
        return `${tex(n.a)} ${n.op} ${n.b.k === 'neg' ? `\\left(${tex(n.b)}\\right)` : wrap(n.b, n.op === '-' ? 2 : 1)}`;
      }
    }
    return '';
  }

  /* A function to plot, from what was written: "f(x) = sin x", "y = x^2", or just "x^2". */
  function plotFn(src) {
    const text = String(src || '').trim();
    if (!text) return { error: 'empty' };
    let name = '', body = text;
    const m = plainOf(text).match(/^\s*([a-zA-Z]\w*\s*\(\s*x\s*\)|y)\s*=(.*)$/);
    if (m) { name = m[1].replace(/\s+/g, ''); body = m[2]; }
    else if (/=/.test(text)) return { error: 'only y = … or f(x) = … can be drawn' };
    try {
      const ast = parse(body), used = [...vars(ast)].filter((v) => v !== 'x');
      if (used.length) return { error: 'unknown ' + used.join(', ') };
      const g = compile(ast);
      return { name, ast, f: (x) => g({ x }), tex: (name ? name.replace(/^(\w+)\(x\)$/, '$1(x)') + ' = ' : 'y = ') + tex(ast) };
    } catch (e) { return { error: e.message }; }
  }

  /* Does this set of variable values satisfy every equation? true / false, or null when it can't
     be told (inequalities, unknown variables, complex values). equations: "2x+3=7; x-y=1". */
  function check(equations, values) {
    const env = {};
    for (const k in values) {
      try { const v = compile(parse(String(values[k])))({}); if (!isFinite(v)) return null; env[k] = v; } catch (e) { return null; }
    }
    let any = false;
    for (const eq of String(equations).split(/;|\n/)) {
      if (!eq.trim()) continue;
      if (/[<>≤≥]/.test(eq)) return null;
      const sides = eq.split('=');
      if (sides.length !== 2) return null;
      let l, r;
      try {
        const a = parse(sides[0]), b = parse(sides[1]);
        for (const v of new Set([...vars(a), ...vars(b)])) if (!(v in env)) return null;
        l = compile(a)(env); r = compile(b)(env);
      } catch (e) { return null; }
      if (!isFinite(l) || !isFinite(r)) return null;
      if (Math.abs(l - r) > 1e-6 * (1 + Math.abs(l) + Math.abs(r))) return false;
      any = true;
    }
    return any ? true : null;
  }

  WB.mx = { parse, compile, tex, vars, plotFn, check, plainOf };
})();
