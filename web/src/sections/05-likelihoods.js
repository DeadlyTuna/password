/* Section 05: the nine likelihood tables P(f = v | C), shown as small-multiple heatmaps,
 * plus a live read-out of the current password's row in every table and a one-cell inspector. */
(function () {
  'use strict';
  const ID = 'likelihoods';

  PWB.register({
    id: ID,
    order: 50,
    nav: 'Likelihoods',
    kicker: 'Conditional probability',
    title: 'How common is each feature in each class?',
    lede: 'For every feature value v and class C, the model stores P(f = v | C), counted from the training data.',
    mount(el, ctx) {
      const { E, kit, data, store, h, fmt } = ctx;
      const esc = kit.escape;
      const CN = E.CLASSES;
      const FEATS = E.FEATURES;
      const BIN = new Set(data.features.bin);
      const classN = data.nb.class_n;
      const ALPHA = data.nb.alpha;
      const A_TXT = String(ALPHA);

      // ---------- static tables (never depend on the password) ----------
      const T = {};
      for (const f of FEATS) T[f] = E.table(f);
      let pMin = 1;
      for (const f of FEATS) for (const row of T[f]) for (const p of row.p) if (p < pMin) pMin = p;
      const LOG_LO = Math.floor(Math.log10(pMin)); // lower end of the log scale, a power of ten
      const Ks = FEATS.map((f) => T[f].length);
      const levelIndex = (f, value) => T[f].findIndex((r) => r.level === String(value));
      const argmax = (xs) => xs.indexOf(Math.max(...xs));
      const argmin = (xs) => xs.indexOf(Math.min(...xs));
      const sum = (xs) => xs.reduce((a, b) => a + b, 0);

      const mkE = data.mk.edges.map((e) => fmt.signed(e, 2));
      const META = {
        len_bin: { name: 'Length', what: 'Number of characters.' },
        dig_bin: { name: 'Digits', what: 'How many digits.' },
        up_bin: { name: 'Uppercase', what: 'How many uppercase letters.' },
        sp_bin: { name: 'Symbols', what: 'Characters that are neither letters nor digits.' },
        mk_bin: { name: 'Markov score', what: `Per-character ln P from the chain. Low < ${mkE[0]} ≤ Med < ${mkE[1]} ≤ High.` },
        is_common: { name: 'Common password', what: `It, or its base word, is on the ${fmt.int(data.meta.common_list_size)}-entry common list.` },
        has_seq: { name: 'Run', what: 'Three in order from the alphabet, digits or a keyboard row (abc, 123, qwe).' },
        has_repeat: { name: 'Triple repeat', what: 'One character three times in a row.' },
        has_year: { name: 'Year', what: 'A 19xx or 20xx number inside it.' },
      };
      const yesNo = (lv) => (lv === '1' ? 'yes' : 'no');
      const lvLabel = (f, lv) => (BIN.has(f) ? `${lv} (${yesNo(lv)})` : lv);

      // ---------- formatting ----------
      const compact = (str) => str.replace(' × ', '×');
      const cp = (p) => compact(fmt.prob(p));
      const ratioTxt = (x) => (x >= 1000 ? fmt.int(x) : x >= 10 ? x.toFixed(1) : x >= 1.01 ? x.toFixed(2) : x.toFixed(4));
      const texEsc = (str) => String(str).replace(/[_#%&$]/g, (c) => `\\${c}`);
      const texInt = (n) => fmt.int(n).replace(/,/g, '{,}');
      const texNum = (x) => {
        if (x === 0) return '0';
        if (x >= 1e-3) return x.toFixed(4);
        const [m, e] = x.toExponential(2).split('e');
        return `${m} \\times 10^{${parseInt(e, 10)}}`;
      };
      const texLevel = (lv) => (lv.startsWith('<') ? `{<}\\text{${texEsc(lv.slice(1))}}` : `\\text{${texEsc(lv)}}`);

      // ---------- UI state ----------
      const ui = { shade: 'linear', view: 'prob' };
      let cur = null;            // latest store state
      let sel = { f: 'sp_bin', r: 1, c: 0, auto: true };
      const curRow = {};         // feature -> level index of the current password

      // ---------- theme-aware text colour inside shaded cells ----------
      const probe = h('span', { 'aria-hidden': 'true', class: 'lk-probe' });
      el.append(probe);
      const rgbOf = (token) => {
        probe.style.color = `var(${token})`;
        const m = getComputedStyle(probe).color.match(/[\d.]+/g);
        return m && m.length >= 3 ? m.slice(0, 3).map(Number) : null;
      };
      const lum = (c) => {
        const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * ch(c[0]) + 0.7152 * ch(c[1]) + 0.0722 * ch(c[2]);
      };
      const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
      let INK_SWITCH = 70; // % of accent in the mix above which the light-on-dark text reads better
      function calibrate() {
        const A = rgbOf('--accent'), S = rgbOf('--surface'), I = rgbOf('--ink'), AI = rgbOf('--accent-ink');
        if (!A || !S || !I || !AI) return;
        INK_SWITCH = 101;
        for (let m = 0; m <= 100; m++) {
          const mix = A.map((a, k) => (a * m + S[k] * (100 - m)) / 100);
          if (contrast(mix, AI) > contrast(mix, I)) { INK_SWITCH = m; break; }
        }
      }
      calibrate();

      const MIX_LO = 3, MIX_HI = 88;
      const tOf = (p) => (ui.shade === 'log' ? Math.max(0, Math.min(1, (Math.log10(p) - LOG_LO) / -LOG_LO)) : p);
      const mixOf = (p) => MIX_LO + (MIX_HI - MIX_LO) * tOf(p);

      // ---------- style ----------
      el.append(h('style', {}, `
#${ID} .lk-probe { position: absolute; width: 0; height: 0; overflow: hidden; pointer-events: none; }
#${ID} .lk-intro { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 1.25rem 2rem; align-items: start; }
#${ID} .lk-intro p + p { margin-top: 0.7rem; }
#${ID} .lk-def { display: grid; gap: 0.35rem; }
#${ID} .lk-def .formula { padding: 0.2rem 0 0.4rem; }
#${ID} .lk-defs { display: grid; gap: 0.3rem; font-size: var(--fs-sm); color: var(--ink-2); }
#${ID} .lk-defs > div { display: grid; grid-template-columns: 2.6rem minmax(0, 1fr); gap: 0.5rem; align-items: baseline; }
#${ID} .lk-defs .k { text-align: right; color: var(--ink); }
#${ID} .lk-try { gap: 0.4rem 0.5rem; }
#${ID} .lk-try .btn { font-family: var(--mono); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#${ID} .lk-bar-ctl { display: flex; flex-wrap: wrap; gap: 0.9rem 1.6rem; align-items: flex-end; padding: 0.8rem 0; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
#${ID} .lk-ctl { display: grid; gap: 0.35rem; }
#${ID} .lk-legend { display: flex; flex-wrap: wrap; gap: 0.7rem 1.4rem; align-items: flex-end; font-size: var(--fs-xs); color: var(--ink-2); min-width: 0; }
#${ID} .lk-scale { width: 12rem; max-width: 100%; display: grid; gap: 0.2rem; }
#${ID} .lk-grad { height: 10px; border-radius: 3px; border: 1px solid var(--line);
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) ${MIX_LO}%, var(--surface)), color-mix(in srgb, var(--accent) ${MIX_HI}%, var(--surface))); }
#${ID} .lk-ticks { position: relative; height: 0.9rem; font: 500 10px/1 var(--mono); color: var(--ink-3); margin-inline: 0.6rem; }
#${ID} .lk-ticks span { position: absolute; top: 1px; transform: translateX(-50%); white-space: nowrap; transition: left .4s var(--ease); }
#${ID} .lk-key { display: inline-flex; align-items: center; gap: 0.45rem; }
#${ID} .lk-key i { display: inline-block; width: 1.5rem; height: 0.95rem; border-radius: 3px; flex: none; }
#${ID} .lk-key .hatch { border: 1px solid var(--line-2); background-color: color-mix(in srgb, var(--accent) ${MIX_LO}%, var(--surface));
  background-image: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink-2) 40%, transparent) 0 1px, transparent 1px 5px); }
#${ID} .lk-key .ring { border: 2px solid var(--ink); }
#${ID} .lk-key .sel { box-shadow: inset 0 0 0 2px var(--accent); background: var(--surface); border: 1px solid var(--line); }
#${ID} .lk-pnote { margin-left: auto; }

#${ID} .lk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(18.5rem, 100%), 1fr)); gap: 1rem; }
#${ID} .lk-card { padding: 0.85rem 0.9rem 0.75rem; display: grid; gap: 0.5rem; align-content: start; }
#${ID} .lk-chead { display: flex; justify-content: space-between; align-items: baseline; gap: 0.25rem 0.6rem; flex-wrap: wrap; }
#${ID} .lk-chead h4 { font-size: var(--fs-base); }
#${ID} .lk-chead h4 .mono { font-size: var(--fs-xs); font-weight: 500; color: var(--ink-3); margin-left: 0.35rem; letter-spacing: 0; }
#${ID} .lk-you { font-size: 11px; padding: 0.2rem 0.5rem; }
#${ID} .lk-what { font-size: var(--fs-xs); line-height: 1.4; color: var(--ink-3); }
#${ID} .lk-tab { position: relative; display: grid; gap: 2px; }
#${ID} .lk-row { display: grid; grid-template-columns: 3.5rem repeat(3, minmax(0, 1fr)); gap: 2px; }
#${ID} .lk-ch { font: 600 10.5px/1.2 var(--mono); color: var(--ink-2); display: flex; gap: 0.3rem; align-items: center; justify-content: center; padding: 0.1rem 0 0.3rem; cursor: help; transition: color .2s; }
#${ID} .lk-ch .swatch { width: 0.6rem; height: 0.6rem; }
#${ID} .lk-corner { font: 500 10px/1.2 var(--mono); color: var(--ink-3); align-self: end; padding: 0 0 0.3rem 0.15rem; }
#${ID} .lk-rh { font: 500 11px/1.1 var(--mono); color: var(--ink-2); display: flex; align-items: center; gap: 0.25rem; padding-left: 0.15rem; white-space: nowrap; cursor: help; min-width: 0; }
#${ID} .lk-rh small { font: 400 10px var(--body); color: var(--ink-3); }
#${ID} .lk-cell { min-height: 2.5rem; border-radius: 3px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
  font: 500 11px/1.1 var(--mono); font-variant-numeric: tabular-nums; cursor: pointer; position: relative; min-width: 0; padding: 0 2px;
  transition: background-color .45s var(--ease), color .45s var(--ease), opacity .2s, box-shadow .2s; }
#${ID} .lk-cell .v { white-space: nowrap; }
#${ID} .lk-cell.is-zero { background-image: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink-2) 34%, transparent) 0 1px, transparent 1px 5px); }
#${ID} .lk-z { font: 500 9px/1 var(--body); color: var(--ink-2); text-decoration: none; white-space: nowrap; letter-spacing: 0.01em; }
#${ID} .lk-z:hover { color: var(--accent); text-decoration: underline; }
#${ID} .lk-cell:hover { box-shadow: 0 0 0 1px var(--ink-2); }
#${ID} .lk-cell.is-sel { box-shadow: inset 0 0 0 2px var(--accent), 0 0 0 1px var(--surface); }
#${ID} .lk-row.is-cur .lk-cell { font-weight: 700; }
#${ID} .lk-row.is-cur .lk-rh { color: var(--ink); font-weight: 700; }
#${ID} .lk-sum { text-align: center; font: 600 10.5px/1.2 var(--mono); color: var(--ink-3); padding-top: 0.35rem; margin-top: 2px; border-top: 1px solid var(--line-2); cursor: help; transition: color .2s; }
#${ID} .lk-srow .lk-corner { align-self: start; padding-top: 0.35rem; margin-top: 2px; border-top: 1px solid var(--line-2); }
#${ID} .lk-tab[data-hc="0"] .lk-cell:not([data-c="0"]), #${ID} .lk-tab[data-hc="1"] .lk-cell:not([data-c="1"]), #${ID} .lk-tab[data-hc="2"] .lk-cell:not([data-c="2"]) { opacity: 0.4; }
#${ID} .lk-tab[data-hc="0"] [data-c="0"].lk-sum, #${ID} .lk-tab[data-hc="1"] [data-c="1"].lk-sum, #${ID} .lk-tab[data-hc="2"] [data-c="2"].lk-sum,
#${ID} .lk-tab[data-hc="0"] [data-c="0"].lk-ch, #${ID} .lk-tab[data-hc="1"] [data-c="1"].lk-ch, #${ID} .lk-tab[data-hc="2"] [data-c="2"].lk-ch { color: var(--accent); }
#${ID} .lk-ring { position: absolute; left: -4px; right: -4px; top: 0; height: 0; border: 2px solid var(--ink); border-radius: 7px; pointer-events: none; opacity: 0; }
#${ID} .lk-ring.on { opacity: 1; }
#${ID} .lk-ring.ready { transition: transform .4s var(--ease), height .4s var(--ease), opacity .2s; }
#${ID} .lk-ring.ping-a { animation: ${ID}-ping-a .6s var(--ease); }
#${ID} .lk-ring.ping-b { animation: ${ID}-ping-b .6s var(--ease); }
@keyframes ${ID}-ping-a { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ink) 35%, transparent); } to { box-shadow: 0 0 0 7px transparent; } }
@keyframes ${ID}-ping-b { from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--ink) 35%, transparent); } to { box-shadow: 0 0 0 7px transparent; } }
#${ID} .lk-foot { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; font-size: var(--fs-xs); color: var(--ink-2); min-height: 1.3rem; }
#${ID} .lk-foot b { color: var(--ink); font-weight: 600; }

#${ID} .lk-ftop { display: grid; gap: 0.5rem; margin-bottom: 0.4rem; }
#${ID} .lk-pw { font-family: var(--mono); background: var(--accent-soft); padding: 0.05em 0.35em; border-radius: var(--r-sm); word-break: break-all; }
#${ID} .lk-frow { display: grid; grid-template-columns: minmax(0, 12rem) minmax(0, 1fr) minmax(0, 12.5rem); gap: 0.45rem 1.2rem; align-items: center; padding: 0.6rem 0; border-top: 1px solid var(--line); }
#${ID} .lk-frow.lk-fhead { border-top: 0; padding: 0 0 0.2rem; }
#${ID} .lk-fname { display: grid; gap: 0.15rem; min-width: 0; }
#${ID} .lk-fname b { font: 650 var(--fs-sm)/1.2 var(--display); }
#${ID} .lk-fname .mono { font-size: var(--fs-xs); color: var(--ink-3); }
#${ID} .lk-fname .lk-fval { font: 600 var(--fs-xs) var(--mono); color: var(--ink); }
#${ID} .lk-bars { display: grid; gap: 4px; min-width: 0; }
#${ID} .lk-bar { display: grid; grid-template-columns: 3.7rem minmax(0, 1fr) 5.4rem; gap: 0.55rem; align-items: center; font: 500 var(--fs-xs)/1.2 var(--mono); color: var(--ink-2); }
#${ID} .lk-bar .num { text-align: right; color: var(--ink); white-space: nowrap; }
#${ID} .lk-bar.top .num { font-weight: 700; }
#${ID} .lk-track { position: relative; height: 9px; border-radius: 0 4px 4px 0; background: color-mix(in srgb, var(--ink-3) 13%, transparent); }
#${ID} .lk-track i { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: var(--c); border-radius: 0 4px 4px 0; }
#${ID} .lk-track.ready i { transition: width .42s var(--ease); }
#${ID} .lk-axis { position: relative; height: 1rem; font: 500 10px/1 var(--mono); color: var(--ink-3); }
#${ID} .lk-axis span { position: absolute; top: 2px; transform: translateX(-50%); white-space: nowrap; }
#${ID} .lk-axis span:first-child { transform: none; }
#${ID} .lk-axis span:last-child { transform: translateX(-100%); }
#${ID} .lk-fav { display: grid; gap: 0.15rem; font-size: var(--fs-xs); color: var(--ink-2); min-width: 0; }
#${ID} .lk-fav .who { display: flex; align-items: center; gap: 0.4rem; font: 600 var(--fs-sm) var(--body); color: var(--ink); }
#${ID} .lk-fav .faint { font-family: var(--mono); }
#${ID} .lk-ftot { display: grid; gap: 0.6rem; padding-top: 0.8rem; border-top: 2px solid var(--ink); }
#${ID} .lk-ftot .row { gap: 0.45rem; }
#${ID} .lk-ftot .chip .swatch { width: 0.6rem; height: 0.6rem; }

#${ID} .lk-ihead { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; flex-wrap: wrap; }
#${ID} .lk-ibody { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 1.25rem 2rem; align-items: start; margin-top: 0.6rem; }
#${ID} .lk-ibody .formula { padding: 0.3rem 0; }
#${ID} .lk-itext { display: grid; gap: 0.6rem; font-size: var(--fs-sm); }
#${ID} .lk-split { display: grid; gap: 0.55rem; }
#${ID} .lk-sline { display: grid; grid-template-columns: 5.6rem minmax(0, 1fr) 5.4rem; gap: 0.6rem; align-items: center; font: 500 var(--fs-xs)/1.2 var(--mono); color: var(--ink-2); transition: opacity .25s; }
#${ID} .lk-sline.dim { opacity: 0.55; }
#${ID} .lk-sline .who { display: flex; align-items: center; gap: 0.35rem; color: var(--ink); white-space: nowrap; }
#${ID} .lk-sline .num { text-align: right; color: var(--ink); white-space: nowrap; }
#${ID} .lk-sline.on .who, #${ID} .lk-sline.on .num { font-weight: 700; }
#${ID} .lk-sbar { display: flex; height: 24px; border-radius: 4px; overflow: hidden; min-width: 0; }
#${ID} .lk-seg { flex: var(--g, 0) 1 0px; min-width: 0; border-right: 2px solid var(--surface); cursor: pointer; display: grid; place-items: center;
  background-color: color-mix(in srgb, var(--ink-3) 22%, var(--surface)); color: var(--ink-2); font: 500 10px/1 var(--mono); white-space: nowrap;
  transition: flex-grow .42s var(--ease), background-color .3s; }
#${ID} .lk-seg:last-child { border-right: 0; }
#${ID} .lk-seg.is-zero { background-image: repeating-linear-gradient(135deg, color-mix(in srgb, var(--ink-2) 34%, transparent) 0 1px, transparent 1px 5px); }
#${ID} .lk-seg.on { background-color: var(--accent); color: var(--accent-ink); font-weight: 600; }
#${ID} .lk-seg:hover { background-color: color-mix(in srgb, var(--ink-3) 38%, var(--surface)); }
#${ID} .lk-seg.on:hover { background-color: var(--accent); }
#${ID} .lk-rowsum { font-size: var(--fs-sm); color: var(--ink-2); }
#${ID} .lk-flash { animation: ${ID}-flash .7s var(--ease); }
@keyframes ${ID}-flash { from { box-shadow: 0 0 0 3px var(--accent), var(--shadow); } to { box-shadow: var(--shadow); } }

@media (max-width: 860px) {
  #${ID} .lk-intro, #${ID} .lk-ibody { grid-template-columns: minmax(0, 1fr); }
  #${ID} .lk-pnote { margin-left: 0; }
}
@media (max-width: 760px) {
  #${ID} .lk-frow { grid-template-columns: minmax(0, 1fr); gap: 0.4rem; }
  #${ID} .lk-frow.lk-fhead { display: none; }
  #${ID} .lk-fname { grid-template-columns: auto auto minmax(0, 1fr); align-items: baseline; gap: 0.5rem; }
  #${ID} .lk-fav { grid-template-columns: auto minmax(0, 1fr); align-items: baseline; gap: 0.5rem; }
}
@media (max-width: 420px) {
  #${ID} .lk-sline { grid-template-columns: 4.9rem minmax(0, 1fr) 4.9rem; gap: 0.4rem; }
  #${ID} .lk-bar { grid-template-columns: 3.5rem minmax(0, 1fr) 5.1rem; gap: 0.4rem; }
}
`));

      // ---------- intro ----------
      const kMin = Math.min(...Ks), kMax = Math.max(...Ks);
      el.append(h('div', { class: 'lk-intro' },
        h('div', {},
          h('p', {}, `Read each table one column at a time. The Weak column looks only at the ${fmt.int(classN[0])} Weak passwords in the training data and asks what share of them falls in each level. That is what conditioning on C means: shrink the world to class C, then count.`),
          h('p', {}, `So every column is a full probability distribution over the levels and adds up to 1. A row mixes three different groups of passwords (${CN.map((c, i) => `${fmt.int(classN[i])} ${c}`).join(', ')}), so a row can add up to anything.`)),
        h('div', { class: 'panel flat lk-def' },
          h('div', { class: 'eyebrow' }, 'Every cell is this fraction'),
          kit.texEl('\\hat P(f = v \\mid C) = \\frac{n_{v,C} + \\alpha}{n_C + \\alpha K}', true),
          h('div', { class: 'lk-defs' },
            h('div', {}, h('span', { class: 'k', html: kit.tex('n_{v,C}') }), h('span', {}, 'training passwords of class C with f = v')),
            h('div', {}, h('span', { class: 'k', html: kit.tex('n_C') }), h('span', {}, `all training passwords of class C (${CN.map((c, i) => fmt.int(classN[i])).join(' / ')})`)),
            h('div', {}, h('span', { class: 'k', html: kit.tex('K') }), h('span', {}, `number of levels of the feature (${kMin} to ${kMax})`)),
            h('div', {}, h('span', { class: 'k', html: kit.tex('\\alpha') }), h('span', {}, `= ${A_TXT}: one pretend password added to every level, so no cell is exactly 0`))))));

      // ---------- try row ----------
      const levelsOf = (ci) => Object.entries(data.meta.level_to_class).filter(([, c]) => c === ci).map(([lv]) => data.meta.levels[lv]);
      function randomSample(ci) {
        const lv = levelsOf(ci).filter((l) => data.eda.samples[l] && data.eda.samples[l].length);
        if (!lv.length) return null;
        const arr = data.eda.samples[lv[Math.floor(Math.random() * lv.length)]];
        return arr[Math.floor(Math.random() * arr.length)];
      }
      const tryRow = h('div', { class: 'row lk-try' }, h('span', { class: 'eyebrow' }, 'Try'));
      for (const pw of Object.keys(data.results.worked_examples || {})) {
        tryRow.append(h('button', { type: 'button', class: 'btn small', onClick: () => store.set(pw), title: `Load ${pw}` }, kit.showPw(pw)));
      }
      CN.forEach((c, ci) => {
        tryRow.append(h('button', {
          type: 'button', class: `btn small ${kit.cls.className(ci)}`, title: `Load a random ${c} password from the training sample`,
          onClick: () => { const pw = randomSample(ci); if (pw !== null) store.set(pw); },
        }, h('span', { class: 'swatch', 'aria-hidden': 'true' }), ` random ${c}`));
      });
      el.append(tryRow);

      // ---------- control bar ----------
      function seg(key, label, options, onChange) {
        const lblId = `${ID}-${key}-label`;
        const group = h('div', { class: 'seg', role: 'group', 'aria-labelledby': lblId });
        const btns = options.map(([val, text]) => h('button', {
          type: 'button', id: `${ID}-${key}-${val}`, 'aria-pressed': String(ui[key] === val),
          onClick: () => {
            if (ui[key] === val) return;
            ui[key] = val;
            btns.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === val)));
            onChange(val);
          },
        }, text));
        group.append(...btns);
        return h('div', { class: 'lk-ctl' }, h('span', { class: 'eyebrow', id: lblId }, label), group);
      }
      const ticksEl = h('div', { class: 'lk-ticks', 'aria-hidden': 'true' });
      const scaleLbl = h('span', { class: 'eyebrow' }, 'Shade = probability');
      function drawTicks() {
        const ticks = ui.shade === 'log'
          ? Array.from({ length: -LOG_LO + 1 }, (_, i) => LOG_LO + i).filter((e, i, a) => a.length <= 4 || (e - LOG_LO) % 1 === 0).map((e) => [Math.pow(10, e), e === 0 ? '1' : `10${kit.sup(e)}`])
          : [[0, '0'], [0.25, '.25'], [0.5, '.5'], [0.75, '.75'], [1, '1']];
        const keep = ui.shade === 'log' && ticks.length > 4 ? ticks.filter((t, i) => i % 2 === (ticks.length - 1) % 2) : ticks;
        kit.replace(ticksEl, ...keep.map(([v, t]) => h('span', { style: { left: `${(100 * Math.max(0, tOf(Math.max(v, 1e-300)))).toFixed(2)}%` } }, t)));
        scaleLbl.textContent = ui.shade === 'log' ? 'Shade = probability (log scale)' : 'Shade = probability (linear)';
      }
      el.append(h('div', { class: 'lk-bar-ctl' },
        seg('shade', 'Shading', [['linear', 'Linear'], ['log', 'Log']], () => { drawTicks(); paintAll(); updateFocus(true); }),
        seg('view', 'Cells show', [['prob', 'Probability'], ['count', 'Raw count n']], () => { writeAllText(true); }),
        h('div', { class: 'lk-legend' },
          h('div', { class: 'lk-scale' }, scaleLbl, h('div', { class: 'lk-grad', 'aria-hidden': 'true' }), ticksEl),
          h('span', { class: 'lk-key' }, h('i', { class: 'hatch', 'aria-hidden': 'true' }),
            h('span', {}, 'smoothed zero (n = 0). ', h('a', { href: '#smoothing' }, 'Why not 0?'))),
          h('span', { class: 'lk-key' }, h('i', { class: 'ring', 'aria-hidden': 'true' }), 'your password'),
          h('span', { class: 'lk-key' }, h('i', { class: 'sel', 'aria-hidden': 'true' }), 'opened below')),
        h('p', { class: 'note lk-pnote' }, 'columns add to 1. rows do not.')));
      drawTicks();

      // ---------- the nine heatmaps ----------
      const cards = {};
      const grid = h('div', { class: 'lk-grid' });

      function hoverCol(card, c) {
        if (c === null) card.tab.removeAttribute('data-hc'); else card.tab.setAttribute('data-hc', String(c));
      }
      function cellTip(f, r, c) {
        const row = T[f][r], n = row.counts[c], nC = classN[c], K = T[f].length, p = row.p[c];
        const lv = esc(row.level);
        let s = `<div style="font-size:1.12em"><b>${esc(fmt.prob(p))}</b></div>`;
        s += `<div>P(${esc(f)} = ${lv} | ${CN[c]})</div>`;
        s += `<div style="margin-top:.35em">n = ${fmt.int(n)} &middot; n<sub>C</sub> = ${fmt.int(nC)} &middot; K = ${K} &middot; &alpha; = ${esc(A_TXT)}</div>`;
        s += `<div style="margin-top:.35em">(n + &alpha;) / (n<sub>C</sub> + &alpha;K)</div>`;
        s += `<div>= (${fmt.int(n)} + ${esc(A_TXT)}) / (${fmt.int(nC)} + ${esc(A_TXT)}&times;${K})</div>`;
        s += `<div>= ${esc(fmt.prob(p))}</div>`;
        s += n === 0
          ? `<div style="margin-top:.35em">Smoothed zero: no ${CN[c]} training password had ${esc(f)} = ${lv}.</div>`
          : `<div style="margin-top:.35em;opacity:.75">raw share n / n<sub>C</sub> = ${esc(fmt.prob(n / nC))}</div>`;
        return s;
      }
      function colTip(f, c) {
        const K = T[f].length;
        return `<div><b>Column ${CN[c]}</b> = P(${esc(f)} | ${CN[c]})</div>`
          + `<div>${fmt.int(classN[c])} ${CN[c]} passwords split over ${K} levels.</div>`
          + `<div>Every ${CN[c]} password lands in exactly one level, so the column adds to 1.</div>`;
      }
      function rowTip(f, r) {
        const row = T[f][r], s = sum(row.p);
        return `<div><b>Row ${esc(f)} = ${esc(row.level)}</b></div>`
          + `<div>${row.p.map((p) => esc(cp(p))).join(' + ')} = ${fmt.fixed(s, 4)}</div>`
          + '<div>A row does not have to add to 1: each value is a share of a different class.</div>';
      }
      function sumTip(f, c) {
        const K = T[f].length, nC = classN[c];
        const s = sum(T[f].map((r) => r.p[c]));
        return `<div><b>&Sigma; over ${K} levels = ${fmt.fixed(s, 4)}</b></div>`
          + `<div>Raw counts add to n<sub>C</sub> = ${fmt.int(sum(T[f].map((r) => r.counts[c])))}.</div>`
          + `<div>&Sigma;(n + &alpha;) = n<sub>C</sub> + &alpha;K = ${fmt.int(nC)} + ${esc(A_TXT)}&times;${K}, the denominator, so the smoothed column adds to exactly 1.</div>`;
      }
      const tipAt = (node, html) => { const b = node.getBoundingClientRect(); kit.tip.show(html, { clientX: b.right - 8, clientY: b.bottom - 6 }); };
      function hoverable(node, card, c, htmlFn) {
        node.addEventListener('pointerenter', (e) => { if (c !== null) hoverCol(card, c); kit.tip.show(htmlFn(), e); });
        node.addEventListener('pointermove', (e) => kit.tip.move(e));
        node.addEventListener('pointerleave', () => { hoverCol(card, null); kit.tip.hide(); });
      }

      FEATS.forEach((f) => {
        const K = T[f].length;
        const card = { f, rows: [], cells: [], sums: [], cur: -1 };
        const youChip = h('span', { class: 'chip lk-you' }, 'you: ');
        const tab = h('div', { class: 'lk-tab', role: 'grid', 'aria-label': `P(${f} | class): ${K} levels by 3 classes. Arrow keys move, Enter opens a cell below.` });
        const head = h('div', { class: 'lk-row', role: 'row' }, h('span', { class: 'lk-corner', role: 'columnheader' }, 'level'));
        CN.forEach((c, ci) => {
          const ch = h('div', { class: `lk-ch ${kit.cls.className(ci)}`, role: 'columnheader', dataset: { c: String(ci) } },
            h('span', { class: 'swatch', 'aria-hidden': 'true' }), c);
          hoverable(ch, card, ci, () => colTip(f, ci));
          head.append(ch);
        });
        tab.append(head);
        T[f].forEach((row, r) => {
          const rh = h('div', { class: 'lk-rh', role: 'rowheader' }, row.level, BIN.has(f) ? h('small', {}, yesNo(row.level)) : null);
          hoverable(rh, card, null, () => rowTip(f, r));
          const rEl = h('div', { class: 'lk-row', role: 'row' }, rh);
          const cells = row.p.map((p, c) => {
            const zero = row.counts[c] === 0;
            const v = h('span', { class: 'v' });
            const cell = h('div', {
              class: `lk-cell${zero ? ' is-zero' : ''}`, role: 'gridcell', tabindex: '-1', dataset: { r: String(r), c: String(c) },
              'aria-label': `P(${f} = ${row.level} | ${CN[c]}) = ${fmt.prob(p)}, raw count ${fmt.int(row.counts[c])} of ${fmt.int(classN[c])}${zero ? ', smoothed zero' : ''}`,
            }, v, zero ? h('a', { class: 'lk-z', href: '#smoothing', tabindex: '-1' }, 'smoothed zero') : null);
            cell.__v = v;
            hoverable(cell, card, c, () => cellTip(f, r, c));
            cell.addEventListener('focus', () => { setRoving(card, cell); hoverCol(card, c); tipAt(cell, cellTip(f, r, c)); });
            cell.addEventListener('blur', () => { hoverCol(card, null); kit.tip.hide(); });
            cell.addEventListener('click', (e) => { if (e.target.closest('a')) return; select(f, r, c, false); });
            rEl.append(cell);
            return cell;
          });
          card.rows.push(rEl);
          card.cells.push(cells);
          tab.append(rEl);
        });
        const srow = h('div', { class: 'lk-row lk-srow', role: 'row' }, h('span', { class: 'lk-corner', role: 'rowheader', title: 'column sum' }, 'Σ'));
        CN.forEach((c, ci) => {
          const sc = h('div', { class: 'lk-sum', role: 'gridcell', dataset: { c: String(ci) } });
          hoverable(sc, card, ci, () => sumTip(f, ci));
          card.sums.push(sc);
          srow.append(sc);
        });
        tab.append(srow);
        const ring = h('div', { class: 'lk-ring', 'aria-hidden': 'true' });
        tab.append(ring);
        tab.addEventListener('keydown', (e) => {
          const cell = e.target.closest && e.target.closest('.lk-cell');
          if (!cell) return;
          let r = +cell.dataset.r, c = +cell.dataset.c;
          switch (e.key) {
            case 'ArrowUp': r = Math.max(0, r - 1); break;
            case 'ArrowDown': r = Math.min(K - 1, r + 1); break;
            case 'ArrowLeft': c = Math.max(0, c - 1); break;
            case 'ArrowRight': c = Math.min(2, c + 1); break;
            case 'Home': c = 0; break;
            case 'End': c = 2; break;
            case 'Enter': case ' ': e.preventDefault(); select(f, r, c, false); return;
            default: return;
          }
          e.preventDefault();
          card.cells[r][c].focus();
        });
        const foot = h('div', { class: 'lk-foot' });
        const cardEl = h('article', { class: 'panel lk-card', 'aria-label': `${META[f].name} likelihood table` },
          h('div', { class: 'lk-chead' }, h('h4', {}, META[f].name, h('span', { class: 'mono' }, `${f} · K = ${K}`)), youChip),
          h('p', { class: 'lk-what' }, META[f].what),
          tab, foot);
        Object.assign(card, { el: cardEl, tab, ring, youChip, foot, ping: false });
        card.cells[0][0].setAttribute('tabindex', '0');
        cards[f] = card;
        grid.append(cardEl);
      });

      function setRoving(card, cell) {
        for (const row of card.cells) for (const c of row) if (c !== cell && c.getAttribute('tabindex') === '0') c.setAttribute('tabindex', '-1');
        cell.setAttribute('tabindex', '0');
      }

      function paintAll() {
        for (const f of FEATS) {
          const card = cards[f];
          T[f].forEach((row, r) => row.p.forEach((p, c) => {
            const cell = card.cells[r][c], m = mixOf(p);
            cell.style.backgroundColor = `color-mix(in srgb, var(--accent) ${m.toFixed(1)}%, var(--surface))`;
            const ink = m >= INK_SWITCH ? 'var(--accent-ink)' : 'var(--ink)';
            cell.style.color = ink;
            const z = cell.querySelector('.lk-z');
            if (z) z.style.color = m >= INK_SWITCH ? 'var(--accent-ink)' : '';
          }));
        }
      }
      function writeAllText(animated) {
        const count = ui.view === 'count';
        for (const f of FEATS) {
          const card = cards[f];
          T[f].forEach((row, r) => row.counts.forEach((n, c) => {
            const v = card.cells[r][c].__v;
            if (count && animated && !kit.reducedMotion()) { v.__pwbVal = 0; kit.countTo(v, n, fmt.int, 520); }
            else { v.__pwbCancel && v.__pwbCancel(); v.__pwbVal = count ? n : undefined; v.textContent = count ? fmt.int(n) : cp(row.p[c]); }
          }));
          CN.forEach((_, c) => {
            const sc = card.sums[c];
            if (count) {
              const tot = sum(T[f].map((row) => row.counts[c]));
              if (animated && !kit.reducedMotion()) { sc.__pwbVal = 0; kit.countTo(sc, tot, fmt.int, 520); } else sc.textContent = fmt.int(tot);
            } else {
              sc.__pwbCancel && sc.__pwbCancel();
              const s = sum(T[f].map((row) => row.p[c]));
              if (animated && !kit.reducedMotion()) { sc.__pwbVal = 0; kit.countTo(sc, s, (x) => fmt.fixed(x, 4), 520); } else sc.textContent = fmt.fixed(s, 4);
            }
          });
        }
      }
      paintAll();
      writeAllText(false);

      el.append(h('figure', { class: 'fig' }, grid,
        h('p', { class: 'cap', html: `<b>Conditional probability P(f | C)</b>Nine likelihood tables, one per feature, all with α = ${esc(A_TXT)}. Each column is the distribution of one feature inside one class, so its Σ row reads 1.0000. Shade shows the probability. The outlined row is where your password lands. Hatched cells had a raw count of 0, so their value comes only from smoothing. Hover a cell for its counts and formula; click it, or press Enter, to open it below.` })));

      // ---------- your password through the nine tables ----------
      const fPw = h('code', { class: 'lk-pw' });
      const fLop = h('p', { class: 'muted' });
      const axisEl = h('div', { class: 'lk-axis', 'aria-hidden': 'true' });
      const fRows = {};
      const fList = h('div', { role: 'list' });
      const fHead = h('div', { class: 'lk-frow lk-fhead', 'aria-hidden': 'true' },
        h('span', { class: 'eyebrow' }, 'feature = your value'),
        h('div', { class: 'lk-bar' }, h('span', {}), axisEl, h('span', {})),
        h('span', { class: 'eyebrow' }, 'highest under'));
      FEATS.forEach((f) => {
        const val = h('span', { class: 'lk-fval' });
        const bars = CN.map((c, ci) => {
          const fill = h('i');
          const track = h('span', { class: 'lk-track' }, fill);
          const num = h('span', { class: 'num' });
          const line = h('div', { class: `lk-bar ${kit.cls.className(ci)}` }, h('span', {}, c), track, num);
          return { line, fill, track, num };
        });
        const who = h('span', { class: 'who' });
        const how = h('span', { class: 'faint' });
        const rowEl = h('div', { class: 'lk-frow', role: 'listitem' },
          h('div', { class: 'lk-fname' }, h('b', {}, META[f].name), h('span', { class: 'mono' }, f), val),
          h('div', { class: 'lk-bars' }, bars.map((b) => b.line)),
          h('div', { class: 'lk-fav' }, who, how));
        fRows[f] = { rowEl, val, bars, who, how, last: null };
        fList.append(rowEl);
      });
      const fWins = h('div', { class: 'row' });
      const fProd = h('div', { class: 'row' });
      const fSay = h('p', { class: 'muted' });
      const fBarNote = h('span', { class: 'faint' });
      const focusPanel = h('div', { class: 'panel' },
        h('div', { class: 'lk-ftop' },
          h('div', { class: 'between' }, h('h3', {}, 'Your password, one row from each table'), fBarNote),
          h('p', {}, 'Your password ', fPw, ' picks one row in each of the nine tables. These are its three values per row, the likelihoods P(f = your value | C).'),
          fLop),
        fHead, fList,
        h('div', { class: 'lk-ftot' },
          h('div', { class: 'row' }, h('span', { class: 'eyebrow' }, 'Highest value, counted'), fWins),
          h('div', { class: 'row' }, h('span', { class: 'eyebrow', html: `All nine multiplied, ${kit.tex('\\prod_j P(f_j \\mid C)')}` }), fProd),
          fSay));
      el.append(h('figure', { class: 'fig' }, focusPanel,
        h('p', { class: 'cap', html: `<b>Likelihood P(f = v | C)</b>For a fixed password, each table gives three numbers, one per class. Under the naive independence assumption the likelihood of the whole password is the product of the nine, P(x | C) = &prod;<sub>j</sub> P(f<sub>j</sub> | C). The prior joins in the <a href="#multiply">Multiply</a> section.` })));

      function drawAxis() {
        const ticks = ui.shade === 'log'
          ? [LOG_LO, Math.round(LOG_LO * 2 / 3), Math.round(LOG_LO / 3), 0].filter((v, i, a) => a.indexOf(v) === i).map((e) => [Math.pow(10, e), e === 0 ? '1' : `10${kit.sup(e)}`])
          : [[0, '0'], [0.5, '0.5'], [1, '1']];
        kit.replace(axisEl, ...ticks.map(([v, t]) => h('span', { style: { left: `${(100 * barT(v)).toFixed(2)}%` } }, t)));
        fBarNote.textContent = ui.shade === 'log' ? `bar length: log scale, 10${kit.sup(LOG_LO)} to 1` : 'bar length: linear, 0 to 1';
      }
      const barT = (p) => (ui.shade === 'log' ? Math.max(0, Math.min(1, (Math.log10(Math.max(p, 1e-300)) - LOG_LO) / -LOG_LO)) : p);

      function updateFocus(scaleOnly) {
        if (!cur) return;
        drawAxis();
        const ex = cur.ex;
        for (const st of ex.steps) {
          const R = fRows[st.feature];
          const top = argmax(st.lik), low = argmin(st.lik);
          st.lik.forEach((p, c) => {
            const b = R.bars[c];
            b.fill.style.width = `${(100 * barT(p)).toFixed(3)}%`;
            b.line.classList.toggle('top', c === top);
            if (!scaleOnly) kit.countTo(b.num, Math.log(p), (v) => cp(Math.exp(v)), 420);
          });
          if (scaleOnly) continue;
          R.val.textContent = `= ${lvLabel(st.feature, st.value)}`;
          const ratio = st.lik[top] / st.lik[low];
          kit.replace(R.who, h('span', { class: `swatch ${kit.cls.className(top)}`, 'aria-hidden': 'true' }), CN[top]);
          R.how.textContent = ratio < 1.1 ? `almost a tie (×${ratioTxt(ratio)} vs ${CN[low]})` : `×${ratioTxt(ratio)} vs ${CN[low]}`;
        }
        if (scaleOnly) return;
        fPw.textContent = kit.showPw(cur.password);

        // most lopsided feature for this password
        let best = null;
        for (const st of ex.steps) {
          const ratio = Math.max(...st.lik) / Math.min(...st.lik);
          if (!best || ratio > best.ratio) best = { st, ratio };
        }
        const bs = best.st, bt = argmax(bs.lik), bl = argmin(bs.lik);
        kit.replace(fLop, 'Most lopsided row: ', h('b', {}, `${META[bs.feature].name} = ${lvLabel(bs.feature, bs.value)}`),
          `. It is ${fmt.prob(bs.lik[bt])} under ${CN[bt]} and ${fmt.prob(bs.lik[bl])} under ${CN[bl]}, a ratio of ${ratioTxt(best.ratio)} to 1.`,
          bs.counts[bl] === 0 ? ` The ${CN[bl]} value is a smoothed zero.` : '');

        // count of "highest" per class, and the product of the nine
        const wins = [0, 0, 0];
        const logL = [0, 0, 0];
        for (const st of ex.steps) { wins[argmax(st.lik)] += 1; st.lik.forEach((p, c) => { logL[c] += Math.log(p); }); }
        const bestP = argmax(logL);
        kit.replace(fWins, ...CN.map((c, ci) => h('span', { class: `chip ${kit.cls.className(ci)}` },
          h('span', { class: 'swatch', 'aria-hidden': 'true' }), `${c} `, h('b', {}, String(wins[ci])))));
        kit.replace(fProd, ...CN.map((c, ci) => h('span', { class: `chip ${kit.cls.className(ci)}${ci === bestP ? ' on' : ''}` },
          h('span', { class: 'swatch', 'aria-hidden': 'true' }), `${c} `, h('b', {}, fmt.sci(Math.exp(logL[ci]), 3)), ci === bestP ? ' largest' : '')));
        const mw = Math.max(...wins);
        const leaders = CN.filter((_, i) => wins[i] === mw);
        let say;
        if (leaders.length === 1 && leaders[0] === CN[bestP]) {
          say = `${CN[bestP]} has the most highest values and also the largest product.`;
        } else if (leaders.length === 1) {
          say = `${leaders[0]} has the most highest values (${mw} of ${FEATS.length}). ${CN[bestP]} has the largest product, and the product is what the model uses. One tiny value can sink a whole column.`;
        } else {
          say = `${leaders.join(' and ')} tie on highest values. ${CN[bestP]} has the largest product, and the product is what the model uses.`;
        }
        kit.replace(fSay, say, ' Naive Bayes multiplies the nine values for each class, then the prior. ', h('a', { href: '#multiply' }, 'See the product.'));
      }

      // ---------- inspector: one cell, opened up ----------
      const iChip = h('span', { class: 'chip on' });
      const iFollow = h('button', { type: 'button', class: 'btn small', id: `${ID}-follow`, 'aria-pressed': 'true', onClick: () => { sel.auto = true; syncAuto(); } }, 'Follow my password');
      const iHint = h('p', { class: 'faint', style: { fontSize: 'var(--fs-sm)' } });
      const iFormula = h('div', { class: 'formula', 'aria-live': 'polite' });
      const iText = h('p', {});
      const iRaw = h('p', { class: 'muted' });
      const iSplit = h('div', { class: 'lk-split' });
      const iRowSum = h('p', { class: 'lk-rowsum' });
      const inspector = h('div', { class: 'panel' },
        h('div', { class: 'lk-ihead' }, h('div', { class: 'row' }, h('h3', {}, 'Inside one cell'), iChip), iFollow),
        iHint,
        h('div', { class: 'lk-ibody' },
          h('div', { class: 'lk-itext' }, iFormula, iText, iRaw),
          h('div', { class: 'stack' },
            h('div', { class: 'eyebrow' }, 'The cell is one slice of its column'),
            iSplit, iRowSum)));
      el.append(h('figure', { class: 'fig' }, inspector,
        h('p', { class: 'cap', html: '<b>Conditional probability as a share</b>Each bar is one class, cut into its levels. Every bar is full because each column adds to 1. The highlighted slice is the opened level, and its width is the cell value. Click a slice to open it. Smoothing (a Dirichlet prior with α = 1) is why no slice is exactly empty: <a href="#smoothing">see Smoothing</a>.' })));

      const split = { f: null, lines: [] };
      function buildSplit(f) {
        split.f = f;
        split.lines = CN.map((c, ci) => {
          const segs = T[f].map((row, r) => {
            const sg = h('div', { class: `lk-seg${row.counts[ci] === 0 ? ' is-zero' : ''}`, '--g': String(row.p[ci]) });
            sg.addEventListener('pointerenter', (e) => kit.tip.show(cellTip(f, r, ci), e));
            sg.addEventListener('pointermove', (e) => kit.tip.move(e));
            sg.addEventListener('pointerleave', () => kit.tip.hide());
            sg.addEventListener('click', () => select(f, r, ci, false));
            return sg;
          });
          const bar = h('div', { class: 'lk-sbar', role: 'img' }, segs);
          const num = h('span', { class: 'num' });
          const line = h('div', { class: 'lk-sline' },
            h('span', { class: 'who' }, h('span', { class: `swatch ${kit.cls.className(ci)}`, 'aria-hidden': 'true' }), c), bar, num);
          return { line, bar, segs, num };
        });
        kit.replace(iSplit, ...split.lines.map((l) => l.line));
      }
      let barW = 0;
      function labelSegs() {
        if (!split.f) return;
        const f = split.f;
        if (!barW && split.lines.length) barW = split.lines[0].bar.clientWidth; // measured once per resize
        split.lines.forEach((L, ci) => {
          const w = barW;
          T[f].forEach((row, r) => {
            const sg = L.segs[r];
            const px = row.p[ci] * Math.max(0, w - 2 * (T[f].length - 1));
            const txt = row.level;
            sg.textContent = px >= txt.length * 6.2 + 8 ? txt : '';
          });
        });
      }

      function select(f, r, c, auto) {
        const changed = !(sel.f === f && sel.r === r && sel.c === c);
        sel = { f, r, c, auto };
        syncAuto(true);
        if (changed || !split.f) renderInspector();
        if (!auto && !kit.reducedMotion()) {
          inspector.classList.remove('lk-flash');
          void inspector.offsetWidth;
          inspector.classList.add('lk-flash');
        }
      }
      function syncAuto(skipPick) {
        iFollow.setAttribute('aria-pressed', String(sel.auto));
        iHint.textContent = sel.auto
          ? 'Showing the most lopsided cell for your password: the lowest value in its most lopsided row. Click any cell above to open it here.'
          : 'Showing the cell you picked. Press Follow my password to go back to the live cell.';
        if (!skipPick && sel.auto && cur) { const pk = autoPick(cur.ex); select(pk.f, pk.r, pk.c, true); }
      }
      function autoPick(ex) {
        let best = null;
        for (const st of ex.steps) {
          const ratio = Math.max(...st.lik) / Math.min(...st.lik);
          if (!best || ratio > best.ratio) best = { f: st.feature, r: levelIndex(st.feature, st.value), c: argmin(st.lik), ratio };
        }
        return best;
      }
      let selCell = null;
      function renderInspector() {
        const { f, r, c } = sel;
        const row = T[f][r], n = row.counts[c], nC = classN[c], K = T[f].length, p = row.p[c];
        const lv = row.level;
        if (selCell) selCell.classList.remove('is-sel');
        selCell = cards[f].cells[r][c];
        selCell.classList.add('is-sel');
        iChip.className = `chip on ${kit.cls.className(c)}`;
        iChip.textContent = `${f} = ${lv} | ${CN[c]}`;
        iFormula.innerHTML = kit.tex(`\\begin{aligned} P(\\text{${texEsc(f)}} = ${texLevel(lv)} \\mid \\text{${CN[c]}}) &= \\frac{n_{v,C} + \\alpha}{n_C + \\alpha K} \\\\ &= \\frac{${texInt(n)} + ${A_TXT}}{${texInt(nC)} + ${A_TXT} \\cdot ${K}} = ${texNum(p)} \\end{aligned}`, true);
        const what = `${f} = ${lvLabel(f, lv)}`;
        if (n === 0) {
          kit.replace(iText, `None of the ${fmt.int(nC)} ${CN[c]} passwords in the training data has ${what}. So the raw share is 0.`);
          kit.replace(iRaw, `A single 0 would make the whole product for ${CN[c]} equal 0, whatever the other ${FEATS.length - 1} features say. Smoothing adds α = ${A_TXT} to each of the K = ${K} levels, so the table stores ${A_TXT} / ${fmt.int(nC + ALPHA * K)} = ${fmt.prob(p)} instead. `,
            h('a', { href: '#smoothing' }, 'How smoothing works.'));
        } else {
          kit.replace(iText, `Of the ${fmt.int(nC)} ${CN[c]} passwords in the training data, ${fmt.int(n)} have ${what}. That is a raw share of ${fmt.int(n)} / ${fmt.int(nC)} = ${fmt.prob(n / nC)}.`);
          const d = p - n / nC;
          kit.replace(iRaw, `Smoothing adds α = ${A_TXT} to each of the K = ${K} levels, which gives ${fmt.prob(p)}. With this many passwords the change is tiny (${d >= 0 ? '+' : '−'}${fmt.sci(Math.abs(d), 2)}).`);
        }
        if (split.f !== f) buildSplit(f);
        split.lines.forEach((L, ci) => {
          L.line.classList.toggle('on', ci === c);
          L.line.classList.toggle('dim', ci !== c);
          L.segs.forEach((sg, rr) => sg.classList.toggle('on', rr === r));
          L.num.textContent = cp(T[f][r].p[ci]);
          L.bar.setAttribute('aria-label', `${CN[ci]}: ${T[f].map((x) => `${x.level} ${fmt.prob(x.p[ci])}`).join(', ')}`);
        });
        labelSegs();
        const s = sum(row.p);
        kit.replace(iRowSum, `Across the row ${what}: ${row.p.map(cp).join(' + ')} = `, h('b', {}, fmt.fixed(s, 4)),
          '. That number has no meaning. Each value is a share of a different class, so only the columns add to 1.');
      }
      kit.responsive(iSplit, () => { barW = 0; labelSegs(); });

      // ---------- live update ----------
      let rowGeom = null; // row offsets per feature, measured once per resize instead of on every keystroke
      function placeRings() {
        if (!rowGeom) rowGeom = Object.fromEntries(FEATS.map((f) => [f, cards[f].rows.map((row) => [row.offsetTop, row.offsetHeight])]));
        const pos = FEATS.map((f) => (cards[f].cur >= 0 ? rowGeom[f][cards[f].cur] : null));
        FEATS.forEach((f, i) => {
          const card = cards[f];
          if (!pos[i]) return;
          card.ring.style.transform = `translateY(${pos[i][0] - 3}px)`;
          card.ring.style.height = `${pos[i][1] + 6}px`;
          card.ring.classList.add('on');
        });
      }
      let ringsReady = false;
      function updateTables(ex) {
        for (const st of ex.steps) {
          const f = st.feature, card = cards[f];
          const r = levelIndex(f, st.value);
          const moved = card.cur !== r;
          if (moved) {
            if (card.cur >= 0) card.rows[card.cur].classList.remove('is-cur');
            card.rows[r].classList.add('is-cur');
            card.cur = r;
            curRow[f] = r;
            if (ringsReady && !kit.reducedMotion()) {
              card.ping = !card.ping;
              card.ring.classList.remove('ping-a', 'ping-b');
              card.ring.classList.add(card.ping ? 'ping-a' : 'ping-b');
            }
          }
          const top = argmax(st.lik), low = argmin(st.lik);
          card.youChip.className = `chip on lk-you ${kit.cls.className(top)}`;
          card.youChip.textContent = `you: ${lvLabel(f, st.value)}`;
          const ratio = st.lik[top] / st.lik[low];
          kit.replace(card.foot, h('span', { class: `swatch ${kit.cls.className(top)}`, 'aria-hidden': 'true' }),
            'highest under ', h('b', {}, CN[top]), h('span', { class: 'faint' }, ` · ×${ratioTxt(ratio)} vs ${CN[low]}`));
        }
        placeRings();
        if (!ringsReady) {
          ringsReady = true;
          requestAnimationFrame(() => FEATS.forEach((f) => cards[f].ring.classList.add('ready')));
        }
      }

      let tracksReady = false;
      store.subscribe((st) => {
        cur = st;
        updateTables(st.ex);
        updateFocus(false);
        if (!tracksReady) {
          tracksReady = true;
          requestAnimationFrame(() => FEATS.forEach((f) => fRows[f].bars.forEach((b) => b.track.classList.add('ready'))));
        }
        if (sel.auto) {
          const pk = autoPick(st.ex);
          select(pk.f, pk.r, pk.c, true);
        }
      }, ID);
      if (!store.get()) renderInspector();

      kit.responsive(grid, () => { rowGeom = null; placeRings(); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { rowGeom = null; barW = 0; placeRings(); labelSegs(); });

      const retheme = () => { calibrate(); paintAll(); };
      window.addEventListener('pwb-theme', retheme);
      try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', retheme); } catch (e) { /* old browsers */ }
    },
  });
})();
