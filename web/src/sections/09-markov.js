(function () {
  'use strict';

  const CSS = `
#markov .mk-strip { display: flex; gap: 4px; padding: .3rem .1rem .6rem; }
#markov .mk-tile { flex: none; width: 3.6rem; display: grid; gap: 3px; justify-items: center; padding: .4rem .25rem; border-radius: var(--r-sm);
  border: 1px solid var(--line); background: var(--surface); cursor: pointer; font: 500 var(--fs-xs) var(--mono); color: var(--ink-2); transition: border-color .2s, transform .2s var(--ease); }
#markov .mk-tile:hover { border-color: var(--accent); }
#markov .mk-tile[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); transform: translateY(-2px); }
#markov .mk-tile.unseen { border-style: dashed; border-color: var(--pencil); }
#markov .mk-ctx { letter-spacing: .05em; color: var(--ink-3); white-space: pre; }
#markov .mk-ch { font: 700 var(--fs-md) var(--mono); color: var(--ink); white-space: pre; }
#markov .mk-bar { width: 1rem; height: 42px; background: var(--paper-2); border-radius: 2px; position: relative; overflow: hidden; border: 1px solid var(--line); }
#markov .mk-bar i { position: absolute; left: 0; right: 0; bottom: 0; background: var(--accent); transition: height .35s var(--ease); }
#markov .pad { color: var(--pencil); font-weight: 700; }
#markov .mk-detail { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
#markov .mk-next { display: grid; gap: .3rem; }
#markov .mk-next .r { display: grid; grid-template-columns: 2.6rem minmax(0, 1fr) 6.5rem; gap: .5rem; align-items: center; font: 500 var(--fs-xs) var(--mono); }
#markov .mk-next .r b { font-size: var(--fs-sm); text-align: center; white-space: pre; }
#markov .mk-next .t { height: .65rem; background: var(--paper-2); border-radius: 99px; overflow: hidden; }
#markov .mk-next .t i { display: block; height: 100%; background: var(--ink-3); transition: width .35s var(--ease); }
#markov .mk-next .r.hit .t i { background: var(--accent); }
#markov .mk-next .r.hit b { color: var(--accent); }
#markov .mk-next .num { text-align: right; }
#markov svg { display: block; width: 100%; height: auto; overflow: visible; }
#markov .mk-samples { display: flex; flex-wrap: wrap; gap: .4rem; }
#markov .mk-samples button { cursor: pointer; }
#markov .mk-kpis { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .8rem; }
#markov .mk-kpis .big { font: 750 var(--fs-lg)/1.1 var(--display); font-variant-numeric: tabular-nums; }
@media (max-width: 860px) { #markov .mk-detail, #markov .mk-kpis { grid-template-columns: minmax(0, 1fr); } }`;

  const show = (c) => (c === '^' ? '⊢' : c === '$' ? '⊣' : c === ' ' ? '␣' : c);

  PWB.register({
    id: 'markov',
    order: 90,
    nav: 'Markov',
    kicker: 'Markov chain',
    title: 'A Markov chain reads it one character at a time',
    lede: 'The chain rule turns P(password) into a product of next-character probabilities. An order-2 chain only looks at the previous two characters.',
    mount(el, { E, kit, data, store, h, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES, d3 = window.d3, MK = data.markov;
      let sel = 0, last = null;

      const strip = h('div', { class: 'mk-strip', role: 'group', 'aria-label': 'Transitions' });
      const detailTitle = h('h3');
      const detailText = h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } });
      const next = h('div', { class: 'mk-next' });
      const chain = h('div', { class: 'formula' });
      const kpis = h('div', { class: 'mk-kpis' });
      const histBox = h('div');
      const histNote = h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } });
      const samples = h('div', { class: 'mk-samples' });
      const sampleBtn = h('button', { class: 'btn primary', id: 'markov-sample', type: 'button' }, 'Sample 10 passwords from the chain');
      const ordersBox = h('div', { class: 'scroll-x' });

      el.append(
        kit.texEl(`P(c_1c_2\\dots c_n)=\\prod_{i=1}^{n+1}P(c_i\\mid c_{i-${MK.order}}\\,c_{i-1}),\\qquad P(c\\mid\\text{ctx})=\\frac{n(\\text{ctx}\\,c)+\\alpha}{n(\\text{ctx})+\\alpha V}`, true),
        h('p', {}, `The chain was trained on the training passwords only, padded as ⊢⊢ password ⊣ so the first characters and the end are modelled too. Each tile below is one factor of the product: the previous ${MK.order} characters, the next character and its probability. V = ${MK.V} possible next symbols, α = ${MK.alpha}.`),
        h('figure', { class: 'fig' }, h('div', { class: 'scroll-x' }, strip),
          h('figcaption', { class: 'cap' }, h('b', {}, 'Conditional probability of the next character'), 'Bar height is P(next | previous two) on a log scale. Dashed tiles have a context the chain never saw, so it falls back to the uniform 1/V. Click a tile to see what the chain expected.')),
        h('div', { class: 'mk-detail' },
          h('div', { class: 'panel stack' }, detailTitle, detailText, next),
          h('div', { class: 'stack' }, h('h3', {}, 'Multiply it all together'), chain, kpis)),
        h('figure', { class: 'fig' }, h('h3', {}, 'Where this password sits'), histBox, histNote,
          h('figcaption', { class: 'cap' }, h('b', {}, 'Markov chain and the chain rule'), 'Distribution of the per-character score ln P / (n + 1) in each class of the training sample. The dashed lines are the tertile cuts that turn the score into the mk_bin feature: Low, Med or High predictability.')),
        h('div', { class: 'grid-2', style: { alignItems: 'start' } },
          h('div', { class: 'stack' }, h('h3', {}, 'Run the chain forwards'),
            h('p', { class: 'muted' }, 'A Markov chain is also a generator. Start from ⊢⊢, draw the next character in proportion to how often it followed that context in training, slide the window, repeat until ⊣. Click a result to analyse it.'),
            sampleBtn, samples),
          h('figure', { class: 'fig' }, h('h3', {}, 'Why order 2?'), ordersBox,
            h('figcaption', { class: 'cap' }, h('b', {}, 'Sparsity'), 'Higher orders remember more context but see each context fewer times. Unseen-context rate: share of test transitions whose context never appeared in that fold’s training passwords.'))));

      // ---------- samples ----------
      const drawSamples = () => kit.replace(samples, Array.from({ length: 10 }, () => E.sample()).map((pw) =>
        h('button', { class: 'chip', type: 'button', title: 'Load this password', onClick: () => store.set(pw) }, pw ? kit.showPw(pw) : '(empty)')));
      sampleBtn.addEventListener('click', drawSamples);
      drawSamples();

      // ---------- order comparison ----------
      const O = data.results.markov_orders;
      kit.replace(ordersBox, h('table', { class: 'tbl' },
        h('thead', {}, h('tr', {}, h('th', {}, 'order'), h('th', {}, 'contexts seen'), C.map((c) => h('th', {}, `unseen · ${c}`)), h('th', {}, 'CV accuracy'))),
        h('tbody', {}, O.map((r) => h('tr', { class: r.order === MK.order ? 'hl' : '' }, h('td', {}, `${r.order}${r.order === MK.order ? ' (used)' : ''}`),
          h('td', {}, fmt.int(r.contexts)), C.map((c) => h('td', {}, fmt.pct(r[`unseen_ctx_${c}`], 1))), h('td', {}, r.cv_acc.toFixed(4)))))));
      const o3 = O[O.length - 1];
      ordersBox.after(h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } },
        `At order ${o3.order}, ${fmt.pct(o3.unseen_ctx_Strong, 1)} of transitions in Strong test passwords have a context never seen in training. For random strings the chain then says "unknown" rather than "unpredictable", which is where sparsity hurts.`));

      // ---------- histogram ----------
      const H = data.eda.mk_hist;
      let hist = null;
      function buildHist() {
        const w = Math.max(300, histBox.clientWidth || 640), Ht = 230, m = { l: 40, r: 14, t: 18, b: 34 };
        const edges = H[C[0]].edges;
        const x = d3.scaleLinear().domain([edges[0], edges[edges.length - 1]]).range([m.l, w - m.r]);
        const dens = C.map((c) => { const tot = d3.sum(H[c].counts); const bw = edges[1] - edges[0]; return H[c].counts.map((n) => n / tot / bw); });
        const y = d3.scaleLinear().domain([0, d3.max(dens.flat())]).nice().range([Ht - m.b, m.t]);
        const svg = d3.create('svg').attr('viewBox', `0 0 ${w} ${Ht}`).attr('role', 'img').attr('aria-label', 'Per-character Markov score by class');
        svg.append('g').attr('class', 'ax').attr('transform', `translate(0,${Ht - m.b})`).call(d3.axisBottom(x).ticks(8).tickSizeOuter(0));
        svg.append('g').attr('class', 'ax').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSizeOuter(0));
        svg.append('text').attr('class', 'chart-text').attr('x', w - m.r).attr('y', Ht - 4).attr('text-anchor', 'end').text('ln P / (n + 1)  (nats per character)');
        const area = d3.area().curve(d3.curveStepAfter).x((d, i) => x(edges[i])).y0(y(0)).y1((d) => y(d));
        dens.forEach((dd, i) => {
          svg.append('path').attr('d', area([...dd, dd[dd.length - 1]])).style('fill', `color-mix(in srgb, ${kit.cls.color(i)} 28%, transparent)`)
            .style('stroke', kit.cls.color(i)).style('stroke-width', 1.4);
        });
        const cuts = data.mk.edges;
        const labelsX = [(edges[0] + cuts[0]) / 2, (cuts[0] + cuts[1]) / 2, (cuts[1] + edges[edges.length - 1]) / 2];
        cuts.forEach((c) => svg.append('line').attr('x1', x(c)).attr('x2', x(c)).attr('y1', m.t).attr('y2', Ht - m.b).style('stroke', 'var(--ink)').style('stroke-dasharray', '5 4'));
        data.mk.labels.forEach((lb, i) => svg.append('text').attr('class', 'chart-text').attr('x', x(labelsX[i])).attr('y', m.t - 4).attr('text-anchor', 'middle').style('font-weight', 700).text(lb));
        C.forEach((c, i) => svg.append('text').attr('class', 'chart-text').attr('x', w - m.r - 4).attr('y', m.t + 14 + 14 * i).attr('text-anchor', 'end').style('fill', kit.cls.ink(i)).style('font-weight', 700).text(c));
        const mark = svg.append('g');
        mark.append('line').attr('y1', m.t).attr('y2', Ht - m.b).style('stroke', 'var(--accent)').style('stroke-width', 2.5);
        mark.append('circle').attr('cy', m.t).attr('r', 5).style('fill', 'var(--accent)');
        const markText = mark.append('text').attr('class', 'chart-text').attr('y', Ht - m.b - 6).style('fill', 'var(--accent)').style('font-weight', 700);
        kit.replace(histBox, svg.node());
        hist = { x, mark, markText, lo: edges[0], hi: edges[edges.length - 1], w, m };
      }
      function placeMark(score, animate) {
        if (!hist) buildHist();
        const v = Math.max(hist.lo, Math.min(hist.hi, score));
        const xp = hist.x(v);
        hist.mark.transition().duration(animate && !kit.reducedMotion() ? 450 : 0).attr('transform', `translate(${xp},0)`);
        const right = xp > hist.w * 0.7;
        hist.markText.attr('x', right ? -6 : 6).attr('text-anchor', right ? 'end' : 'start').text(`this password ${score.toFixed(2)}`);
      }

      // ---------- strip + detail ----------
      function render(st, animate) {
        const ex = st.ex, f = ex.features;
        const trace = E.markovTrace(st.password);
        sel = Math.min(sel, trace.length - 1);
        const logW = (p) => `${Math.max(3, Math.min(100, 100 * (1 + Math.log10(p) / 4)))}%`; // 1e-4 .. 1
        kit.replace(strip, trace.map((t, i) => {
          const tile = h('button', { type: 'button', class: `mk-tile ${t.seen ? '' : 'unseen'}`, 'aria-pressed': String(i === sel),
            'aria-label': `step ${i + 1}: after ${t.ctx} comes ${t.ch}, probability ${fmt.prob(t.p)}`, onClick: () => { sel = i; render(last, false); } },
            h('span', { class: 'mk-ctx' }, [...t.ctx].map((c) => h('span', { class: c === '^' ? 'pad' : '' }, show(c)))),
            h('span', { class: `mk-ch ${t.ch === '$' ? 'pad' : ''}` }, show(t.ch)),
            h('span', { class: 'mk-bar' }, h('i', { style: { height: logW(t.p) } })),
            h('span', {}, fmt.prob(t.p, 3)));
          kit.tip.attach(tile, () => `P(${kit.escape(show(t.ch))} | ${kit.escape([...t.ctx].map(show).join(''))}) = (${t.n} + ${MK.alpha}) / (${fmt.int(t.nctx)} + ${MK.alpha}×${MK.V}) = ${fmt.prob(t.p)}`);
          return tile;
        }));

        const t = trace[sel];
        const top = E.topNext(t.ctx, 8);
        const all = E.topNext(t.ctx, MK.V + 5);
        const rank = all.findIndex((x) => x.ch === t.ch);
        detailTitle.textContent = `After “${[...t.ctx].map(show).join('')}”`;
        detailText.textContent = t.seen
          ? `This context appeared ${fmt.int(t.nctx)} times in training. The actual next character “${show(t.ch)}” followed it ${fmt.int(t.n)} times${rank >= 0 ? `, rank ${rank + 1} of ${all.length}` : ', never'}, so P = ${fmt.prob(t.p)}.`
          : `This context never appeared in training, so every next character gets the same probability 1/V = ${fmt.prob(1 / MK.V)}.`;
        const maxP = top.length ? top[0].p : 1;
        kit.replace(next, top.length ? top.map((x) => h('div', { class: `r ${x.ch === t.ch ? 'hit' : ''}` }, h('b', {}, show(x.ch)),
          h('div', { class: 't' }, h('i', { style: { width: `${(100 * x.p) / maxP}%` } })), h('span', { class: 'num' }, `${fmt.prob(x.p, 3)} · ${fmt.int(x.n)}`)))
          : h('p', { class: 'faint' }, 'No continuations recorded.'),
          rank >= 8 ? h('div', { class: 'r hit' }, h('b', {}, show(t.ch)), h('div', { class: 't' }, h('i', { style: { width: `${(100 * t.p) / maxP}%` } })), h('span', { class: 'num' }, `rank ${rank + 1}`)) : null);

        const n = ex.chars.length, lp = f.log_prob;
        chain.innerHTML = kit.tex(`\\ln P(\\text{pw})=\\sum_{i=1}^{${n + 1}}\\ln P(c_i\\mid\\text{ctx}_i)=${lp.toFixed(2)},\\qquad \\frac{\\ln P}{n+1}=\\frac{${lp.toFixed(2)}}{${n + 1}}=${f.mk_score.toFixed(3)}`, true);
        kit.replace(kpis,
          h('div', { class: 'panel flat' }, h('div', { class: 'eyebrow' }, 'per character'), h('div', { class: 'big' }, `${f.mk_score.toFixed(3)} nats`)),
          h('div', { class: 'panel flat' }, h('div', { class: 'eyebrow' }, 'mk_bin'), h('div', { class: 'big' }, `${f.mk_bin} predictability`)),
          h('div', { class: 'panel flat' }, h('div', { class: 'eyebrow' }, 'surprisal'), h('div', { class: 'big' }, `${(-lp / Math.LN2).toFixed(1)} bits`)));
        placeMark(f.mk_score, animate);
        const mc = data.nb.counts.mk_bin, wTot = mc.counts.reduce((a, r) => a + r[0], 0);
        histNote.textContent = `Score ${f.mk_score.toFixed(3)} falls in the ${f.mk_bin} bin (cuts at ${data.mk.edges.map((e) => e.toFixed(3)).join(' and ')}). Weak passwords spread over all three bins (${mc.levels.map((lv, r) => `${lv} ${fmt.pct(mc.counts[r][0] / wTot, 0)}`).join(', ')}): the very weak level in this dataset is short random strings, which the chain finds just as unpredictable as long random ones.`;
      }

      kit.responsive(histBox, () => { hist = null; last && placeMark(last.ex.features.mk_score, false); });
      store.subscribe((st) => { if (!last || last.password !== st.password) sel = 0; last = st; render(st, true); }, 'markov');
    },
  });
})();
