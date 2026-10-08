(function () {
  'use strict';

  const CSS = `
#independence .in-maps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
#independence .in-map h4 { font: 700 var(--fs-sm) var(--mono); color: var(--c-ink); margin-bottom: .3rem; display: flex; justify-content: space-between; gap: .5rem; }
#independence .in-map h4 span { font-weight: 500; color: var(--ink-2); }
#independence svg { display: block; width: 100%; height: auto; overflow: visible; }
#independence .in-cell { cursor: pointer; }
#independence .in-cell:focus { outline: none; }
#independence .in-cell:focus-visible rect, #independence .in-cell.sel rect { stroke: var(--ink); stroke-width: 2.5; }
#independence .in-detail { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; }
#independence .in-ct { border-collapse: collapse; font: 500 var(--fs-xs) var(--mono); width: 100%; }
#independence .in-ct th, #independence .in-ct td { padding: .3rem .4rem; text-align: right; border: 1px solid var(--line); white-space: nowrap; }
#independence .in-ct th { color: var(--ink-2); font-weight: 600; background: var(--paper-2); }
#independence .in-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .8rem; }
#independence .in-kpis .big { font: 750 var(--fs-lg)/1.1 var(--display); font-variant-numeric: tabular-nums; }
#independence .in-toy { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 1.25rem; align-items: start; }
#independence .in-tbar { display: grid; grid-template-columns: 4.6rem minmax(0, 1fr) 6.5rem; gap: .6rem; align-items: center; font-size: var(--fs-sm); }
#independence .in-tbar + .in-tbar { margin-top: .45rem; }
#independence .in-tbar .t { height: .8rem; background: var(--paper-2); border-radius: 99px; overflow: hidden; border: 1px solid var(--line); }
#independence .in-tbar .t i { display: block; height: 100%; background: var(--c); transition: width .35s var(--ease); }
#independence .in-tbar .num { text-align: right; font-size: var(--fs-xs); }
@media (max-width: 960px) { #independence .in-maps, #independence .in-detail { grid-template-columns: minmax(0, 1fr); } #independence .in-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 760px) { #independence .in-toy { grid-template-columns: minmax(0, 1fr); } }`;

  // p-values come from the Python results; the page recomputes chi^2 so readers can see it matches.
  PWB.register({
    id: 'independence',
    order: 120,
    nav: 'Assumption',
    kicker: 'Chi-square test',
    title: 'Is the naive assumption true?',
    lede: 'Naive Bayes assumes the features are independent within each class. A chi-square test checks every pair.',
    mount(el, { E, kit, data, store, h, s, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES, F = data.features.order, R = data.results;
      const chi = R.chi_square, cont = data.eda.contingency;
      const key = (c, a, b) => `${c}|${a}|${b}`;
      const chiBy = new Map(chi.map((r, i) => [key(r.class, r.f1, r.f2), { ...r, ct: cont[i] }]));
      const get = (c, a, b) => chiBy.get(key(c, a, b)) || chiBy.get(key(c, b, a));
      const viol = C.map((c) => chi.filter((r) => r.class === c && r.violates).length);
      const perClass = chi.length / C.length;
      const top = chi.slice().sort((a, b) => b.cramers_v - a.cramers_v)[0];
      let sel = { c: top.class, a: top.f1, b: top.f2 };

      // ---------- heatmaps ----------
      const maps = C.map((c, ci) => {
        const box = h('div');
        return { c, ci, box, el: h('div', { class: `in-map ${kit.cls.className(ci)}` }, h('h4', {}, c, h('span', {}, `${viol[ci]} of ${perClass} pairs dependent`)), box) };
      });
      const short = (f) => f.replace('_bin', '').replace('has_', '').replace('is_', '');
      function drawMap(m, w) {
        const n = F.length, lab = 46, cell = (w - lab) / n, H = lab + cell * n;
        const svg = s('svg', { viewBox: `0 0 ${w} ${H}`, role: 'group', 'aria-label': `Cramér's V for ${m.c}` });
        F.forEach((f, i) => {
          svg.append(s('text', { x: lab - 4, y: lab + cell * i + cell / 2 + 3, 'text-anchor': 'end', class: 'chart-text', style: { fontSize: '9.5px' } }, short(f)));
          svg.append(s('text', { x: lab + cell * i + cell / 2, y: lab - 4, 'text-anchor': 'start', class: 'chart-text', style: { fontSize: '9.5px' },
            transform: `rotate(-50 ${lab + cell * i + cell / 2} ${lab - 4})` }, short(f)));
        });
        for (let i = 1; i < n; i++) for (let j = 0; j < i; j++) {
          const r = get(m.c, F[i], F[j]);
          const v = r.cramers_v, na = r.chi2 === null;
          const fill = na ? 'var(--paper-2)' : `color-mix(in srgb, ${kit.cls.color(m.ci)} ${Math.round(6 + 94 * Math.min(1, v / 0.7))}%, var(--surface))`;
          const g = s('g', { class: `in-cell ${sel.c === m.c && ((sel.a === F[i] && sel.b === F[j]) || (sel.a === F[j] && sel.b === F[i])) ? 'sel' : ''}`, tabindex: '0', role: 'button',
            'aria-label': `${m.c}: ${F[i]} and ${F[j]}, Cramér's V ${v.toFixed(2)}${na ? ', not testable' : r.violates ? ', dependent' : ''}` },
            s('rect', { x: lab + cell * j + 1, y: lab + cell * i + 1, width: cell - 2, height: cell - 2, rx: 2, style: { fill, stroke: 'var(--line)' } }),
            na ? s('text', { x: lab + cell * j + cell / 2, y: lab + cell * i + cell / 2 + 3, 'text-anchor': 'middle', class: 'chart-text', style: { fontSize: '8px' } }, 'n/a')
              : r.violates ? s('circle', { cx: lab + cell * j + cell - 6, cy: lab + cell * i + 6, r: 2.4, style: { fill: v > 0.35 ? 'var(--paper)' : 'var(--ink)' } }) : null);
          const pick = () => { sel = { c: m.c, a: F[i], b: F[j] }; maps.forEach((mm) => mm.w && drawMap(mm, mm.w)); renderDetail(); };
          g.addEventListener('click', pick);
          g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
          kit.tip.attach(g, () => `${m.c}: ${F[i]} × ${F[j]}<br>V = ${v.toFixed(3)}${na ? ' (a feature is constant)' : `<br>χ² = ${fmt.int(r.chi2)}, dof ${r.dof}<br>${r.violates ? 'dependent' : 'no evidence of dependence'}`}`);
          svg.append(g);
        }
        kit.replace(m.box, svg);
      }
      maps.forEach((m) => kit.responsive(m.box, (w) => { m.w = w; drawMap(m, w); }));

      // ---------- detail ----------
      const dTitle = h('h3');
      const dObs = h('div', { class: 'scroll-x' }), dExp = h('div', { class: 'scroll-x' }), dCon = h('div', { class: 'scroll-x' });
      const dFormula = h('div', { class: 'formula' });
      const dNote = h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } });
      function table(rows, cols, vals, cellFmt, shade) {
        return h('table', { class: 'in-ct' }, h('thead', {}, h('tr', {}, h('th', {}, ''), cols.map((c) => h('th', {}, c)))),
          h('tbody', {}, rows.map((r, i) => h('tr', {}, h('th', {}, r), cols.map((c, j) => h('td', { style: shade ? { background: shade(vals[i][j]) } : null }, cellFmt(vals[i][j])))))));
      }
      function renderDetail() {
        const r = get(sel.c, sel.a, sel.b), ct = r.ct;
        const ci = C.indexOf(sel.c);
        const keepR = ct.observed.map((row) => row.some((v) => v > 0));
        const keepC = ct.cols.map((_, j) => ct.observed.some((row) => row[j] > 0));
        const O = ct.observed.filter((_, i) => keepR[i]).map((row) => row.filter((_, j) => keepC[j]));
        const rows = ct.rows.filter((_, i) => keepR[i]), cols = ct.cols.filter((_, j) => keepC[j]);
        const n = O.flat().reduce((a, b) => a + b, 0);
        const rs = O.map((row) => row.reduce((a, b) => a + b, 0)), cs = cols.map((_, j) => O.reduce((a, row) => a + row[j], 0));
        const Ex = O.map((row, i) => row.map((_, j) => (rs[i] * cs[j]) / n));
        const Con = O.map((row, i) => row.map((o, j) => (Ex[i][j] > 0 ? (o - Ex[i][j]) ** 2 / Ex[i][j] : 0)));
        const chi2 = Con.flat().reduce((a, b) => a + b, 0);
        const dof = (rows.length - 1) * (cols.length - 1);
        const V = dof > 0 ? Math.sqrt(chi2 / (n * (Math.min(rows.length, cols.length) - 1))) : 0;
        const maxCon = Math.max(...Con.flat(), 1e-9);
        dTitle.textContent = `${sel.c} passwords: ${ct.f1} (rows) × ${ct.f2} (columns)`;
        kit.replace(dObs, table(rows, cols, O, (v) => fmt.int(v)));
        kit.replace(dExp, dof > 0 ? table(rows, cols, Ex, (v) => (v < 10 ? v.toFixed(2) : fmt.int(v))) : h('p', { class: 'faint' }, 'One feature is constant in this class, so there is nothing to test.'));
        kit.replace(dCon, dof > 0 ? table(rows, cols, Con, (v) => (v < 10 ? v.toFixed(2) : fmt.int(v)),
          (v) => `color-mix(in srgb, ${kit.cls.color(ci)} ${Math.round(70 * Math.sqrt(v / maxCon))}%, transparent)`) : h('span'));
        dFormula.innerHTML = dof > 0
          ? kit.tex(`\\chi^2=\\sum\\frac{(O-E)^2}{E}=${chi2 < 1e5 ? chi2.toFixed(1) : fmt.int(chi2).replace(/,/g, '{,}')},\\quad \\text{dof}=(${rows.length}-1)(${cols.length}-1)=${dof},\\quad V=\\sqrt{\\frac{\\chi^2}{n\\,(\\min(r,c)-1)}}=${V.toFixed(3)}`, true)
          : kit.tex('\\text{not testable: a feature takes a single value in this class}', true);
        const pTxt = r.p === null ? 'not defined' : r.p === 0 ? 'below 10⁻³⁰⁰' : fmt.sci(r.p, 2);
        dNote.textContent = dof > 0
          ? `Recomputed here: χ² = ${chi2.toFixed(1)}; stored from the Python test: ${r.chi2.toFixed(1)}. p-value ${pTxt}, against the Bonferroni level ${fmt.sci(R.bonferroni_alpha, 3)}: ${r.violates ? 'reject independence' : 'no evidence against independence'}. ${r.pct_expected_lt5 > 0.2 ? `Note: ${fmt.pct(r.pct_expected_lt5, 0)} of expected counts are below 5, so the p-value is only approximate.` : ''}`
          : '';
      }

      // ---------- double-counting toy ----------
      const kRange = h('input', { type: 'range', id: 'independence-k', min: '1', max: '5', step: '1', value: '1', 'aria-label': 'Times the strongest feature is counted' });
      const kOut = h('output', { class: 'num', for: 'independence-k' });
      const toyText = h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } });
      const toyBars = C.map((c, i) => { const fill = h('i'), num = h('span', { class: 'num' });
        return { el: h('div', { class: `in-tbar ${kit.cls.className(i)}` }, h('span', {}, c), h('div', { class: 't' }, fill), num), fill, num }; });
      let last = null;
      function renderToy() {
        if (!last) return;
        const ex = last.ex, k = +kRange.value;
        const st = ex.steps.reduce((a, b) => (Math.abs(b.llr) > Math.abs(a.llr) ? b : a));
        const lj = ex.logJoint.map((v, c) => v + (k - 1) * Math.log(st.lik[c]));
        const Z = E.logsumexp(lj), post = lj.map((v) => Math.exp(v - Z));
        kOut.textContent = `counted ${k}×`;
        toyBars.forEach((b, i) => { b.fill.style.width = `${Math.max(0.5, 100 * post[i])}%`; b.num.textContent = fmt.post(post[i]); });
        toyText.textContent = `The strongest feature for the current password is ${st.feature} = ${st.value} (${fmt.signed(st.llr, 2)} nats toward ${st.llr >= 0 ? 'Strong' : 'Weak'}). If two features carry the same information, naive Bayes adds it twice. Each extra copy adds another ${fmt.signed(st.llr, 2)} nats, so the posterior grows more confident without any new evidence.`;
      }
      kRange.addEventListener('input', renderToy);

      // mk_bin dependence in Strong, computed.
      const mkStrong = chi.filter((r) => r.class === 'Strong' && (r.f1 === 'mk_bin' || r.f2 === 'mk_bin')).sort((a, b) => b.cramers_v - a.cramers_v).slice(0, 3);

      el.append(
        h('p', {}, 'Within one class, naive Bayes treats P(f₁, f₂ | C) as P(f₁ | C) · P(f₂ | C). The chi-square test compares the observed counts of every value pair with the counts that independence would predict, and Cramér’s V measures how strong the dependence is, from 0 (none) to 1 (one feature determines the other).'),
        h('div', { class: 'in-kpis' },
          h('div', { class: 'panel flat' }, h('div', { class: 'eyebrow' }, 'tests'), h('div', { class: 'big' }, `${chi.length}`), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `${perClass} pairs × ${C.length} classes`)),
          h('div', { class: 'panel flat' }, h('div', { class: 'eyebrow' }, 'Bonferroni level'), h('div', { class: 'big' }, fmt.sci(R.bonferroni_alpha, 3)), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `0.05 / ${chi.length}`)),
          h('div', { class: 'panel flat' }, h('div', { class: 'eyebrow' }, 'dependent pairs'), h('div', { class: 'big' }, `${viol.reduce((a, b) => a + b, 0)} / ${chi.length}`), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, C.map((c, i) => `${c} ${viol[i]}`).join(' · '))),
          h('div', { class: 'panel flat' }, h('div', { class: 'eyebrow' }, 'strongest'), h('div', { class: 'big' }, `V = ${top.cramers_v.toFixed(2)}`), h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)' } }, `${top.class}: ${top.f1} × ${top.f2}`))),
        h('figure', { class: 'fig' }, h('div', { class: 'in-maps' }, maps.map((m) => m.el)),
          h('figcaption', { class: 'cap' }, h('b', {}, 'Independence and the chi-square test'), 'Cramér’s V for every feature pair within each class; darker is more dependent. A dot marks pairs where the chi-square test rejects independence at the Bonferroni level. n/a: one feature never changes inside that class. Click a cell for the full test.')),
        h('div', { class: 'panel stack' }, dTitle,
          h('div', { class: 'in-detail' },
            h('div', { class: 'stack' }, h('span', { class: 'eyebrow nocase' }, 'Observed O'), dObs),
            h('div', { class: 'stack' }, h('span', { class: 'eyebrow nocase' }, 'Expected if independent  E = row × column / n'), dExp),
            h('div', { class: 'stack' }, h('span', { class: 'eyebrow nocase' }, 'Contribution (O − E)² / E'), dCon)),
          dFormula, dNote,
          h('p', { class: 'cap' }, h('b', {}, 'Joint vs product of marginals'), 'E is what the joint table would look like if it were exactly the product of its row and column totals. Large contributions show where the real joint distribution departs from that product.')),
        h('div', { class: 'in-toy' },
          h('div', { class: 'stack' }, h('h3', {}, 'What dependence does to the posterior'),
            h('p', {}, `Dependent features tell the model the same thing twice, so it becomes overconfident. In the Strong class the Markov bin is tied to the composition features (${mkStrong.map((r) => `${r.f1 === 'mk_bin' ? r.f2 : r.f1} V = ${r.cramers_v.toFixed(2)}`).join(', ')}). That is why adding mk_bin lowered accuracy in `, h('a', { href: '#evaluation' }, 'the evaluation'), '.'),
            toyText),
          h('figure', { class: 'fig panel flat' }, h('div', { class: 'between' }, h('label', { for: 'independence-k', class: 'eyebrow' }, 'Count the strongest feature'), kOut), kRange,
            h('div', {}, toyBars.map((b) => b.el)),
            h('figcaption', { class: 'cap' }, h('b', {}, 'Double counting'), 'The current password’s posterior if its strongest feature were counted k times, as naive Bayes effectively does when features are duplicates of each other.'))));

      renderDetail();
      store.subscribe((st) => { last = st; renderToy(); }, 'independence');
    },
  });
})();
