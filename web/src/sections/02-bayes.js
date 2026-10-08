(function () {
  'use strict';

  const N = 1000;
  const COLS = 20;
  const CSS = `
#bayes .by-controls { display: flex; flex-wrap: wrap; gap: .8rem 1.2rem; align-items: end; }
#bayes .by-controls select { min-width: 9rem; }
#bayes .by-groups { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; align-items: start; }
#bayes .by-group h4 { font: 600 var(--fs-sm) var(--mono); display: flex; justify-content: space-between; gap: .5rem; margin-bottom: .4rem; color: var(--c-ink); }
#bayes .by-grid { display: grid; grid-template-columns: repeat(${COLS}, minmax(0, 1fr)); gap: 2px; }
#bayes .by-grid i { aspect-ratio: 1; border-radius: 1.5px; background: color-mix(in srgb, var(--c) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--c) 30%, transparent); transition: background-color .35s var(--ease), transform .35s var(--ease); }
#bayes .by-grid i.on { background: var(--c); border-color: var(--c); }
#bayes.by-cond .by-grid i:not(.on) { opacity: .12; }
#bayes .by-tiny { font: 500 var(--fs-xs) var(--mono); color: var(--ink-2); margin-top: .35rem; min-height: 1.2em; }
#bayes .by-steps { display: grid; gap: .55rem; counter-reset: st; }
#bayes .by-steps p { padding-left: 1.8rem; position: relative; max-width: none; }
#bayes .by-steps p::before { counter-increment: st; content: counter(st); position: absolute; left: 0; top: .1rem; width: 1.3rem; height: 1.3rem; border-radius: 50%;
  display: grid; place-items: center; font: 700 var(--fs-xs) var(--mono); background: var(--accent-soft); color: var(--accent); }
#bayes .by-stack { display: flex; height: 2.2rem; border-radius: var(--r); overflow: hidden; border: 1px solid var(--line-2); }
#bayes .by-stack div { background: var(--c); transition: flex-grow .5s var(--ease); display: grid; place-items: center; overflow: hidden;
  font: 700 var(--fs-xs) var(--mono); color: var(--paper); white-space: nowrap; min-width: 0; }
#bayes .by-forms { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(19rem, 100%), 1fr)); gap: .9rem; }
#bayes .by-forms .panel { padding: .8rem 1rem; }
#bayes .by-forms .formula { font-size: 1rem; padding: .2rem 0; }
#bayes .by-two { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .8rem; }
#bayes .by-two .col { display: grid; gap: .35rem; }
#bayes .by-two .r { display: grid; grid-template-columns: 4.3rem minmax(0, 1fr) 4rem; gap: .4rem; align-items: center; font-size: var(--fs-xs); }
#bayes .by-two .t { height: .55rem; background: var(--paper-2); border-radius: 99px; overflow: hidden; }
#bayes .by-two .t i { display: block; height: 100%; width: 0; background: var(--c); transition: width .45s var(--ease); }
#bayes .by-two .r .num { text-align: right; }
@media (max-width: 760px) { #bayes .by-groups, #bayes .by-two { grid-template-columns: minmax(0, 1fr); } }`;

  const texNum = (x) => {
    if (x === 0) return '0';
    if (x >= 1e-3) return Number(x.toPrecision(4)).toString();
    const [m, e] = x.toExponential(2).split('e');
    return `${m}\\times10^{${parseInt(e, 10)}}`;
  };
  // Integer square counts that sum exactly to N.
  function apportion(p, total) {
    const raw = p.map((x) => x * total);
    const out = raw.map(Math.floor);
    let left = total - out.reduce((a, b) => a + b, 0);
    raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (left-- > 0) out[i]++; });
    return out;
  }

  PWB.register({
    id: 'bayes',
    order: 20,
    nav: 'Bayes 101',
    kicker: 'Probability 101',
    title: 'Bayes’ theorem with 1,000 passwords',
    lede: 'Conditional probability, joint probability and Bayes’ theorem, drawn as counts you can see.',
    mount(el, { E, kit, data, store, h, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES;
      const section = el.closest('section') || el;

      // ---------- controls ----------
      let follow = true, priorMode = 'data', scale = N, view = 'joint';
      const featSel = h('select', { id: 'bayes-feature' }, E.FEATURES.map((f) => h('option', { value: f }, f)));
      const valSel = h('select', { id: 'bayes-value' });
      const fillValues = (f, keep) => {
        const levels = data.nb.counts[f].levels;
        kit.replace(valSel, levels.map((v) => h('option', { value: v }, v)));
        valSel.value = levels.includes(keep) ? keep : levels[0];
      };
      const followBtn = h('button', { class: 'btn small', id: 'bayes-follow', type: 'button', 'aria-pressed': 'true' }, 'Follow the password');
      const seg = (id, opts, get, set) => {
        const wrap = h('div', { class: 'seg', role: 'group', id });
        opts.forEach(([v, label]) => wrap.append(h('button', { type: 'button', 'aria-pressed': String(get() === v), onClick: () => {
          set(v); [...wrap.children].forEach((b, i) => b.setAttribute('aria-pressed', String(opts[i][0] === v))); render();
        } }, label)));
        return wrap;
      };
      featSel.addEventListener('change', () => { follow = false; followBtn.setAttribute('aria-pressed', 'false'); fillValues(featSel.value); render(); });
      valSel.addEventListener('change', () => { follow = false; followBtn.setAttribute('aria-pressed', 'false'); render(); });
      followBtn.addEventListener('click', () => { follow = true; followBtn.setAttribute('aria-pressed', 'true'); render(); });

      const controls = h('div', { class: 'by-controls' },
        h('div', { class: 'field' }, h('label', { for: 'bayes-feature' }, 'FEATURE'), featSel),
        h('div', { class: 'field' }, h('label', { for: 'bayes-value' }, 'VALUE'), valSel),
        followBtn,
        h('div', { class: 'field' }, h('label', {}, 'PRIOR'), seg('bayes-prior', [['data', 'data'], ['uniform', 'uniform']], () => priorMode, (v) => { priorMode = v; })),
        h('div', { class: 'field' }, h('label', {}, 'VIEW'), seg('bayes-view', [['joint', 'all 1,000'], ['cond', 'only matches']], () => view, (v) => { view = v; })),
        h('div', { class: 'field' }, h('label', {}, 'SCALE'), seg('bayes-scale', [[N, '1,000'], [1e6, '1,000,000']], () => scale, (v) => { scale = v; })));

      // ---------- squares ----------
      const groups = C.map((c, i) => {
        const grid = h('div', { class: 'by-grid', 'aria-hidden': 'true' });
        const head = h('span'), count = h('span');
        const tiny = h('div', { class: 'by-tiny' });
        return { el: h('div', { class: `by-group ${kit.cls.className(i)}` }, h('h4', {}, head, count), grid, tiny), grid, head, count, tiny, cells: [] };
      });
      const sizeGrid = (g, n) => {
        while (g.cells.length < n) { const sq = h('i'); g.cells.push(sq); g.grid.append(sq); }
        while (g.cells.length > n) g.cells.pop().remove();
      };
      const stack = h('div', { class: 'by-stack', role: 'img' }, C.map((c, i) => h('div', { class: kit.cls.className(i), style: { flexGrow: '1' } })));
      const steps = h('div', { class: 'by-steps' });
      const forms = { cond: h('div', { class: 'formula' }), joint: h('div', { class: 'formula' }), total: h('div', { class: 'formula' }), bayes: h('div', { class: 'formula' }) };
      const two = { title: h('p', { class: 'muted' }), cols: [] };
      const twoGrid = h('div', { class: 'by-two' });
      const twoFormula = h('div', { class: 'formula' });

      el.append(
        h('p', {}, 'Imagine 1,000 passwords drawn from the training data. The prior decides how many of each class there are. One feature then picks out the passwords that share the current password’s value. Bayes’ theorem is just counting what fraction of those are in each class.'),
        controls,
        h('figure', { class: 'fig' }, h('div', { class: 'by-groups' }, groups.map((g) => g.el)),
          h('figcaption', { class: 'cap' }, h('b', {}, 'Joint and conditional probability'), 'Each square is one of 1,000 passwords. Filled squares have the chosen feature value. Filled squares in a class ÷ squares in that class = P(f = v | C). Filled squares in a class ÷ 1,000 = the joint P(f = v, C).')),
        h('div', { class: 'grid-2', style: { alignItems: 'start' } },
          h('div', { class: 'stack' }, h('h3', {}, 'Reading the picture'), steps),
          h('figure', { class: 'fig' }, h('h3', {}, 'Among the filled squares only'), stack,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Posterior'), 'Rescale the filled squares to 100%: this split is P(C | f = v), the posterior after seeing one feature.'))),
        h('div', { class: 'by-forms' },
          h('div', { class: 'panel flat' }, h('span', { class: 'eyebrow' }, 'Conditional probability'), forms.cond),
          h('div', { class: 'panel flat' }, h('span', { class: 'eyebrow' }, 'Joint probability'), forms.joint),
          h('div', { class: 'panel flat' }, h('span', { class: 'eyebrow' }, 'Law of total probability'), forms.total),
          h('div', { class: 'panel flat' }, h('span', { class: 'eyebrow' }, 'Bayes’ theorem'), forms.bayes)),
        h('figure', { class: 'fig panel' }, h('h3', {}, 'Two features at once'), two.title, twoGrid, twoFormula,
          h('figcaption', { class: 'cap' }, h('b', {}, 'Conditional independence'), 'Naive Bayes multiplies the two likelihoods as if the features were independent within each class. Whether that holds is tested in ',
            h('a', { href: '#independence' }, 'the chi-square section'), '.')));

      const twoCols = ['first feature only', 'second feature only', 'both (naive Bayes)'].map((label) => {
        const rows = C.map((c, i) => { const bar = h('i'), num = h('span', { class: 'num' });
          return { el: h('div', { class: `r ${kit.cls.className(i)}` }, h('span', {}, c), h('div', { class: 't' }, bar), num), bar, num }; });
        const head = h('span', { class: 'eyebrow' }, label);
        twoGrid.append(h('div', { class: 'col' }, head, rows.map((r) => r.el)));
        return { head, rows };
      });

      let last = null;
      function render() {
        const st = last;
        if (!st) return;
        const ex = st.ex;
        if (follow) {
          const best = ex.steps.reduce((a, b) => (Math.abs(b.llr) > Math.abs(a.llr) ? b : a));
          featSel.value = best.feature;
          fillValues(best.feature, best.value);
        }
        const f = featSel.value, v = valSel.value;
        const prior = priorMode === 'uniform' ? [1 / 3, 1 / 3, 1 / 3] : E.dataPrior;
        const row = E.table(f).find((r) => r.level === v);
        const lik = row.p;
        const classN = apportion(prior, N);
        const expected = prior.map((p, i) => scale * p * lik[i]);
        const total = expected.reduce((a, b) => a + b, 0);
        const postr = expected.map((e) => e / total);
        section.classList.toggle('by-cond', view === 'cond');

        groups.forEach((g, i) => {
          sizeGrid(g, classN[i]);
          const on = Math.min(classN[i], Math.round(N * prior[i] * lik[i]));
          g.cells.forEach((sq, j) => {
            sq.classList.toggle('on', j < on);
            sq.style.transitionDelay = kit.reducedMotion() ? '0ms' : `${Math.min(j, 300)}ms`;
          });
          g.head.textContent = `${C[i]}: ${fmt.int(scale * prior[i])}`;
          g.count.textContent = `${fmt.prob(expected[i] / (scale * prior[i]))}`;
          const e = expected[i];
          g.tiny.textContent = e === 0 ? 'none' : e < 1 ? `about ${fmt.sci(e, 2)} of ${fmt.int(scale)}: fewer than one` : `≈ ${e < 100 ? e.toFixed(1) : fmt.int(e)} with ${f} = ${v}`;
        });

        [...stack.children].forEach((d, i) => { d.style.flexGrow = String(Math.max(postr[i], 0.0001)); d.textContent = postr[i] > 0.12 ? `${C[i]} ${fmt.pct(postr[i])}` : ''; });
        stack.setAttribute('aria-label', C.map((c, i) => `${c} ${fmt.pct(postr[i])}`).join(', '));

        const S = fmt.int(scale);
        const say = (i) => `${fmt.int(scale * prior[i])} are ${C[i]}. P(${f} = ${v} | ${C[i]}) = ${fmt.prob(lik[i])}, so about ${expected[i] < 1 ? fmt.sci(expected[i], 2) : expected[i].toFixed(1)} of them have it.`;
        kit.replace(steps,
          h('p', {}, `Of ${S} passwords: ${say(0)}`),
          h('p', {}, `${say(1)} ${say(2)}`),
          h('p', {}, `In total about ${total < 1 ? fmt.sci(total, 3) : total.toFixed(1)} passwords have ${f} = ${v}. That total is P(${f} = ${v}) × ${S}.`),
          h('p', {}, `So a password with ${f} = ${v} is ${C.map((c, i) => `${c} with probability ${fmt.post(postr[i])}`).join(', ')}.`));

        const k = postr.indexOf(Math.max(...postr)), ck = C[k];
        const fv = `\\text{${f.replace(/_/g, '\\_')}}=\\text{${v}}`;
        forms.cond.innerHTML = kit.tex(`P(${fv}\\mid \\text{${ck}})=\\frac{P(${fv},\\,\\text{${ck}})}{P(\\text{${ck}})}=\\frac{${texNum(prior[k] * lik[k])}}{${texNum(prior[k])}}=${texNum(lik[k])}`, true);
        forms.joint.innerHTML = kit.tex(`P(${fv},\\,\\text{${ck}})=P(${fv}\\mid\\text{${ck}})\\,P(\\text{${ck}})=${texNum(lik[k])}\\times${texNum(prior[k])}=${texNum(prior[k] * lik[k])}`, true);
        forms.total.innerHTML = kit.tex(`P(${fv})=\\sum_C P(${fv}\\mid C)P(C)=${prior.map((p, i) => texNum(p * lik[i])).join('+')}=${texNum(total / scale)}`, true);
        forms.bayes.innerHTML = kit.tex(`P(\\text{${ck}}\\mid ${fv})=\\frac{P(${fv}\\mid\\text{${ck}})\\,P(\\text{${ck}})}{P(${fv})}=\\frac{${texNum(prior[k] * lik[k])}}{${texNum(total / scale)}}=${texNum(postr[k])}`, true);

        // Two strongest features combined.
        const top = ex.steps.slice().sort((a, b) => Math.abs(b.llr) - Math.abs(a.llr)).slice(0, 2);
        const one = (s) => { const j = prior.map((p, i) => p * s.lik[i]); const z = j.reduce((a, b) => a + b, 0); return j.map((x) => x / z); };
        const both = (() => { const j = prior.map((p, i) => p * top[0].lik[i] * top[1].lik[i]); const z = j.reduce((a, b) => a + b, 0); return j.map((x) => x / z); })();
        two.title.textContent = `The two features that matter most for “${kit.showPw(ex.password)}”: ${top[0].feature} = ${top[0].value} and ${top[1].feature} = ${top[1].value}.`;
        [one(top[0]), one(top[1]), both].forEach((ps, c) => ps.forEach((p, i) => {
          twoCols[c].rows[i].bar.style.width = `${Math.max(0.5, 100 * p)}%`;
          twoCols[c].rows[i].num.textContent = fmt.pct(p, 1);
        }));
        const t0 = `\\text{${top[0].feature.replace(/_/g, '\\_')}}`, t1 = `\\text{${top[1].feature.replace(/_/g, '\\_')}}`;
        twoFormula.innerHTML = kit.tex(`P(C\\mid ${t0},${t1})\\;\\propto\\;P(C)\\,P(${t0}\\mid C)\\,P(${t1}\\mid C)`, true);
      }

      store.subscribe((st) => { last = st; render(); }, 'bayes');
    },
  });
})();
