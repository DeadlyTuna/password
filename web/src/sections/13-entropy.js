(function () {
  'use strict';

  const CSS = `
#entropy .en-toy { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
#entropy svg { display: block; width: 100%; height: auto; overflow: visible; touch-action: none; }
#entropy .en-bar { cursor: ns-resize; outline: none; }
#entropy .en-bar:focus-visible rect.b { stroke: var(--ink); stroke-width: 2; }
#entropy .en-kpis { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; }
#entropy .en-kpis .panel { padding: .7rem .85rem; }
#entropy .en-kpis .big { font: 750 var(--fs-lg)/1.1 var(--display); font-variant-numeric: tabular-nums; }
#entropy .en-kpis p { font-size: var(--fs-xs); color: var(--ink-2); margin-top: .2rem; }
#entropy .en-bits { display: grid; gap: .5rem; }
#entropy .en-bits .r { display: grid; grid-template-columns: 12rem minmax(0, 1fr) 6.5rem; gap: .6rem; align-items: center; font-size: var(--fs-sm); }
#entropy .en-bits .t { height: .9rem; background: var(--paper-2); border-radius: 3px; overflow: hidden; border: 1px solid var(--line); }
#entropy .en-bits .t i { display: block; height: 100%; transition: width .45s var(--ease); }
#entropy .en-bits .num { text-align: right; font-size: var(--fs-xs); }
#entropy .en-top { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; font: 500 var(--fs-xs) var(--mono); }
#entropy .en-top ol { margin: .3rem 0 0; padding-left: 1.4rem; }
@media (max-width: 860px) { #entropy .en-toy { grid-template-columns: minmax(0, 1fr); } #entropy .en-bits .r { grid-template-columns: 8rem minmax(0, 1fr) 5.5rem; } }`;

  const PRESETS = {
    uniform: [1, 1, 1, 1, 1, 1, 1, 1],
    dominant: [12, 1, 1, 1, 1, 1, 1, 1],
    zipf: [1, 1 / 2, 1 / 3, 1 / 4, 1 / 5, 1 / 6, 1 / 7, 1 / 8],
  };
  const stats = (w) => {
    const tot = w.reduce((a, b) => a + b, 0), p = w.map((x) => x / tot);
    const sorted = p.slice().sort((a, b) => b - a);
    const H = -p.reduce((a, x) => a + (x > 0 ? x * Math.log2(x) : 0), 0);
    const G = sorted.reduce((a, x, i) => a + (i + 1) * x, 0);
    return { p, sorted, H, G, log2G: Math.log2(G), Hmin: -Math.log2(sorted[0]) };
  };

  PWB.register({
    id: 'entropy',
    order: 130,
    nav: 'Entropy',
    kicker: 'Information',
    title: 'Entropy, guessing and Zipf’s law',
    lede: 'Three ways to measure how hard a distribution is to guess, and a power law that real password leaks follow but this synthetic dataset does not.',
    mount(el, { E, kit, data, store, h, s, fmt }) {
      el.append(h('style', { text: CSS }));
      const d3 = window.d3, R = data.results;
      let w = PRESETS.zipf.slice();

      // ---------- toy distribution ----------
      const toyBox = h('div'), curveBox = h('div');
      const kpi = {};
      const kpiCard = (k, label, desc) => h('div', { class: 'panel flat' }, h('div', { class: 'eyebrow' }, label), (kpi[k] = h('div', { class: 'big' })), h('p', {}, desc));
      const order = h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } });
      const presetBtns = h('div', { class: 'row' }, Object.keys(PRESETS).map((k) => h('button', { class: 'btn small', id: `entropy-${k}`, type: 'button', onClick: () => { w = PRESETS[k].slice(); renderToy(true); } }, k)));
      let toy = null;
      function buildToy(width) {
        const H = 230, m = { l: 34, r: 8, t: 10, b: 26 }, n = w.length;
        const x = d3.scaleBand().domain(d3.range(n)).range([m.l, width - m.r]).padding(0.18);
        const y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
        const svg = s('svg', { viewBox: `0 0 ${width} ${H}`, role: 'group', 'aria-label': 'Editable probability distribution over 8 passwords' });
        d3.select(svg).append('g').attr('class', 'ax').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5).tickSizeOuter(0));
        const bars = d3.range(n).map((i) => {
          const g = s('g', { class: 'en-bar', tabindex: '0', role: 'slider', 'aria-label': `password ${i + 1} probability` },
            s('rect', { class: 'hit', x: x(i), y: m.t, width: x.bandwidth(), height: H - m.t - m.b, style: { fill: 'transparent' } }),
            s('rect', { class: 'b', x: x(i), width: x.bandwidth(), rx: 2, style: { fill: 'var(--accent)' } }),
            s('text', { class: 'chart-text', x: x(i) + x.bandwidth() / 2, 'text-anchor': 'middle' }),
            s('text', { class: 'chart-text', x: x(i) + x.bandwidth() / 2, y: H - 8, 'text-anchor': 'middle' }, `pw${i + 1}`));
          const setFrom = (evt) => {
            const r = svg.getBoundingClientRect();
            const v = Math.max(0.005, Math.min(1, y.invert(((evt.clientY - r.top) / r.height) * H)));
            // Set this bar's probability to v and rescale the others so the total stays 1.
            const p = stats(w).p, rest = 1 - p[i];
            w = p.map((q, j) => (j === i ? v : rest > 0 ? (q / rest) * (1 - v) : (1 - v) / (n - 1)));
            renderToy(false);
          };
          let drag = false;
          g.addEventListener('pointerdown', (e) => { drag = true; g.setPointerCapture(e.pointerId); g.focus({ preventScroll: true }); setFrom(e); });
          g.addEventListener('pointermove', (e) => drag && setFrom(e));
          g.addEventListener('pointerup', () => { drag = false; });
          g.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const p = stats(w).p, v = Math.max(0.005, Math.min(0.99, p[i] + (e.key === 'ArrowUp' ? 0.02 : -0.02))), rest = 1 - p[i];
            w = p.map((q, j) => (j === i ? v : (q / rest) * (1 - v)));
            renderToy(false);
          });
          svg.append(g);
          return g;
        });
        kit.replace(toyBox, svg);
        toy = { y, bars, H, m, width };
      }
      function renderToy(animate) {
        if (!toy) return;
        const st = stats(w), T = animate && !kit.reducedMotion() ? 400 : 0;
        toy.bars.forEach((g, i) => {
          const b = g.querySelector('rect.b'), t = g.querySelector('text');
          d3.select(b).transition().duration(T).attr('y', toy.y(st.p[i])).attr('height', toy.y(0) - toy.y(st.p[i]));
          d3.select(t).transition().duration(T).attr('y', toy.y(st.p[i]) - 4);
          t.textContent = st.p[i].toFixed(2);
          g.setAttribute('aria-valuetext', st.p[i].toFixed(2));
        });
        kpi.H.textContent = `${st.H.toFixed(3)} bits`;
        kpi.G.textContent = `${st.G.toFixed(2)} guesses`;
        kpi.lg.textContent = `${st.log2G.toFixed(3)} bits`;
        kpi.Hmin.textContent = `${st.Hmin.toFixed(3)} bits`;
        order.textContent = `Always true: H∞ = ${st.Hmin.toFixed(3)} ≤ H = ${st.H.toFixed(3)} ≤ log₂ 8 = 3. Guessing entropy log₂ G = ${st.log2G.toFixed(3)} is not tied to that ordering: for a uniform distribution it is about one bit below H.`;
        drawCurve(st);
      }
      function drawCurve(st) {
        const width = Math.max(240, curveBox.clientWidth || 360), H = 170, m = { l: 34, r: 10, t: 10, b: 28 };
        const x = d3.scaleLinear().domain([0, 8]).range([m.l, width - m.r]), y = d3.scaleLinear().domain([0, 1]).range([H - m.b, m.t]);
        const cum = [0]; st.sorted.forEach((p, i) => cum.push(cum[i] + p));
        const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${H}`).attr('role', 'img').attr('aria-label', 'Chance of success after k guesses');
        svg.append('g').attr('class', 'ax').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(8).tickSizeOuter(0));
        svg.append('g').attr('class', 'ax').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));
        svg.append('path').attr('d', d3.line().curve(d3.curveStepAfter).x((d, i) => x(i)).y((d) => y(d))(cum)).style('fill', 'none').style('stroke', 'var(--pencil)').style('stroke-width', 2.4);
        svg.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(8)).attr('y2', y(1)).style('stroke', 'var(--ink-3)').style('stroke-dasharray', '4 3');
        svg.append('text').attr('class', 'chart-text').attr('x', width - m.r).attr('y', H - 4).attr('text-anchor', 'end').text('guesses k (most likely first)');
        kit.replace(curveBox, svg.node());
      }

      // ---------- dataset entropy table ----------
      const ent = R.entropy;
      const entTable = h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, ['unit', 'class', 'N', 'distinct', 'Shannon H', 'log₂ G', 'H∞', 'log₂ distinct'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ent.map((r) => h('tr', { class: r.class === 'All' ? 'hl' : '' }, h('td', {}, r.unit), h('td', {}, r.class), h('td', {}, fmt.int(r.N)), h('td', {}, fmt.int(r.distinct)),
          h('td', {}, r.shannon_bits.toFixed(3)), h('td', {}, r.log2_G.toFixed(3)), h('td', {}, r.min_entropy_bits.toFixed(3)), h('td', {}, r.max_bits_log2_distinct.toFixed(3))))));
      const pwAll = ent.find((r) => r.unit === 'password' && r.class === 'All'), bwAll = ent.find((r) => r.unit === 'base word' && r.class === 'All');

      // ---------- the current password ----------
      const bits = h('div', { class: 'en-bits' });
      const randBits = 16 * Math.log2(94);

      // ---------- Zipf ----------
      const zipfBox = h('div');
      const Z = data.eda.zipf, fits = R.zipf_fits;
      const series = [['password', Z.password, 'var(--accent)'], ['base word', Z.base_word, 'var(--pencil)']];
      function drawZipf(width) {
        const H = 300, m = { l: 46, r: 14, t: 12, b: 36 };
        const maxR = Math.max(...series.map(([, z]) => z.rank[z.rank.length - 1])), maxF = Math.max(...series.map(([, z]) => z.freq[0]));
        const x = d3.scaleLog().domain([1, maxR]).range([m.l, width - m.r]), y = d3.scaleLog().domain([1, maxF * 1.5]).range([H - m.b, m.t]);
        const svg = d3.create('svg').attr('viewBox', `0 0 ${width} ${H}`).attr('role', 'img').attr('aria-label', 'Rank-frequency plot on log-log axes');
        svg.append('g').attr('class', 'ax').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(width < 480 ? 3 : 6, '~s').tickSizeOuter(0));
        svg.append('g').attr('class', 'ax').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4, '~s').tickSizeOuter(0));
        svg.append('text').attr('class', 'chart-text').attr('x', width - m.r).attr('y', H - 4).attr('text-anchor', 'end').text('rank r');
        svg.append('text').attr('class', 'chart-text').attr('x', 4).attr('y', m.t - 2).text('frequency f(r)');
        // reference slope -1 through the top base-word point
        const f0 = Z.base_word.freq[0];
        svg.append('line').attr('x1', x(1)).attr('y1', y(f0)).attr('x2', x(f0)).attr('y2', y(1)).style('stroke', 'var(--ink-3)').style('stroke-dasharray', '6 4');
        svg.append('text').attr('class', 'chart-text').attr('x', x(Math.sqrt(f0)) + 6).attr('y', y(Math.sqrt(f0)) - 6).text('slope −1 (classic Zipf)');
        series.forEach(([name, z, color]) => {
          const fit = fits.find((f) => f.unit === name);
          svg.append('g').selectAll('circle').data(z.rank).join('circle').attr('cx', (r) => x(r)).attr('cy', (r, i) => y(z.freq[i])).attr('r', 2.2).style('fill', color).style('opacity', 0.75);
          // least-squares intercept on the plotted points within the fitted rank range, slope from the Python fit
          const pts = z.rank.map((r, i) => [Math.log10(r), Math.log10(z.freq[i])]).filter(([lr], i) => z.rank[i] <= fit.fit_ranks);
          const b = d3.mean(pts, ([lr, lf]) => lf - fit.slope * lr);
          svg.append('line').attr('x1', x(1)).attr('y1', y(10 ** b)).attr('x2', x(fit.fit_ranks)).attr('y2', y(10 ** (b + fit.slope * Math.log10(fit.fit_ranks))))
            .style('stroke', color).style('stroke-width', 2.2);
          svg.append('text').attr('class', 'chart-text').attr('x', x(fit.fit_ranks) + 4).attr('y', y(10 ** (b + fit.slope * Math.log10(fit.fit_ranks)))).style('fill', color).style('font-weight', 700)
            .text(`${name}: s = ${fit.zipf_s.toFixed(2)}`);
        });
        kit.replace(zipfBox, svg.node());
      }
      const topList = (z) => h('ol', {}, Object.entries(z.top).slice(0, 6).map(([k, v]) => h('li', {}, `${kit.showPw(k)} · ${v}`)));

      el.append(
        h('div', { class: 'en-toy' },
          h('figure', { class: 'fig' }, h('div', { class: 'between' }, h('h3', {}, 'A toy world with 8 passwords'), presetBtns), toyBox,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Shannon entropy'), 'Drag a bar (or focus it and press the arrow keys) to change how often each password is chosen. The other bars rescale so the probabilities still add to 1.')),
          h('div', { class: 'stack' },
            h('div', { class: 'en-kpis' },
              kpiCard('H', 'Shannon H', 'Average surprise, −Σ p log₂ p. How many yes/no questions on average.'),
              kpiCard('G', 'Guessing G', 'Expected guesses for an attacker who tries passwords from most to least likely.'),
              kpiCard('lg', 'log₂ G', 'Guessing effort on the same bit scale.'),
              kpiCard('Hmin', 'Min-entropy H∞', '−log₂ of the most likely password. The worst case: success on the first guess.')),
            order,
            h('figure', { class: 'fig' }, curveBox, h('figcaption', { class: 'cap' }, h('b', {}, 'Guessing entropy'), 'Chance the attacker has succeeded after k guesses in optimal order. The dashed diagonal is a uniform distribution, the hardest case.'))),
        ),
        h('div', { class: 'stack' }, h('h3', {}, 'The entropy of the dataset'),
          h('div', { class: 'scroll-x' }, entTable),
          h('p', { class: 'cap' }, h('b', {}, 'Min-entropy'),
            `Whole passwords are almost all unique (${fmt.int(pwAll.distinct)} distinct out of ${fmt.int(pwAll.N)}), so Shannon H = ${pwAll.shannon_bits.toFixed(3)} sits right at its ceiling log₂(distinct) = ${pwAll.max_bits_log2_distinct.toFixed(3)}. That ceiling is a property of the sample size. Base words (digits and symbols stripped, leetspeak undone) repeat more: their min-entropy is ${bwAll.min_entropy_bits.toFixed(2)} bits against ${pwAll.min_entropy_bits.toFixed(2)} for whole passwords, because the most common base word “${bwAll.top_item}” has probability ${fmt.sci(bwAll.top_p, 2)}. That gap is what a dictionary attack exploits.`)),
        h('figure', { class: 'fig' }, h('h3', {}, 'Three ways to count the bits in your password'), bits,
          h('figcaption', { class: 'cap' }, h('b', {}, 'Surprisal'), 'Markov surprisal −log₂ P(password) assumes an attacker who knows the character statistics of the training data. Brute force assumes they know only which kinds of characters you used. The last bar is a password of 16 random printable characters for comparison.')),
        h('div', { class: 'grid-2', style: { alignItems: 'start' } },
          h('figure', { class: 'fig' }, zipfBox,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Zipf’s law'), 'Rank-frequency on log-log axes. Zipf’s law says f(r) ∝ r^−s, a straight line with slope −s. Lines: least-squares fits over the top ranks.')),
          h('div', { class: 'stack' },
            h('p', {}, `Real leaked password lists follow Zipf’s law with a heavy head: a few passwords like 123456 are chosen by a large share of people (Wang et al., 2017). Here the fitted exponents are only ${fits.map((f) => `${f.zipf_s.toFixed(2)} for ${f.unit}s`).join(' and ')}, and the most frequent password appears just ${fits.find((f) => f.unit === 'password').max_freq} times. PWLDS was generated by rules, not by people.`),
            h('div', { class: 'en-top' }, h('div', {}, h('b', {}, 'most frequent passwords'), topList(Z.password)), h('div', {}, h('b', {}, 'most frequent base words'), topList(Z.base_word))))));

      kit.responsive(toyBox, (width) => { buildToy(width); renderToy(false); });
      kit.responsive(zipfBox, drawZipf);

      store.subscribe((st) => {
        const r = st.rating, max = Math.max(r.markovBits, r.bruteBits, randBits, 1);
        const row = (label, v, color) => h('div', { class: 'r' }, h('span', {}, label), h('div', { class: 't' }, h('i', { style: { width: `${(100 * v) / max}%`, background: color } })), h('span', { class: 'num' }, `${v.toFixed(1)} bits`));
        kit.replace(bits,
          row('Markov surprisal', r.markovBits, 'var(--accent)'),
          row(`Brute force (${r.charset} symbols)`, r.bruteBits, 'var(--pencil)'),
          row('16 random characters', randBits, 'var(--ink-3)'));
      }, 'entropy');
    },
  });
})();
