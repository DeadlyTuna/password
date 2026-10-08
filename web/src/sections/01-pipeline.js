(function () {
  'use strict';

  const CSS = `
#pipeline .pl-rail { position: relative; display: grid; gap: 1.1rem; padding-left: 2.6rem; }
#pipeline .pl-rail::before {
  content: ""; position: absolute; left: 0.95rem; top: 1rem; bottom: 1rem; width: 3px; border-radius: 3px;
  background: repeating-linear-gradient(to bottom, var(--accent) 0 8px, transparent 8px 16px);
  background-size: 3px 16px; animation: pl-flow 0.9s linear infinite; opacity: .55;
}
@keyframes pl-flow { to { background-position: 0 16px; } }
#pipeline .pl-stage { position: relative; display: grid; grid-template-columns: minmax(10rem, 13rem) minmax(0, 1fr); gap: 1rem 1.4rem; align-items: start;
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: .9rem 1rem; color: inherit; text-decoration: none;
  transition: border-color .2s, transform .2s var(--ease); }
#pipeline a.pl-stage:hover { border-color: var(--accent); transform: translateX(3px); }
#pipeline .pl-node { position: absolute; left: -2.6rem; top: .85rem; width: 1.9rem; height: 1.9rem; border-radius: 50%; display: grid; place-items: center;
  font: 700 var(--fs-xs) var(--mono); background: var(--paper); border: 2px solid var(--accent); color: var(--accent); }
#pipeline .pl-head h3 { font-size: var(--fs-md); }
#pipeline .pl-head p { font-size: var(--fs-xs); color: var(--ink-2); margin-top: .25rem; }
#pipeline .pl-go { font: 600 var(--fs-xs) var(--mono); color: var(--accent); margin-top: .4rem; display: inline-block; }
#pipeline .pl-chars { display: flex; flex-wrap: wrap; gap: 3px; }
#pipeline .pl-chars span { font: 600 var(--fs-sm) var(--mono); min-width: 1.5rem; padding: .2rem .3rem; text-align: center; border-radius: 3px; border: 1px solid var(--line-2); background: var(--paper-2); }
#pipeline .pl-feats { display: flex; flex-wrap: wrap; gap: .35rem; }
#pipeline .pl-lik { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(11.5rem, 100%), 1fr)); gap: .45rem .9rem; }
#pipeline .pl-lrow { display: grid; grid-template-columns: 5.4rem minmax(0, 1fr); gap: .5rem; align-items: center; font: 500 var(--fs-xs) var(--mono); color: var(--ink-2); }
#pipeline .pl-mini { display: grid; gap: 2px; }
#pipeline .pl-mini i { display: block; height: 4px; border-radius: 2px; background: var(--c); width: 0; transition: width .4s var(--ease); }
#pipeline .pl-three { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .6rem; }
#pipeline .pl-cell { border-top: 3px solid var(--c); padding-top: .35rem; min-width: 0; }
#pipeline .pl-cell .eyebrow { color: var(--c-ink); text-transform: none; letter-spacing: .03em; }
#pipeline .pl-cell .num { font-size: var(--fs-sm); word-break: break-word; }
#pipeline .pl-post { display: grid; gap: .4rem; }
#pipeline .pl-pbar { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr) 6.5rem; gap: .6rem; align-items: center; font-size: var(--fs-sm); }
#pipeline .pl-pbar .t { height: .7rem; border-radius: 99px; background: var(--paper-2); border: 1px solid var(--line); overflow: hidden; }
#pipeline .pl-pbar .t i { display: block; height: 100%; width: 0; background: var(--c); transition: width .45s var(--ease); }
#pipeline .pl-pbar .num { text-align: right; font-size: var(--fs-xs); }
#pipeline .pl-gloss { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(11rem, 100%), 1fr)); gap: .8rem; }
#pipeline .pl-gloss div { border-top: 1px solid var(--ink); padding-top: .5rem; display: grid; gap: .25rem; align-content: start; }
#pipeline .pl-gloss b { font: 700 var(--fs-sm) var(--display); }
#pipeline .pl-gloss p { font-size: var(--fs-xs); color: var(--ink-2); }
#pipeline .pl-gloss .num { font-size: var(--fs-sm); color: var(--accent); }
@media (max-width: 720px) { #pipeline .pl-stage { grid-template-columns: minmax(0, 1fr); } }
@media (prefers-reduced-motion: reduce) { #pipeline .pl-rail::before { animation: none; } }`;

  // LaTeX for a number in scientific notation.
  const texNum = (x, d = 3) => {
    if (x === 0) return '0';
    if (x >= 1e-3 && x < 1e4) return x.toFixed(4);
    const [m, e] = x.toExponential(d - 1).split('e');
    return `${m}\\times 10^{${parseInt(e, 10)}}`;
  };
  // Width for a likelihood on a log scale: 1e-6 -> 0%, 1 -> 100%.
  const logW = (p) => `${Math.max(1.5, Math.min(100, 100 * (1 + Math.log10(p) / 6)))}%`;

  PWB.register({
    id: 'pipeline',
    order: 10,
    nav: 'Overview',
    kicker: 'The pipeline',
    title: 'From a password to a probability',
    lede: 'The model never reads the password as text. It turns it into nine features, looks up how often each feature appears in each class, and combines them with Bayes’ theorem.',
    mount(el, { E, kit, data, store, h, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES;

      const stage = (n, title, desc, href, body) => h(href ? 'a' : 'div', { class: 'pl-stage', href: href ? `#${href}` : null },
        h('span', { class: 'pl-node', 'aria-hidden': 'true' }, String(n)),
        h('div', { class: 'pl-head' }, h('h3', {}, title), h('p', {}, desc), href ? h('span', { class: 'pl-go' }, 'open section →') : null),
        h('div', { style: { minWidth: '0' } }, body));

      const chars = h('div', { class: 'pl-chars', 'aria-label': 'password characters' });
      const featChips = E.FEATURES.map((f) => h('span', { class: 'chip' }, `${f} `, h('b')));
      const likRows = E.FEATURES.map((f) => {
        const bars = C.map((c, i) => h('i', { class: kit.cls.className(i) }));
        const row = h('div', { class: 'pl-lrow' }, h('span', {}, f), h('div', { class: 'pl-mini' }, bars));
        return { row, bars };
      });
      const three = (label) => {
        const vals = C.map(() => h('div', { class: 'num' }));
        return { el: h('div', { class: 'pl-three' }, C.map((c, i) => h('div', { class: `pl-cell ${kit.cls.className(i)}` }, h('div', { class: 'eyebrow' }, label(c)), vals[i]))), vals };
      };
      const priorT = three((c) => `P(${c})`);
      const jointT = three((c) => `P(x | ${c}) P(${c})`);
      const evid = h('div', { class: 'num', style: { fontSize: 'var(--fs-md)' } });
      const evidTerms = h('div', { class: 'faint', style: { fontSize: 'var(--fs-xs)', fontFamily: 'var(--mono)', wordBreak: 'break-word' } });
      const post = C.map((c, i) => {
        const bar = h('i'), num = h('span', { class: 'num' });
        return { row: h('div', { class: `pl-pbar ${kit.cls.className(i)}` }, h('span', {}, c), h('div', { class: 't' }, bar), num), bar, num };
      });

      const rail = h('div', { class: 'pl-rail' },
        stage(1, 'Password', 'The raw string, as code points.', null, chars),
        stage(2, 'Extract features', 'Four binned counts, four yes/no patterns and one Markov bin.', 'features', h('div', { class: 'pl-feats' }, featChips)),
        stage(3, 'Look up likelihoods', 'P(f | C) for each feature value in each class, from the training counts. Bars on a log scale.', 'likelihoods',
          h('div', { class: 'pl-lik' }, likRows.map((r) => r.row))),
        stage(4, 'Multiply by the prior', 'How common each class is before reading the password.', 'prior', priorT.el),
        stage(5, 'Joint score', 'Prior × all nine likelihoods. Proportional to the posterior.', 'multiply', jointT.el),
        stage(6, 'Divide by the evidence', 'P(x) is the sum of the three joint scores (law of total probability).', 'multiply', h('div', {}, evid, evidTerms)),
        stage(7, 'Posterior', 'P(C | x): the three joint scores rescaled to sum to 1.', 'evidence', h('div', { class: 'pl-post' }, post.map((p) => p.row))));

      const formula = h('div', { class: 'formula' });
      const gloss = {};
      const G = [
        ['prior', 'Prior', 'P(C): belief about the class before seeing the password.'],
        ['likelihood', 'Likelihood', 'P(x | C): how probable these features are if the class were C.'],
        ['joint', 'Joint', 'P(x, C) = P(x | C) P(C): this password and this class together.'],
        ['evidence', 'Evidence', 'P(x) = Σ P(x | C) P(C): how probable the features are overall.'],
        ['posterior', 'Posterior', 'P(C | x): belief about the class after seeing the password.'],
      ];
      const glossEl = h('div', { class: 'pl-gloss' }, G.map(([k, name, def]) => h('div', {}, h('b', {}, name), h('p', {}, def), (gloss[k] = h('span', { class: 'num' })))));

      el.append(
        h('div', { class: 'grid-2', style: { alignItems: 'start' } },
          h('div', { class: 'stack' }, h('p', {}, 'Every stage below is live: it shows the numbers for the password in the box at the top. Click a stage to open the section that explains it.'),
            h('p', { class: 'muted' }, 'Bayes’ theorem turns "how often does this kind of password appear in each class" into "which class is this password probably from".')),
          h('figure', { class: 'fig panel flat' }, formula,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Bayes’ theorem'), 'The posterior of the predicted class, with the live numbers for the current password.'))),
        rail,
        h('figure', { class: 'fig' }, glossEl,
          h('figcaption', { class: 'cap' }, h('b', {}, 'Prior, likelihood, joint, evidence, posterior'), 'The five quantities in Bayes’ theorem, each with its live value for the predicted class.')));

      store.subscribe((st) => {
        const { ex } = st;
        const cs = ex.chars.slice(0, 24);
        kit.replace(chars, cs.length ? cs.map((c) => h('span', { title: E.charClass(c) }, c === ' ' ? '␣' : c)) : h('span', { class: 'faint' }, 'empty'),
          ex.chars.length > 24 ? h('span', { class: 'faint' }, `+${ex.chars.length - 24}`) : null);
        ex.steps.forEach((stp, j) => {
          featChips[j].querySelector('b').textContent = stp.value;
          stp.lik.forEach((p, i) => { likRows[j].bars[i].style.width = logW(p); });
          likRows[j].row.title = `${stp.feature}=${stp.value}: ${C.map((c, i) => `${c} ${fmt.prob(stp.lik[i])}`).join(', ')}`;
        });
        ex.prior.forEach((p, i) => { priorT.vals[i].textContent = p.toFixed(4); });
        ex.joint.forEach((j, i) => { jointT.vals[i].textContent = fmt.sci(j, 3); });
        evid.textContent = `P(x) = ${fmt.sci(ex.evidence, 4)}`;
        evidTerms.textContent = ex.joint.map((j) => fmt.sci(j, 3)).join(' + ');
        ex.posterior.forEach((p, i) => { post[i].bar.style.width = `${Math.max(0.5, 100 * p)}%`; post[i].num.textContent = fmt.post(p); });

        const k = ex.predIndex, c = C[k];
        const lik = ex.joint[k] / ex.prior[k];
        formula.innerHTML = kit.tex(`P(\\text{${c}}\\mid x)=\\frac{P(x\\mid \\text{${c}})\\,P(\\text{${c}})}{P(x)}=\\frac{${texNum(lik)}\\times ${ex.prior[k].toFixed(2)}}{${texNum(ex.evidence)}}=${ex.posterior[k] > 0.9999 && ex.posterior[k] < 1 ? '0.9999\\ldots' : ex.posterior[k].toFixed(4)}`, true);
        gloss.prior.textContent = `P(${c}) = ${ex.prior[k].toFixed(2)}`;
        gloss.likelihood.textContent = `P(x | ${c}) = ${fmt.sci(lik, 3)}`;
        gloss.joint.textContent = fmt.sci(ex.joint[k], 3);
        gloss.evidence.textContent = fmt.sci(ex.evidence, 3);
        gloss.posterior.textContent = `P(${c} | x) = ${fmt.post(ex.posterior[k])}`;
      }, 'pipeline');
    },
  });
})();
