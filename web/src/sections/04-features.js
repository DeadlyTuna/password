/* Section 04: feature extraction. A password becomes nine features (four binned counts,
 * four binary attack patterns, one Markov bin). Every number shown is read from `data`
 * or computed live with `E`. */
(function () {
  'use strict';
  const ID = 'features';

  PWB.register({
    id: ID,
    order: 40,
    nav: 'Features',
    kicker: 'Feature extraction',
    title: 'Turning characters into evidence',
    lede: 'Every password becomes nine features: four counts sorted into bins, four yes-or-no attack patterns and one Markov score.',
    mount(el, ctx) {
      const { E, kit, data, store, h, fmt } = ctx;
      const d3 = window.d3;
      const CLS = E.CLASSES;
      const FEATS = E.FEATURES;
      const NB = data.nb;
      const dur = (ms) => (kit.reducedMotion() ? 0 : ms);
      const esc = kit.escape;
      const argmax = (a) => a.indexOf(Math.max(...a));
      const shown = (c) => (c === ' ' ? '␣' : c);
      const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
      const MAXT = 64; // tiles / strip characters drawn before "+N more"

      // Same character tests as engine.js (used only for display: tooltips, highlights).
      const RE_DIGIT = /\p{Nd}/u;
      const RE_UPPER = /\p{Uppercase}/u;
      const RE_ALNUM = /[\p{L}\p{N}]/u;
      const RE_NL = /[\n\r\u2028\u2029]/;
      const JUNK = '(?:[^\\p{L}\\p{N}_]|\\p{Nd}|_)+';
      const RE_HEAD = new RegExp(`^${JUNK}`, 'u');
      const RE_TAIL = new RegExp(`${JUNK}$`, 'u');
      const RE_EDGE = new RegExp(`^${JUNK}|${JUNK}$`, 'gu');

      // Cached, password-independent data.
      const COMMON = new Set(data.lex.common);
      const SORTED = data.lex.common.slice().sort();
      const LEET = data.lex.leet;
      const LEET_KEYS = Object.keys(LEET);
      const RUNS = data.lex.runs;
      const RUN_NAME = {
        abcdefghijklmnopqrstuvwxyz: 'the alphabet', '0123456789': 'the digits', '1234567890': 'the number row',
        qwertyuiop: 'the top letter row', asdfghjkl: 'the home row', zxcvbnm: 'the bottom row',
      };
      const SEQ3 = new Set();
      for (const r of RUNS) for (const v of [r, E.cps(r).reverse().join('')]) {
        const a = E.cps(v);
        for (let i = 0; i + 3 <= a.length; i++) SEQ3.add(a.slice(i, i + 3).join(''));
      }
      const BINF = FEATS.filter((f) => data.bins[f]);
      const RV = {
        length: { sym: 'L', name: 'Length', what: 'characters' },
        n_digit: { sym: 'D', name: 'Digits', what: 'digits' },
        n_upper: { sym: 'U', name: 'Uppercase', what: 'uppercase letters' },
        n_special: { sym: 'S', name: 'Symbols', what: 'symbols (not a letter or digit)' },
      };
      const CC = [
        { key: 'lower', label: 'lowercase', glyph: 'a' },
        { key: 'upper', label: 'uppercase', glyph: 'A' },
        { key: 'digit', label: 'digit', glyph: '0' },
        { key: 'symbol', label: 'symbol', glyph: '#' },
        { key: 'letter', label: 'other letter', glyph: 'ℓ' },
      ];
      const CCX = Object.fromEntries(CC.map((c) => [c.key, c]));
      const kindName = (k) => (k === 'cat' ? 'binned' : 'binary');
      const trainingWith = (f, level) => NB.counts[f].counts[NB.counts[f].levels.indexOf(level)];

      // ---------- small helpers ----------
      // Restart a CSS "flash" animation without forcing layout: alternate two identical keyframes.
      const flash = (node) => {
        if (!node || kit.reducedMotion()) return;
        const a = node.classList.contains('fx-a');
        node.classList.toggle('fx-a', !a);
        node.classList.toggle('fx-b', a);
      };
      const attachTip = (node, htmlFn, focusable) => {
        kit.tip.attach(node, htmlFn);
        if (!focusable) return;
        node.addEventListener('focus', () => {
          const r = node.getBoundingClientRect();
          kit.tip.show(htmlFn(), { clientX: r.left + r.width / 2, clientY: r.bottom });
        });
        node.addEventListener('blur', () => kit.tip.hide());
      };
      const key = (ci) => `<i class="f-key" style="background:${kit.cls.color(ci)}"></i>`;
      const barPath = (x, yb, w, hh, r = 2.5) => {
        if (!(hh > 0.4) || !(w > 0)) return '';
        const rr = Math.min(r, w / 2, hh);
        const yt = yb - hh;
        return `M${x},${yb}V${yt + rr}Q${x},${yt} ${x + rr},${yt}H${x + w - rr}Q${x + w},${yt} ${x + w},${yt + rr}V${yb}Z`;
      };
      const eventText = (sym, lo, hi) => {
        if (!isFinite(hi)) return `${sym} ≥ ${lo}`;
        const top = hi - 1;
        if (lo === top) return `${sym} = ${lo}`;
        if (lo === 0) return `${sym} ≤ ${top}`;
        return `${lo} ≤ ${sym} ≤ ${top}`;
      };
      const ratioText = (r) => (!isFinite(r) ? '∞' : r < 10 ? `×${r.toFixed(2)}` : r < 1e5 ? `×${fmt.int(r)}` : `×${fmt.sci(r, 2)}`);
      const lowerBound = (arr, t) => {
        let lo = 0, hi = arr.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid] < t) lo = mid + 1; else hi = mid; }
        return lo;
      };
      const posText = (start, len) => (len === 1 ? `position ${start + 1}` : `positions ${start + 1}–${start + len}`);

      // Character strip (one span per code point), joined by index so highlights glide.
      function drawStrip(node, chars, mark, cut) {
        const list = chars.slice(0, MAXT);
        const sel = d3.select(node).selectAll('span.f-sc').data(list);
        sel.exit().remove();
        sel.enter().append('span').attr('class', 'f-sc').merge(sel)
          .text((c) => shown(c))
          .classed('m', (c, i) => !!(mark && mark.has(i)))
          .classed('cut', (c, i) => !!(cut && cut.has(i)));
        let more = node.querySelector('.f-more');
        if (chars.length > MAXT) {
          if (!more) more = node.appendChild(h('span', { class: 'f-more faint' }));
          more.textContent = ` +${chars.length - MAXT} more`;
        } else if (more) more.remove();
      }

      // Pattern matches as code-point positions (mirrors the engine's regexes).
      function yearMatches(a) {
        const out = [];
        for (let i = 0; i + 4 <= a.length; i++) {
          const p = a[i] + a[i + 1];
          if ((p === '19' || p === '20') && RE_DIGIT.test(a[i + 2]) && RE_DIGIT.test(a[i + 3])) out.push({ start: i, len: 4, text: a.slice(i, i + 4).join('') });
        }
        return out;
      }
      function repeatRuns(a) {
        const out = [];
        let i = 0;
        while (i < a.length) {
          let j = i + 1;
          while (j < a.length && a[j] === a[i]) j++;
          if (j - i >= 3 && !RE_NL.test(a[i])) out.push({ start: i, len: j - i, text: a.slice(i, j).join('') });
          i = j;
        }
        return out;
      }
      function runOf(g) {
        for (const r of RUNS) {
          const i = r.indexOf(g);
          if (i >= 0) return { run: r, start: i, dir: 'forwards' };
          const rev = E.cps(r).reverse().join('');
          const j = rev.indexOf(g);
          if (j >= 0) return { run: r, start: E.cps(r).length - j - 3, dir: 'backwards' };
        }
        return null;
      }
      const spanSet = (matches) => {
        const set = new Set();
        for (const m of matches) for (let k = 0; k < m.len; k++) set.add(m.start + k);
        return set;
      };

      // ---------- DOM ----------
      const style = h('style', {}, CSS);

      // Input + presets
      const input = h('input', {
        id: `${ID}-pw`, type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off',
        placeholder: 'type a password',
      });
      input.addEventListener('input', () => store.set(input.value));
      const PRESETS = [
        ['Summer2026!', 'common base word and a year'],
        ['P@ssw0rd', 'leetspeak'],
        ['qwerty123', 'keyboard run, exact match'],
        ['Dragon1987', 'base word, year and a run'],
        ['zzz1999abc', 'triple, year and a run'],
        ['😀😀😀 ok', 'emoji count as symbols'],
        ['kq7#Vx!9mZ@2kLp$', 'random, no patterns'],
      ];
      const sampleNote = h('p', { class: 'f-samplenote faint', 'aria-live': 'polite' });
      const SAMPLES = Object.entries(data.eda.samples).flatMap(([lv, arr]) => arr.map((pw) => ({ lv, pw })));
      const levelToClass = (lv) => {
        const k = Object.keys(data.meta.levels).find((x) => data.meta.levels[x] === lv);
        return k === undefined ? null : CLS[data.meta.level_to_class[k]];
      };
      const randomBtn = h('button', {
        class: 'btn small', type: 'button', id: `${ID}-random`,
        onClick: () => {
          if (!SAMPLES.length) return;
          const pick = SAMPLES[Math.floor(Math.random() * SAMPLES.length)];
          store.set(pick.pw);
          const c = levelToClass(pick.lv);
          sampleNote.textContent = `That one is a PWLDS “${pick.lv.replace('_', ' ')}” training password${c ? `, so its true class is ${c}` : ''}.`;
        },
      }, 'Random training password');
      const top = h('div', { class: 'f-top' },
        h('div', { class: 'field f-input' },
          h('label', { for: `${ID}-pw` }, 'Password to take apart'), input),
        h('div', { class: 'f-presets row' },
          h('span', { class: 'eyebrow' }, 'Try'),
          PRESETS.map(([pw, why], i) => h('button', {
            class: 'btn small mono', type: 'button', id: `${ID}-try-${i}`, title: why,
            onClick: () => { sampleNote.textContent = ''; store.set(pw); },
          }, kit.showPw(pw))),
          randomBtn),
        sampleNote);

      const targets = {}; // feature -> element to scroll to
      function jump(f) {
        const t = targets[f];
        if (!t) return;
        t.scrollIntoView({ behavior: kit.reducedMotion() ? 'auto' : 'smooth', block: 'center' });
        flash(t);
      }

      // ===== Figure A: tiles -> feature vector =====
      const tiles = h('div', { class: 'f-tiles', role: 'list', 'aria-label': 'Characters of the password, one tile each' });
      const tilesMore = h('p', { class: 'faint f-tmore' });
      const tilesEmpty = h('p', { class: 'faint f-empty' }, 'Type a password to see its characters.');
      const legendN = {};
      const legend = h('div', { class: 'row f-legend', 'aria-label': 'Character types and how many of each' },
        CC.map((c) => {
          const n = h('b', { class: 'num' }, '0');
          const item = h('span', { class: `chip f-lg t-${c.key}`, title: c.key === 'letter' ? 'A letter or number that is neither upper- nor lowercase, such as 中' : null },
            h('span', { class: 'f-lgsw', 'aria-hidden': 'true' }, c.glyph), c.label, n);
          legendN[c.key] = { n, item };
          return item;
        }));
      const vecCells = {};
      const vec = h('div', { class: 'f-vec' }, FEATS.map((f) => {
        const val = h('span', { class: 'f-vv' }, '–');
        const fav = h('span', { class: 'f-vf' }, '');
        const b = h('button', { class: 'f-vc', type: 'button', id: `${ID}-vec-${f}`, onClick: () => jump(f) },
          h('span', { class: 'f-vn' }, f), val, fav);
        vecCells[f] = { b, val, fav, last: null };
        return b;
      }));
      const figA = h('figure', { class: 'fig' },
        h('div', { class: 'panel stack' },
          h('div', { class: 'panel-title' }, h('h3', {}, 'Each character gets a type'),
            h('span', { class: 'faint f-small' }, 'hover a tile for details')),
          tiles, tilesMore, tilesEmpty, legend,
          h('div', { class: 'f-arrow', 'aria-hidden': 'true' }, '↓ counted, binned and matched ↓'),
          h('div', { class: 'between f-vechead' },
            h('span', { class: 'eyebrow' }, 'Feature vector ', kit.texEl('x = (f_1, \\dots, f_9)')),
            h('span', { class: 'faint f-small' }, 'each cell says which class its value points to; click one to see how it is computed')),
          vec),
        h('p', { class: 'cap', html: '<b>Random variables</b>Pick a password at random and every value computed from it is random too. ' +
          'The nine entries of x are the random variables the classifier reads. Each is a function of the characters above and nothing else.' }));

      // ===== Figure B: bin rulers =====
      const rulers = BINF.map(makeRuler);
      const spW = trainingWith('sp_bin', NB.counts.sp_bin.levels[0]);
      const iW = CLS.indexOf('Weak');
      const spNote = spW && spW[iW] === NB.class_n[iW]
        ? `Every one of the ${fmt.int(NB.class_n[iW])} Weak training passwords has S = 0.`
        : spW ? `${fmt.pct(spW[iW] / NB.class_n[iW])} of Weak training passwords have S = 0.` : '';
      const figB = h('figure', { class: 'fig' },
        h('div', { class: 'panel stack' },
          h('div', { class: 'panel-title' }, h('h3', {}, 'Four counts, four rulers'),
            h('span', { class: 'row f-small faint' }, 'bars: P(bin | C) for ',
              CLS.map((c, ci) => h('span', { class: `f-lk ${kit.cls.className(ci)}` }, h('span', { class: 'swatch' }), ` ${c}`)))),
          h('p', { class: 'muted f-small' }, 'The marker slides to the count. The classifier keeps only the bin it lands in, so 10 and 11 characters look the same to it.'),
          rulers.map((r) => r.root),
          spNote ? h('p', { class: 'note f-note' }, spNote) : null),
        h('p', { class: 'cap', html: '<b>Random variables and events</b>L, D, U and S are discrete random variables. ' +
          'Binning turns each one into a few events, such as {10 ≤ L ≤ 11}, and the model learns the conditional probability P(event | C) of each in every class. ' +
          'The small bars under each bin are those probabilities from the training counts. The bin this password lands in is lit.' }));

      // ===== Figure C: pattern detectors =====
      const det = {
        has_seq: makeDetector('has_seq', 'Keyboard or alphabet run',
          [`Three characters in a row from one of these runs, forwards or backwards (after lowercasing): `,
            RUNS.map((r) => h('code', {}, r)).flatMap((c, i) => (i ? [' ', c] : [c])),
            `. That is ${fmt.int(SEQ3.size)} three-character runs.`]),
        has_repeat: makeDetector('has_repeat', 'Triple repeat',
          ['The same character three times in a row: ', h('code', {}, '(.)\\1\\1'), '.']),
        has_year: makeDetector('has_year', 'Year',
          ['19 or 20 followed by two more digits: ', h('code', {}, '(19|20)\\d\\d'), '.']),
      };
      const pipe = makePipeline();
      const figC = h('figure', { class: 'fig' },
        h('div', { class: 'grid-auto f-dets' }, det.has_seq.card, det.has_repeat.card, det.has_year.card),
        pipe.root,
        h('p', { class: 'cap', html: '<b>Events</b>Each flag is the indicator of an event: 1 if the password contains a run, a triple, a year or a common word, 0 if not. ' +
          'An indicator is a Bernoulli random variable, so each class needs one number, P(flag = 1 | C), and P(flag = 0 | C) is one minus it. ' +
          'For is_common the event is a union of three events, and the check stops at the first one that happens.' }));

      // ===== Figure D: continuous values =====
      const lenBig = h('span', { class: 'f-big' }, '0');
      const lenBin = h('b', { class: 'mono' }, '');
      const urBig = h('span', { class: 'f-big' }, '0');
      const urFrac = h('span', { class: 'mono' }, '');
      const urFill = h('span', { class: 'f-urfill' });
      const urChips = h('div', { class: 'f-uchips', 'aria-label': 'Distinct characters with how often each appears' });
      const figD = h('figure', { class: 'fig' },
        h('div', { class: 'grid-2' },
          h('div', { class: 'panel stack f-cont' },
            h('div', { class: 'between' }, h('h4', { class: 'mono' }, 'length'), h('span', { class: 'chip' }, 'not used directly')),
            h('div', { class: 'row f-bigrow' }, lenBig, h('span', { class: 'muted' }, 'characters')),
            h('p', { class: 'f-small muted' }, 'Counted in Unicode code points, so an emoji is one character. The classifier sees only its bin: ',
              h('button', { class: 'f-tlink mono', type: 'button', id: `${ID}-cont-len`, onClick: () => jump('len_bin') }, 'len_bin'), ' = ', lenBin, '.')),
          h('div', { class: 'panel stack f-cont' },
            h('div', { class: 'between' }, h('h4', { class: 'mono' }, 'unique_ratio'), h('span', { class: 'chip' }, 'not used')),
            h('div', { class: 'row f-bigrow' }, urBig, urFrac),
            h('div', { class: 'f-urtrack', role: 'presentation' }, urFill),
            kit.texEl('\\text{unique\\_ratio} = \\frac{|\\,\\text{distinct characters}\\,|}{|\\,\\text{all characters}\\,|}', true),
            urChips)),
        h('p', { class: 'cap', html: '<b>Continuous vs categorical</b>This naive Bayes stores a table of counts for each feature, so every feature must take one of a few values. ' +
          'Length reaches the model only through len_bin, and unique_ratio is not used at all. A Gaussian naive Bayes could use both; this one does not.' }));

      // ===== Figure E: mk_bin =====
      const mk = makeMk();
      const figE = h('figure', { class: 'fig' }, mk.root,
        h('p', { class: 'cap', html: '<b>Quantiles</b>The two cut points are the tertiles of the training scores, so each bin is an event with probability about one third in the training set ' +
          `(${mk.shares}). The curves show how the score is spread within each class.` }));

      // ===== Figure F: summary table =====
      const table = makeTable();
      const figF = h('figure', { class: 'fig' }, table.root,
        h('p', { class: 'cap', html: `<b>Random variables and events</b>Each row is a random variable fᵢ and the event {fᵢ = value} this password produced. ` +
          `The three numbers are the conditional probabilities P(fᵢ = value | C), smoothed with α = ${NB.alpha}: (n + α) / (n<sub>C</sub> + αK), where K is the number of values (see <a href="#smoothing">Smoothing</a>). ` +
          'Naive Bayes multiplies one column per class with the prior (see <a href="#multiply">Multiply</a>).' }));

      el.append(style,
        h('p', { class: 'f-intro' }, 'The classifier never reads the password as text. It reads nine values computed from it, each one a value it saw many times in training. Type below or try one of these.'),
        top, figA, figB, figC, figD, figE, figF);

      // ---------- builders ----------
      function makeRuler(f) {
        const spec = data.bins[f];
        const rv = RV[spec.source] || { sym: 'X', name: spec.source, what: '' };
        const edges = spec.edges.map((e) => (e === null ? Infinity : e));
        const finite = edges.filter((e) => isFinite(e));
        const lastFin = finite[finite.length - 1];
        const cap = lastFin + Math.max(3, Math.ceil(lastFin / 4)); // drawn cells 0..cap-1; the last bin runs on to ∞
        const tbl = E.table(f);
        const K = spec.labels.length;
        const bins = spec.labels.map((label, i) => ({ i, label, lo: edges[i], hi: edges[i + 1], row: tbl.find((r) => r.level === label) }));
        const countEl = h('b', { class: 'num' }, '0');
        const chipVal = h('b', {}, '–');
        const evEl = h('span', { class: 'mono f-rev' }, '');
        const head = h('div', { class: 'f-rhead' },
          h('div', { class: 'f-rl' }, h('span', { class: 'f-rname' }, rv.name), h('span', { class: 'mono f-req' }, `${rv.sym} = `, countEl)),
          h('div', { class: 'f-rr' }, h('span', { class: 'chip on mono' }, `${f} = `, chipVal), evEl));
        const svgWrap = h('div', { class: 'f-rsvg' });
        const root = h('div', { class: 'f-ruler', dataset: { feat: f } }, head, svgWrap);
        targets[f] = root;
        const svg = d3.select(svgWrap).append('svg').attr('role', 'img')
          .attr('aria-label', `Ruler for ${rv.name.toLowerCase()} with bins ${spec.labels.join(', ')}`);
        const H = 120;
        let geom = null;
        const cur = { count: 0, idx: 0 };
        let binEls = [];
        let mkG = null, mkText = null;

        const binTip = (b) => `<b>${esc(f)} = ${esc(b.label)}</b> · event {${esc(eventText(rv.sym, b.lo, b.hi))}}<br>` +
          CLS.map((c, ci) => `${key(ci)}P(bin | ${c}) = <b>${fmt.prob(b.row.p[ci])}</b> · (${fmt.int(b.row.counts[ci])} + ${NB.alpha}) / (${fmt.int(NB.class_n[ci])} + ${NB.alpha}·${K})`).join('<br>');

        function draw(W) {
          const ml = 6, mr = 28;
          const x = d3.scaleLinear().domain([0, cap]).range([ml, W - mr]);
          const cw = x(1) - x(0);
          const yBand = 26, hBand = 26, yAxis = 58, yLab = 72, yBase = 114, hBar = 32;
          svg.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
          svg.selectAll('*').remove();
          binEls = [];
          // axis + ticks
          const ax = svg.append('g').attr('class', 'f-axis');
          ax.append('line').attr('x1', x(0)).attr('x2', x(cap) + 12).attr('y1', yAxis).attr('y2', yAxis);
          ax.append('path').attr('class', 'f-arrowhead').attr('d', `M${x(cap) + 12},${yAxis - 3.5}L${x(cap) + 18},${yAxis}L${x(cap) + 12},${yAxis + 3.5}Z`);
          const starts = new Set(bins.map((b) => b.lo));
          for (let v = 0; v < cap; v++) {
            const xc = x(v + 0.5);
            const major = starts.has(v);
            ax.append('line').attr('x1', xc).attr('x2', xc).attr('y1', yAxis).attr('y2', yAxis - (major ? 6 : 3)).classed('major', major);
            if (major || cw >= 17) ax.append('text').attr('class', `chart-text f-tick${major ? ' major' : ''}`).attr('x', xc).attr('y', yLab).text(v);
          }
          ax.append('text').attr('class', 'chart-text f-tick major').attr('x', x(cap) + 15).attr('y', yLab).text('∞');
          // bins
          bins.forEach((b) => {
            const x0 = x(b.lo) + 1;
            const x1 = (isFinite(b.hi) ? x(Math.min(b.hi, cap)) : x(cap)) - 1;
            const bw = Math.max(1, x1 - x0);
            const g = svg.append('g').attr('class', 'f-bin');
            const rect = g.append('rect').attr('class', 'rb').attr('x', x0).attr('y', yBand).attr('width', bw).attr('height', hBand).attr('rx', 3);
            const fits = b.label.length * 6.2 + 6 <= bw;
            const txt = g.append('text').attr('class', 'rb-t').attr('x', x0 + bw / 2).attr('y', yBand + hBand / 2 + 3.6).text(fits ? b.label : '');
            g.append('line').attr('class', 'f-bl').attr('x1', x0).attr('x2', x1).attr('y1', yBase).attr('y2', yBase);
            const gap = 2;
            const bwBar = Math.max(2, Math.min(12, (bw - 2 * gap - 4) / 3));
            const gx = x0 + (bw - (3 * bwBar + 2 * gap)) / 2;
            const bars = CLS.map((c, ci) => g.append('path').attr('class', 'mb')
              .attr('d', barPath(gx + ci * (bwBar + gap), yBase, bwBar, b.row.p[ci] * hBar))
              .style('fill', kit.cls.color(ci)));
            const hit = g.append('rect').attr('class', 'f-hit').attr('x', x0 - 1).attr('y', yBand - 2)
              .attr('width', bw + 2).attr('height', yBase - yBand + 4).attr('tabindex', 0)
              .attr('aria-label', `${f} = ${b.label}, event ${eventText(rv.sym, b.lo, b.hi)}. ` +
                CLS.map((c, ci) => `P given ${c} ${fmt.prob(b.row.p[ci])}`).join(', '));
            attachTip(hit.node(), () => binTip(b), true);
            binEls.push({ rect, txt, bars });
          });
          // marker
          mkG = svg.append('g').attr('class', 'f-marker');
          mkG.append('line').attr('x1', 0).attr('x2', 0).attr('y1', 20).attr('y2', yBand + hBand + 2);
          mkG.append('path').attr('d', 'M-6,12L6,12L0,21Z');
          mkText = mkG.append('text').attr('class', 'f-mtext').attr('x', 0).attr('y', 9);
          geom = { x, cap };
          setActive();
          place(false);
        }
        function setActive() {
          binEls.forEach((b, i) => {
            const on = i === cur.idx;
            b.rect.classed('on', on);
            b.txt.classed('on', on);
            b.bars.forEach((p) => p.classed('on', on));
          });
        }
        function place(anim) {
          if (!geom || !mkG) return;
          const v = Math.min(cur.count, geom.cap - 1);
          const xm = geom.x(v + 0.5);
          mkText.text(cur.count >= geom.cap ? `${cur.count} →` : String(cur.count));
          mkG.interrupt();
          if (anim) mkG.transition().duration(dur(420)).ease(d3.easeCubicOut).attr('transform', `translate(${xm},0)`);
          else mkG.attr('transform', `translate(${xm},0)`);
        }
        kit.responsive(svgWrap, draw);
        return {
          f, root,
          update(count, value) {
            let idx = spec.labels.indexOf(value);
            if (idx < 0) idx = E.binIndex(f, count);
            const changed = idx !== cur.idx;
            cur.count = count;
            cur.idx = idx;
            kit.countTo(countEl, count, (v) => String(Math.round(v)), dur(350));
            chipVal.textContent = value;
            const b = bins[idx];
            evEl.textContent = b ? `event {${eventText(rv.sym, b.lo, b.hi)}}` : '';
            setActive();
            place(true);
            if (changed) flash(head);
          },
        };
      }

      function makeDetector(f, title, rule) {
        const flag = h('span', { class: 'chip f-flag' }, '');
        const strip = h('div', { class: 'f-strip', 'aria-hidden': 'true' });
        const found = h('div', { class: 'f-found' });
        const extra = h('div', { class: 'f-extra' });
        const n1 = trainingWith(f, '1');
        const card = h('div', { class: 'panel stack f-det', dataset: { feat: f } },
          h('div', { class: 'between f-dhead' },
            h('div', { class: 'f-dtitle' }, h('h4', {}, title), h('span', { class: 'mono faint f-small' }, f)), flag),
          h('p', { class: 'f-small muted f-rule' }, rule),
          strip, found, extra,
          n1 ? h('p', { class: 'f-train f-small faint' }, 'In training: ',
            CLS.map((c, ci) => h('span', { class: `f-tc ${kit.cls.className(ci)}` }, h('span', { class: 'swatch' }),
              ` ${c} ${fmt.int(n1[ci])} of ${fmt.int(NB.class_n[ci])}`))) : null);
        targets[f] = card;
        return { card, flag, strip, found, extra, last: null };
      }
      function setFlag(d, on) {
        d.flag.textContent = on ? '= 1 · found' : '= 0 · not found';
        d.flag.classList.toggle('bad', !!on);
        if (d.last !== null && d.last !== on) flash(d.card);
        d.last = on;
      }

      function makePipeline() {
        const steps = [];
        const ol = h('ol', { class: 'f-pipe' });
        const step = (title, desc) => {
          const out = h('div', { class: 'f-out' });
          const li = h('li', { class: 'f-step' },
            h('span', { class: 'f-badge', 'aria-hidden': 'true' }, String(steps.length + 1)),
            h('div', { class: 'f-sbody' }, h('div', { class: 'f-stitle' }, title), desc ? h('p', { class: 'f-sdesc muted' }, desc) : null, out));
          ol.append(li);
          steps.push(li);
          return out;
        };
        const o1 = step('Lowercase', 'Case does not matter for the lookup.');
        const s1 = o1.appendChild(h('div', { class: 'f-strip', 'aria-hidden': 'true' }));
        const t1 = o1.appendChild(h('p', { class: 'f-small faint' }));
        const o2 = step('Strip the ends', 'Remove digits, symbols and underscores from the start and the end. What is left is the base word.');
        const s2 = o2.appendChild(h('div', { class: 'f-strip', 'aria-hidden': 'true' }));
        const t2 = o2.appendChild(h('p', { class: 'f-small faint' }));
        const o3 = step('Undo leetspeak', 'Swap each look-alike character back to its letter.');
        const ruleEls = {};
        o3.appendChild(h('div', { class: 'row f-leet' }, LEET_KEYS.map((k) => {
          const n = h('b', { class: 'num' }, '');
          ruleEls[k] = { chip: h('span', { class: 'chip f-leetchip' }, h('span', { class: 'mono' }, `${shown(k)} → ${LEET[k]}`), n), n };
          return ruleEls[k].chip;
        })));
        const s3 = o3.appendChild(h('div', { class: 'f-strip', 'aria-hidden': 'true' }));
        const t3 = o3.appendChild(h('p', { class: 'f-small faint' }));
        const o4 = step('Look it up', `Check three candidates, in this order, against the list of ${fmt.int(data.meta.common_list_size)} common passwords. The first hit wins.`);
        const candEls = ['The lowercase password', 'The lowercase password with leetspeak undone', 'The base word (needs at least 4 characters)'].map((label) => {
          const word = h('span', { class: 'mono f-cword' });
          const st = h('span', { class: 'chip f-cst' });
          const row = h('div', { class: 'f-cand' }, h('span', { class: 'f-clabel f-small muted' }, label), word, st);
          return { row, word, st };
        });
        o4.appendChild(h('div', { class: 'f-cands' }, candEls.map((c) => c.row)));
        const dictHead = h('p', { class: 'f-small faint' });
        const dictList = h('ol', { class: 'f-dict', 'aria-label': 'Alphabetical neighbours in the common list' });
        o4.appendChild(h('div', { class: 'f-dictbox' }, dictHead, dictList));
        const o5 = step('Result');
        const resFlag = h('span', { class: 'chip f-flag' });
        const resText = h('span', { class: 'f-small' });
        o5.appendChild(h('div', { class: 'row' }, h('span', { class: 'mono' }, 'is_common'), resFlag, resText));
        const replay = h('button', { class: 'btn small', type: 'button', id: `${ID}-replay`, onClick: () => pulse() }, 'Replay the steps');
        const n1 = trainingWith('is_common', '1');
        const root = h('div', { class: 'panel stack f-pipepanel', dataset: { feat: 'is_common' } },
          h('div', { class: 'between f-dhead' },
            h('div', { class: 'f-dtitle' }, h('h4', {}, 'Common password'), h('span', { class: 'mono faint f-small' }, 'is_common')),
            h('div', { class: 'row' }, replay)),
          ol,
          n1 ? h('p', { class: 'f-train f-small faint' }, 'In training: ',
            CLS.map((c, ci) => h('span', { class: `f-tc ${kit.cls.className(ci)}` }, h('span', { class: 'swatch' }),
              ` ${c} ${fmt.int(n1[ci])} of ${fmt.int(NB.class_n[ci])}`))) : null);
        targets.is_common = root;

        let timers = [];
        function pulse() {
          timers.forEach(clearTimeout);
          timers = [];
          if (kit.reducedMotion()) return;
          steps.forEach((li, i) => timers.push(setTimeout(() => {
            const a = li.classList.contains('p-a');
            li.classList.toggle('p-a', !a);
            li.classList.toggle('p-b', a);
          }, i * 170)));
        }
        const pulseSoon = kit.debounce(pulse, 320);
        let last = null;

        function update(pw, ex) {
          const chars = ex.chars;
          const low = pw.toLowerCase();
          const lowA = E.cps(low);
          // 1. lowercase
          const changed = new Set();
          if (lowA.length === chars.length) lowA.forEach((c, i) => { if (c !== chars[i]) changed.add(i); });
          drawStrip(s1, lowA, changed);
          t1.textContent = pw === '' ? '' : changed.size ? `${changed.size} character${changed.size === 1 ? '' : 's'} lowered.` : 'Already lowercase.';
          // 2. strip the ends
          const hm = low.match(RE_HEAD);
          const head = hm ? hm[0] : '';
          const rest = low.slice(head.length);
          const tm = rest.match(RE_TAIL);
          const tail = tm ? tm[0] : '';
          let core = rest.slice(0, rest.length - tail.length);
          if (core !== low.replace(RE_EDGE, '')) core = low.replace(RE_EDGE, '');
          const hn = E.cps(head).length, tn = E.cps(tail).length;
          const cut = new Set();
          for (let i = 0; i < lowA.length; i++) if (i < hn || i >= lowA.length - tn) cut.add(i);
          drawStrip(s2, lowA, null, cut);
          t2.textContent = pw === '' ? '' : cut.size
            ? `Removed ${[hn ? `“${head}” at the start` : '', tn ? `“${tail}” at the end` : ''].filter(Boolean).join(' and ')}.`
            : 'Nothing to strip.';
          // 3. undo leetspeak on the base word
          const coreA = E.cps(core);
          const subs = new Set();
          const used = {};
          const baseA = coreA.map((c, i) => {
            if (has(LEET, c)) { subs.add(i); used[c] = (used[c] || 0) + 1; return LEET[c]; }
            return c;
          });
          let base = baseA.join('');
          let baseShow = baseA;
          if (base !== ex.baseWord) { base = ex.baseWord; baseShow = E.cps(base); subs.clear(); }
          for (const k of LEET_KEYS) {
            const n = used[k] || 0;
            ruleEls[k].chip.classList.toggle('on', n > 0);
            ruleEls[k].n.textContent = n ? `×${n}` : '';
          }
          drawStrip(s3, baseShow, subs);
          t3.textContent = pw === '' ? '' : subs.size ? `${subs.size} swap${subs.size === 1 ? '' : 's'}. Base word: “${base}”.` : `No swaps. Base word: “${base}”.`;
          // 4. look up
          const dl = E.deleet(low);
          const baseOk = E.cps(base).length >= 4;
          const cands = [
            { word: low, hit: COMMON.has(low), ok: true, via: 'exact' },
            { word: dl, hit: COMMON.has(dl), ok: true, via: 'deleet' },
            { word: base, hit: baseOk && COMMON.has(base), ok: baseOk, via: 'base' },
          ];
          let won = -1;
          cands.forEach((c, i) => {
            const e = candEls[i];
            e.word.textContent = c.word === '' ? '(empty)' : kit.showPw(c.word);
            let txt, cl = '';
            if (won >= 0) { txt = 'not checked'; cl = 'skip'; }
            else if (!c.ok) { txt = 'too short'; cl = 'skip'; }
            else if (c.hit) { txt = 'on the list'; cl = 'bad'; won = i; }
            else { txt = 'not on the list'; }
            e.st.textContent = txt;
            e.st.className = `chip f-cst ${cl}`;
            e.row.classList.toggle('won', won === i);
            e.row.classList.toggle('skip', cl === 'skip');
          });
          // dictionary window around the candidate that hit (else the base word, else the lowercase password)
          const target = won >= 0 ? cands[won].word : baseOk ? base : low;
          if (target === '') {
            dictHead.textContent = 'Type something to look it up.';
            kit.replace(dictList);
          } else {
            const at = lowerBound(SORTED, target);
            const hit = SORTED[at] === target;
            dictHead.textContent = hit ? `“${target}” in the alphabetical list:` : `Where “${target}” would sit in the alphabetical list (it is not there):`;
            const rows = [];
            for (let k = Math.max(0, at - 2); k < at; k++) rows.push(h('li', {}, SORTED[k]));
            if (hit) rows.push(h('li', { class: 'hit' }, SORTED[at], h('span', { class: 'f-small' }, '  ← match')));
            else rows.push(h('li', { class: 'gap' }, `▸ ${target}`));
            for (let k = hit ? at + 1 : at; k < Math.min(SORTED.length, (hit ? at + 1 : at) + 2); k++) rows.push(h('li', {}, SORTED[k]));
            kit.replace(dictList, rows);
          }
          // 5. result (always the engine's verdict)
          const cm = ex.common;
          resFlag.textContent = cm.hit ? '= 1' : '= 0';
          resFlag.classList.toggle('bad', cm.hit);
          resText.textContent = cm.hit
            ? { exact: `The lowercase password “${cm.word}” is on the list.`, deleet: `With leetspeak undone it reads “${cm.word}”, which is on the list.`, base: `Its base word “${cm.word}” is on the list.` }[cm.via]
            : 'None of the three candidates is on the list.';
          if (last !== null && last !== pw) pulseSoon();
          if (last !== null && (last === '' ? false : COMMON) && resFlag.__v !== undefined && resFlag.__v !== cm.hit) flash(root);
          resFlag.__v = cm.hit;
          last = pw;
        }
        return { root, update };
      }

      function makeMk() {
        const H0 = data.eda.mk_hist;
        const edges = data.mk.edges;
        const labels = data.mk.labels;
        const first = H0[CLS[0]].edges;
        const X0 = first[0], X1 = first[first.length - 1];
        const series = CLS.map((c) => {
          const hst = H0[c];
          const tot = hst.counts.reduce((a, b) => a + b, 0) || 1;
          return hst.counts.map((n, j) => {
            const lo = hst.edges[j], hi = hst.edges[j + 1];
            return { lo, hi, x: (lo + hi) / 2, share: n / tot, dens: n / tot / (hi - lo) };
          });
        });
        const ymax = Math.max(...series.flat().map((d) => d.dens)) * 1.08 || 1;
        const regions = labels.map((lab, i) => ({ lab, lo: i === 0 ? X0 : edges[i - 1], hi: i === labels.length - 1 ? X1 : edges[i] }));
        // training share of each mk_bin level (pooled over classes)
        const mkC = NB.counts.mk_bin;
        const totN = NB.class_n.reduce((a, b) => a + b, 0);
        const shares = labels.map((lab) => {
          const r = mkC.counts[mkC.levels.indexOf(lab)];
          return r ? `${lab} ${fmt.pct(r.reduce((a, b) => a + b, 0) / totN)}` : `${lab} ?`;
        }).join(', ');

        const scoreEl = h('b', { class: 'num' }, '0');
        const binVal = h('b', {}, '–');
        const detail = h('p', { class: 'f-small muted' });
        const wrap = h('div', { class: 'f-mkchart' });
        const root = h('div', { class: 'panel stack', dataset: { feat: 'mk_bin' } },
          h('div', { class: 'panel-title' }, h('h3', {}, 'One Markov score, cut into thirds'),
            h('span', { class: 'row f-small faint' }, CLS.map((c, ci) => h('span', { class: `f-lk ${kit.cls.className(ci)}` }, h('span', { class: 'f-linekey' }), ` ${c}`)))),
          h('div', { class: 'between' },
            h('div', { class: 'row' }, h('span', { class: 'mono' }, 'mk_score = '), scoreEl, h('span', { class: 'muted f-small' }, 'nats per character')),
            h('span', { class: 'chip on mono' }, 'mk_bin = ', binVal)),
          kit.texEl('\\text{mk\\_score} = \\frac{1}{n+1}\\sum_{i=1}^{n+1} \\ln P(c_i \\mid c_{i-2}\\,c_{i-1})', true),
          detail,
          wrap,
          h('p', { class: 'f-small muted' }, 'Scores near 0 mean the chain found each next character easy to predict, so High means predictable. ',
            h('a', { href: '#markov' }, 'See the chain score every character →')));
        targets.mk_bin = root;

        const svg = d3.select(wrap).append('svg').attr('role', 'img')
          .attr('aria-label', 'Distribution of the Markov score in each class with the two tertile cut points');
        let geom = null;
        let cur = { score: 0, bin: null };
        let parts = {};
        function draw(W) {
          const Hc = W < 480 ? 180 : 210;
          const m = { l: 8, r: 10, t: 22, b: 30 };
          const x = d3.scaleLinear().domain([X0, X1]).range([m.l, W - m.r]);
          const y = d3.scaleLinear().domain([0, ymax]).range([Hc - m.b, m.t]);
          svg.attr('viewBox', `0 0 ${W} ${Hc}`).attr('width', W).attr('height', Hc);
          svg.selectAll('*').remove();
          parts = {};
          parts.regs = regions.map((r) => {
            const g = svg.append('g');
            const rect = g.append('rect').attr('class', 'f-reg').attr('x', x(r.lo)).attr('y', m.t).attr('width', Math.max(0, x(r.hi) - x(r.lo))).attr('height', Hc - m.b - m.t);
            const t = g.append('text').attr('class', 'chart-text f-regt').attr('x', (x(r.lo) + x(r.hi)) / 2).attr('y', m.t - 8).text(r.lab);
            return { rect, t, lab: r.lab };
          });
          svg.append('g').attr('class', 'ax').attr('transform', `translate(0,${Hc - m.b})`)
            .call(d3.axisBottom(x).ticks(W < 420 ? 5 : 10).tickFormat((d) => (Number.isInteger(d) ? fmt.signed(d, 0) : fmt.signed(d, 1))).tickSizeOuter(0));
          svg.append('text').attr('class', 'chart-text').attr('x', W - m.r).attr('y', Hc - 2).attr('text-anchor', 'end').text('nats/char');
          series.forEach((ser, ci) => {
            const area = d3.area().x((d) => x(d.x)).y0(y(0)).y1((d) => y(d.dens)).curve(d3.curveMonotoneX);
            const line = d3.line().x((d) => x(d.x)).y((d) => y(d.dens)).curve(d3.curveMonotoneX);
            svg.append('path').attr('d', area(ser)).style('fill', kit.cls.color(ci)).style('opacity', 0.1);
            svg.append('path').attr('class', 'f-mkline').attr('d', line(ser)).style('stroke', kit.cls.color(ci));
          });
          edges.forEach((e) => {
            svg.append('line').attr('class', 'f-edge').attr('x1', x(e)).attr('x2', x(e)).attr('y1', m.t).attr('y2', Hc - m.b);
            svg.append('text').attr('class', 'chart-text f-edget').attr('x', x(e) + 4).attr('y', m.t + 11).text(fmt.signed(e, 2));
          });
          const cross = svg.append('line').attr('class', 'f-cross').attr('y1', m.t).attr('y2', Hc - m.b).style('opacity', 0);
          const you = svg.append('g').attr('class', 'f-you');
          you.append('line').attr('y1', m.t + 16).attr('y2', Hc - m.b);
          you.append('circle').attr('cy', m.t + 16).attr('r', 4.5);
          const youT = you.append('text').attr('class', 'f-yout').attr('y', m.t + 32);
          const ov = svg.append('rect').attr('class', 'f-hit').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', Hc - m.b - m.t);
          const ovNode = ov.node();
          const binAt = (evt) => {
            const [px] = d3.pointer(evt, svg.node());
            const v = x.invert(px);
            const step = (X1 - X0) / series[0].length;
            return Math.max(0, Math.min(series[0].length - 1, Math.floor((v - X0) / step)));
          };
          const tipHtml = (j) => {
            const d0 = series[0][j];
            return `<b>${fmt.signed(d0.lo, 2)} to ${fmt.signed(d0.hi, 2)} nats/char</b><br>` +
              CLS.map((c, ci) => `${key(ci)}<b>${fmt.pct(series[ci][j].share, 2)}</b> of ${c} passwords`).join('<br>');
          };
          ovNode.addEventListener('pointermove', (evt) => {
            const j = binAt(evt);
            cross.attr('x1', x(series[0][j].x)).attr('x2', x(series[0][j].x)).style('opacity', 1);
            kit.tip.show(tipHtml(j), evt);
          });
          ovNode.addEventListener('pointerleave', () => { cross.style('opacity', 0); kit.tip.hide(); });
          geom = { x, W };
          parts.you = you;
          parts.youT = youT;
          paint(false);
        }
        function paint(anim) {
          if (!geom) return;
          (parts.regs || []).forEach((r) => {
            r.rect.classed('on', r.lab === cur.bin);
            r.t.classed('on', r.lab === cur.bin);
          });
          const sc = Math.max(X0, Math.min(X1, cur.score));
          const xm = geom.x(sc);
          const right = xm > geom.W * 0.62;
          const off = cur.score < X0 ? ' (off the left edge)' : cur.score > X1 ? ' (off the right edge)' : '';
          parts.youT.attr('text-anchor', right ? 'end' : 'start').attr('x', right ? -8 : 8).text(`this password${off}`);
          parts.you.interrupt();
          if (anim) parts.you.transition().duration(dur(420)).ease(d3.easeCubicOut).attr('transform', `translate(${xm},0)`);
          else parts.you.attr('transform', `translate(${xm},0)`);
        }
        kit.responsive(wrap, draw);
        let lastBin = null;
        return {
          root, shares,
          update(ex) {
            const f = ex.features;
            cur = { score: f.mk_score, bin: f.mk_bin };
            kit.countTo(scoreEl, f.mk_score, (v) => fmt.signed(v, 2), dur(350));
            binVal.textContent = f.mk_bin;
            const steps = ex.chars.length + 1;
            detail.textContent = `ln P(password) = ${fmt.signed(f.log_prob, 2)} nats over ${steps} step${steps === 1 ? '' : 's'} (each character plus the end mark), so ${fmt.signed(f.log_prob, 2)} / ${steps} = ${fmt.signed(f.mk_score, 2)}.`;
            paint(true);
            if (lastBin !== null && lastBin !== f.mk_bin) flash(root);
            lastBin = f.mk_bin;
          },
        };
      }

      function makeTable() {
        let view = 'p';
        const segP = h('button', { type: 'button', id: `${ID}-view-p`, 'aria-pressed': 'true' }, 'P(value | C)');
        const segN = h('button', { type: 'button', id: `${ID}-view-n`, 'aria-pressed': 'false' }, 'counts n');
        const thP = CLS.map((c, ci) => h('th', { class: kit.cls.className(ci) }, h('span', { class: 'swatch' }), ` ${c}`));
        const rows = {};
        const tbody = h('tbody');
        let curSteps = {};
        for (const f of FEATS) {
          const btn = h('button', { class: 'f-tlink mono', type: 'button', id: `${ID}-row-${f}`, onClick: () => jump(f) }, f);
          const tdVal = h('td', { class: 'f-tval' });
          const tdKind = h('td', { class: 'f-tkind' });
          const tdP = CLS.map(() => h('td', { class: 'f-tp' }));
          const tdFav = h('td', { class: 'f-tfav' });
          const tdRat = h('td', { class: 'f-trat' });
          const tr = h('tr', {}, h('td', {}, btn), tdVal, tdKind, tdP, tdFav, tdRat);
          tdP.forEach((td, ci) => attachTip(td, () => pTip(f, ci)));
          rows[f] = { tr, tdVal, tdKind, tdP, tdFav, tdRat, last: null };
          tbody.append(tr);
        }
        const nNote = h('p', { class: 'f-small faint' });
        function pTip(f, ci) {
          const st = curSteps[f];
          if (!st) return '';
          const K = NB.counts[f].levels.length;
          const a = curAlpha;
          return `<b>P(${esc(f)} = ${esc(st.value)} | ${CLS[ci]}) = ${fmt.prob(st.lik[ci])}</b><br>` +
            `(${fmt.int(st.counts[ci])} + ${a}) / (${fmt.int(NB.class_n[ci])} + ${a}·${K})<br>` +
            `${fmt.int(st.counts[ci])} of the ${fmt.int(NB.class_n[ci])} ${CLS[ci]} training passwords had this value`;
        }
        let curAlpha = NB.alpha;
        function setView(v) {
          view = v;
          segP.setAttribute('aria-pressed', String(v === 'p'));
          segN.setAttribute('aria-pressed', String(v === 'n'));
          paint();
        }
        segP.addEventListener('click', () => setView('p'));
        segN.addEventListener('click', () => setView('n'));
        function paint() {
          for (const f of FEATS) {
            const st = curSteps[f];
            const r = rows[f];
            if (!st) continue;
            st.lik.forEach((p, ci) => {
              r.tdP[ci].textContent = view === 'p' ? fmt.prob(p) : fmt.int(st.counts[ci]);
            });
          }
          nNote.textContent = view === 'n'
            ? `Raw training counts n for the value, out of ${CLS.map((c, ci) => `${fmt.int(NB.class_n[ci])} ${c}`).join(', ')} passwords.`
            : 'Hover a probability to see the counts behind it.';
        }
        const root = h('div', { class: 'panel stack' },
          h('div', { class: 'panel-title' }, h('h3', {}, 'All nine features for this password'),
            h('div', { class: 'seg', role: 'group', 'aria-label': 'Show probabilities or counts' }, segP, segN)),
          h('div', { class: 'scroll-x' },
            h('table', { class: 'tbl f-tbl' },
              h('thead', {}, h('tr', {}, h('th', {}, 'feature'), h('th', {}, 'value'), h('th', {}, 'kind'), thP,
                h('th', {}, 'favours'), h('th', { title: 'Largest P(value | C) divided by the smallest' }, 'max ÷ min'))),
              tbody)),
          nNote,
          h('p', { class: 'f-small muted' }, '“Favours” is the class with the largest P(value | C). “max ÷ min” says how many times more likely the value is under that class than under the least likely one; near 1 means the feature barely separates the classes.'));
        return {
          root,
          update(ex) {
            curAlpha = ex.alpha;
            curSteps = Object.fromEntries(ex.steps.map((s) => [s.feature, s]));
            for (const f of FEATS) {
              const st = curSteps[f];
              const r = rows[f];
              if (!st) continue;
              const fav = argmax(st.lik);
              r.tdVal.textContent = st.kind === 'bin' ? `${st.value} (${st.value === '1' ? 'yes' : 'no'})` : st.value;
              r.tdKind.textContent = kindName(st.kind);
              r.tdP.forEach((td, ci) => {
                td.classList.toggle('f-fav', ci === fav);
                for (let k = 0; k < CLS.length; k++) td.classList.toggle(kit.cls.className(k), k === fav && ci === fav);
              });
              kit.replace(r.tdFav, h('span', { class: `f-favname ${kit.cls.className(fav)}` }, h('span', { class: 'swatch' }), ` ${CLS[fav]}`));
              const mx = Math.max(...st.lik), mn = Math.min(...st.lik);
              r.tdRat.textContent = ratioText(mx / mn);
              const sig = `${st.value}|${fav}`;
              if (r.last !== null && r.last !== sig) flash(r.tr);
              r.last = sig;
            }
            paint();
          },
        };
      }

      // ---------- live update ----------
      let curMarks = { seq: new Set(), rep: new Set(), year: new Set() };
      let curN = 0;
      function tileTip(d) {
        const c = d.c;
        const cp = c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
        const adds = ['L'];
        if (RE_DIGIT.test(c)) adds.push('D');
        if (RE_UPPER.test(c)) adds.push('U');
        if (!RE_ALNUM.test(c)) adds.push('S');
        const pats = [];
        if (curMarks.seq.has(d.i)) pats.push('a run (has_seq)');
        if (curMarks.rep.has(d.i)) pats.push('a triple (has_repeat)');
        if (curMarks.year.has(d.i)) pats.push('a year (has_year)');
        return `<b>${esc(shown(c))}</b> · U+${cp} · ${esc(CCX[d.k] ? CCX[d.k].label : d.k)}<br>position ${d.i + 1} of ${curN}<br>adds 1 to ${adds.join(', ')}` +
          (pats.length ? `<br>part of ${pats.join(', ')}` : '');
      }

      function drawTiles(chars) {
        const list = chars.slice(0, MAXT).map((c, i) => ({ c, i, k: E.charClass(c) }));
        const sel = d3.select(tiles).selectAll('div.f-tile:not(.gone)').data(list, (d) => d.i);
        sel.exit().classed('gone', true).interrupt().transition().duration(dur(170))
          .style('opacity', 0).style('transform', 'scale(0.4)').remove();
        const ent = sel.enter().append('div').attr('class', 'f-tile pop').attr('role', 'listitem');
        ent.each(function () {
          this.append(h('span', { class: 'f-ix' }), h('span', { class: 'f-ch' }), h('span', { class: 'f-gl', 'aria-hidden': 'true' }));
          const node = this;
          kit.tip.attach(node, () => tileTip(node.__data__));
        });
        ent.merge(sel).each(function (d) {
          for (const c of CC) this.classList.toggle(`t-${c.key}`, c.key === d.k);
          const [ix, ch, gl] = this.children;
          ix.textContent = String(d.i + 1);
          ch.textContent = shown(d.c);
          gl.textContent = CCX[d.k] ? CCX[d.k].glyph : '?';
          this.setAttribute('aria-label', `${d.c === ' ' ? 'space' : d.c}, ${CCX[d.k] ? CCX[d.k].label : d.k}`);
          if (this.__pc !== undefined && this.__pc !== d.c) flash(this);
          this.__pc = d.c;
        }).order();
        tilesMore.textContent = chars.length > MAXT ? `+${chars.length - MAXT} more characters not drawn (all are counted).` : '';
        tilesEmpty.hidden = chars.length > 0;
      }

      store.subscribe((st) => {
        const { password: pw, ex } = st;
        const chars = ex.chars;
        const f = ex.features;
        const counts = f._counts;
        curN = chars.length;
        if (document.activeElement !== input && input.value !== pw) input.value = pw;

        // pattern positions (code points) for highlights
        const ym = yearMatches(chars);
        const rr = repeatRuns(chars);
        const lowLen = E.cps(pw.toLowerCase()).length;
        const sq = lowLen === chars.length ? ex.seqs.map((m) => ({ start: m.start, len: 3, text: m.text })) : [];
        curMarks = { seq: spanSet(sq), rep: spanSet(rr), year: spanSet(ym) };

        // A. tiles, legend, vector
        drawTiles(chars);
        const tally = { lower: 0, upper: 0, digit: 0, symbol: 0, letter: 0 };
        for (const c of chars) { const k = E.charClass(c); tally[k] = (tally[k] || 0) + 1; }
        for (const c of CC) {
          kit.countTo(legendN[c.key].n, tally[c.key] || 0, (v) => String(Math.round(v)), dur(300));
          legendN[c.key].item.classList.toggle('zero', !(tally[c.key] > 0));
        }
        for (const s of ex.steps) {
          const cell = vecCells[s.feature];
          if (!cell) continue;
          const fav = argmax(s.lik);
          cell.val.textContent = s.value;
          cell.fav.textContent = `→ ${CLS[fav]}`;
          for (let k = 0; k < CLS.length; k++) cell.b.classList.toggle(kit.cls.className(k), k === fav);
          cell.b.setAttribute('aria-label', `${s.feature} = ${s.value}, points to ${CLS[fav]}. Show how it is computed.`);
          const sig = `${s.value}|${fav}`;
          if (cell.last !== null && cell.last !== sig) flash(cell.b);
          cell.last = sig;
        }

        // B. rulers
        for (const r of rulers) r.update(counts[data.bins[r.f].source], String(f[r.f]));

        // C. detectors
        // has_seq
        setFlag(det.has_seq, f.has_seq === 1);
        drawStrip(det.has_seq.strip, chars, curMarks.seq);
        if (ex.seqs.length) {
          const list = ex.seqs.slice(0, 6).map((m) => `“${m.text}” at ${posText(m.start, 3)}`).join(', ');
          det.has_seq.found.textContent = `Found ${ex.seqs.length}: ${list}${ex.seqs.length > 6 ? ', …' : ''}.`;
          // show each run involved, with the matched windows lit
          const byRun = new Map();
          for (const m of ex.seqs) {
            const r = runOf(m.text);
            if (!r) continue;
            if (!byRun.has(r.run)) byRun.set(r.run, { set: new Set(), dirs: new Set() });
            const e = byRun.get(r.run);
            for (let k = 0; k < 3; k++) e.set.add(r.start + k);
            e.dirs.add(r.dir);
          }
          const blocks = [...byRun.entries()].slice(0, 3).map(([run, e]) => {
            const strip = h('div', { class: 'f-strip f-runstrip', 'aria-hidden': 'true' });
            drawStrip(strip, E.cps(run), e.set);
            return h('div', { class: 'f-run' }, h('span', { class: 'f-small faint' }, `${RUN_NAME[run] || 'run'}, ${[...e.dirs].join(' and ')}`), strip);
          });
          kit.replace(det.has_seq.extra, blocks);
        } else {
          det.has_seq.found.textContent = 'No three-character run found.';
          kit.replace(det.has_seq.extra);
        }
        // has_repeat
        setFlag(det.has_repeat, f.has_repeat === 1);
        drawStrip(det.has_repeat.strip, chars, curMarks.rep);
        det.has_repeat.found.textContent = rr.length
          ? `Found: ${rr.slice(0, 5).map((m) => `“${kit.showPw(m.text)}” (${m.len} in a row) at ${posText(m.start, m.len)}`).join(', ')}${rr.length > 5 ? ', …' : ''}.`
          : 'No character appears three times in a row.';
        // has_year
        setFlag(det.has_year, f.has_year === 1);
        drawStrip(det.has_year.strip, chars, curMarks.year);
        det.has_year.found.textContent = ym.length
          ? `Found: ${ym.slice(0, 5).map((m) => `“${m.text}” at ${posText(m.start, 4)}`).join(', ')}${ym.length > 5 ? ', …' : ''}.`
          : 'No 19xx or 20xx in the password.';
        // is_common
        pipe.update(pw, ex);

        // D. continuous
        kit.countTo(lenBig, f.length, (v) => String(Math.round(v)), dur(350));
        lenBin.textContent = String(f.len_bin);
        const distinct = new Map();
        for (const c of chars) distinct.set(c, (distinct.get(c) || 0) + 1);
        kit.countTo(urBig, f.unique_ratio, (v) => v.toFixed(3), dur(350));
        urFrac.textContent = chars.length ? `= ${distinct.size} / ${chars.length}` : '(empty password)';
        urFill.style.width = `${(100 * f.unique_ratio).toFixed(2)}%`;
        const dl = [...distinct.entries()].slice(0, 48);
        const csel = d3.select(urChips).selectAll('span.f-uc').data(dl, (d) => d[0]);
        csel.exit().remove();
        const cent = csel.enter().append('span').attr('class', 'f-uc pop');
        cent.append('span').attr('class', 'f-ucc');
        cent.append('span').attr('class', 'f-ucn');
        cent.merge(csel).each(function (d) {
          this.children[0].textContent = shown(d[0]);
          this.children[1].textContent = d[1] > 1 ? `×${d[1]}` : '';
          this.classList.toggle('dup', d[1] > 1);
        }).order();

        // E. mk_bin
        mk.update(ex);

        // F. table
        table.update(ex);
      }, ID);
    },
  });

  const CSS = `
#features .f-intro { color: var(--ink-2); }
#features .f-small { font-size: var(--fs-sm); }
#features .f-top { display: grid; gap: 0.75rem; }
#features .f-input { max-width: 26rem; min-width: 0; }
#features .f-input input { width: 100%; font-size: var(--fs-md); padding: 0.6rem 0.8rem; }
#features .f-presets { min-width: 0; }
#features .f-presets .btn { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#features .f-samplenote:empty { display: none; }

/* character tiles */
#features .t-lower { --t: var(--ink-3); }
#features .t-upper { --t: var(--accent); }
#features .t-digit { --t: var(--pencil); }
#features .t-symbol { --t: var(--ink); }
#features .t-letter { --t: color-mix(in srgb, var(--accent) 50%, var(--pencil)); }
#features .f-tiles { display: flex; flex-wrap: wrap; gap: 0.4rem; min-width: 0; }
#features .f-tile {
  position: relative; width: 2.45rem; height: 2.95rem; border-radius: 7px; display: grid; place-items: center;
  background: color-mix(in srgb, var(--t, var(--ink-3)) 13%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--t, var(--ink-3)) 60%, transparent);
  color: var(--ink); font: 600 1.15rem/1 var(--mono); cursor: default;
  transition: background-color .25s var(--ease), border-color .25s var(--ease), color .25s var(--ease);
}
#features .f-tile.t-symbol { background: var(--ink); border-color: var(--ink); color: var(--paper); }
#features .f-tile.t-letter { border-style: dashed; }
#features .f-tile .f-ch { max-width: 100%; overflow: hidden; }
#features .f-tile .f-ix { position: absolute; top: 3px; left: 4px; font: 500 0.56rem/1 var(--mono); color: var(--ink-3); }
#features .f-tile .f-gl { position: absolute; bottom: 3px; right: 4px; font: 600 0.56rem/1 var(--mono); color: var(--ink-2); }
#features .f-tile.t-symbol .f-ix, #features .f-tile.t-symbol .f-gl { color: color-mix(in srgb, var(--paper) 72%, transparent); }
#features .f-tile.pop, #features .f-uc.pop { animation: features-pop .34s var(--ease); }
#features .fx-a { animation: features-fx-a .7s var(--ease); }
#features .fx-b { animation: features-fx-b .7s var(--ease); }
@keyframes features-pop { from { transform: translateY(7px) scale(.72); opacity: .35; } }
@keyframes features-fx-a { 0% { box-shadow: 0 0 0 0 var(--accent); } 35% { box-shadow: 0 0 0 4px var(--accent-soft); } 100% { box-shadow: 0 0 0 0 transparent; } }
@keyframes features-fx-b { 0% { box-shadow: 0 0 0 0 var(--accent); } 35% { box-shadow: 0 0 0 4px var(--accent-soft); } 100% { box-shadow: 0 0 0 0 transparent; } }
#features .f-empty[hidden] { display: none; }
#features .f-tmore:empty { display: none; }
#features .f-legend .f-lg { gap: 0.4rem; }
#features .f-legend .f-lg.zero { opacity: .55; }
#features .f-lgsw {
  display: inline-grid; place-items: center; width: 1.05rem; height: 1.05rem; border-radius: 3px; font: 600 0.6rem/1 var(--mono);
  background: color-mix(in srgb, var(--t) 13%, var(--surface)); border: 1px solid color-mix(in srgb, var(--t) 60%, transparent); color: var(--ink);
}
#features .t-symbol .f-lgsw { background: var(--ink); color: var(--paper); border-color: var(--ink); }
#features .t-letter .f-lgsw { border-style: dashed; }
#features .f-arrow { font: 500 var(--fs-xs) var(--mono); color: var(--ink-3); text-align: center; letter-spacing: .06em; }
#features .f-vechead .eyebrow { display: inline-flex; align-items: baseline; gap: .4rem; text-transform: none; letter-spacing: .04em; }
#features .f-vec { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(7.4rem, 100%), 1fr)); gap: 0.5rem; }
#features .f-vc {
  display: grid; gap: 0.15rem; text-align: left; min-width: 0; padding: 0.5rem 0.6rem; cursor: pointer;
  background: color-mix(in srgb, var(--c, var(--line)) 8%, var(--surface)); color: var(--ink);
  border: 1px solid var(--line); border-left: 4px solid var(--c, var(--line-2)); border-radius: var(--r);
  transition: background-color .3s var(--ease), border-color .3s var(--ease), transform .15s var(--ease);
}
#features .f-vc:hover { transform: translateY(-1px); border-color: var(--line-2); border-left-color: var(--c, var(--line-2)); }
#features .f-vn { font: 500 var(--fs-xs) var(--mono); color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#features .f-vv { font: 700 1.25rem/1.1 var(--display); overflow-wrap: anywhere; }
#features .f-vf { font: 600 var(--fs-xs) var(--mono); color: var(--c-ink, var(--ink-2)); }

/* rulers */
#features .f-ruler { display: grid; gap: 0.2rem; padding: 0.55rem 0.5rem 0.2rem; border-radius: var(--r); min-width: 0; }
#features .f-ruler + .f-ruler { border-top: 1px solid var(--line); }
#features .f-rhead { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 0.3rem 1rem; border-radius: var(--r-sm); }
#features .f-rl, #features .f-rr { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3rem 0.7rem; min-width: 0; }
#features .f-rname { font: 650 var(--fs-md) var(--display); }
#features .f-req { color: var(--ink-2); }
#features .f-req b { color: var(--ink); font-size: 1.1rem; }
#features .f-rev { font-size: var(--fs-xs); color: var(--ink-2); }
#features .f-rsvg { min-width: 0; }
#features .f-rsvg svg { display: block; overflow: visible; }
#features .rb { fill: var(--grid-strong); transition: fill .3s var(--ease); }
#features .rb.on { fill: var(--accent); }
#features .rb-t { fill: var(--ink-2); font: 600 10px var(--mono); text-anchor: middle; pointer-events: none; transition: fill .3s; }
#features .rb-t.on { fill: var(--accent-ink); }
#features .mb { opacity: .28; transition: opacity .35s var(--ease); }
#features .mb.on { opacity: 1; }
#features .f-bl { stroke: var(--line-2); stroke-width: 1; }
#features .f-axis line { stroke: var(--line-2); stroke-width: 1; }
#features .f-axis line.major { stroke: var(--ink-3); }
#features .f-arrowhead { fill: var(--line-2); }
#features .f-tick { text-anchor: middle; font-size: 10px; }
#features .f-tick.major { fill: var(--ink); }
#features .f-hit { fill: transparent; cursor: help; }
#features .f-hit:focus { outline: none; }
#features .f-hit:focus-visible { stroke: var(--accent); stroke-width: 2; }
#features .f-marker line { stroke: var(--ink); stroke-width: 1.5; }
#features .f-marker path { fill: var(--ink); }
#features .f-mtext { fill: var(--ink); font: 700 12px var(--mono); text-anchor: middle; }
#features .f-lk { display: inline-flex; align-items: center; gap: .25rem; }
#features .f-key { display: inline-block; width: 12px; height: 3px; border-radius: 2px; vertical-align: middle; margin-right: 6px; }
#features .f-note { margin-top: .2rem; }

/* detectors */
#features .f-dets { align-items: stretch; }
#features .f-det, #features .f-pipepanel { align-content: start; }
#features .f-dhead { align-items: center; }
#features .f-dtitle { display: grid; gap: 0.1rem; min-width: 0; }
#features .f-flag { font-weight: 600; }
#features .f-rule code { overflow-wrap: anywhere; }
#features .f-strip { display: flex; flex-wrap: wrap; gap: 1px; font: 500 1rem/1.5 var(--mono); min-width: 0; min-height: 1.6rem; }
#features .f-strip:empty::before { content: "(empty)"; color: var(--ink-3); font-size: var(--fs-sm); }
#features .f-sc {
  display: inline-block; min-width: 1.05em; text-align: center; padding: 0 0.08em; border-radius: 3px; color: var(--ink);
  transition: background-color .3s var(--ease), box-shadow .3s var(--ease), color .3s, opacity .3s;
}
#features .f-sc.m { background: color-mix(in srgb, var(--pencil) 22%, transparent); box-shadow: inset 0 -2px 0 var(--pencil); font-weight: 700; }
#features .f-sc.cut { color: var(--ink-3); text-decoration: line-through; opacity: .6; }
#features .f-runstrip { font-size: 0.85rem; }
#features .f-run { display: grid; gap: 0.1rem; }
#features .f-extra { display: grid; gap: 0.4rem; }
#features .f-extra:empty { display: none; }
#features .f-found { font-size: var(--fs-sm); color: var(--ink-2); overflow-wrap: anywhere; }
#features .f-train { display: flex; flex-wrap: wrap; gap: 0.2rem 0.7rem; align-items: center; }
#features .f-tc { white-space: nowrap; }

/* is_common pipeline */
#features .f-pipe { list-style: none; margin: 0; padding: 0; display: grid; }
#features .f-step { display: grid; grid-template-columns: 2.1rem minmax(0, 1fr); gap: 0.85rem; position: relative; padding-bottom: 1.15rem; }
#features .f-step:last-child { padding-bottom: 0; }
#features .f-step:not(:last-child)::before {
  content: ""; position: absolute; left: calc(1.05rem - 1px); top: 2.2rem; bottom: 0.1rem; width: 2px; background: var(--line-2); border-radius: 2px;
}
#features .f-badge {
  width: 2.1rem; height: 2.1rem; border-radius: 50%; display: grid; place-items: center; font: 700 0.9rem var(--mono);
  background: var(--surface); border: 2px solid var(--accent); color: var(--accent);
}
#features .f-step.p-a .f-badge { animation: features-ping-a .75s var(--ease); }
#features .f-step.p-b .f-badge { animation: features-ping-b .75s var(--ease); }
#features .f-step.p-a::before { animation: features-rail-a .75s var(--ease); }
#features .f-step.p-b::before { animation: features-rail-b .75s var(--ease); }
#features .f-step.p-a .f-out { animation: features-out-a .75s var(--ease); }
#features .f-step.p-b .f-out { animation: features-out-b .75s var(--ease); }
@keyframes features-ping-a { 30% { background: var(--accent); color: var(--accent-ink); transform: scale(1.14); } }
@keyframes features-ping-b { 30% { background: var(--accent); color: var(--accent-ink); transform: scale(1.14); } }
@keyframes features-rail-a { 40% { background: var(--accent); } }
@keyframes features-rail-b { 40% { background: var(--accent); } }
@keyframes features-out-a { 30% { background: var(--accent-soft); } }
@keyframes features-out-b { 30% { background: var(--accent-soft); } }
#features .f-sbody { display: grid; gap: 0.3rem; min-width: 0; padding-top: 0.25rem; }
#features .f-stitle { font: 650 var(--fs-md)/1.2 var(--display); }
#features .f-sdesc { font-size: var(--fs-sm); }
#features .f-out { display: grid; gap: 0.35rem; border-radius: var(--r-sm); min-width: 0; }
#features .f-leet { gap: 0.35rem; }
#features .f-leetchip { gap: 0.3rem; }
#features .f-leetchip:not(.on) { opacity: .6; }
#features .f-cands { display: grid; gap: 0.35rem; }
#features .f-cand {
  display: grid; grid-template-columns: minmax(0, 15rem) minmax(0, 1fr) auto; gap: 0.3rem 0.8rem; align-items: center;
  padding: 0.35rem 0.55rem; border: 1px solid var(--line); border-radius: var(--r); transition: background-color .3s, border-color .3s, opacity .3s;
}
#features .f-cand.won { border-color: var(--weak); background: color-mix(in srgb, var(--weak) 8%, transparent); }
#features .f-cand.skip { opacity: .6; }
#features .f-cword { overflow-wrap: anywhere; min-width: 0; }
#features .f-cst.skip { border-style: dashed; }
#features .f-dictbox { display: grid; gap: 0.25rem; }
#features .f-dict {
  list-style: none; margin: 0; padding: 0.3rem 0; display: grid; font: 500 var(--fs-sm)/1.5 var(--mono); max-width: 28rem;
  border-left: 2px solid var(--line-2);
}
#features .f-dict li { padding: 0 0.7rem; color: var(--ink-3); overflow-wrap: anywhere; }
#features .f-dict li.hit { color: var(--weak-ink); font-weight: 700; background: color-mix(in srgb, var(--weak) 10%, transparent); }
#features .f-dict li.gap { color: var(--ink); font-weight: 600; background: var(--accent-soft); }
@media (max-width: 640px) {
  #features .f-cand { grid-template-columns: minmax(0, 1fr) auto; }
  #features .f-clabel { grid-column: 1 / -1; }
}

/* continuous */
#features .f-cont { align-content: start; }
#features .f-bigrow { align-items: baseline; gap: 0.6rem; }
#features .f-big { font: 750 2.6rem/1 var(--display); letter-spacing: -0.02em; }
#features .f-urtrack { height: 8px; border-radius: 4px; background: var(--grid-strong); overflow: hidden; }
#features .f-urfill { display: block; height: 100%; width: 0; background: var(--accent); border-radius: 4px; transition: width .45s var(--ease); }
#features .f-uchips { display: flex; flex-wrap: wrap; gap: 0.3rem; min-width: 0; }
#features .f-uc {
  display: inline-flex; align-items: baseline; gap: 0.15rem; padding: 0.15rem 0.4rem; border-radius: var(--r-sm);
  border: 1px solid var(--line); font: 500 var(--fs-sm) var(--mono); color: var(--ink); background: var(--surface);
}
#features .f-uc.dup { border-color: var(--pencil); background: color-mix(in srgb, var(--pencil) 10%, transparent); }
#features .f-ucn { font-size: var(--fs-xs); color: var(--pencil); font-weight: 700; }

/* mk chart */
#features .f-mkchart { min-width: 0; }
#features .f-mkchart svg { display: block; overflow: visible; }
#features .f-reg { fill: var(--grid); transition: fill .3s var(--ease); }
#features .f-reg.on { fill: var(--accent-soft); }
#features .f-regt { text-anchor: middle; font-weight: 600; }
#features .f-regt.on { fill: var(--accent); }
#features .f-mkline { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
#features .f-edge { stroke: var(--ink-2); stroke-width: 1; }
#features .f-edget { font-size: 10px; }
#features .f-cross { stroke: var(--ink-3); stroke-width: 1; pointer-events: none; }
#features .f-you line { stroke: var(--ink); stroke-width: 1.5; }
#features .f-you circle { fill: var(--ink); stroke: var(--surface); stroke-width: 2; }
#features .f-yout { fill: var(--ink); font: 600 11px var(--mono); }
#features .f-linekey { display: inline-block; width: 14px; height: 2px; border-radius: 1px; background: var(--c); }

/* table */
#features .f-tbl td.f-fav { background: color-mix(in srgb, var(--c) 14%, transparent); color: var(--c-ink); font-weight: 700; }
#features .f-tbl th .swatch { margin-right: 0.15rem; }
#features .f-tbl tr { border-radius: var(--r-sm); }
#features .f-tkind { color: var(--ink-2); }
#features .f-favname { color: var(--c-ink); font-weight: 600; }
#features .f-tlink {
  font: 600 var(--fs-sm) var(--mono); color: var(--accent); background: none; border: 0; padding: 0; cursor: pointer;
  text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--accent) 40%, transparent); text-underline-offset: 3px;
}
#features .f-tlink:hover { text-decoration-color: var(--accent); }
`;
})();
