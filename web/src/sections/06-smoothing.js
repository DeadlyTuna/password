(function () {
  'use strict';

  const CSS = `
#smoothing .sm-ctl { display: flex; flex-wrap: wrap; gap: .8rem 1.2rem; align-items: center; }
#smoothing .sm-ctl .field { flex: 1 1 16rem; }
#smoothing .sm-alpha { font: 750 var(--fs-xl)/1 var(--display); font-variant-numeric: tabular-nums; color: var(--accent); min-width: 7ch; }
#smoothing .sm-zero { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
#smoothing .sm-zero .panel { display: grid; gap: .4rem; align-content: start; }
#smoothing .sm-zero .big { font: 750 var(--fs-xl)/1.1 var(--display); font-variant-numeric: tabular-nums; }
#smoothing .sm-zero .bad { color: var(--weak-ink); }
#smoothing .sm-zero .good { color: var(--strong-ink); }
#smoothing .sm-zero .formula { font-size: 1rem; }
#smoothing svg { display: block; width: 100%; height: auto; overflow: visible; }
#smoothing .sm-legend { display: flex; gap: 1rem; flex-wrap: wrap; font: 500 var(--fs-xs) var(--mono); color: var(--ink-2); }
#smoothing .sm-legend span::before { content: ""; display: inline-block; width: .8rem; height: 3px; background: var(--c); margin-right: .35rem; vertical-align: middle; }
#smoothing .sm-row { display: flex; flex-wrap: wrap; gap: .6rem; align-items: end; }
@media (max-width: 760px) { #smoothing .sm-zero { grid-template-columns: minmax(0, 1fr); } }`;

  const ALPHAS = Array.from({ length: 41 }, (_, i) => Math.pow(10, -3 + (i * Math.log10(20000)) / 40)); // 0.001 .. 20
  function lgamma(z) {
    if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
    z -= 1;
    const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
      12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    let x = c[0];
    for (let i = 1; i < 9; i++) x += c[i] / (z + i);
    const t = z + 7.5;
    return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
  }
  const betaLogPdf = (x, a, b) => (a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - (lgamma(a) + lgamma(b) - lgamma(a + b));
  const texNum = (x) => {
    if (x === 0) return '0';
    if (x >= 1e-3) return Number(x.toPrecision(5)).toString();
    const [m, e] = x.toExponential(2).split('e');
    return `${m}\\times10^{${parseInt(e, 10)}}`;
  };
  const fmtA = (a) => (a >= 1 ? a.toFixed(a >= 10 ? 1 : 2) : a >= 0.01 ? a.toFixed(3) : a.toExponential(1));

  PWB.register({
    id: 'smoothing',
    order: 60,
    nav: 'Smoothing',
    kicker: 'Dirichlet prior',
    title: 'Laplace smoothing is a Dirichlet prior in disguise',
    lede: 'A count of zero would rule a class out forever. Adding \u03b1 imaginary observations to every cell fixes that, and it is exactly the posterior mean under a Dirichlet(\u03b1) prior.',
    mount(el, { E, kit, data, store, h, s, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES, d3 = window.d3;
      let alpha = 1, last = null;

      // ---------- α control ----------
      const slider = h('input', { type: 'range', id: 'smoothing-alpha', min: '0', max: '1000', step: '1', 'aria-label': 'alpha, log scale' });
      const toSlider = (a) => String(Math.round(1000 * (Math.log10(a) + 3) / Math.log10(20000)));
      const fromSlider = (v) => Math.pow(10, -3 + (v / 1000) * Math.log10(20000));
      slider.value = toSlider(alpha);
      const aOut = h('output', { class: 'sm-alpha', for: 'smoothing-alpha' });
      const presets = h('div', { class: 'seg', role: 'group', 'aria-label': 'alpha presets' },
        [[0.01, '0.01'], [0.1, '0.1'], [1, '1 · Laplace'], [2, '2']].map(([a, l]) => h('button', { type: 'button', id: `smoothing-p${String(a).replace('.', '_')}`, onClick: () => setAlpha(a) }, l)));
      const setAlpha = (a) => { alpha = a; slider.value = toSlider(a); render(); };
      slider.addEventListener('input', () => { alpha = fromSlider(+slider.value); render(); });

      // ---------- zero-frequency panel ----------
      const zeroTitle = h('h3');
      const mlePanel = h('div', { class: 'panel flat' });
      const smPanel = h('div', { class: 'panel flat' });

      // ---------- posterior vs α ----------
      const postBox = h('div');
      const postNote = h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } });
      const postLegend = h('div', { class: 'sm-legend' }, C.map((c, i) => h('span', { class: kit.cls.className(i) }, c)));

      // ---------- Beta posterior ----------
      const BIN = data.features.bin;
      const betaFeat = h('select', { id: 'smoothing-beta-feature' }, BIN.map((f) => h('option', { value: f }, f)));
      const betaCls = h('select', { id: 'smoothing-beta-class' }, C.map((c, i) => h('option', { value: String(i) }, c)));
      betaFeat.addEventListener('change', () => render());
      betaCls.addEventListener('change', () => render());
      const betaBox = h('div');
      const betaText = h('div', { class: 'formula', style: { fontSize: '1rem' } });

      // ---------- results ----------
      const resBox = h('div', { class: 'grid-2' });
      const sweep = data.results.alpha_sweep;

      el.append(
        h('div', { class: 'panel sm-ctl' }, h('div', { class: 'field' }, h('label', { for: 'smoothing-alpha' }, 'PSEUDO-COUNT \u03b1 (LOG SCALE)'), slider), aOut, presets),
        h('div', { class: 'stack' }, zeroTitle, h('div', { class: 'sm-zero' }, mlePanel, smPanel)),
        h('figure', { class: 'fig' }, h('h3', {}, 'The current password\u2019s posterior as \u03b1 changes'), postLegend, postBox, postNote,
          h('figcaption', { class: 'cap' }, h('b', {}, 'Posterior mean'), 'Every likelihood is the Dirichlet posterior mean (n + \u03b1) / (n_C + \u03b1K). The dashed line marks the \u03b1 chosen above; 1 is Laplace smoothing, which the model uses.')),
        h('div', { class: 'grid-2', style: { alignItems: 'start' } },
          h('div', { class: 'stack' }, h('h3', {}, 'Why it is a prior'),
            h('p', {}, 'Treat the K probabilities of one feature inside one class as unknown, and give them a Dirichlet(\u03b1, …, \u03b1) prior. After observing counts n₁ … n_K, the posterior is Dirichlet(n₁ + \u03b1, …, n_K + \u03b1), because the Dirichlet is conjugate to the multinomial. Its mean is the smoothed estimate.'),
            kit.texEl('\\hat P(f=v\\mid C)=\\mathbb{E}[\\theta_v\\mid\\text{counts}]=\\frac{n_{v,C}+\\alpha}{n_C+\\alpha K}', true),
            h('p', { class: 'muted' }, 'With K = 2 the Dirichlet is a Beta distribution. The plot shows that posterior for one binary feature. It is extremely narrow because each class has tens of thousands of passwords, so \u03b1 barely moves it.')),
          h('figure', { class: 'fig panel flat' },
            h('div', { class: 'sm-row' }, h('div', { class: 'field' }, h('label', { for: 'smoothing-beta-feature' }, 'FEATURE'), betaFeat),
              h('div', { class: 'field' }, h('label', { for: 'smoothing-beta-class' }, 'CLASS'), betaCls)),
            betaBox, betaText,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Beta prior and posterior'), 'Main plot: posterior density of P(feature = 1 | class), zoomed to where it lives. Inset: the Beta(\u03b1, \u03b1) prior on [0, 1] before any data.'))),
        h('figure', { class: 'fig' }, h('h3', {}, 'Does \u03b1 change accuracy?'), resBox,
          h('figcaption', { class: 'cap' }, h('b', {}, 'Dirichlet prior strength'), 'Five-fold accuracy (± one standard deviation across folds) for each \u03b1. With the full training folds the lines are flat. With only 300 training passwords, a large \u03b1 pulls the informative near-zero likelihoods toward uniform and costs accuracy.')));

      // ---------- drawing ----------
      function lineChart(box, { w, H = 230, xs, series, xLog = true, yDomain, xLabel, yLabel, marker, fmtY = (v) => v.toFixed(2) }) {
        const m = { l: 46, r: 12, t: 10, b: 34 };
        const x = (xLog ? d3.scaleLog() : d3.scaleLinear()).domain(d3.extent(xs)).range([m.l, w - m.r]);
        const y = d3.scaleLinear().domain(yDomain).nice().range([H - m.b, m.t]);
        const svg = d3.create('svg').attr('viewBox', `0 0 ${w} ${H}`).attr('role', 'img');
        svg.append('g').attr('class', 'ax').attr('transform', `translate(0,${H - m.b})`)
          .call(d3.axisBottom(x).ticks(w < 420 ? 3 : 6, xLog ? '~g' : undefined).tickSizeOuter(0));
        svg.append('g').attr('class', 'ax').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(fmtY).tickSizeOuter(0));
        svg.append('g').selectAll('line').data(y.ticks(5)).join('line').attr('class', 'gridline')
          .attr('x1', m.l).attr('x2', w - m.r).attr('y1', (d) => y(d)).attr('y2', (d) => y(d));
        if (xLabel) svg.append('text').attr('class', 'chart-text').attr('x', w - m.r).attr('y', H - 4).attr('text-anchor', 'end').text(xLabel);
        if (yLabel) svg.append('text').attr('class', 'chart-text').attr('x', 4).attr('y', m.t - 1).text(yLabel);
        for (const sr of series) {
          if (sr.band) svg.append('path').attr('d', d3.area().x((d, i) => x(xs[i])).y0((d) => y(d[0])).y1((d) => y(d[1]))(sr.band))
            .style('fill', `color-mix(in srgb, ${sr.color} 18%, transparent)`);
          svg.append('path').attr('d', d3.line().x((d, i) => x(xs[i])).y((d) => y(d))(sr.values))
            .style('fill', 'none').style('stroke', sr.color).style('stroke-width', 2.2).style('stroke-dasharray', sr.dash || null);
          if (sr.dots) svg.append('g').selectAll('circle').data(sr.values).join('circle').attr('cx', (d, i) => x(xs[i])).attr('cy', (d) => y(d)).attr('r', 3).style('fill', sr.color);
        }
        if (marker !== undefined) {
          svg.append('line').attr('x1', x(marker)).attr('x2', x(marker)).attr('y1', m.t).attr('y2', H - m.b)
            .style('stroke', 'var(--ink)').style('stroke-dasharray', '4 3').style('stroke-width', 1.2);
        }
        kit.replace(box, svg.node());
        return { x, y, svg };
      }

      let postCache = { pw: null, rows: null };
      function drawPosterior() {
        const pw = last.password;
        if (postCache.pw !== pw) postCache = { pw, rows: ALPHAS.map((a) => E.explain(pw, { alpha: a }).posterior) };
        const w = Math.max(280, postW || 600);
        lineChart(postBox, { w, xs: ALPHAS, yDomain: [0, 1], xLabel: '\u03b1', yLabel: 'P(C | x)', marker: alpha,
          series: C.map((c, i) => ({ color: kit.cls.color(i), values: postCache.rows.map((r) => r[i]) })) });
        const preds = postCache.rows.map((r) => r.indexOf(Math.max(...r)));
        const changes = new Set(preds).size > 1;
        postNote.textContent = !pw ? 'Type a password to see its posterior.' : changes
          ? `The predicted class changes across this range of \u03b1: ${[...new Set(preds)].map((k) => C[k]).join(' → ')}.`
          : `The predicted class stays ${C[preds[0]]} for every \u03b1 from 0.001 to 20.`;
      }

      function drawBeta() {
        const f = betaFeat.value, c = +betaCls.value;
        const tab = data.nb.counts[f];
        const n1 = tab.counts[tab.levels.indexOf('1')][c], n0 = tab.counts[tab.levels.indexOf('0')][c];
        const a = n1 + alpha, b = n0 + alpha;
        const mean = a / (a + b), sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
        const lo = Math.max(1e-9, mean - 6 * sd), hi = Math.min(1 - 1e-9, mean + 6 * sd);
        const xs = d3.range(161).map((i) => lo + ((hi - lo) * i) / 160);
        const ys = xs.map((x) => Math.exp(betaLogPdf(x, a, b)));
        const w = Math.max(260, betaW || 420), H = 220;
        const { x, y, svg } = lineChart(betaBox, { w, H, xs, xLog: false, yDomain: [0, d3.max(ys) * 1.05], xLabel: `P(${f} = 1 | ${C[c]})`, yLabel: 'density',
          series: [{ color: kit.cls.color(c), values: ys, band: ys.map((v) => [0, v]) }], marker: mean, fmtY: (v) => d3.format('~s')(v) });
        // Inset: prior Beta(α, α) on [0, 1].
        const iw = Math.min(150, w * 0.36), ih = 74, ix = w - iw - 14, iy = 14;
        const g = svg.append('g').attr('transform', `translate(${ix},${iy})`);
        g.append('rect').attr('width', iw).attr('height', ih).attr('rx', 4).style('fill', 'var(--surface)').style('stroke', 'var(--line-2)');
        const px = d3.range(1, 100).map((i) => i / 100);
        const py = px.map((t) => Math.exp(betaLogPdf(t, alpha, alpha)));
        const yMax = Math.min(6, d3.max(py));
        const sx = d3.scaleLinear().domain([0, 1]).range([8, iw - 8]), sy = d3.scaleLinear().domain([0, yMax]).range([ih - 16, 8]);
        g.append('path').attr('d', d3.line().x((d, i) => sx(px[i])).y((d) => sy(Math.min(d, yMax)))(py)).style('fill', 'none').style('stroke', 'var(--ink-2)').style('stroke-width', 1.6);
        g.append('text').attr('class', 'chart-text').attr('x', 8).attr('y', ih - 4).text(`prior Beta(${fmtA(alpha)}, ${fmtA(alpha)})`);
        betaText.innerHTML = kit.tex(`\\theta\\mid\\text{data}\\sim\\text{Beta}(${n1}+\\alpha,\\;${n0}+\\alpha),\\quad \\mathbb{E}[\\theta]=\\frac{${n1}+${fmtA(alpha)}}{${n1 + n0}+2(${fmtA(alpha)})}=${texNum(mean)}`, true);
      }

      function drawResults() {
        const w = Math.max(240, (resBox.clientWidth - 20) / (resBox.clientWidth > 700 ? 2 : 1));
        const groups = [...new Set(sweep.map((r) => r.train_size))];
        kit.replace(resBox, ...groups.map((g) => {
          const rows = sweep.filter((r) => r.train_size === g);
          const models = [...new Set(rows.map((r) => r.model))];
          const xs = [...new Set(rows.map((r) => r.alpha))].sort((a, b) => a - b);
          const lo = d3.min(rows, (r) => r.cv_mean - r.cv_std), hi = d3.max(rows, (r) => r.cv_mean + r.cv_std);
          const pad = Math.max(0.002, (hi - lo) * 0.15);
          const box = h('div');
          const wrap = h('div', { class: 'stack' }, h('span', { class: 'eyebrow' }, `training passwords per fold: ${g}`), box,
            h('div', { class: 'sm-legend' }, models.map((mdl, i) => h('span', { style: { '--c': i ? 'var(--pencil)' : 'var(--accent)' } }, mdl))));
          requestAnimationFrame(() => {
            const { x, y, svg } = lineChart(box, { w: Math.max(240, box.clientWidth || w), H: 210, xs, yDomain: [lo - pad, hi + pad], xLabel: '\u03b1', yLabel: 'accuracy', fmtY: (v) => v.toFixed(3),
              series: models.map((mdl, i) => ({ color: i ? 'var(--pencil)' : 'var(--accent)', dots: true, dash: i ? '5 3' : null,
                values: xs.map((a) => rows.find((r) => r.model === mdl && r.alpha === a).cv_mean) })) });
            models.forEach((mdl, i) => rows.filter((r) => r.model === mdl).forEach((r) => {
              svg.append('line').attr('x1', x(r.alpha)).attr('x2', x(r.alpha)).attr('y1', y(r.cv_mean - r.cv_std)).attr('y2', y(r.cv_mean + r.cv_std))
                .style('stroke', i ? 'var(--pencil)' : 'var(--accent)').style('stroke-width', 1.2).style('opacity', 0.7);
            }));
          });
          return wrap;
        }));
      }

      function render() {
        if (!last) return;
        aOut.textContent = `\u03b1 = ${fmtA(alpha)}`;
        // zero-frequency demo: the current password's zero-count cells, else sp_bin=1 / Weak.
        let zs = [];
        last.ex.steps.forEach((st) => st.counts.forEach((n, c) => { if (n === 0) zs.push({ f: st.feature, v: st.value, c }); }));
        const z = zs[0] || { f: 'sp_bin', v: '1', c: 0 };
        const tab = data.nb.counts[z.f], K = tab.levels.length, nC = data.nb.class_n[z.c];
        const smoothed = alpha / (nC + alpha * K);
        zeroTitle.textContent = zs.length
          ? `The current password hits ${zs.length} zero count${zs.length > 1 ? 's' : ''}. For example, no ${C[z.c]} training password has ${z.f} = ${z.v}.`
          : `The current password hits no zero counts. Here is one from the data: no ${C[z.c]} training password has ${z.f} = ${z.v}.`;
        const exA = E.explain(last.password, { alpha });
        kit.replace(mlePanel, h('span', { class: 'eyebrow nocase' }, 'Without smoothing (\u03b1 = 0)'),
          kit.texEl(`\\hat P(\\text{${z.f.replace(/_/g, '\\_')}}=\\text{${z.v}}\\mid\\text{${C[z.c]}})=\\frac{0}{${nC}}=0`, true),
          h('span', { class: 'big bad' }, `P(${C[z.c]} | x) = 0`),
          h('p', { class: 'muted' }, `One zero in the product makes ${C[z.c]} impossible, whatever the other eight features say.`));
        kit.replace(smPanel, h('span', { class: 'eyebrow nocase' }, `With smoothing (\u03b1 = ${fmtA(alpha)})`),
          kit.texEl(`\\hat P=\\frac{0+${fmtA(alpha)}}{${nC}+${fmtA(alpha)}\\times ${K}}=${texNum(smoothed)}`, true),
          h('span', { class: 'big good' }, `P(${C[z.c]} | x) = ${fmt.post(exA.posterior[z.c])}`),
          h('p', { class: 'muted' }, `Small but not zero, so strong evidence elsewhere can still win. Prediction for the current password: ${exA.pred}.`));
        drawPosterior();
        drawBeta();
      }

      let postW = 0, betaW = 0; // widths come from the resize observer, never read during an update
      kit.responsive(postBox, (w) => { postW = w; last && drawPosterior(); });
      kit.responsive(betaBox, (w) => { betaW = w; last && drawBeta(); });
      kit.responsive(resBox, drawResults);
      store.subscribe((st) => { last = st; render(); }, 'smoothing');
    },
  });
})();
