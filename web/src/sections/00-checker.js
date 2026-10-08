(function () {
  'use strict';

  const EXAMPLES = ['password123', 'Summer2026!', 'qwerty', 'Dragon!1987', 'Tr0ub4dor&3', 'correcthorsebatterystaple', 'kq7#Vx!9mZ@2kLp$'];
  const BANDS = [[0, 40, 'F'], [40, 55, 'D'], [55, 70, 'C'], [70, 85, 'B'], [85, 100, 'A']];
  const LINKS = { model: 'multiply', length: 'features', variety: 'features', common: 'features', seq: 'features',
    repeat: 'features', year: 'features', markov: 'markov', guess: 'markov', brute: 'entropy' };
  const EXPLAIN = {
    model: 'What naive Bayes concludes from the nine features, as 0.5·P(Medium) + P(Strong).',
    length: 'Each extra character multiplies the number of possible passwords.',
    variety: 'Lowercase, uppercase, digits and symbols. More kinds means a bigger alphabet.',
    common: 'Checked against the most common leaked passwords, also after undoing leetspeak and stripping padding.',
    seq: 'Runs like qwe, asd, abc or 123 are among the first things attackers try.',
    repeat: 'Three identical characters in a row (aaa, 111) add length without adding much surprise.',
    year: 'Years from 1900 to 2099 are a classic suffix that guessers append.',
    markov: 'How natural the character sequence looks to the chain, per character.',
    guess: 'Surprisal −log₂ P(password) under the Markov chain. More bits means harder to guess.',
    brute: 'length × log₂(alphabet size): the space an attacker who knows nothing would search.',
  };
  const VIA = { exact: 'exactly', deleet: 'after undoing leetspeak', base: 'as its base word, with digits and symbols stripped' };

  const CSS = `
#checker { padding-block: 2.5rem 3.5rem; border-bottom: 1px dashed var(--line-2); }
#checker .hero-body { display: grid; gap: 2rem; }
#checker .ck-eyebrow { display: flex; gap: .75rem; flex-wrap: wrap; align-items: center; }
#checker h1 { font: 800 var(--fs-3xl)/0.98 var(--display); letter-spacing: -0.045em; font-variation-settings: "wdth" 88; max-width: 14ch; }
#checker h1 em { font-style: normal; color: var(--accent); }
#checker .ck-sub { font-size: var(--fs-md); color: var(--ink-2); max-width: 60ch; }
#checker .ck-top { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 1.5rem; align-items: stretch; }
#checker .ck-input-card { display: grid; gap: 1rem; align-content: start; }
#checker .ck-field { position: relative; }
#checker .ck-field input {
  width: 100%; font: 500 clamp(1.25rem, 3vw, 1.9rem)/1.2 var(--mono); letter-spacing: .02em;
  padding: 1.05rem 7.2rem 1.05rem 1.2rem; color: var(--ink); background: var(--surface);
  border: 2px solid var(--ink); border-radius: var(--r-lg); box-shadow: 6px 6px 0 var(--accent-soft);
  transition: border-color .2s, box-shadow .25s var(--ease);
}
#checker .ck-field input:focus { outline: none; border-color: var(--accent); box-shadow: 6px 6px 0 color-mix(in srgb, var(--accent) 35%, transparent); }
#checker .ck-field .ck-tools { position: absolute; right: .6rem; top: 50%; transform: translateY(-50%); display: flex; gap: .35rem; }
#checker .ck-len { font: 600 var(--fs-xs) var(--mono); color: var(--ink-3); align-self: center; }
#checker .ck-examples { display: flex; flex-wrap: wrap; gap: .4rem; }
#checker .ck-examples button { font: 500 var(--fs-xs) var(--mono); }
#checker .ck-privacy { font-size: var(--fs-sm); color: var(--ink-2); display: flex; gap: .5rem; align-items: baseline; }
#checker .ck-privacy b { color: var(--strong-ink); font-family: var(--mono); font-size: var(--fs-xs); letter-spacing: .08em; }

#checker .ck-grade { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 1.2rem; align-items: center; }
#checker .ck-stamp {
  --c: var(--accent); width: 8.5rem; aspect-ratio: 1; max-width: 100%; border-radius: 50%; display: grid; place-items: center;
  border: 3px solid var(--c); color: var(--c); position: relative; transform: rotate(-8deg);
  background: color-mix(in srgb, var(--c) 9%, transparent); transition: color .35s, border-color .35s, background-color .35s;
}
#checker .ck-stamp::after { content: ""; position: absolute; inset: 6px; border-radius: 50%; border: 1px dashed var(--c); opacity: .7; }
#checker .ck-letter { font: 800 5.4rem/1 var(--display); letter-spacing: -0.06em; }
#checker .ck-stamp.pop { animation: ck-pop .45s var(--ease); }
@keyframes ck-pop { 0% { transform: rotate(-8deg) scale(.82); } 60% { transform: rotate(-5deg) scale(1.06); } 100% { transform: rotate(-8deg) scale(1); } }
#checker .ck-score { font: 700 var(--fs-xl)/1 var(--display); font-variant-numeric: tabular-nums; }
#checker .ck-score small { font-size: var(--fs-sm); color: var(--ink-3); font-weight: 500; }
#checker .ck-verdict { font-size: var(--fs-base); color: var(--ink); max-width: 46ch; }
#checker .ck-gauge { width: 100%; max-width: 360px; }
#checker .ck-gauge text { font: 600 10px var(--mono); fill: var(--ink-3); }
#checker .ck-gauge .band-label { font: 700 12px var(--display); }

#checker .ck-views { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.25rem; }
#checker .ck-bar { display: grid; grid-template-columns: 4.6rem minmax(0, 1fr) 7.5rem; gap: .6rem; align-items: center; font-size: var(--fs-sm); }
#checker .ck-bar + .ck-bar { margin-top: .55rem; }
#checker .ck-track { height: .8rem; background: var(--paper-2); border-radius: 99px; overflow: hidden; border: 1px solid var(--line); }
#checker .ck-fill { height: 100%; width: 0; background: var(--c); border-radius: 99px; transition: width .45s var(--ease); }
#checker .ck-bar .num { text-align: right; font-size: var(--fs-xs); }
#checker .ck-bar.top .ck-name { font-weight: 700; color: var(--c-ink); }
#checker .ck-big { font: 750 var(--fs-xl)/1.1 var(--display); letter-spacing: -0.02em; }
#checker .ck-kv { display: grid; grid-template-columns: auto 1fr; gap: .35rem 1rem; font-size: var(--fs-sm); margin-top: .7rem; }
#checker .ck-kv dt { color: var(--ink-2); }
#checker .ck-kv dd { margin: 0; text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }

#checker .ck-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(15.5rem, 100%), 1fr)); gap: .8rem; }
#checker .ck-card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--r); padding: .85rem .95rem; display: grid; gap: .35rem; align-content: start; transition: border-color .3s; }
#checker .ck-card[data-score="0"], #checker .ck-card[data-score="1"] { border-color: color-mix(in srgb, var(--weak) 55%, var(--line)); }
#checker .ck-card .between { align-items: center; }
#checker .ck-card h3 { font: 650 var(--fs-sm)/1.2 var(--body); }
#checker .ck-card .ck-val { font: 600 var(--fs-sm) var(--mono); color: var(--ink); word-break: break-word; }
#checker .ck-card .ck-lt { font: 600 var(--fs-xs) var(--mono); letter-spacing: .05em; text-transform: uppercase; }
#checker .ck-card p { font-size: var(--fs-xs); color: var(--ink-2); line-height: 1.45; }
#checker .ck-card a { font: 600 var(--fs-xs) var(--mono); text-decoration: none; }
#checker .ck-lower { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
#checker .ck-tips { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; }
#checker .ck-tips li { display: grid; grid-template-columns: 1.6rem minmax(0, 1fr); gap: .5rem; font-size: var(--fs-sm); padding: .55rem .7rem; border-radius: var(--r); background: var(--paper-2); }
#checker .ck-tips li b { font-family: var(--mono); color: var(--accent); }
#checker .ck-tips li.bad b { color: var(--weak-ink); }
#checker .ck-tips li.new { animation: ck-in .35s var(--ease); }
@keyframes ck-in { from { transform: translateX(-6px); background: var(--accent-soft); } }
#checker details { font-size: var(--fs-sm); }
#checker summary { cursor: pointer; font-weight: 600; }
#checker .ck-rule { display: grid; gap: .3rem; margin-top: .8rem; font: 500 var(--fs-xs)/1.6 var(--mono); }
#checker .ck-rule .r { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px dotted var(--line); }
#checker .ck-rule .r span:last-child { text-align: right; font-variant-numeric: tabular-nums; }
#checker .ck-rule .r.final { font-weight: 700; border-bottom: 2px solid var(--ink); }
#checker .ck-more { font: 600 var(--fs-sm) var(--mono); text-decoration: none; }
@media (max-width: 900px) { #checker .ck-top, #checker .ck-views, #checker .ck-lower { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 480px) {
  #checker .ck-grade { grid-template-columns: minmax(0, 1fr); justify-items: start; }
  #checker .ck-stamp { width: 6.5rem; } #checker .ck-letter { font-size: 4rem; }
  #checker .ck-field input { padding-right: 1.2rem; }
  #checker .ck-field .ck-tools { position: static; transform: none; margin-top: .5rem; }
  #checker .ck-bar { grid-template-columns: 4.2rem minmax(0, 1fr) 5.8rem; }
}`;

  function randomPassword(n = 16) {
    const out = [];
    const buf = new Uint8Array(64);
    while (out.length < n) {
      crypto.getRandomValues(buf);
      for (const b of buf) {
        if (b < 188 && out.length < n) out.push(String.fromCharCode(33 + (b % 94))); // 188 = 2 * 94: no modulo bias
      }
    }
    return out.join('');
  }

  PWB.register({
    id: 'checker',
    order: 0,
    hero: true,
    mount(el, { E, kit, data, store, h, s, fmt }) {
      el.append(h('style', { text: CSS }));

      // ---------- input card ----------
      const input = h('input', { id: 'checker-input', type: 'text', autocomplete: 'off', spellcheck: 'false',
        autocapitalize: 'off', 'aria-label': 'Password to check', placeholder: 'type a password' });
      const lenEl = h('span', { class: 'ck-len' });
      const toggle = h('button', { class: 'btn small', id: 'checker-toggle', type: 'button', 'aria-pressed': 'false' }, 'Hide');
      toggle.addEventListener('click', () => {
        const hide = input.type === 'text';
        input.type = hide ? 'password' : 'text';
        toggle.textContent = hide ? 'Show' : 'Hide';
        toggle.setAttribute('aria-pressed', String(hide));
      });
      input.addEventListener('input', () => store.set(input.value));
      const examples = h('div', { class: 'ck-examples', role: 'group', 'aria-label': 'Example passwords' },
        EXAMPLES.map((pw) => h('button', { class: 'chip', type: 'button', onClick: () => { store.set(pw); input.value = pw; } }, pw)),
        h('button', { class: 'btn small primary', id: 'checker-generate', type: 'button',
          onClick: () => { const pw = randomPassword(); store.set(pw); input.value = pw; } }, 'Generate a random one'));

      const inputCard = h('div', { class: 'ck-input-card' },
        h('div', { class: 'ck-field' }, input, h('div', { class: 'ck-tools' }, lenEl, toggle)),
        examples,
        h('p', { class: 'ck-privacy' }, h('b', {}, 'LOCAL'),
          h('span', {}, 'Everything is computed inside this page. Nothing you type is sent or stored. Still, try a password similar to yours rather than the real one.')));

      // ---------- grade card ----------
      const letter = h('span', { class: 'ck-letter' }, '–');
      const stamp = h('div', { class: 'ck-stamp', 'aria-hidden': 'true' }, letter);
      const scoreNum = h('span', {}, '0');
      const scoreEl = h('div', { class: 'ck-score' }, scoreNum, h('small', {}, ' / 100'));
      const verdict = h('p', { class: 'ck-verdict' });
      const gradeLive = h('span', { class: 'sr-only', 'aria-live': 'polite' });

      // Instrument-style gauge: semicircle 0..100 with grade bands.
      const R = 92, CX = 120, CY = 112;
      const pt = (v, r = R) => { const a = Math.PI * (1 - v / 100); return [CX + r * Math.cos(a), CY - r * Math.sin(a)]; };
      const arc = (a, b, r = R) => { const [x0, y0] = pt(a, r), [x1, y1] = pt(b, r); return `M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}`; };
      const bandColor = { F: 'var(--weak)', D: 'color-mix(in srgb, var(--weak) 55%, var(--medium))', C: 'var(--medium)',
        B: 'color-mix(in srgb, var(--strong) 60%, var(--medium))', A: 'var(--strong)' };
      const needle = s('g', { class: 'ck-needle' },
        s('line', { x1: CX, y1: CY, x2: CX, y2: CY - R + 8, style: { stroke: 'var(--ink)', strokeWidth: '3', strokeLinecap: 'round' } }),
        s('circle', { cx: CX, cy: CY, r: 6, style: { fill: 'var(--ink)' } }));
      const gauge = s('svg', { class: 'ck-gauge', viewBox: '0 0 240 128', role: 'img', 'aria-label': 'Score gauge from 0 to 100' },
        BANDS.map(([a, b, g]) => s('path', { d: arc(a + 0.6, b - 0.6), style: { fill: 'none', stroke: bandColor[g], strokeWidth: '14' } })),
        BANDS.map(([a, b, g]) => { const [x, y] = pt((a + b) / 2, R - 22); return s('text', { x, y: y + 4, 'text-anchor': 'middle', class: 'band-label', style: { fill: bandColor[g] } }, g); }),
        [0, 40, 55, 70, 85, 100].map((v) => {
          const [x0, y0] = pt(v, R + 9), [x1, y1] = pt(v, R + 15), [tx, ty] = pt(v, R + 24);
          return s('g', {}, s('line', { x1: x0, y1: y0, x2: x1, y2: y1, style: { stroke: 'var(--ink-3)', strokeWidth: '1' } }),
            s('text', { x: tx, y: ty + 3, 'text-anchor': 'middle' }, String(v)));
        }),
        Array.from({ length: 21 }, (_, i) => { const [x0, y0] = pt(i * 5, R + 9), [x1, y1] = pt(i * 5, R + 12); return s('line', { x1: x0, y1: y0, x2: x1, y2: y1, style: { stroke: 'var(--line-2)', strokeWidth: '1' } }); }),
        needle);
      let needleVal = 0, cancelNeedle = null;
      const setNeedle = (v) => {
        cancelNeedle && cancelNeedle();
        cancelNeedle = kit.animate({ from: needleVal, to: v, duration: 650, onUpdate: (x) => {
          needleVal = x;
          needle.setAttribute('transform', `rotate(${-90 + 1.8 * x} ${CX} ${CY})`);
        } });
      };
      needle.setAttribute('transform', `rotate(-90 ${CX} ${CY})`);

      const gradeCard = h('div', { class: 'panel stack' },
        h('div', { class: 'between' }, h('span', { class: 'eyebrow' }, 'Overall grade'), h('a', { class: 'ck-more', href: '#checker-rule' }, 'how it is computed')),
        h('div', { class: 'ck-grade' }, stamp, h('div', { class: 'stack' }, scoreEl, gauge)),
        verdict, gradeLive);

      // ---------- two views ----------
      const bars = E.CLASSES.map((c, i) => {
        const fill = h('div', { class: 'ck-fill' });
        const val = h('span', { class: 'num' });
        const row = h('div', { class: `ck-bar ${kit.cls.className(i)}` }, h('span', { class: 'ck-name' }, c), h('div', { class: 'ck-track' }, fill), val);
        return { row, fill, val };
      });
      const predEl = h('div', { class: 'ck-big' });
      const modelView = h('div', { class: 'panel' },
        h('div', { class: 'panel-title' }, h('h3', {}, 'Bayes model verdict'), h('a', { class: 'ck-more', href: '#multiply' }, 'see the maths')),
        predEl, h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', margin: '.3rem 0 .9rem' } }, 'Posterior probability of each class given the nine features, P(C | password).'),
        bars.map((b) => b.row));

      const bitsEl = h('div', { class: 'ck-big' });
      const commonNote = h('p', { class: 'chip bad', style: { whiteSpace: 'normal', marginTop: '.5rem', borderRadius: 'var(--r)' } });
      const kv = {};
      const kvRow = (k, label) => [h('dt', {}, label), (kv[k] = h('dd'))];
      const guessView = h('div', { class: 'panel' },
        h('div', { class: 'panel-title' }, h('h3', {}, 'Guessability'), h('a', { class: 'ck-more', href: '#markov' }, 'see the chain')),
        bitsEl, commonNote,
        h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)', marginTop: '.3rem' } },
          'Estimated time to guess, assuming an offline attacker making ', h('b', {}, `${fmt.int(E.rate(E.explain('')).guessRate / 1e9)} billion`),
          ' guesses per second who tries passwords in order of Markov probability. This is a rough estimate, not a guarantee.'),
        h('dl', { class: 'ck-kv' }, kvRow('markov', 'Markov surprisal'), kvRow('brute', 'Brute-force space'), kvRow('charset', 'Alphabet size'), kvRow('p', 'P(password) under the chain')));

      // ---------- report card ----------
      const cards = {};
      const cardGrid = h('div', { class: 'ck-cards' });
      const ensureCards = (aspects) => {
        for (const a of aspects) {
          if (cards[a.key]) continue;
          const m = kit.meter(0), lt = h('span', { class: 'ck-lt' }), val = h('div', { class: 'ck-val' });
          const card = h('article', { class: 'ck-card', dataset: { score: '0' } },
            h('div', { class: 'between' }, h('h3', {}, a.label), m), val,
            h('div', { class: 'between' }, lt, h('a', { href: `#${LINKS[a.key]}` }, 'how?')),
            h('p', {}, EXPLAIN[a.key]));
          cards[a.key] = { card, m, lt, val };
          cardGrid.append(card);
        }
      };

      // ---------- tips + rule ----------
      const tipsEl = h('ul', { class: 'ck-tips' });
      let lastTips = new Set();
      const ruleEl = h('div', { class: 'ck-rule' });
      const rule = h('details', { class: 'panel', id: 'checker-rule' },
        h('summary', {}, 'How the overall grade is computed'),
        h('p', { class: 'muted', style: { marginTop: '.6rem' } },
          'The grade combines the trained Bayes model with two checks the model cannot do by itself. It takes the more pessimistic of the model and the guessability estimate, then applies penalties. This rule belongs to this page; it is not part of the trained model.'),
        ruleEl);

      el.append(
        h('div', { class: 'ck-eyebrow' }, h('span', { class: 'eyebrow' }, 'BAMAT207 · Bayesian intelligence'),
          h('span', { class: 'chip' }, 'trained on ', h('b', {}, fmt.int(data.meta.n)), ' passwords')),
        h('h1', {}, 'How strong is ', h('em', {}, 'your'), ' password?'),
        h('p', { class: 'ck-sub' }, `Type anything. A naive Bayes classifier and an order-${data.markov.order} Markov chain, both trained on ${fmt.int(data.meta.n)} passwords, rate it live. Every number below comes from that model, and the rest of the page shows exactly how.`),
        h('div', { class: 'ck-top' }, h('div', { class: 'panel' }, inputCard), gradeCard),
        h('div', { class: 'ck-views' }, modelView, guessView),
        h('div', { class: 'stack' }, h('div', { class: 'between' }, h('h2', { style: { fontSize: 'var(--fs-xl)' } }, 'Report card'),
          h('span', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, 'Each aspect rated 0 to 4.')), cardGrid),
        h('div', { class: 'ck-lower' },
          h('div', { class: 'panel stack' }, h('h3', {}, 'How to make it stronger'), tipsEl),
          rule),
        h('a', { class: 'ck-more', href: '#pipeline' }, 'See how the model works ↓'));

      // ---------- logic ----------
      const PENALTY = [['has_seq', 'a keyboard or alphabet run'], ['has_repeat', 'a triple repeat'], ['has_year', 'a year']];

      function verdictText(ex, r) {
        const f = ex.features;
        if (!ex.password) return 'Type a password to see its grade.';
        if (ex.common.hit) return `Capped at 15: “${ex.common.word}” is on the list of the ${fmt.int(data.meta.common_list_size)} most common passwords (matched ${VIA[ex.common.via]}).`;
        const pens = PENALTY.filter(([k]) => f[k]).map(([, t]) => t);
        const base = r.limiting === 'model'
          ? `Limited by the Bayes model, which rates it ${ex.pred} (${fmt.pct(ex.confidence)}).`
          : `Limited by guessability: the Markov chain gives it only ${r.markovBits.toFixed(1)} bits of surprisal.`;
        return pens.length ? `${base} Lost ${10 * pens.length} points for ${pens.join(' and ')}.` : base;
      }

      function tipsFor(ex) {
        const f = ex.features, tips = [];
        if (!ex.password) return [['→', 'Type or paste a password, or pick an example above.', false]];
        if (ex.common.hit) tips.push(['!', `Avoid “${ex.common.word}”. It is a very common password, matched ${VIA[ex.common.via]}. Swapping letters for look-alike symbols does not hide it.`, true]);
        if (f.has_year) tips.push(['!', `Remove the year “${(ex.password.match(/(19|20)\p{Nd}{2}/u) || [''])[0]}”. Dates are among the first things guessers append.`, true]);
        if (f.has_seq) tips.push(['!', `Avoid keyboard and alphabet runs: ${ex.seqs.map((x) => `“${x.text}”`).join(', ')}.`, true]);
        if (f.has_repeat) tips.push(['!', 'Break up the repeated characters (three in a row).', true]);
        if (f.length < 12) tips.push(['+', `Make it longer: ${f.length} characters now, aim for 12 or more. Length grows the search space fastest.`, false]);
        const kinds = [['up_bin', 'an uppercase letter'], ['dig_bin', 'a digit'], ['sp_bin', 'a symbol']].filter(([k]) => f[k] === '0').map(([, t]) => t);
        if (kinds.length) tips.push(['+', `Mix in ${kinds.join(', ')}.`, false]);
        if (f.mk_bin === 'High') tips.push(['+', 'It reads like natural text, so the Markov chain finds it predictable. Random words or characters are harder to guess.', false]);
        const flagged = f.is_common || f.has_year || f.has_seq || f.has_repeat;
        if (ex.pred === 'Strong' && flagged) tips.push(['i', 'The Bayes model alone says Strong because Weak passwords in the training data never contain symbols. The red flags above are what real attackers exploit.', false]);
        if (!tips.length) tips.push(['✓', 'No obvious weakness found. An A means the checks found nothing, not that it can never be cracked.', false]);
        return tips;
      }

      let lastGrade = null;
      store.subscribe((st) => {
        const { ex, rating: r, password } = st;
        if (document.activeElement !== input && input.value !== password) input.value = password;
        lenEl.textContent = `${E.cps(password).length} ch`;

        // grade
        const color = kit.gradeColor(r.grade);
        stamp.style.setProperty('--c', color);
        if (r.grade !== lastGrade) {
          letter.textContent = password ? r.grade : '–';
          if (!kit.reducedMotion() && stamp.animate) stamp.animate([{ transform: 'rotate(-8deg) scale(.82)' }, { transform: 'rotate(-5deg) scale(1.06)', offset: 0.6 }, { transform: 'rotate(-8deg) scale(1)' }], { duration: 450, easing: 'cubic-bezier(.2,.8,.2,1)' });
          gradeLive.textContent = `Grade ${r.grade}, score ${Math.round(r.score)} of 100`;
          lastGrade = r.grade;
        }
        kit.countTo(scoreNum, r.score, (v) => v.toFixed(0));
        setNeedle(r.score);
        verdict.textContent = verdictText(ex, r);

        // model view
        predEl.textContent = password ? `${ex.pred} · ${fmt.pct(ex.confidence)}` : '–';
        predEl.style.color = kit.cls.ink(ex.predIndex);
        bars.forEach((b, i) => {
          b.fill.style.width = `${Math.max(0.4, 100 * ex.posterior[i])}%`;
          b.val.textContent = fmt.post(ex.posterior[i]);
          b.row.classList.toggle('top', i === ex.predIndex);
        });

        // guess view
        bitsEl.textContent = !password ? '–' : ex.common.hit ? '≈ instantly' : `≈ ${fmt.duration(r.crackSeconds)}`;
        commonNote.hidden = !ex.common.hit;
        commonNote.textContent = ex.common.hit ? `“${ex.common.word}” is on a list of ${fmt.int(data.meta.common_list_size)} common passwords that attackers try first. The Markov chain alone would estimate ≈ ${fmt.duration(r.crackSeconds)}, because it was trained on synthetic passwords and does not know common words.` : '';
        kv.markov.textContent = fmt.bits(r.markovBits);
        kv.brute.textContent = fmt.bits(r.bruteBits);
        kv.charset.textContent = `${r.charset} symbols`;
        kv.p.textContent = `≈ 10${kit.sup((ex.features.log_prob / Math.LN10).toFixed(1))}`;

        // report card
        ensureCards(r.aspects);
        for (const a of r.aspects) {
          const c = cards[a.key];
          c.card.dataset.score = String(a.score);
          c.m.dataset.score = String(a.score);
          c.m.setAttribute('aria-label', `${a.score} of 4`);
          c.lt.textContent = a.label_text;
          c.lt.style.color = a.score <= 1 ? 'var(--weak-ink)' : a.score === 2 ? 'var(--medium-ink)' : 'var(--strong-ink)';
          c.val.textContent = a.value;
        }

        // tips
        const tips = tipsFor(ex);
        kit.replace(tipsEl, tips.map(([icon, text, bad]) =>
          h('li', { class: `${bad ? 'bad' : ''} ${lastTips.has(text) ? '' : 'new'}` }, h('b', { 'aria-hidden': 'true' }, icon), h('span', {}, text))));
        lastTips = new Set(tips.map((t) => t[1]));

        // rule with live numbers
        const pens = PENALTY.filter(([k]) => ex.features[k]);
        const lines = [
          ['modelScore = 100 × (0.5·P(Medium) + P(Strong))', r.modelScore.toFixed(1)],
          ['guessScore = 100 × clamp((bits − 20) / 50, 0, 1)', `${r.guessScore.toFixed(1)}  (bits ${r.markovBits.toFixed(1)})`],
          ['min(modelScore, guessScore)', Math.min(r.modelScore, r.guessScore).toFixed(1)],
          [`− 10 per pattern (${pens.length ? pens.map((p) => p[1]).join(', ') : 'none'})`, `−${10 * pens.length}`],
          [`common-password cap at 15 (${ex.common.hit ? 'applies' : 'not applied'})`, ex.common.hit ? '≤ 15' : '–'],
          ['score (clamped to 0–100)', r.score.toFixed(1)],
          ['grade: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, else F', r.grade],
        ];
        kit.replace(ruleEl, lines.map(([a, b], i) => h('div', { class: `r ${i >= lines.length - 2 ? 'final' : ''}` }, h('span', {}, a), h('span', {}, b))));
      }, 'checker');
    },
  });
})();
