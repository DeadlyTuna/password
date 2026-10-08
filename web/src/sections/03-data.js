(function () {
  'use strict';

  const CSS = `
#data .dt-flow svg { display: block; width: 100%; height: auto; }
#data .dt-flow text { font: 500 12px var(--mono); fill: var(--ink); }
#data .dt-flow .sub { fill: var(--ink-2); font-size: 11px; }
#data .dt-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr)); gap: .8rem; }
#data .dt-fact { border-top: 2px solid var(--c, var(--ink)); padding-top: .55rem; display: grid; gap: .2rem; }
#data .dt-fact .big { font: 750 var(--fs-xl)/1.05 var(--display); color: var(--c-ink, var(--ink)); font-variant-numeric: tabular-nums; }
#data .dt-fact p { font-size: var(--fs-sm); color: var(--ink-2); }
#data .dt-hists { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .6rem; }
#data .dt-hist h4 { font: 600 var(--fs-xs) var(--mono); color: var(--c-ink); margin-bottom: .2rem; }
#data .dt-hist .faint { font: 500 10.5px var(--mono); }
#data .dt-hist svg { display: block; width: 100%; height: auto; overflow: visible; }
#data .dt-samples { display: grid; gap: .7rem; }
#data .dt-samples .row { gap: .35rem; }
#data .dt-samples .lvl { font: 600 var(--fs-xs) var(--mono); color: var(--c-ink); min-width: 7.5rem; }
#data .dt-samples button.chip { cursor: pointer; }
#data .dt-samples button.chip:hover { border-color: var(--accent); color: var(--ink); }
#data .dt-prior { display: grid; gap: .45rem; }
#data .dt-prior .r { display: grid; grid-template-columns: 4.5rem minmax(0, 1fr) 7rem; gap: .6rem; align-items: center; font-size: var(--fs-sm); }
#data .dt-prior .t { height: .8rem; background: var(--paper-2); border-radius: 99px; overflow: hidden; border: 1px solid var(--line); }
#data .dt-prior .t i { display: block; height: 100%; background: var(--c); }
@media (max-width: 860px) { #data .dt-hists { grid-template-columns: repeat(2, minmax(0, 1fr)); } }`;

  PWB.register({
    id: 'data',
    order: 30,
    nav: 'Data',
    kicker: 'Training data',
    title: 'What the model learned from',
    lede: 'PWLDS is a public dataset of synthetic passwords in five strength levels. We merged them into three classes.',
    mount(el, { E, kit, data, store, h, s, fmt }) {
      el.append(h('style', { text: CSS }));
      const C = E.CLASSES, M = data.meta;
      const LV = Object.keys(M.levels).map(Number);
      const lvlName = (l) => M.levels[l].replace('_', ' ');
      const clsOf = (l) => M.level_to_class[String(l)];

      // ---------- flow: 5 levels -> 3 classes ----------
      const flowBox = h('div', { class: 'dt-flow' });
      kit.responsive(flowBox, (w) => {
        const H = 300, pad = 8, boxW = Math.min(150, w * 0.3), gap = 10, narrow = w < 480;
        const left = LV.map((l, i) => ({ l, y: pad + i * ((H - 2 * pad) / 5), hgt: (H - 2 * pad) / 5 - gap }));
        const classTot = M.class_counts;
        const unit = (H - 2 * pad - 2 * 18) / M.n;
        let y = pad;
        const right = C.map((c, i) => { const r = { i, y, hgt: classTot[i] * unit }; y += r.hgt + 18; return r; });
        const filled = C.map(() => 0);
        const x0 = boxW, x1 = w - boxW;
        const svg = s('svg', { viewBox: `0 0 ${w} ${H}`, role: 'img', 'aria-label': 'Five PWLDS levels flow into three classes' });
        left.forEach(({ l, y: ly, hgt }) => {
          const c = clsOf(l), r = right[c];
          const th = M.n_per_file * unit;
          const ry = r.y + filled[c]; filled[c] += th;
          const ly0 = ly + (hgt - th) / 2;
          const mx = (x0 + x1) / 2;
          svg.append(s('path', { d: `M${x0},${ly0} C${mx},${ly0} ${mx},${ry} ${x1},${ry} L${x1},${ry + th} C${mx},${ry + th} ${mx},${ly0 + th} ${x0},${ly0 + th} Z`,
            style: { fill: `color-mix(in srgb, ${kit.cls.color(c)} 32%, transparent)`, stroke: kit.cls.color(c), strokeWidth: '0.6' } }));
          svg.append(s('rect', { x: 0, y: ly, width: boxW, height: hgt, rx: 4, style: { fill: 'var(--surface)', stroke: 'var(--line-2)' } }));
          svg.append(s('text', { x: 8, y: ly + hgt / 2 - 3, style: narrow ? { fontSize: '10.5px' } : null }, `${l} · ${lvlName(l)}`));
          svg.append(s('text', { x: 8, y: ly + hgt / 2 + 12, class: 'sub' }, narrow ? fmt.int(M.n_per_file) : `${fmt.int(M.n_per_file)} sampled`));
        });
        right.forEach((r) => {
          svg.append(s('rect', { x: x1, y: r.y, width: boxW, height: r.hgt, rx: 4, style: { fill: `color-mix(in srgb, ${kit.cls.color(r.i)} 18%, var(--surface))`, stroke: kit.cls.color(r.i) } }));
          svg.append(s('text', { x: x1 + 10, y: r.y + r.hgt / 2 - 3, style: { fontWeight: '700' } }, C[r.i]));
          svg.append(s('text', { x: x1 + 8, y: r.y + r.hgt / 2 + 12, class: 'sub' }, narrow ? `P = ${(classTot[r.i] / M.n).toFixed(2)}` : `${fmt.int(classTot[r.i])} · P = ${(classTot[r.i] / M.n).toFixed(2)}`));
        });
        kit.replace(flowBox, svg);
      });

      // ---------- dataset rules computed from counts ----------
      const cnt = data.nb.counts;
      const col = (f, c, pred) => cnt[f].levels.reduce((a, lv, r) => a + (pred(lv) ? cnt[f].counts[r][c] : 0), 0);
      const facts = [
        [0, col('sp_bin', 0, (lv) => lv !== '0'), M.class_counts[0], 'Weak passwords that contain any symbol.'],
        [1, col('dig_bin', 1, (lv) => lv !== '0'), M.class_counts[1], 'Medium passwords that contain any digit.'],
        [2, col('len_bin', 2, (lv) => lv === '16+'), M.class_counts[2], 'Strong passwords with 16 or more characters.'],
        [0, col('len_bin', 0, (lv) => lv === '<6'), M.class_counts[0], 'Weak passwords shorter than 6 characters.'],
      ];

      // ---------- length histograms ----------
      const hists = LV.map((l) => {
        const key = M.levels[l];
        const counts = data.eda.length_hist[key];
        const st = data.eda.length_stats[key];
        const svgWrap = h('div');
        const marker = { el: null };
        return { l, key, counts, st, svgWrap, marker,
          el: h('div', { class: `dt-hist ${kit.cls.className(clsOf(l))}` }, h('h4', {}, `${l} · ${lvlName(l)}`), svgWrap,
            h('div', { class: 'faint' }, `mean ${(+st.mean).toFixed(1)} · ${st.min}–${st.max} chars`)) };
      });
      const maxLen = 34;
      const drawHist = (hh, w) => {
        const H = 92, b = 14;
        const xs = (len) => ((len - 0.5) / maxLen) * w;
        const maxC = Math.max(...Object.values(hh.counts));
        const bw = w / maxLen;
        const svg = s('svg', { viewBox: `0 0 ${w} ${H + b}`, role: 'img', 'aria-label': `Password lengths for level ${hh.l}` });
        for (const [len, n] of Object.entries(hh.counts)) {
          const bh = (n / maxC) * (H - 4);
          svg.append(s('rect', { x: xs(+len), y: H - bh, width: Math.max(1, bw - 1), height: bh, style: { fill: 'var(--c)' } }));
        }
        svg.append(s('line', { x1: 0, x2: w, y1: H, y2: H, style: { stroke: 'var(--line-2)' } }));
        [1, 8, 16, 24, 32].forEach((t) => svg.append(s('text', { x: xs(t) + bw / 2, y: H + 11, 'text-anchor': 'middle', class: 'chart-text', style: { fontSize: '9px' } }, String(t))));
        hh.marker.el = s('line', { y1: 0, y2: H, style: { stroke: 'var(--ink)', strokeWidth: '1.5', strokeDasharray: '3 2' } });
        hh.marker.xs = (len) => xs(Math.min(len, maxLen)) + bw / 2;
        svg.append(hh.marker.el);
        kit.replace(hh.svgWrap, svg);
        placeMarkers();
      };
      let curLen = 0;
      const placeMarkers = () => hists.forEach((hh) => {
        if (!hh.marker.el) return;
        const x = hh.marker.xs(Math.max(curLen, 0.5));
        hh.marker.el.setAttribute('x1', x); hh.marker.el.setAttribute('x2', x);
        hh.marker.el.style.opacity = curLen ? '1' : '0';
      });
      const histGrid = h('div', { class: 'dt-hists' }, hists.map((hh) => hh.el));
      kit.responsive(histGrid, () => hists.forEach((hh) => drawHist(hh, Math.max(80, hh.svgWrap.clientWidth || 120))));
      const lenNote = h('p', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } });

      // ---------- samples ----------
      const samples = h('div', { class: 'dt-samples' }, LV.map((l) => h('div', { class: `row ${kit.cls.className(clsOf(l))}` },
        h('span', { class: 'lvl' }, `${l} · ${lvlName(l)} → ${C[clsOf(l)]}`),
        data.eda.samples[M.levels[l]].slice(0, 8).map((pw) => h('button', { class: 'chip', type: 'button', title: 'Load this password', onClick: () => store.set(pw) }, kit.showPw(pw))))));

      const frac = M.n / M.pwlds_rows;
      el.append(
        h('div', { class: 'grid-2', style: { alignItems: 'start' } },
          h('div', { class: 'stack' },
            h('p', {}, `PWLDS (Infinitode, 2024) contains ${fmt.int(M.pwlds_rows)} synthetic passwords, about ${fmt.int(M.pwlds_rows / 5)} per level. Level 4 was generated with Python’s secrets module; the dataset’s README says the weaker levels rely heavily on English words. We drew a random sample of ${fmt.int(M.n_per_file)} per level, ${fmt.int(M.n)} in all (${fmt.pct(frac, 2)} of the dataset).`),
            h('p', { class: 'muted' }, 'Levels 0 and 1 become Weak, level 2 becomes Medium and levels 3 and 4 become Strong. That makes the classes unequal in size, which is exactly what the prior P(C) records.'),
            h('figure', { class: 'fig' }, h('div', { class: 'dt-prior' }, C.map((c, i) => h('div', { class: `r ${kit.cls.className(i)}` }, h('span', {}, c),
              h('div', { class: 't' }, h('i', { style: { width: `${100 * M.class_counts[i] / M.n}%` } })), h('span', { class: 'num' }, `${fmt.int(M.class_counts[i])} · ${(M.class_counts[i] / M.n).toFixed(2)}`)))),
              h('figcaption', { class: 'cap' }, h('b', {}, 'Prior probability'), 'P(C) is the share of training passwords in each class.'))),
          h('figure', { class: 'fig' }, flowBox, h('figcaption', { class: 'cap' }, h('b', {}, 'Merging levels'), 'Band width is proportional to the number of sampled passwords.'))),
        h('div', { class: 'stack' }, h('h3', {}, 'Rules hidden in the data'),
          h('div', { class: 'dt-facts' }, facts.map(([c, k, n, text]) => h('div', { class: `dt-fact ${kit.cls.className(c)}` },
            h('span', { class: 'big' }, `${fmt.int(k)} / ${fmt.int(n)}`), h('p', {}, `${text} (${fmt.pct(k / n, 1)})`)))),
          h('p', { class: 'muted' }, 'A rule like "Weak passwords never contain symbols" is a property of how PWLDS was generated. The model learns it perfectly, which is why a single symbol counts as strong evidence. See ', h('a', { href: '#limits' }, 'where the model is wrong'), '.')),
        h('figure', { class: 'fig' }, h('h3', {}, 'Password length by level'), histGrid, lenNote,
          h('figcaption', { class: 'cap' }, h('b', {}, 'Empirical distribution'), 'Histograms of length per PWLDS level; the dashed line is the current password. Lengths barely overlap, so length alone already separates most classes.')),
        h('div', { class: 'stack' }, h('h3', {}, 'Try a training example'), h('p', { class: 'muted' }, 'Click any of these real passwords from the sample to load it into the whole page.'), samples));

      store.subscribe((st) => {
        curLen = st.ex.features.length;
        placeMarkers();
        lenNote.textContent = st.password ? `The current password has ${curLen} characters.` : 'Type a password to mark its length.';
      }, 'data');
    },
  });
})();
