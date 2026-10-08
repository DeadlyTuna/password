/* PWB kit: shared helpers every section uses. See web/CONTRACT.md. */
(function () {
  'use strict';
  const PWB = (window.PWB = window.PWB || {});
  PWB.sections = PWB.sections || [];
  PWB.register = (section) => PWB.sections.push(section);
  window.__pwbErrors = window.__pwbErrors || [];
  const recordError = (where, err) => {
    window.__pwbErrors.push({ where, message: String((err && err.message) || err), stack: err && err.stack });
    console.error(`[PWB:${where}]`, err);
  };

  // ---------- DOM builders ----------
  const SVGNS = 'http://www.w3.org/2000/svg';
  function build(ns, tag, props, children) {
    const el = ns ? document.createElementNS(ns, tag) : document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.setAttribute('class', v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k.startsWith('--')) el.style.setProperty(k, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children.flat(Infinity)) {
      if (c === null || c === undefined || c === false) continue;
      el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return el;
  }
  const h = (tag, props, ...children) => build(null, tag, props, children);
  const s = (tag, props, ...children) => build(SVGNS, tag, props, children);
  const replace = (el, ...children) => { el.replaceChildren(); return append(el, children); };

  // ---------- number formatting ----------
  const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  const sup = (str) => String(str).replace(/[-0-9]/g, (c) => SUP[c]);
  const fmt = {
    sci(x, d = 3) {
      if (x === 0) return '0';
      if (!isFinite(x)) return String(x);
      const [m, e] = x.toExponential(d - 1).split('e');
      const exp = parseInt(e, 10);
      return exp === 0 ? m : `${m} × 10${sup(exp)}`;
    },
    prob(x, d = 4) {
      if (x === 0) return '0';
      if (x >= 1e-3) return x.toFixed(d);
      return fmt.sci(x, 3);
    },
    post(x) {
      if (x < 1 && 1 - x < 1e-4) return `1 − ${fmt.sci(1 - x, 2)}`;
      return fmt.prob(x);
    },
    pct: (x, d = 1) => `${(100 * x).toFixed(d)}%`,
    int: (n) => Math.round(n).toLocaleString('en-US'),
    fixed: (x, d = 2) => Number(x).toFixed(d),
    signed: (x, d = 2) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`,
    bits: (x) => `${x.toFixed(1)} bits`,
    duration(sec) {
      if (!isFinite(sec)) return 'forever';
      if (sec < 1e-3) return 'instantly';
      const units = [['second', 1], ['minute', 60], ['hour', 3600], ['day', 86400], ['year', 31557600],
        ['thousand years', 31557600e3], ['million years', 31557600e6], ['billion years', 31557600e9]];
      if (sec >= 31557600e12) return `${fmt.sci(sec / 31557600, 2)} years`;
      let u = units[0];
      for (const x of units) if (sec >= x[1]) u = x;
      const v = sec / u[1];
      const n = v >= 10 ? Math.round(v) : Number(v.toFixed(1));
      return `${n} ${u[0]}${n !== 1 && !u[0].includes(' ') ? 's' : ''}`;
    },
  };

  // ---------- math (KaTeX -> native MathML; no external CSS or fonts needed) ----------
  function tex(latex, display = false) {
    try {
      if (window.katex) return window.katex.renderToString(latex, { output: 'mathml', displayMode: display, throwOnError: false });
    } catch (e) { recordError('tex', e); }
    return `<code>${latex.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</code>`;
  }
  const texEl = (latex, display = false) => h(display ? 'div' : 'span', { class: display ? 'formula' : null, html: tex(latex, display) });

  // ---------- classes & colours ----------
  const CLS = ['Weak', 'Medium', 'Strong'];
  const key = (c) => (typeof c === 'number' ? CLS[c] : c).toLowerCase();
  const cls = {
    names: CLS,
    color: (c) => `var(--${key(c)})`,
    ink: (c) => `var(--${key(c)}-ink)`,
    className: (c) => `c-${key(c)}`,
  };
  const gradeColor = (g) => ({ A: 'var(--strong)', B: 'var(--strong)', C: 'var(--medium)', D: 'var(--weak)', F: 'var(--weak)' }[g] || 'var(--accent)');
  const cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();

  // ---------- motion ----------
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  function animate({ from = 0, to = 1, duration = 500, ease = easeOut, onUpdate, onDone }) {
    if (reducedMotion() || duration <= 0) { onUpdate(to, 1); onDone && onDone(); return () => {}; }
    let raf, t0;
    const step = (t) => {
      t0 = t0 ?? t;
      const k = Math.min(1, (t - t0) / duration);
      onUpdate(from + (to - from) * ease(k), k);
      if (k < 1) raf = requestAnimationFrame(step); else onDone && onDone();
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }
  // Tween a number shown in el. Remembers the last value on the element.
  function countTo(el, value, format = (v) => v.toFixed(0), duration = 450) {
    const from = el.__pwbVal ?? value;
    el.__pwbCancel && el.__pwbCancel();
    el.__pwbVal = value;
    el.__pwbCancel = animate({ from, to: value, duration, onUpdate: (v) => { el.textContent = format(v); } });
  }

  // ---------- tooltip ----------
  let tipEl;
  const tip = {
    show(html, evt) {
      tipEl = tipEl || document.body.appendChild(h('div', { class: 'tip', role: 'tooltip' }));
      tipEl.innerHTML = html;
      tipEl.classList.add('show');
      tip.move(evt);
    },
    move(evt) {
      if (!tipEl || !evt) return;
      const pad = 14, w = tipEl.offsetWidth, ht = tipEl.offsetHeight;
      let x = evt.clientX + pad, y = evt.clientY + pad;
      if (x + w > window.innerWidth - 8) x = evt.clientX - w - pad;
      if (y + ht > window.innerHeight - 8) y = evt.clientY - ht - pad;
      tipEl.style.left = `${Math.max(8, x)}px`;
      tipEl.style.top = `${Math.max(8, y)}px`;
    },
    hide() { tipEl && tipEl.classList.remove('show'); },
    // Attach to an element (or d3 selection node); htmlFn(evt) returns the tooltip HTML.
    attach(el, htmlFn) {
      el.addEventListener('pointerenter', (e) => tip.show(htmlFn(e), e));
      el.addEventListener('pointermove', (e) => tip.move(e));
      el.addEventListener('pointerleave', () => tip.hide());
    },
  };

  // ---------- misc ----------
  const debounce = (fn, ms = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  // Calls draw(width) now and whenever el's width changes.
  function responsive(el, draw) {
    let last = -1;
    const run = () => {
      const w = Math.round(el.clientWidth);
      if (w > 0 && w !== last) {
        last = w;
        const t0 = performance.now();
        try { draw(w); } catch (e) { recordError('responsive', e); }
        const dt = performance.now() - t0;
        if (dt > 30) (window.__pwbSlow = window.__pwbSlow || []).push({ where: (el.closest('section') || {}).id, w, ms: Math.round(dt) });
      }
    };
    new ResizeObserver(debounce(run, 60)).observe(el);
    requestAnimationFrame(run);
    setTimeout(run, 50); // frames are paused in background tabs; draw anyway (run is idempotent)
    return { redraw: () => { last = -1; run(); } };
  }
  const meter = (score) => h('span', { class: 'meter', dataset: { score: String(score) }, 'aria-label': `${score} of 4` }, h('i'), h('i'), h('i'), h('i'));
  const escape = (str) => String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Visible rendering of a password: spaces shown as ␣ so nothing is invisible.
  const showPw = (pw) => (pw === '' ? '(empty)' : pw.replace(/ /g, '␣'));

  // ---------- the live password store ----------
  function createStore(E) {
    const subs = [];
    let state = null;
    let pending = null;
    const compute = (password) => {
      const ex = E.explain(password);
      return { password, ex, rating: E.rate(ex) };
    };
    const times = (window.__pwbTimes = {}); // last update cost per section, ms (for profiling)
    const notify = () => {
      for (const { fn, id } of subs) {
        const t0 = performance.now();
        try { fn(state); } catch (e) { recordError(id || 'subscriber', e); }
        times[id || 'subscriber'] = performance.now() - t0;
      }
    };
    return {
      get: () => state,
      set(password) {
        password = String(password ?? '');
        if (state && state.password === password) return;
        state = compute(password);
        if (pending) return;
        pending = requestAnimationFrame(() => { pending = null; notify(); });
      },
      // Deliver a pending update now (tests, or a page whose frames are paused in a background tab).
      flush() { if (pending) { cancelAnimationFrame(pending); pending = null; notify(); } },
      // fn(state) is called on every change and immediately if a password is already set.
      subscribe(fn, id) {
        subs.push({ fn, id });
        if (state) { try { fn(state); } catch (e) { recordError(id || 'subscriber', e); } }
        return () => { const i = subs.findIndex((x) => x.fn === fn); if (i >= 0) subs.splice(i, 1); };
      },
    };
  }

  PWB.kit = {
    h, s, append, replace, fmt, sup, tex, texEl, cls, gradeColor, cssVar, animate, countTo, reducedMotion,
    tip, debounce, responsive, meter, escape, showPw, createStore, recordError,
  };
})();
