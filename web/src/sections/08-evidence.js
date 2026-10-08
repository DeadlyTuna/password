(function () {
  'use strict';

  const CSS = `
#evidence .ev-ctl { display: flex; flex-wrap: wrap; gap: .8rem 1.2rem; align-items: end; }
#evidence svg { display: block; width: 100%; height: auto; overflow: visible; }
#evidence .ev-lab { font: 500 11.5px var(--mono); fill: var(--ink); }
#evidence .ev-val { font: 600 11px var(--mono); }
#evidence .ev-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
#evidence .ev-sum .big { font: 750 var(--fs-xl)/1.1 var(--display); font-variant-numeric: tabular-nums; }
#evidence .ev-story { display: grid; gap: .5rem; padding: 0; margin: 0; list-style: none; }
#evidence .ev-story li { padding: .55rem .75rem; border-radius: var(--r); background: var(--paper-2); font-size: var(--fs-sm); border-left: 3px solid var(--c); }
@media (max-width: 760px) { #evidence .ev-sum { grid-template-columns: minmax(0, 1fr); } }`;

  const PAIRS = [[2, 0], [1, 0], [2, 1]];
  const oddsStr = (L, fmt) => (Math.abs(L) < 700 ? fmt.sci(Math.exp(L), 3) : `e^${L.toFixed(1)}`);
  const timesStr = (r) => (r >= 1e6 ? `about ${r.toExponential(1).replace('e+', ' × 10^')}` : r >= 100 ? `about ${Math.round(r).toLocaleString('en-US')}` : r.toFixed(1));

  PWB.register({
    id: 'evidence',
    order: 80,
    nav: 'Evidence',
    kicker: 'Log-odds',
    title: 'Which features pushed it where',
    lede: 'Each feature adds its log-likelihood ratio to the log-odds. Positive values push toward one class, negative values toward the other.',
    mount(el, { E, kit, store, h, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES, d3 = window.d3;
      let pair = 0, sorted = false, bits = false, last = null;

      const seg = (id, opts, get, set) => {
        const wrap = h('div', { class: 'seg', role: 'group', id });
        opts.forEach(([v, label]) => wrap.append(h('button', { type: 'button', 'aria-pressed': String(get() === v), onClick: () => {
          set(v); [...wrap.children].forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i][0] === v))); render(true);
        } }, label)));
        return wrap;
      };
      const chartBox = h('div');
      const sum = h('div', { class: 'ev-sum' });
      const story = h('ul', { class: 'ev-story' });
      const formula = h('div', { class: 'formula' });

      el.append(
        h('p', {}, 'Write the posterior as odds between two classes A and B. Bayes’ theorem then says posterior odds = prior odds × the likelihood ratio of every feature. Taking logs turns that product into a sum, so each feature contributes a signed amount you can draw as a bar.'),
        formula,
        h('div', { class: 'ev-ctl' },
          h('div', { class: 'field' }, h('label', {}, 'COMPARE'), seg('evidence-pair', PAIRS.map(([a, b], i) => [i, `${C[a]} vs ${C[b]}`]), () => pair, (v) => { pair = v; })),
          h('div', { class: 'field' }, h('label', {}, 'ORDER'), seg('evidence-order', [[false, 'pipeline'], [true, 'by impact']], () => sorted, (v) => { sorted = v; })),
          h('div', { class: 'field' }, h('label', {}, 'UNITS'), seg('evidence-units', [[false, 'nats'], [true, 'bits']], () => bits, (v) => { bits = v; }))),
        h('figure', { class: 'fig' }, chartBox,
          h('figcaption', { class: 'cap' }, h('b', {}, 'Likelihood ratio'), 'Waterfall of the log-odds. The first bar is the prior log-odds ln(P(A) / P(B)); each feature adds ln P(f | A) − ln P(f | B); the last bar is the posterior log-odds, their sum.')),
        sum,
        h('div', { class: 'stack' }, h('h3', {}, 'In words'), story));

      let chart = null;
      function build() {
        const w = Math.max(300, chartBox.clientWidth || 640);
        const rowH = 26, m = { l: Math.min(150, w * 0.34), r: 58, t: 22, b: 28 }, H = m.t + m.b + rowH * 11;
        const svg = d3.create('svg').attr('viewBox', `0 0 ${w} ${H}`).attr('role', 'img').attr('aria-label', 'Log-odds waterfall');
        const x = d3.scaleLinear().range([m.l, w - m.r]);
        const gx = svg.append('g').attr('class', 'ax').attr('transform', `translate(0,${H - m.b})`);
        const grid = svg.append('g');
        const zero = svg.append('line').attr('y1', m.t - 6).attr('y2', H - m.b).style('stroke', 'var(--ink)').style('stroke-width', 1);
        const sideA = svg.append('text').attr('class', 'chart-text').attr('y', 12).attr('text-anchor', 'end');
        const sideB = svg.append('text').attr('class', 'chart-text').attr('y', 12);
        const rows = svg.append('g');
        kit.replace(chartBox, svg.node());
        chart = { svg, x, gx, grid, zero, rows, w, H, m, rowH, sideA, sideB };
      }

      function render(animate) {
        if (!last) return;
        if (!chart) build();
        const ex = last.ex, [A, B] = PAIRS[pair], u = bits ? Math.LN2 : 1, unit = bits ? 'bits' : 'nats';
        const priorL = Math.log(ex.prior[A] / ex.prior[B]);
        let items = ex.steps.map((s) => ({ key: s.feature, label: `${s.feature} = ${s.value}`, v: Math.log(s.lik[A]) - Math.log(s.lik[B]), s }));
        if (sorted) items = items.slice().sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
        let cum = priorL;
        const rowsData = [{ key: '__prior', label: 'prior log-odds', v: priorL, from: 0, to: priorL, kind: 'prior' }];
        for (const it of items) { rowsData.push({ ...it, from: cum, to: cum + it.v, kind: 'f' }); cum += it.v; }
        const L = cum;
        rowsData.push({ key: '__total', label: 'posterior log-odds', v: L, from: 0, to: L, kind: 'total' });

        const { x, gx, grid, zero, rows, w, H, m, rowH, sideA, sideB } = chart;
        const ext = d3.extent(rowsData.flatMap((r) => [r.from / u, r.to / u, 0]));
        x.domain(ext).nice();
        const T = animate && !kit.reducedMotion() ? 450 : 0;
        gx.transition().duration(T).call(d3.axisBottom(x).ticks(w < 480 ? 4 : 8).tickSizeOuter(0));
        grid.selectAll('line').data(x.ticks(w < 480 ? 4 : 8)).join('line').attr('class', 'gridline').attr('y1', m.t - 6).attr('y2', H - m.b)
          .transition().duration(T).attr('x1', (d) => x(d)).attr('x2', (d) => x(d));
        zero.transition().duration(T).attr('x1', x(0)).attr('x2', x(0));
        sideA.attr('x', w - m.r).text(`toward ${C[A]} →`).style('fill', kit.cls.ink(A));
        sideB.attr('x', m.l).text(`← toward ${C[B]}`).style('fill', kit.cls.ink(B));

        const color = (r) => (r.kind === 'total' ? kit.cls.color(r.v >= 0 ? A : B) : r.v >= 0 ? kit.cls.color(A) : kit.cls.color(B));
        const g = rows.selectAll('g.r').data(rowsData, (d) => d.key).join((en) => {
          const gg = en.append('g').attr('class', 'r').attr('transform', (d, i) => `translate(0,${m.t + i * rowH})`);
          gg.append('text').attr('class', 'ev-lab').attr('x', m.l - 8).attr('y', rowH / 2 + 4).attr('text-anchor', 'end');
          gg.append('rect').attr('y', 4).attr('height', rowH - 8).attr('rx', 2).attr('x', x(0)).attr('width', 0);
          gg.append('line').attr('class', 'conn');
          gg.append('text').attr('class', 'ev-val').attr('y', rowH / 2 + 4);
          return gg;
        });
        g.transition().duration(T).attr('transform', (d, i) => `translate(0,${m.t + i * rowH})`);
        g.select('.ev-lab').text((d) => d.label).style('font-weight', (d) => (d.kind === 'f' ? 400 : 700));
        g.select('rect').style('fill', color).style('opacity', (d) => (d.kind === 'f' ? 0.9 : 1))
          .transition().duration(T).attr('x', (d) => x(Math.min(d.from, d.to) / u)).attr('width', (d) => Math.max(1, Math.abs(x(d.to / u) - x(d.from / u))));
        g.select('.conn').style('stroke', 'var(--ink-3)').style('stroke-dasharray', '2 2')
          .transition().duration(T).attr('x1', (d) => x(d.to / u)).attr('x2', (d) => x(d.to / u)).attr('y1', rowH - 4).attr('y2', (d, i) => (i < rowsData.length - 2 ? rowH + 4 : rowH - 4));
        g.select('.ev-val').text((d) => fmt.signed(d.v / u, 2)).style('fill', (d) => (d.v >= 0 ? kit.cls.ink(A) : kit.cls.ink(B)))
          .transition().duration(T).attr('x', (d) => Math.max(d.from, d.to) / u >= x.invert(w - m.r - 40) ? x(Math.min(d.from, d.to) / u) - 4 : x(Math.max(d.from, d.to) / u) + 4)
          .attr('text-anchor', (d) => (Math.max(d.from, d.to) / u >= x.invert(w - m.r - 40) ? 'end' : 'start'));

        // summary
        const pAB = 1 / (1 + Math.exp(-L));
        const direct = ex.posterior[A] / (ex.posterior[A] + ex.posterior[B]);
        kit.replace(sum,
          h('div', { class: 'panel flat stack' }, h('span', { class: 'eyebrow' }, 'Posterior log-odds'), h('span', { class: 'big' }, `${fmt.signed(L / u, 2)} ${unit}`),
            h('span', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `prior ${fmt.signed(priorL / u, 2)} + features ${fmt.signed((L - priorL) / u, 2)}`)),
          h('div', { class: 'panel flat stack' }, h('span', { class: 'eyebrow' }, `From the log-odds`), h('span', { class: 'big' }, fmt.post(pAB)),
            h('span', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `P(${C[A]} | x, ${C[A]} or ${C[B]}) = 1 / (1 + e^(−L))`)),
          h('div', { class: 'panel flat stack' }, h('span', { class: 'eyebrow' }, 'From the posterior directly'), h('span', { class: 'big' }, fmt.post(direct)),
            h('span', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `P(${C[A]}) / (P(${C[A]}) + P(${C[B]})) with the full posterior. Same number.`)));

        const top = ex.steps.map((s) => ({ s, v: Math.log(s.lik[A]) - Math.log(s.lik[B]) })).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 3);
        kit.replace(story, top.map(({ s, v }, i) => {
          const toward = v >= 0 ? A : B, away = v >= 0 ? B : A;
          const r = Math.exp(Math.abs(v));
          return h('li', { class: kit.cls.className(toward) },
            `${i === 0 ? 'The biggest push' : i === 1 ? 'Next' : 'Third'}: ${s.feature} = ${s.value} is ${timesStr(r)} times more likely in ${C[toward]} than in ${C[away]} passwords (${fmt.prob(s.lik[toward])} vs ${fmt.prob(s.lik[away])}), worth ${fmt.signed(v / u, 2)} ${unit}.`);
        }));

        const lr = L - priorL;
        formula.innerHTML = kit.tex(`\\underbrace{\\frac{P(\\text{${C[A]}}\\mid x)}{P(\\text{${C[B]}}\\mid x)}}_{\\text{posterior odds}}=\\underbrace{\\frac{P(\\text{${C[A]}})}{P(\\text{${C[B]}})}}_{${(ex.prior[A] / ex.prior[B]).toFixed(2)}}\\times\\underbrace{\\prod_j\\frac{P(f_j\\mid \\text{${C[A]}})}{P(f_j\\mid \\text{${C[B]}})}}_{\\text{${oddsStr(lr, fmt)}}}=\\text{${oddsStr(L, fmt)}}`, true);
      }

      kit.responsive(chartBox, () => { chart = null; render(false); });
      store.subscribe((st) => { last = st; render(true); }, 'evidence');
    },
  });
})();
