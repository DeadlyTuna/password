(function () {
  'use strict';

  const CSS = `
#multiply .mu-ctl { display: flex; flex-wrap: wrap; gap: .8rem 1rem; align-items: center; }
#multiply .mu-ctl input[type=range] { flex: 1 1 14rem; }
#multiply .mu-step { font: 600 var(--fs-sm) var(--mono); min-width: 14rem; }
#multiply .mu-main { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
#multiply svg { display: block; width: 100%; height: auto; overflow: visible; }
#multiply .mu-arith { display: grid; gap: .55rem; }
#multiply .mu-arith .row3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .5rem; }
#multiply .mu-cell { border-top: 3px solid var(--c); padding-top: .3rem; display: grid; gap: .1rem; min-width: 0; }
#multiply .mu-cell .eyebrow { color: var(--c-ink); }
#multiply .mu-cell .num { font-size: var(--fs-sm); word-break: break-word; }
#multiply .mu-cell .faint { font: 500 var(--fs-xs) var(--mono); }
#multiply .mu-arith .formula { font-size: 1rem; }
#multiply .tbl td.cur, #multiply .tbl tr.cur td { background: var(--accent-soft); }
#multiply .tbl tr.cur td:first-child { color: var(--accent); font-weight: 600; }
#multiply .mu-under { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
#multiply .mu-under .big { font: 750 var(--fs-xl)/1.1 var(--display); font-variant-numeric: tabular-nums; }
@media (max-width: 860px) { #multiply .mu-main, #multiply .mu-under { grid-template-columns: minmax(0, 1fr); } }`;

  const LAST = 11; // 0 prior, 1..9 features, 10 normalise, 11 posterior
  const texNum = (x) => {
    if (x === 0) return '0';
    if (x >= 1e-3 && x < 1e4) return Number(x.toPrecision(4)).toString();
    const [m, e] = x.toExponential(2).split('e');
    return `${m}\\times10^{${parseInt(e, 10)}}`;
  };

  PWB.register({
    id: 'multiply',
    order: 70,
    nav: 'Multiply',
    kicker: 'Naive Bayes',
    title: 'Multiplying the evidence, one feature at a time',
    lede: 'Naive Bayes assumes the features are independent given the class, so the joint likelihood is a product. In log space the product becomes a sum.',
    mount(el, { E, kit, store, h, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES, d3 = window.d3;
      let step = LAST, timer = null, last = null;

      const range = h('input', { type: 'range', id: 'multiply-step', min: '0', max: String(LAST), step: '1', value: String(LAST), 'aria-label': 'Step' });
      const play = h('button', { class: 'btn small primary', id: 'multiply-play', type: 'button' }, 'Play');
      const stepLabel = h('span', { class: 'mu-step', 'aria-live': 'polite' });
      range.addEventListener('input', () => { stop(); step = +range.value; render(); });
      const stop = () => { if (timer) { clearInterval(timer); timer = null; play.textContent = 'Play'; } };
      play.addEventListener('click', () => {
        if (timer) return stop();
        if (step >= LAST) step = 0;
        play.textContent = 'Pause';
        render();
        timer = setInterval(() => { step += 1; if (step >= LAST) { step = LAST; stop(); } render(); }, kit.reducedMotion() ? 900 : 650);
      });

      const chartBox = h('div');
      const arith = h('div', { class: 'mu-arith' });
      const table = h('table', { class: 'tbl' });
      const under = h('div', { class: 'mu-under' });

      el.append(
        kit.texEl('P(C\\mid x)\\;\\propto\\;P(C)\\prod_{j=1}^{9}P(f_j\\mid C)\\qquad\\Longleftrightarrow\\qquad \\ln P(C\\mid x)=\\ln P(C)+\\sum_{j=1}^{9}\\ln P(f_j\\mid C)-\\ln P(x)', true),
        h('div', { class: 'panel mu-ctl' }, play, range, stepLabel),
        h('div', { class: 'mu-main' },
          h('figure', { class: 'fig' }, chartBox,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Joint probability under independence'), 'Running log joint ln P(C) + Σ ln P(f | C) for each class after each feature (natural log). Every step adds one log-likelihood; the highest line at the end is the prediction.')),
          h('div', { class: 'panel' }, arith)),
        h('figure', { class: 'fig' }, h('h3', {}, 'The full step table'), h('div', { class: 'scroll-x' }, table),
          h('figcaption', { class: 'cap' }, h('b', {}, 'Law of total probability'), 'The evidence row is the sum of the three joint scores. Dividing each joint score by it gives the posterior, which sums to 1.')),
        h('figure', { class: 'fig' }, h('h3', {}, 'Why the model works in logs'), under,
          h('figcaption', { class: 'cap' }, h('b', {}, 'Log-sum-exp'), 'Products of many small probabilities underflow to exactly 0 in 64-bit floating point. Sums of logs never do, and log-sum-exp normalises them without leaving log space.')));

      // ---------- chart (persistent, updated with transitions) ----------
      let chart = null;
      function buildChart() {
        const w = Math.max(280, chartBox.clientWidth || 560), H = 280, m = { l: 52, r: 66, t: 14, b: 40 };
        const svg = d3.create('svg').attr('viewBox', `0 0 ${w} ${H}`).attr('role', 'img').attr('aria-label', 'Running log joint for each class');
        const x = d3.scaleLinear().domain([0, 9]).range([m.l, w - m.r]);
        const y = d3.scaleLinear().range([H - m.b, m.t]);
        const band = svg.append('rect').attr('y', m.t).attr('height', H - m.t - m.b).style('fill', 'var(--accent-soft)');
        const gx = svg.append('g').attr('class', 'ax').attr('transform', `translate(0,${H - m.b})`);
        const gy = svg.append('g').attr('class', 'ax').attr('transform', `translate(${m.l},0)`);
        const grid = svg.append('g');
        svg.append('text').attr('class', 'chart-text').attr('x', 4).attr('y', m.t - 2).text('ln joint');
        const lines = C.map((c, i) => svg.append('path').style('fill', 'none').style('stroke', kit.cls.color(i)).style('stroke-width', 2.4));
        const dots = C.map((c, i) => svg.append('g').style('fill', kit.cls.color(i)));
        const labels = C.map((c, i) => svg.append('text').attr('class', 'chart-text').style('fill', kit.cls.ink(i)).style('font-weight', 700).attr('x', w - m.r + 6));
        kit.replace(chartBox, svg.node());
        chart = { svg, x, y, band, gx, gy, grid, lines, dots, labels, w, H, m };
      }
      function updateChart(ex, animate) {
        if (!chart) buildChart();
        const { x, y, band, gx, gy, grid, lines, dots, labels, w, m } = chart;
        const series = C.map((c, i) => [Math.log(ex.prior[i]), ...ex.steps.map((s) => s.logJointAfter[i])]);
        const all = series.flat();
        y.domain([Math.min(...all), Math.max(0, ...all)]).nice();
        const T = animate && !kit.reducedMotion() ? 450 : 0;
        gx.call(d3.axisBottom(x).ticks(10).tickFormat((d) => (d === 0 ? 'prior' : ex.steps[d - 1].feature.replace('_bin', '').replace('has_', '').replace('is_', ''))).tickSizeOuter(0))
          .selectAll('text').attr('transform', 'rotate(-30)').style('text-anchor', 'end');
        gy.transition().duration(T).call(d3.axisLeft(y).ticks(6).tickSizeOuter(0));
        grid.selectAll('line').data(y.ticks(6)).join('line').attr('class', 'gridline').attr('x1', m.l).attr('x2', w - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
        const line = d3.line().x((d, j) => x(j)).y((d) => y(d));
        lines.forEach((p, i) => p.transition().duration(T).attr('d', line(series[i])));
        dots.forEach((g, i) => g.selectAll('circle').data(series[i]).join('circle').attr('r', 3.2).transition().duration(T).attr('cx', (d, j) => x(j)).attr('cy', (d) => y(d)));
        const k = Math.min(step, 9);
        labels.forEach((t, i) => t.transition().duration(T).attr('y', y(series[i][9]) + 4).text(`${C[i]} ${series[i][9].toFixed(1)}`));
        const bw = (x(1) - x(0)) * 0.8;
        band.transition().duration(T).attr('x', x(k) - bw / 2).attr('width', bw);
        dots.forEach((g) => g.selectAll('circle').attr('r', (d, j) => (j === k ? 5.5 : 3.2)));
      }

      // ---------- arithmetic for the current step ----------
      const cells = (vals) => h('div', { class: 'row3' }, C.map((c, i) => h('div', { class: `mu-cell ${kit.cls.className(i)}` }, h('span', { class: 'eyebrow' }, c), vals(i))));
      function renderArith(ex) {
        const lj = (k) => (k === 0 ? ex.prior.map(Math.log) : ex.steps[k - 1].logJointAfter);
        if (step === 0) {
          stepLabel.textContent = 'Step 0 · start from the prior';
          kit.replace(arith, h('h3', {}, 'Start with the prior P(C)'),
            h('p', { class: 'muted' }, 'Before reading anything, the model believes each class in proportion to its share of the training data.'),
            cells((i) => [h('span', { class: 'num' }, ex.prior[i].toFixed(4)), h('span', { class: 'faint' }, `ln = ${Math.log(ex.prior[i]).toFixed(3)}`)]));
        } else if (step <= 9) {
          const s = ex.steps[step - 1], prev = lj(step - 1), cur = lj(step);
          stepLabel.textContent = `Step ${step} · × P(${s.feature} = ${s.value} | C)`;
          kit.replace(arith, h('h3', {}, `Multiply by P(${s.feature} = ${s.value} | C)`),
            h('p', { class: 'muted' }, `${s.kind === 'cat' ? 'A binned count' : 'A yes/no pattern'}. Its likelihood in each class comes from the training counts.`),
            cells((i) => [h('span', { class: 'num' }, `× ${fmt.prob(s.lik[i])}`), h('span', { class: 'faint' }, `${fmt.sci(Math.exp(prev[i]), 3)} → ${fmt.sci(Math.exp(cur[i]), 3)}`),
              h('span', { class: 'faint' }, `ln: ${prev[i].toFixed(2)} ${fmt.signed(Math.log(s.lik[i]), 2)} = ${cur[i].toFixed(2)}`)]));
        } else if (step === 10) {
          const sC = ex.logJoint, mx = Math.max(...sC), sh = sC.map((v) => Math.exp(v - mx)), sum = sh.reduce((a, b) => a + b, 0);
          stepLabel.textContent = 'Step 10 · normalise with log-sum-exp';
          kit.replace(arith, h('h3', {}, 'Normalise: the evidence P(x)'),
            h('p', { class: 'muted' }, 'P(x) is the sum of the three joint scores. To add numbers stored as logs, shift by the largest one first so nothing underflows.'),
            h('div', { class: 'formula' }, h('span', { html: kit.tex(`m=\\max_C s_C=${mx.toFixed(3)}`) })),
            cells((i) => [h('span', { class: 'num' }, `e^(s − m) = ${fmt.prob(sh[i])}`), h('span', { class: 'faint' }, `s = ${sC[i].toFixed(3)}`)]),
            h('div', { class: 'formula', html: kit.tex(`\\ln P(x)=m+\\ln\\sum_C e^{s_C-m}=${mx.toFixed(3)}+\\ln(${sum.toFixed(4)})=${ex.logEvidence.toFixed(3)}`, true) }),
            h('p', {}, `So P(x) = ${fmt.sci(ex.evidence, 4)}.`));
        } else {
          stepLabel.textContent = 'Step 11 · posterior';
          kit.replace(arith, h('h3', {}, 'Posterior P(C | x)'),
            h('p', { class: 'muted' }, 'Each joint score divided by the evidence. The three numbers now sum to 1.'),
            cells((i) => [h('span', { class: 'num' }, fmt.post(ex.posterior[i])), h('span', { class: 'faint' }, `e^(${ex.logJoint[i].toFixed(2)} − (${ex.logEvidence.toFixed(2)}))`)]),
            h('div', { class: 'formula', html: kit.tex(`P(\\text{${ex.pred}}\\mid x)=\\frac{${texNum(ex.joint[ex.predIndex])}}{${texNum(ex.evidence)}}=${ex.posterior[ex.predIndex] > 0.9999 && ex.posterior[ex.predIndex] < 1 ? '0.9999\\ldots' : ex.posterior[ex.predIndex].toFixed(4)}`, true) }));
        }
      }

      function renderTable(ex) {
        const rows = [['P(C)  prior', ex.prior, 0]]
          .concat(ex.steps.map((s, j) => [`P(${s.feature} = ${s.value} | C)`, s.lik, j + 1]))
          .concat([['joint  P(C)·∏P(f|C)', ex.joint, 9.5], ['evidence  P(x) = Σ joint', C.map(() => ex.evidence), 10], ['posterior  P(C | x)', ex.posterior, 11]]);
        kit.replace(table, h('thead', {}, h('tr', {}, h('th', {}, 'step'), C.map((c) => h('th', {}, c)))),
          h('tbody', {}, rows.map(([label, vals, k]) => h('tr', { class: `${Math.floor(k) === step || (k === 9.5 && step === 9) ? 'cur' : ''} ${k === 11 ? 'total' : ''}` },
            h('td', {}, label), vals.map((v, i) => h('td', { class: k === 11 && i === ex.predIndex ? 'hl' : '' }, k === 11 ? fmt.post(v) : fmt.prob(v)))))));
      }

      function renderUnder(ex) {
        const pmin = Math.min(...ex.steps.flatMap((s) => s.lik));
        let x = 1, n = 0;
        while (x > 0 && n < 100000) { x *= pmin; n++; }
        kit.replace(under,
          h('div', { class: 'panel flat stack' }, h('span', { class: 'eyebrow' }, 'Multiplying probabilities'),
            h('span', { class: 'big' }, `${fmt.int(n)} factors`),
            h('p', { class: 'muted' }, `The smallest likelihood for this password is ${fmt.sci(pmin, 3)}. Multiply it by itself ${fmt.int(n)} times and a 64-bit float becomes exactly 0, below about 5 × 10⁻³²⁴.`)),
          h('div', { class: 'panel flat stack' }, h('span', { class: 'eyebrow' }, 'Adding logs'),
            h('span', { class: 'big' }, `${fmt.int(n)} × ${Math.log(pmin).toFixed(2)} = ${fmt.int(n * Math.log(pmin))}`),
            h('p', { class: 'muted' }, 'The same product in log space is an ordinary number. With nine features this password’s joint scores are only as small as ' +
              `${fmt.sci(Math.min(...ex.joint), 2)}, but log space keeps the method safe for any number of features.`)));
      }

      function render(animate = false) {
        if (!last) return;
        range.value = String(step);
        updateChart(last.ex, animate);
        renderArith(last.ex);
        renderTable(last.ex);
      }

      kit.responsive(chartBox, () => { chart = null; last && render(); });
      store.subscribe((st) => { last = st; render(true); renderUnder(st.ex); }, 'multiply');
    },
  });
})();
