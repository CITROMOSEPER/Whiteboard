/* AI actions on a selection: reading handwriting with a vision model the user brings their own
   key for. There is no Whiteboard server: the browser calls the provider directly, and the key
   stays in this browser's storage (localStorage "wb.ai"), never in boards, files or share links.

   The model only reads what is written (and, for "Solve", writes the working). Graphs are drawn
   and answers checked locally (js/mathexpr.js), so the numbers do not depend on the model. */
(function () {
  'use strict';
  const WB = (window.WB = window.WB || {});

  const PROVIDERS = {
    gemini: { name: 'Google Gemini', model: 'gemini-flash-lite-latest', keyUrl: 'https://aistudio.google.com/apikey' },
    openai: { name: 'OpenAI', model: 'gpt-5-mini', keyUrl: 'https://platform.openai.com/api-keys' },
    anthropic: { name: 'Anthropic Claude', model: 'claude-opus-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
    custom: { name: 'OpenAI-compatible', model: '', keyUrl: '' },
  };
  const KEY = 'wb.ai';
  function load() {
    let c = {};
    try { c = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
    return { provider: PROVIDERS[c.provider] ? c.provider : 'gemini', keys: c.keys || {}, models: c.models || {}, baseUrl: c.baseUrl || '' };
  }
  let cfg = load();
  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  const ai = {
    PROVIDERS,
    get: () => cfg,
    set(patch) { cfg = Object.assign(cfg, patch); save(); },
    setKey(p, k) { cfg.keys[p] = k; save(); },
    setModel(p, m) { cfg.models[p] = m; save(); },
    model: (p = cfg.provider) => (cfg.models[p] || PROVIDERS[p].model || '').trim(),
    key: (p = cfg.provider) => (cfg.keys[p] || '').trim(),
    ready: () => !!(ai.key() || cfg.provider === 'custom') && !!ai.model() && (cfg.provider !== 'custom' || !!cfg.baseUrl),
    forget() { cfg.keys = {}; save(); },
  };

  /* ---- Talking to the providers ------------------------------------------ */
  const base = () => (cfg.baseUrl || '').replace(/\/+$/, '');
  async function fail(res) {
    let msg = '';
    try { const j = await res.json(); msg = (j.error && (j.error.message || j.error.type || j.error)) || j.message || ''; } catch (e) {}
    const err = new Error(typeof msg === 'string' && msg ? msg : 'HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  /* Claude models that take output_config.effort and the server-side refusal fallback. */
  const claudeNew = (m) => /^claude-(opus-5|sonnet-5|haiku-5|fable-5|opus-4-[678]|sonnet-4-6)/.test(m);
  const claudeFallback = (m) => /^claude-(opus-5-5|opus-5$|sonnet-5-5|fable-5-[12])/.test(m);

  /* Ask the model about one PNG (a data: URL). Returns the reply text. */
  async function ask(system, prompt, png, signal) {
    const p = cfg.provider, key = ai.key(), model = ai.model(), data = png.split(',')[1];
    if (p === 'gemini') {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST', signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/png', data } }, { text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
      if (!res.ok) await fail(res);
      const j = await res.json(), cand = j.candidates && j.candidates[0];
      if (!cand || !cand.content) throw new Error((j.promptFeedback && j.promptFeedback.blockReason) || 'no answer');
      return cand.content.parts.map((q) => q.text || '').join('');
    }
    if (p === 'anthropic') {
      const body = {
        model, max_tokens: 16000, system,
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }, { type: 'text', text: prompt }] }],
      };
      const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
      if (claudeNew(model)) body.output_config = { effort: 'low' };         // reading handwriting needs little deliberation
      if (claudeFallback(model)) { body.fallbacks = 'default'; headers['anthropic-beta'] = 'server-side-fallback-2026-07-01'; }
      const res = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers, body: JSON.stringify(body) });
      if (!res.ok) await fail(res);
      const j = await res.json();
      if (j.stop_reason === 'refusal') throw new Error('the model declined this request');
      return (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
    }
    // OpenAI, and any server that speaks its chat completions API (OpenRouter, a local Ollama or LM Studio…).
    const url = p === 'openai' ? 'https://api.openai.com/v1/chat/completions' : base() + '/chat/completions';
    const body = {
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: png } }] }],
    };
    if (p === 'openai') body.response_format = { type: 'json_object' };
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers.Authorization = 'Bearer ' + key;
    const res = await fetch(url, { method: 'POST', signal, headers, body: JSON.stringify(body) });
    if (!res.ok) await fail(res);
    const j = await res.json(), m = j.choices && j.choices[0] && j.choices[0].message;
    if (!m) throw new Error('no answer');
    if (m.refusal) throw new Error(m.refusal);
    return typeof m.content === 'string' ? m.content : (m.content || []).map((q) => q.text || '').join('');
  }

  /* The models this key can use, for the model field's suggestions. */
  ai.listModels = async function () {
    const p = cfg.provider, key = ai.key();
    if (p === 'gemini') {
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
      if (!res.ok) await fail(res);
      const j = await res.json();
      return (j.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
    }
    if (p === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models?limit=100', { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } });
      if (!res.ok) await fail(res);
      return ((await res.json()).data || []).map((m) => m.id);
    }
    const res = await fetch((p === 'openai' ? 'https://api.openai.com/v1' : base()) + '/models', { headers: key ? { Authorization: 'Bearer ' + key } : {} });
    if (!res.ok) await fail(res);
    return ((await res.json()).data || []).map((m) => m.id).sort();
  };

  /* The first JSON object in a reply (models sometimes wrap it in a code fence or a sentence). */
  function json(text) {
    const t = String(text).replace(/```(?:json)?/gi, '');
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('the reply was not understood');
    return JSON.parse(t.slice(a, b + 1));
  }

  /* ---- The three actions ------------------------------------------------- */
  const SYSTEM = 'You read handwriting and hand-drawn maths from a picture of part of a whiteboard. ' +
    'Reply with one JSON object only, exactly in the shape asked for, with no explanation around it.';
  const LATEX = 'Write maths in LaTeX: \\frac{a}{b}, x^{2}, x_{1}, \\sqrt{x}, \\sqrt[3]{x}, \\cdot, \\pm, \\le, \\ge, \\ne, \\pi, \\infty, \\sin, \\log, \\int, \\sum, \\lim. ' +
    'Never use environments (no \\begin, no \\\\ line breaks, no &), \\displaystyle or \\boxed.';
  const PROMPTS = {
    tidy: 'Transcribe all the handwriting in the picture, keeping its lines in order. ' +
      'Reply as {"lines": ["…", "…"]}, one string per written line. Write ordinary words as plain text, in the language they are written in. ' +
      'Put every mathematical expression (numbers with operators, variables, equations, fractions, exponents, roots, Greek letters…) between single dollar signs, ' +
      'e.g. "Area: $A = \\pi r^{2}$"; a line that is all maths is one $…$ span. ' + LATEX +
      ' Transcribe what is written: do not correct, solve, complete or add anything. Ignore doodles and drawings that are not writing.',
    solve: 'The picture shows a handwritten maths problem: an equation, a system of equations, an inequality, or an expression to simplify or evaluate. ' +
      'Solve it and show the working the way a student would write it by hand, one short line per step. Reply as ' +
      '{"problem": LaTeX of the problem as written, "plain": the problem in calculator syntax (e.g. "2*x+3=7"; several equations separated by ";"; use * / ^ sqrt() abs() ln() log() sin() pi), ' +
      '"steps": [LaTeX of each line of working, e.g. "2x = 4"; at most 12; do not repeat the problem first; a few words in \\text{…} are fine, in the language of the handwriting], ' +
      '"answer": LaTeX of the final result, e.g. "x = 2" or "x_{1} = 1,\\; x_{2} = 3", ' +
      '"solutions": [one object per solution mapping each variable to its exact value in calculator syntax, e.g. {"x": "sqrt(2)/2"}; [] for an expression, no solution, or infinitely many]}. ' + LATEX,
    plot: 'The picture shows one or more handwritten functions to graph, e.g. "f(x) = sin(x)" or "y = x^2 - 1". ' +
      'Reply as {"functions": [{"name": the left-hand side as written, e.g. "f(x)" or "y" ("" if there is none), ' +
      '"plain": the right-hand side in calculator syntax in terms of x, e.g. "sin(x)", "x^2-1", "sqrt(x)/2", "abs(x)", "e^x", "ln(x)", "log(x)" (base 10), "pi*x"; use * between factors when unsure}]}. ' +
      'Only functions of x. If something else is written, reply {"functions": []}.',
  };
  ai.run = async function (task, png, signal) {
    return json(await ask(SYSTEM, PROMPTS[task], png, signal));
  };

  /* The selection as a picture for the model: dark ink on white (whatever colours were used, so
     white ink on a dark board still reads), at most 1400 px on its long side. Highlighters are left out. */
  ai.picture = function (items) {
    const ink = items.filter((s) => s.tool !== 'eraser' && !s.hl).map((s) => {
      if (s.tool === 'pen' || s.tool === 'text' || s.tool === 'fill') return { ...s, color: '#111111', opacity: 1, _path: s._path, _opath: s._opath, _t: s._t };
      return s;
    });
    const b = WB.contentBounds(ink);
    if (!b) return null;
    const pad = Math.max(8, Math.max(b.w, b.h) * 0.06), box = { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad };
    const scale = Math.min(6, 1400 / Math.max(box.w, box.h)), rendered = WB.renderToCanvas(ink, box, scale, '#ffffff');
    return rendered.canvas.toDataURL('image/png');
  };

  WB.ai = ai;
})();
