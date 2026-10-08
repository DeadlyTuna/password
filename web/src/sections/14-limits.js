(function () {
  'use strict';

  const CSS = `
#limits .li-pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
#limits .li-ev { display: grid; gap: .3rem; }
#limits .li-ev .r { display: grid; grid-template-columns: 8.5rem minmax(0, 1fr) 3.6rem; gap: .5rem; align-items: center; font: 500 var(--fs-xs) var(--mono); }
#limits .li-ev .t { position: relative; height: .75rem; }
#limits .li-ev .t::before { content: ""; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: var(--ink-3); }
#limits .li-ev .t i { position: absolute; top: 0; bottom: 0; border-radius: 2px; transition: left .4s var(--ease), width .4s var(--ease); }
#limits .li-ev .num { text-align: right; }
#limits .li-head { display: flex; justify-content: space-between; gap: .5rem; align-items: baseline; flex-wrap: wrap; }
#limits .li-head .pw { font: 700 var(--fs-md) var(--mono); word-break: break-all; }
#limits .li-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(17rem, 100%), 1fr)); gap: .9rem; counter-reset: lim; }
#limits .li-item { border-top: 2px solid var(--ink); padding-top: .6rem; display: grid; gap: .3rem; align-content: start; }
#limits .li-item h4 { font-size: var(--fs-base); }
#limits .li-item h4::before { counter-increment: lim; content: counter(lim) ". "; color: var(--accent); }
#limits .li-item .big { font: 750 var(--fs-lg)/1.1 var(--display); font-variant-numeric: tabular-nums; color: var(--pencil); }
#limits .li-item p { font-size: var(--fs-sm); color: var(--ink-2); }
#limits .li-sum { font: 500 var(--fs-md)/1.6 var(--body); max-width: 70ch; }
@media (max-width: 760px) { #limits .li-pair { grid-template-columns: minmax(0, 1fr); } }`;

  const PARADOX = 'Summer2026!';
  const CONCEPTS = [
    ['Conditional probability', 'P(f | C) tables, next-character probabilities', ['likelihoods', 'markov', 'bayes']],
    ['Joint probability', 'the naive Bayes product, contingency tables', ['multiply', 'independence', 'bayes']],
    ['Bayes’ theorem', 'the posterior P(C | x)', ['pipeline', 'bayes', 'multiply']],
    ['Law of total probability', 'the evidence P(x) = Σ P(x | C) P(C)', ['multiply', 'bayes']],
    ['Prior and posterior', 'data vs uniform prior, Bayesian updating', ['prior', 'data']],
    ['Dirichlet / Beta prior', 'Laplace smoothing as a posterior mean', ['smoothing']],
    ['Likelihood ratio and log-odds', 'which features push toward which class', ['evidence']],
    ['Markov chains', 'the chain rule over characters', ['markov']],
    ['Chi-square test', 'testing conditional independence', ['independence']],
    ['Entropy', 'Shannon, guessing and min-entropy', ['entropy']],
    ['Zipf’s law', 'rank-frequency power law', ['entropy']],
    ['Binomial CI and bootstrap', 'uncertainty in accuracy', ['evaluation']],
    ['McNemar’s test', 'paired comparison of two classifiers', ['evaluation']],
  ];

  PWB.register({
    id: 'limits',
    order: 140,
    nav: 'Limits',
    kicker: 'Limitations',
    title: 'Where the model is wrong, and why',
    lede: 'A posterior is only as good as the data behind it. Here is what this model gets wrong and what that teaches.',
    mount(el, { E, kit, data, store, h, fmt }) {
      el.append(h('style', { text: CSS }));
      const R = data.results, M = data.meta, cnt = data.nb.counts;
      const iS = 2, iW = 0, MAXN = 12;

      const evPanel = (title) => {
        const rows = E.FEATURES.map((f) => { const bar = h('i'), num = h('span', { class: 'num' }), lab = h('span');
          return { f, el: h('div', { class: 'r' }, lab, h('div', { class: 't' }, bar), num), bar, num, lab }; });
        const head = h('div', { class: 'li-head' }, h('span', { class: 'pw' }), h('span', { class: 'chip' }));
        return { el: h('div', { class: 'panel stack' }, h('span', { class: 'eyebrow' }, title), head, h('div', { class: 'li-ev' }, rows.map((r) => r.el))), rows, head };
      };
      const fillPanel = (p, pw) => {
        const ex = E.explain(pw), r = E.rate(ex);
        p.head.children[0].textContent = kit.showPw(pw);
        p.head.children[1].className = `chip on ${kit.cls.className(ex.predIndex)}`;
        p.head.children[1].textContent = `model: ${ex.pred} ${fmt.pct(ex.confidence, 1)} · grade ${r.grade}`;
        ex.steps.forEach((st, j) => {
          const v = st.llr, x = Math.max(-MAXN, Math.min(MAXN, v)) / MAXN * 50;
          const row = p.rows[j];
          row.lab.textContent = `${st.feature}=${st.value}`;
          row.bar.style.left = `${50 + Math.min(0, x)}%`;
          row.bar.style.width = `${Math.max(0.6, Math.abs(x))}%`;
          row.bar.style.background = v >= 0 ? 'var(--strong)' : 'var(--weak)';
          row.num.textContent = fmt.signed(v, 2);
        });
        return { ex, r };
      };
      const left = evPanel('The paradox'), right = evPanel('Your password');
      const par = fillPanel(left, PARADOX);
      const spW = cnt.sp_bin.levels.reduce((a, lv, i) => a + (lv !== '0' ? cnt.sp_bin.counts[i][iW] : 0), 0);
      const spLik = par.ex.steps.find((s) => s.feature === 'sp_bin');
      const negSum = par.ex.steps.filter((s) => s.llr < 0).reduce((a, s) => a + s.llr, 0);

      // ---------- limitations ----------
      const viol = R.chi_square.filter((r) => r.violates).length;
      const zp = R.zipf_fits.find((f) => f.unit === 'password');
      const abl = (name) => R.ablation.find((r) => r.model === name);
      const mkDelta = abl('+ Markov').cv_mean - abl('+ pattern').cv_mean;
      const ciHalf = (50 * Math.max(...R.ablation.map((r) => r.wilson_hi - r.wilson_lo))).toFixed(2);
      const items = [
        ['Independence is violated', `${viol} / ${R.chi_square.length}`, 'feature pairs fail the chi-square test within their class. The posteriors are overconfident: a 0.999 here is a ranking, not a calibrated probability.', 'independence'],
        ['The data are synthetic', `s = ${zp.zipf_s.toFixed(2)}`, `Zipf exponent for whole passwords; the most common one appears ${zp.max_freq} times. Rules like "Weak never has symbols" come from the generator, not from people.`, 'entropy'],
        ['We used a sample', fmt.pct(M.n / M.pwlds_rows, 2), `of the ${fmt.int(M.pwlds_rows)} PWLDS passwords. With ${fmt.int(M.n)} test predictions the accuracy is pinned down to about ±${ciHalf} points, so more data would not change the conclusions.`, 'data'],
        ['Five levels became three', `${Object.keys(M.levels).length} → 3`, 'Merging is a modelling choice. Level 3 (word-based "strong") looks like level 1 and 2 and causes most of the errors.', 'evaluation'],
        ['One Markov chain for all classes', `${fmt.signed(100 * mkDelta, 2)} pts`, 'accuracy change from adding mk_bin to the pattern model. The single chain measures generic predictability and double-counts composition. Per-class chains might do better.', 'markov'],
        ['The checker’s grade is a rule, not a model', 'A–F', 'The overall grade on this page combines the trained model with a guessability estimate and pattern penalties. That rule is a sensible heuristic, not something learned from data.', 'checker'],
      ];

      // ---------- summary ----------
      const best = R.ablation.reduce((a, b) => (b.cv_mean > a.cv_mean ? b : a));
      const sumText = `A transparent naive Bayes model reaches ${fmt.pct(best.cv_mean, 2)} accuracy (95% CI ${fmt.pct(best.wilson_lo, 2)} to ${fmt.pct(best.wilson_hi, 2)}) on three-class password strength, against a ${fmt.pct(R.baseline_acc, 0)} majority baseline. Every prediction breaks down into a prior, nine readable likelihoods and one normalisation. Attack-pattern features add ${fmt.signed(100 * (abl('+ pattern').cv_mean - abl('base-4 bins').cv_mean), 2)} points. A Markov feature, despite being a richer model, changes accuracy by ${fmt.signed(100 * mkDelta, 2)} points because it breaks the independence assumption the classifier is built on.`;

      el.append(
        h('div', { class: 'stack' },
          h('p', {}, `The model calls ${PARADOX} ${par.ex.pred} with probability ${fmt.post(par.ex.confidence)}. Any attacker would try it early. The reason is one rule in the training data: of the ${fmt.int(M.class_counts[iW])} Weak passwords, ${fmt.int(spW)} contain a symbol. So P(sp_bin = ${spLik.value} | Weak) is a smoothed zero, ${fmt.sci(spLik.lik[iW], 3)}, and a single “!” is worth ${fmt.signed(spLik.llr, 2)} nats toward Strong. The common-word and year flags push back with ${fmt.signed(negSum, 2)} nats in total and lose.`),
          h('div', { class: 'row' }, h('button', { class: 'btn primary', id: 'limits-load', type: 'button', onClick: () => store.set(PARADOX) }, `Load ${PARADOX} into the page`),
            h('span', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, `The checker at the top still gives it grade ${par.r.grade}: the common-password check caps the score.`))),
        h('figure', { class: 'fig' }, h('div', { class: 'li-pair' }, left.el, right.el),
          h('figcaption', { class: 'cap' }, h('b', {}, 'Likelihood ratio'), `Per-feature log-likelihood ratio ln P(f | Strong) − ln P(f | Weak), clipped at ±${MAXN} nats. Green pushes toward Strong, red toward Weak.`)),
        h('div', { class: 'stack' }, h('h3', {}, 'Limitations'),
          h('div', { class: 'li-list' }, items.map(([t, big, text, link]) => h('div', { class: 'li-item' }, h('h4', {}, t), h('span', { class: 'big' }, big), h('p', {}, text),
            h('a', { href: `#${link}`, style: { fontSize: 'var(--fs-xs)', fontFamily: 'var(--mono)' } }, 'see the evidence →'))))),
        h('figure', { class: 'fig' }, h('h3', {}, 'Where each probability idea appears'),
          h('div', { class: 'scroll-x' }, h('table', { class: 'tbl' },
            h('thead', {}, h('tr', {}, h('th', {}, 'concept'), h('th', {}, 'used for'), h('th', {}, 'sections'))),
            h('tbody', {}, CONCEPTS.map(([c, use, ids]) => h('tr', {}, h('td', { style: { fontFamily: 'var(--body)', fontWeight: '600' } }, c),
              h('td', { style: { fontFamily: 'var(--body)', textAlign: 'left', whiteSpace: 'normal' } }, use),
              h('td', {}, ids.map((id, i) => [i ? ', ' : '', h('a', { href: `#${id}` }, id)]))))))),
          h('figcaption', { class: 'cap' }, h('b', {}, 'Model assumptions'), 'Every concept from the course that this project uses, with a link to where it is shown live.')),
        h('div', { class: 'stack' }, h('h3', {}, 'In one paragraph'), h('p', { class: 'li-sum' }, sumText),
          h('p', { class: 'faint', style: { fontSize: 'var(--fs-sm)' } }, 'Data: PWLDS, Infinitode (2024), CC BY 4.0. Common passwords: SecLists 10k-most-common (D. Miessler et al.). Zipf’s law in passwords: Wang, Cheng, Wang, Huang and Jian (2017), IEEE Transactions on Information Forensics and Security. Course: BAMAT207 Probability and Statistics.')));

      store.subscribe((st) => fillPanel(right, st.password), 'limits');
    },
  });
})();
