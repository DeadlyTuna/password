(function () {
  'use strict';

  const CSS = `
#prior .pr-main { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 1.5rem; align-items: start; }
#prior svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: none; user-select: none; }
#prior .pr-handle { cursor: grab; outline: none; }
#prior .pr-handle:focus-visible circle.ring { stroke: var(--accent); stroke-width: 3; }
#prior .pr-bars { display: grid; gap: .45rem; }
#prior .pr-bar { display: grid; grid-template-columns: 4.6rem minmax(0, 1fr) 6.5rem; gap: .6rem; align-items: center; font-size: var(--fs-sm); }
#prior .pr-bar .t { height: .8rem; background: var(--paper-2); border-radius: 99px; overflow: hidden; border: 1px solid var(--line); position: relative; }
#prior .pr-bar .t i { display: block; height: 100%; background: var(--c); transition: width .35s var(--ease); }
#prior .pr-bar .t b { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--ink); transition: left .35s var(--ease); }
#prior .pr-bar .num { text-align: right; font-size: var(--fs-xs); }
#prior .pr-res { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
#prior .pr-res svg { max-width: 520px; }
#prior .pr-kpi { font: 750 var(--fs-lg)/1.1 var(--display); font-variant-numeric: tabular-nums; }
@media (max-width: 860px) { #prior .pr-main, #prior .pr-res { grid-template-columns: minmax(0, 1fr); } }`;

  const MIN = 0.001;
  const norm = (p) => { const q = p.map((x) => Math.max(MIN, x)); const s = q[0] + q[1] + q[2]; return q.map((x) => x / s); };

  PWB.register({
    id: 'prior',
    order: 100,
    nav: 'Prior',
    kicker: 'Prior and posterior',
    title: 'What if we believed something else first?',
    lede: 'The prior P(C) is what the model believes before reading the password. Drag it and watch the posterior respond.',
    mount(el, { E, kit, data, store, h, s, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES, d3 = window.d3;
      let prior = E.dataPrior.slice(), last = null;

      // ---------- simplex geometry (Weak bottom-left, Strong bottom-right, Medium top) ----------
      const W = 420, Ht = 390, pad = 46;
      const corner = [[pad, Ht - pad], [W / 2, pad + 10], [W - pad, Ht - pad]]; // Weak, Medium, Strong
      const toXY = (p) => [p[0] * corner[0][0] + p[1] * corner[1][0] + p[2] * corner[2][0], p[0] * corner[0][1] + p[1] * corner[1][1] + p[2] * corner[2][1]];
      function toBary(x, y) {
        const [[x1, y1], [x2, y2], [x3, y3]] = corner;
        const det = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
        const a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / det;
        const b = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / det;
        return norm([a, b, 1 - a - b]);
      }

      const svg = s('svg', { viewBox: `0 0 ${W} ${Ht}`, role: 'img', 'aria-label': 'Prior and posterior on the probability simplex' });
      const defs = s('defs', {}, s('marker', { id: 'prior-arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' },
        s('path', { d: 'M0,0 L10,5 L0,10 z', style: { fill: 'var(--ink)' } })));
      svg.append(defs);
      svg.append(s('path', { d: `M${corner.map((c) => c.join(',')).join(' L')} Z`, style: { fill: 'var(--surface)', stroke: 'var(--ink)', strokeWidth: '1.5' } }));
      for (let k = 1; k < 10; k++) {
        const t = k / 10;
        for (const [i, j, l] of [[0, 1, 2], [1, 2, 0], [2, 0, 1]]) {
          const a = [0, 0, 0], b = [0, 0, 0];
          a[i] = t; a[j] = 1 - t; b[i] = t; b[l] = 1 - t;
          const [x1, y1] = toXY(a), [x2, y2] = toXY(b);
          svg.append(s('line', { x1, y1, x2, y2, class: 'gridline', style: { strokeWidth: k === 5 ? '1.2' : '0.8' } }));
        }
      }
      C.forEach((c, i) => {
        const [x, y] = corner[i];
        svg.append(s('text', { x, y: i === 1 ? y - 14 : y + 24, 'text-anchor': i === 0 ? 'start' : i === 2 ? 'end' : 'middle', class: 'chart-text', style: { fill: kit.cls.ink(i), fontWeight: '700', fontSize: '13px' } }, `${c} = 1`));
      });
      const ref = (p, label, dy) => { const [x, y] = toXY(p); return s('g', {}, s('circle', { cx: x, cy: y, r: 4, style: { fill: 'none', stroke: 'var(--ink-2)', strokeWidth: '1.5' } }),
        s('text', { x: x + 7, y: y + dy, class: 'chart-text' }, label)); };
      svg.append(ref(E.dataPrior, 'data prior', -6), ref([1 / 3, 1 / 3, 1 / 3], 'uniform', 14));
      const arrow = s('line', { style: { stroke: 'var(--ink)', strokeWidth: '1.8', strokeDasharray: '5 3' }, 'marker-end': 'url(#prior-arrow)' });
      const postDot = s('g', {}, s('circle', { r: 9, style: { fill: 'var(--accent)', stroke: 'var(--paper)', strokeWidth: '2' } }),
        s('text', { y: -14, 'text-anchor': 'middle', class: 'chart-text', style: { fill: 'var(--accent)', fontWeight: '700' } }, 'posterior'));
      const handle = s('g', { class: 'pr-handle', id: 'prior-handle', tabindex: '0', role: 'slider', 'aria-label': 'Prior' },
        s('circle', { class: 'ring', r: 13, style: { fill: 'var(--paper)', stroke: 'var(--ink)', strokeWidth: '2' } }),
        s('circle', { r: 5, style: { fill: 'var(--ink)' } }),
        s('text', { y: 28, 'text-anchor': 'middle', class: 'chart-text', style: { fontWeight: '700', fill: 'var(--ink)' } }, 'prior'));
      svg.append(arrow, postDot, handle);

      const toLocal = (evt) => { const r = svg.getBoundingClientRect(); return [((evt.clientX - r.left) / r.width) * W, ((evt.clientY - r.top) / r.height) * Ht]; };
      let dragging = false;
      svg.addEventListener('pointerdown', (e) => { dragging = true; svg.setPointerCapture(e.pointerId); handle.focus({ preventScroll: true }); prior = toBary(...toLocal(e)); render(false); });
      svg.addEventListener('pointermove', (e) => { if (dragging) { prior = toBary(...toLocal(e)); render(false); } });
      svg.addEventListener('pointerup', () => { dragging = false; });
      handle.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.1 : 0.02, p = prior.slice();
        if (e.key === 'ArrowRight') { p[2] += step; p[0] -= step; } else if (e.key === 'ArrowLeft') { p[0] += step; p[2] -= step; }
        else if (e.key === 'ArrowUp') { p[1] += step; p[0] -= step / 2; p[2] -= step / 2; } else if (e.key === 'ArrowDown') { p[1] -= step; p[0] += step / 2; p[2] += step / 2; }
        else return;
        e.preventDefault(); prior = norm(p); render(true);
      });

      // ---------- side panel ----------
      const snap = (p) => { prior = p.slice(); render(true); };
      const bars = C.map((c, i) => { const fill = h('i'), mark = h('b'), num = h('span', { class: 'num' });
        return { el: h('div', { class: `pr-bar ${kit.cls.className(i)}` }, h('span', {}, c), h('div', { class: 't' }, fill, mark), num), fill, mark, num }; });
      const odds = h('div', { class: 'formula' });
      const strength = h('p', { class: 'callout' });

      // ---------- experiment results ----------
      const PE = data.results.prior_experiment;
      const resBox = h('div');
      const resKpis = h('div', { class: 'grid-2' }, PE.map((r) => h('div', { class: 'panel flat' }, h('div', { class: 'eyebrow' }, `${r.prior} prior`),
        h('div', { class: 'pr-kpi' }, `accuracy ${r.accuracy.toFixed(4)}`), h('div', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `macro F1 ${r.macro_f1.toFixed(4)}`))));
      const dataRow = PE.find((r) => r.prior === 'data'), uniRow = PE.find((r) => r.prior === 'uniform');

      el.append(
        h('div', { class: 'pr-main' },
          h('figure', { class: 'fig' }, svg,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Prior and posterior'), 'Every point in the triangle is a distribution over the three classes. Drag the prior (or focus it and use the arrow keys). The arrow shows where the current password’s evidence moves it: Bayesian updating.')),
          h('div', { class: 'stack' },
            h('div', { class: 'row' }, h('button', { class: 'btn small', id: 'prior-data', type: 'button', onClick: () => snap(E.dataPrior) }, 'Data prior'),
              h('button', { class: 'btn small', id: 'prior-uniform', type: 'button', onClick: () => snap([1 / 3, 1 / 3, 1 / 3]) }, 'Uniform 1/3')),
            h('h3', {}, 'Posterior for the current password'),
            h('div', { class: 'pr-bars' }, bars.map((b) => b.el)),
            h('p', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, 'Bars: posterior. Black ticks: the prior you set.'),
            odds, strength)),
        h('div', { class: 'stack' }, h('h3', {}, 'The prior experiment'),
          h('p', {}, `We re-ran the full 5-fold evaluation of the model with a uniform prior instead of the data prior (${E.dataPrior.map((p) => p.toFixed(1)).join(' / ')}). Only the Medium column of the prior grows, from ${E.dataPrior[1].toFixed(1)} to 1/3.`),
          h('div', { class: 'pr-res' },
            h('figure', { class: 'fig' }, resBox, h('figcaption', { class: 'cap' }, h('b', {}, 'Conditional probability P(ŷ = C | y = C)'), 'Per-class recall under each prior, out-of-fold over all training passwords.')),
            h('div', { class: 'stack' }, resKpis,
              h('p', { class: 'muted' }, `Medium recall rises from ${dataRow.Medium.toFixed(4)} to ${uniRow.Medium.toFixed(4)} and Weak recall falls from ${dataRow.Weak.toFixed(4)} to ${uniRow.Weak.toFixed(4)}. Strong recall is ${dataRow.Strong === uniRow.Strong ? 'identical' : 'almost unchanged'}: P(Strong) / P(Weak) is 1 under both priors, so only borderline Strong-vs-Medium cases could move, and none did.`)))));

      function drawResults(w) {
        const Hh = 210, m = { l: 36, r: 8, t: 12, b: 30 };
        const lo = Math.min(...PE.flatMap((r) => C.map((c) => r[c])));
        const x0 = d3.scaleBand().domain(C).range([m.l, w - m.r]).padding(0.25);
        const x1 = d3.scaleBand().domain(PE.map((r) => r.prior)).range([0, x0.bandwidth()]).padding(0.1);
        const y = d3.scaleLinear().domain([Math.floor((lo - 0.05) * 20) / 20, 1]).range([Hh - m.b, m.t]);
        const sv = d3.create('svg').attr('viewBox', `0 0 ${w} ${Hh}`).attr('role', 'img').attr('aria-label', 'Recall per class, data vs uniform prior');
        sv.append('g').attr('class', 'ax').attr('transform', `translate(0,${Hh - m.b})`).call(d3.axisBottom(x0).tickSizeOuter(0));
        sv.append('g').attr('class', 'ax').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));
        C.forEach((c, i) => PE.forEach((r) => {
          const xx = x0(c) + x1(r.prior);
          sv.append('rect').attr('x', xx).attr('width', x1.bandwidth()).attr('y', y(r[c])).attr('height', y.range()[0] - y(r[c]))
            .style('fill', r.prior === 'data' ? kit.cls.color(i) : `color-mix(in srgb, ${kit.cls.color(i)} 40%, transparent)`).style('stroke', kit.cls.color(i));
          sv.append('text').attr('class', 'chart-text').attr('x', xx + x1.bandwidth() / 2).attr('y', y(r[c]) - 4).attr('text-anchor', 'middle').style('font-size', '10px').text(r[c].toFixed(3));
          sv.append('text').attr('class', 'chart-text').attr('x', xx + x1.bandwidth() / 2).attr('y', y.range()[0] - 5).attr('text-anchor', 'middle').style('font-size', '9px').style('fill', 'var(--paper)').text(r.prior === 'data' ? 'data' : 'unif.');
        }));
        kit.replace(resBox, sv.node());
      }
      kit.responsive(resBox, drawResults);

      function render(animate) {
        if (!last) return;
        const ex = E.explain(last.password, { prior });
        const [hx, hy] = toXY(prior), [px, py] = toXY(ex.posterior);
        handle.setAttribute('transform', `translate(${hx},${hy})`);
        handle.setAttribute('aria-valuetext', C.map((c, i) => `${c} ${prior[i].toFixed(2)}`).join(', '));
        const T = animate && !kit.reducedMotion() ? 450 : 0;
        d3.select(postDot).transition().duration(T).attr('transform', `translate(${px},${py})`);
        const dx = px - hx, dy = py - hy, len = Math.hypot(dx, dy), cut = Math.min(len, 13);
        d3.select(arrow).transition().duration(T).attr('x1', hx + (len ? (dx / len) * 13 : 0)).attr('y1', hy + (len ? (dy / len) * 13 : 0))
          .attr('x2', px - (len ? (dx / len) * cut : 0)).attr('y2', py - (len ? (dy / len) * cut : 0)).style('opacity', len > 26 ? 1 : 0);
        bars.forEach((b, i) => { b.fill.style.width = `${Math.max(0.5, 100 * ex.posterior[i])}%`; b.mark.style.left = `calc(${100 * prior[i]}% - 1px)`;
          b.num.textContent = `${fmt.post(ex.posterior[i])}`; });
        const iS = 2, iW = 0;
        const pOdds = prior[iS] / prior[iW];
        const L = ex.steps.reduce((a, st) => a + st.llr, 0);
        const postOdds = ex.posterior[iS] / ex.posterior[iW];
        const big = (v) => (Math.abs(Math.log10(v)) < 4 ? v.toFixed(3) : fmt.sci(v, 3));
        odds.innerHTML = kit.tex(`\\frac{P(\\text{Strong}\\mid x)}{P(\\text{Weak}\\mid x)}=\\frac{${prior[iS].toFixed(3)}}{${prior[iW].toFixed(3)}}\\times e^{${L.toFixed(2)}}=\\text{${big(pOdds)}}\\times\\text{${Math.abs(L) < 700 ? big(Math.exp(L)) : `e^${L.toFixed(0)}`}}=\\text{${big(postOdds)}}`, true);
        const swing = Math.abs(Math.log(prior[iS] / prior[iW]));
        strength.textContent = !last.password ? 'Type a password to see how much its evidence moves the prior.'
          : Math.abs(L) > 8 ? `The features of this password give a log-likelihood ratio of ${fmt.signed(L, 2)} nats between Strong and Weak. The prior you set contributes only ${fmt.signed(Math.log(pOdds), 2)}, so the evidence decides: the prior barely matters here.`
            : `The evidence for this password is weak (log-likelihood ratio ${fmt.signed(L, 2)} nats between Strong and Weak), so the prior (${fmt.signed(Math.log(pOdds), 2)} nats now${swing > 0.01 ? '' : ', neutral'}) can change the answer. Try dragging it.`;
      }

      store.subscribe((st) => { last = st; render(true); }, 'prior');
    },
  });
})();
