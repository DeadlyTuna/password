(function () {
  'use strict';

  const CSS = `
#evaluation .ev-cv { display: grid; gap: 5px; max-width: 30rem; }
#evaluation .ev-cv .r { display: grid; grid-template-columns: 4.5rem repeat(5, minmax(0, 1fr)); gap: 5px; align-items: center; font: 500 var(--fs-xs) var(--mono); color: var(--ink-2); }
#evaluation .ev-cv .b { height: 1.5rem; border-radius: 3px; background: color-mix(in srgb, var(--accent) 16%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
  display: grid; place-items: center; font-size: 10px; color: var(--ink-2); transition: background-color .35s, transform .35s var(--ease); }
#evaluation .ev-cv .b.test { background: var(--pencil); border-color: var(--pencil); color: var(--paper); font-weight: 700; }
#evaluation .ev-cv .r.live .b.test { transform: scale(1.08); }
#evaluation .ev-cv .r.live { color: var(--ink); font-weight: 700; }
#evaluation svg { display: block; width: 100%; height: auto; overflow: visible; }
#evaluation .ev-cm { display: grid; grid-template-columns: 5.5rem repeat(3, minmax(0, 1fr)); gap: 4px; max-width: 30rem; }
#evaluation .ev-cm .hd { font: 600 var(--fs-xs) var(--mono); color: var(--ink-2); display: grid; place-items: center; text-align: center; }
#evaluation .ev-cm .cell { aspect-ratio: 1.6; border-radius: 4px; display: grid; place-items: center; text-align: center; font: 600 var(--fs-sm) var(--mono);
  transition: background-color .45s var(--ease), color .45s; border: 1px solid var(--line); }
#evaluation .ev-cm .cell small { display: block; font-weight: 500; font-size: 10px; opacity: .85; }
#evaluation .ev-mc { display: grid; gap: .5rem; }
#evaluation .ev-mc .r { display: grid; grid-template-columns: 11rem minmax(0, 1fr) 5rem; gap: .6rem; align-items: center; font-size: var(--fs-sm); }
#evaluation .ev-mc .t { height: 1.1rem; background: var(--paper-2); border-radius: 3px; overflow: hidden; border: 1px solid var(--line); }
#evaluation .ev-mc .t i { display: block; height: 100%; transition: width .45s var(--ease); }
#evaluation .ev-flips { display: grid; gap: .4rem; max-height: 26rem; overflow: auto; padding-right: .3rem; }
#evaluation .ev-flip { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .4rem 1rem; align-items: center; text-align: left; padding: .55rem .7rem;
  border-radius: var(--r); border: 1px solid var(--line); background: var(--surface); cursor: pointer; color: var(--ink); font: inherit; }
#evaluation .ev-flip:hover { border-color: var(--accent); }
#evaluation .ev-flip .pw { font: 600 var(--fs-sm) var(--mono); word-break: break-all; }
#evaluation .ev-flip .meta { font-size: var(--fs-xs); color: var(--ink-2); }
#evaluation .ev-flip .ok { font: 600 var(--fs-xs) var(--mono); color: var(--strong-ink); }
@media (max-width: 860px) { #evaluation .ev-mc .r { grid-template-columns: 8rem minmax(0, 1fr) 4rem; } }`;

  const MODELS = [['base', 'base-4 bins'], ['pattern', '+ pattern'], ['markov', '+ Markov']];
  const texSci = (x) => { const [m, e] = x.toExponential(1).split('e'); return `${m}\\times10^{${parseInt(e, 10)}}`; };

  PWB.register({
    id: 'evaluation',
    order: 110,
    nav: 'Results',
    kicker: 'Evaluation',
    title: 'How we know it works',
    lede: 'Five-fold cross-validation, a majority-class baseline, confidence intervals and a paired significance test.',
    mount(el, { E, kit, data, store, h, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES, d3 = window.d3, R = data.results;
      const abl = Object.fromEntries(MODELS.map(([k, name]) => [k, R.ablation.find((r) => r.model === name)]));
      let model = 'markov', cmMode = 'rate', pairIdx = 1;

      const seg = (id, opts, get, set, after) => {
        const wrap = h('div', { class: 'seg', role: 'group', id });
        opts.forEach(([v, label]) => wrap.append(h('button', { type: 'button', 'aria-pressed': String(get() === v), onClick: () => {
          set(v); [...wrap.children].forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i][0] === v))); after();
        } }, label)));
        return wrap;
      };

      // ---------- 1. CV diagram ----------
      const cvRows = Array.from({ length: 5 }, (_, k) => h('div', { class: 'r' }, h('span', {}, `fold ${k + 1}`),
        Array.from({ length: 5 }, (_, j) => h('div', { class: `b ${j === k ? 'test' : ''}` }, j === k ? 'test' : 'train'))));
      let live = 0;
      const tick = () => { cvRows.forEach((r, k) => r.classList.toggle('live', k === live)); live = (live + 1) % 5; };
      tick();
      if (!kit.reducedMotion()) setInterval(tick, 1400);

      // ---------- 2. accuracy chart ----------
      const accFull = h('div'), accZoom = h('div');
      const rows = [{ name: 'majority baseline', mean: R.baseline_acc, base: true }]
        .concat(MODELS.map(([k, name]) => ({ name, mean: abl[k].cv_mean, sd: abl[k].cv_std, w: [abl[k].wilson_lo, abl[k].wilson_hi], b: [abl[k].boot_lo, abl[k].boot_hi], k })));
      function drawAcc(box, w, domain, zoom) {
        const rowH = 34, m = { l: Math.min(150, w * 0.38), r: 16, t: 8, b: 30 }, H = m.t + m.b + rowH * rows.length;
        const x = d3.scaleLinear().domain(domain).range([m.l, w - m.r]);
        const svg = d3.create('svg').attr('viewBox', `0 0 ${w} ${H}`).attr('role', 'img').attr('aria-label', zoom ? 'Zoomed accuracy with confidence intervals' : 'Accuracy from 0 to 1');
        svg.append('g').attr('class', 'ax').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(zoom ? 5 : 5).tickFormat(d3.format(zoom ? '.3f' : '.1f')).tickSizeOuter(0));
        svg.append('g').selectAll('line').data(x.ticks(5)).join('line').attr('class', 'gridline').attr('x1', (d) => x(d)).attr('x2', (d) => x(d)).attr('y1', m.t).attr('y2', H - m.b);
        rows.forEach((r, i) => {
          const y = m.t + i * rowH;
          svg.append('text').attr('class', 'chart-text').attr('x', m.l - 8).attr('y', y + rowH / 2 + 4).attr('text-anchor', 'end').style('fill', 'var(--ink)').text(r.name);
          if (!zoom || !r.base) {
            if (!zoom) svg.append('rect').attr('x', x(domain[0])).attr('y', y + 8).attr('height', rowH - 16).attr('width', Math.max(0, x(r.mean) - x(domain[0])))
              .style('fill', r.base ? 'var(--ink-3)' : r.k === 'pattern' ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 50%, transparent)');
            if (zoom && !r.base) {
              svg.append('line').attr('x1', x(r.mean - r.sd)).attr('x2', x(r.mean + r.sd)).attr('y1', y + rowH / 2).attr('y2', y + rowH / 2).style('stroke', 'var(--line-2)').style('stroke-width', 8).style('stroke-linecap', 'round');
              svg.append('line').attr('x1', x(r.w[0])).attr('x2', x(r.w[1])).attr('y1', y + rowH / 2 - 6).attr('y2', y + rowH / 2 - 6).style('stroke', 'var(--accent)').style('stroke-width', 2.5);
              svg.append('line').attr('x1', x(r.b[0])).attr('x2', x(r.b[1])).attr('y1', y + rowH / 2 + 6).attr('y2', y + rowH / 2 + 6).style('stroke', 'var(--pencil)').style('stroke-width', 2.5);
              svg.append('circle').attr('cx', x(r.mean)).attr('cy', y + rowH / 2).attr('r', 4.5).style('fill', 'var(--ink)');
            }
            svg.append('text').attr('class', 'chart-text').attr('x', zoom ? x(r.w[1]) + 8 : x(r.mean) + 6).attr('y', y + rowH / 2 + 4).style('fill', 'var(--ink)').style('font-weight', 600)
              .text(zoom ? r.mean.toFixed(4) : fmt.pct(r.mean, 2));
          } else {
            svg.append('text').attr('class', 'chart-text').attr('x', m.l + 4).attr('y', y + rowH / 2 + 4).text(`${fmt.pct(r.mean, 1)} (off the zoomed axis)`);
          }
        });
        kit.replace(box, svg.node());
      }
      const lo = Math.min(...rows.filter((r) => !r.base).map((r) => Math.min(r.w[0], r.b[0], r.mean - r.sd)));
      const hi = Math.max(...rows.filter((r) => !r.base).map((r) => Math.max(r.w[1], r.b[1], r.mean + r.sd)));
      kit.responsive(accFull, (w) => drawAcc(accFull, w, [0, 1], false));
      kit.responsive(accZoom, (w) => drawAcc(accZoom, w, [lo - 0.003, hi + 0.004], true));

      // ---------- 3/4. per-class table + confusion ----------
      const prTable = h('table', { class: 'tbl' });
      const cm = h('div', { class: 'ev-cm', role: 'table', 'aria-label': 'Confusion matrix' });
      const cmCells = [];
      cm.append(h('div', { class: 'hd' }, 'true ↓ pred →'), C.map((c) => h('div', { class: 'hd' }, c)));
      C.forEach((c, i) => { cm.append(h('div', { class: 'hd' }, c)); cmCells[i] = C.map(() => { const d = h('div', { class: 'cell' }); cm.append(d); return d; }); });
      function renderModel() {
        const rep = R.report[model];
        kit.replace(prTable, h('thead', {}, h('tr', {}, h('th', {}, 'class'), h('th', {}, 'precision'), h('th', {}, 'recall'), h('th', {}, 'F1'), h('th', {}, 'support'))),
          h('tbody', {}, rep.filter((r) => C.includes(r.label) || r.label === 'macro avg').map((r) => h('tr', { class: r.label === 'macro avg' ? 'total' : '' },
            h('td', {}, r.label), h('td', {}, r.precision.toFixed(4)), h('td', {}, r.recall.toFixed(4)), h('td', {}, r['f1-score'].toFixed(4)), h('td', {}, fmt.int(r.support))))));
        const M = R.confusion[model];
        M.forEach((row, i) => { const tot = row.reduce((a, b) => a + b, 0); row.forEach((n, j) => {
          const rate = n / tot, d = cmCells[i][j];
          const col = i === j ? kit.cls.color(i) : 'var(--weak)';
          d.style.background = `color-mix(in srgb, ${col} ${Math.round(8 + 80 * Math.sqrt(rate))}%, var(--surface))`;
          d.style.color = rate > 0.45 ? 'var(--paper)' : 'var(--ink)';
          kit.replace(d, cmMode === 'rate' ? fmt.pct(rate, 1) : fmt.int(n), h('small', {}, cmMode === 'rate' ? fmt.int(n) : fmt.pct(rate, 1)));
        }); });
      }

      // ---------- 5. McNemar ----------
      const mcBox = h('div', { class: 'ev-mc' });
      const mcFormula = h('div', { class: 'formula' });
      function renderMc() {
        const r = R.mcnemar[pairIdx], tot = r.b_A_only + r.c_B_only;
        const bar = (label, n, color) => h('div', { class: 'r' }, h('span', {}, label), h('div', { class: 't' }, h('i', { style: { width: `${(100 * n) / Math.max(r.b_A_only, r.c_B_only)}%`, background: color } })), h('span', { class: 'num' }, fmt.int(n)));
        kit.replace(mcBox, bar(`b: only ${r.A} right`, r.b_A_only, 'var(--ink-3)'), bar(`c: only ${r.B} right`, r.c_B_only, 'var(--accent)'),
          h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `Both models agree on the other ${fmt.int(data.meta.n - tot)} passwords, which say nothing about which model is better. Under the null hypothesis of equal accuracy each discordant password is a fair coin: b ~ Binomial(${fmt.int(tot)}, ½).`));
        const p = r.p_chi2 === 0 ? '<10^{-300}' : `=${texSci(r.p_chi2)}`;
        mcFormula.innerHTML = kit.tex(`\\chi^2=\\frac{(|b-c|-1)^2}{b+c}=\\frac{(|${r.b_A_only}-${r.c_B_only}|-1)^2}{${tot}}=${r.chi2.toFixed(1)},\\qquad p${p}`, true);
      }

      // ---------- 6. flips ----------
      const flips = h('div', { class: 'ev-flips' });
      const confirm = h('span', { class: 'sr-only', 'aria-live': 'polite' });
      R.flips.forEach((f) => {
        const ok = h('span', { class: 'ok' });
        const b = h('button', { type: 'button', class: 'ev-flip', onClick: () => {
          store.set(f.password); flips.querySelectorAll('.ok').forEach((x) => { x.textContent = ''; }); ok.textContent = 'loaded ✓'; confirm.textContent = `Loaded ${f.password}`;
        } },
          h('div', {}, h('div', { class: 'pw' }, kit.showPw(f.password)),
            h('div', { class: 'meta' }, `true ${f.true} · + pattern said ${f.pred_pattern} · + Markov says ${f.pred_markov}`)),
          h('span', { class: `chip ${f.flip === 'fixed_by_markov' ? 'good' : 'bad'}` }, f.flip === 'fixed_by_markov' ? 'fixed by Markov' : 'broken by Markov'), ok);
        flips.append(b);
      });
      const nFixed = R.flips.filter((f) => f.flip === 'fixed_by_markov').length;

      const best = MODELS.map(([k]) => abl[k]).reduce((a, b) => (b.cv_mean > a.cv_mean ? b : a));
      el.append(
        h('div', { class: 'grid-2', style: { alignItems: 'start' } },
          h('figure', { class: 'fig' }, h('div', { class: 'ev-cv' }, cvRows),
            h('figcaption', { class: 'cap' }, h('b', {}, 'Cross-validation'), 'The data is split into 5 stratified folds. Each model is trained 5 times, each time tested on the one fold it never saw, so every password is tested exactly once. The Markov chain and its tertile cuts are retrained inside every fold.')),
          h('div', { class: 'stack' },
            h('p', {}, `The best model is ${best.model} with ${fmt.pct(best.cv_mean, 2)} ± ${fmt.pct(best.cv_std, 2)} accuracy across the folds. A model that always answers the most common class scores ${fmt.pct(R.baseline_acc, 1)}.`),
            h('p', { class: 'muted' }, `Adding the Markov feature changes accuracy by ${fmt.signed(100 * (abl.markov.cv_mean - abl.pattern.cv_mean), 2)} points compared with + pattern. The flips below show why.`))),
        h('div', { class: 'grid-2', style: { alignItems: 'start' } },
          h('figure', { class: 'fig' }, h('h3', {}, 'Accuracy on the full scale'), accFull,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Accuracy'), 'Five-fold mean accuracy against the majority-class baseline.')),
          h('figure', { class: 'fig' }, h('h3', {}, 'Zoomed in, with uncertainty'), accZoom,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Binomial confidence interval and bootstrap'), `Grey: ± one standard deviation across folds. Blue: 95% Wilson binomial interval. Orange: 95% bootstrap interval from resampling the out-of-fold predictions. With ${fmt.int(data.meta.n)} test predictions the intervals are only about ±${(50 * (best.wilson_hi - best.wilson_lo)).toFixed(2)} points wide.`))),
        h('div', { class: 'stack' },
          h('div', { class: 'between' }, h('h3', {}, 'Per class'),
            h('div', { class: 'row' }, seg('evaluation-model', MODELS.map(([k, n]) => [k, n]), () => model, (v) => { model = v; }, renderModel),
              seg('evaluation-cm', [['rate', 'P(pred | true)'], ['count', 'counts']], () => cmMode, (v) => { cmMode = v; }, renderModel))),
          h('div', { class: 'grid-2', style: { alignItems: 'start' } },
            h('div', { class: 'scroll-x' }, prTable),
            h('figure', { class: 'fig' }, cm, h('figcaption', { class: 'cap' }, h('b', {}, 'Conditional probability P(predicted | true)'), 'Each row of the confusion matrix, divided by its total, is the distribution of predictions given the true class. The diagonal is recall.')))),
        h('figure', { class: 'fig panel' },
          h('div', { class: 'between' }, h('h3', {}, 'McNemar\u2019s test'), seg('evaluation-pair', R.mcnemar.map((r, i) => [i, `${r.A} vs ${r.B}`]), () => pairIdx, (v) => { pairIdx = v; }, renderMc)),
          mcBox, mcFormula,
          h('figcaption', { class: 'cap' }, h('b', {}, 'McNemar\u2019s test'), 'A paired test on the same passwords. Only the passwords where exactly one model is right count.')),
        h('div', { class: 'stack' }, h('h3', {}, 'What the Markov feature changed'),
          h('p', { class: 'muted' }, `${nFixed} examples it fixed and ${R.flips.length - nFixed} it broke, compared with + pattern. Click one to load it into the whole page. ${R.flips.filter((f) => f.flip !== 'fixed_by_markov' && f.true === 'Strong').length} of the ${R.flips.length - nFixed} broken ones are Strong passwords that the + Markov model now calls ${[...new Set(R.flips.filter((f) => f.flip !== 'fixed_by_markov').map((f) => f.pred_markov))].join(' or ')}: word-like strings the chain finds predictable.`),
          flips, confirm));

      renderModel();
      renderMc();
    },
  });
})();
