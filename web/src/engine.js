/* PWB engine: a line-for-line JavaScript port of src/features.py, src/markov.py and
 * NaiveBayes in src/model.py. Everything runs in the browser; nothing is sent anywhere.
 * Parity with Python is checked by web/test_engine.js against web/data/test_vectors.json.
 *
 * Strings are handled as arrays of Unicode code points (Array.from), because Python's
 * len() and slicing count code points while JS .length counts UTF-16 units.
 */
(function (root) {
  'use strict';

  const RE_ALNUM = /[\p{L}\p{N}]/u;  // Python str.isalnum()
  const RE_DIGIT = /\p{Nd}/u;        // Python str.isdigit() (differs only for rare chars such as '²')
  const RE_UPPER = /\p{Uppercase}/u; // Python str.isupper() on one character
  const RE_LOWER = /\p{Lowercase}/u;
  const JUNK = '(?:[^\\p{L}\\p{N}_]|\\p{Nd}|_)+';
  const RE_EDGE = new RegExp(`^${JUNK}|${JUNK}$`, 'gu'); // Python r"^[\W\d_]+|[\W\d_]+$"
  const RE_YEAR = /(19|20)\p{Nd}{2}/u;
  const RE_REPEAT = /(.)\1\1/u;
  const LN2 = Math.LN2;

  const cps = (s) => Array.from(s);

  function logsumexp(xs) {
    const m = Math.max(...xs);
    if (!isFinite(m)) return m;
    let s = 0;
    for (const x of xs) s += Math.exp(x - m);
    return m + Math.log(s);
  }

  function create(data) {
    const CLASSES = data.meta.classes;
    const C = CLASSES.length;
    const FEATURES = data.features.order;
    const CAT = new Set(data.features.cat);
    const COMMON = new Set(data.lex.common);
    const LEET = data.lex.leet;
    const SEQ3 = new Set();
    for (const run of data.lex.runs) {
      for (const r of [run, cps(run).reverse().join('')]) {
        const a = cps(r);
        for (let i = 0; i + 3 <= a.length; i++) SEQ3.add(a.slice(i, i + 3).join(''));
      }
    }
    const BINS = data.bins;
    const MK = data.mk;
    const NB = data.nb;

    // ---------------- features.py ----------------
    const deleet = (s) => cps(s).map((c) => (c in LEET ? LEET[c] : c)).join('');
    const baseWord = (pw) => deleet(pw.toLowerCase().replace(RE_EDGE, ''));

    function commonMatch(pw) {
      const low = pw.toLowerCase();
      const base = baseWord(pw);
      if (COMMON.has(low)) return { hit: true, via: 'exact', word: low };
      const dl = deleet(low);
      if (COMMON.has(dl)) return { hit: true, via: 'deleet', word: dl };
      if (cps(base).length >= 4 && COMMON.has(base)) return { hit: true, via: 'base', word: base };
      return { hit: false, via: null, word: base };
    }

    function seqMatches(pw) {
      const a = cps(pw.toLowerCase());
      const out = [];
      for (let i = 0; i + 3 <= a.length; i++) {
        const g = a.slice(i, i + 3).join('');
        if (SEQ3.has(g)) out.push({ start: i, text: g });
      }
      return out;
    }

    function binIndex(feature, value) {
      const edges = BINS[feature].edges.map((e) => (e === null ? Infinity : e));
      let i = 0;
      while (i + 1 < edges.length && value >= edges[i + 1]) i++;
      return i;
    }

    function charClass(c) {
      if (RE_DIGIT.test(c)) return 'digit';
      if (RE_UPPER.test(c)) return 'upper';
      if (RE_LOWER.test(c)) return 'lower';
      if (RE_ALNUM.test(c)) return 'letter';
      return 'symbol';
    }

    function extract(pw) {
      const a = cps(pw);
      const n = a.length;
      const counts = {
        length: n,
        n_digit: a.filter((c) => RE_DIGIT.test(c)).length,
        n_upper: a.filter((c) => RE_UPPER.test(c)).length,
        n_special: a.filter((c) => !RE_ALNUM.test(c)).length,
      };
      const out = {};
      for (const f of Object.keys(BINS)) out[f] = BINS[f].labels[binIndex(f, counts[BINS[f].source])];
      out.is_common = commonMatch(pw).hit ? 1 : 0;
      out.has_seq = seqMatches(pw).length ? 1 : 0;
      out.has_repeat = RE_REPEAT.test(pw) ? 1 : 0;
      out.has_year = RE_YEAR.test(pw) ? 1 : 0;
      out.length = n;
      out.unique_ratio = n ? new Set(a).size / n : 0;
      out._counts = counts;
      return out;
    }

    // ---------------- markov.py ----------------
    const MKV = data.markov;
    const K = MKV.order;
    // Compact layout: one entry per context (~9k) instead of one object per n-gram (~600k),
    // so the garbage collector has little to scan while the page is being typed into.
    // ctx -> { total, chars: [next chars sorted by count desc], counts: Int32Array, index: Map(char -> i) }
    const nodes = new Map();
    for (const g in MKV.grams) {
      const a = cps(g);
      const ctx = a.slice(0, K).join('');
      let node = nodes.get(ctx);
      if (!node) nodes.set(ctx, (node = { total: 0, list: [] }));
      node.list.push([a[K], MKV.grams[g]]);
      node.total += MKV.grams[g];
    }
    for (const node of nodes.values()) {
      node.list.sort((x, y) => y[1] - x[1]);
      node.chars = node.list.map((x) => x[0]);
      node.counts = Int32Array.from(node.list, (x) => x[1]);
      node.index = new Map(node.chars.map((c, i) => [c, i]));
      delete node.list;
    }
    const ctxCount = { get: (ctx) => (nodes.get(ctx) || { total: 0 }).total };
    const gramCount = (ctx, ch) => {
      const node = nodes.get(ctx);
      const i = node ? node.index.get(ch) : undefined;
      return i === undefined ? 0 : node.counts[i];
    };
    const padded = (pw) => [...'^'.repeat(K), ...cps(pw), '$'];

    function markovTrace(pw, alpha = MKV.alpha) {
      const s = padded(pw);
      const steps = [];
      for (let i = 0; i + K < s.length; i++) {
        const ctx = s.slice(i, i + K).join('');
        const ch = s[i + K];
        const n = gramCount(ctx, ch);
        const nctx = ctxCount.get(ctx);
        const p = (n + alpha) / (nctx + alpha * MKV.V);
        steps.push({ i, ctx, ch, n, nctx, p, logp: Math.log(p), seen: nctx > 0 });
      }
      return steps;
    }

    function logProb(pw) {
      let lp = 0;
      for (const st of markovTrace(pw)) lp += st.logp;
      return lp;
    }
    const perChar = (pw) => logProb(pw) / (cps(pw).length + 1);
    const mkBin = (score) => MK.labels[MK.edges.filter((e) => e <= score).length];

    function topNext(ctx, k = 6) {
      const node = nodes.get(ctx);
      if (!node) return [];
      const out = [];
      for (let i = 0; i < Math.min(k, node.chars.length); i++) {
        out.push({ ch: node.chars[i], n: node.counts[i], p: (node.counts[i] + MKV.alpha) / (node.total + MKV.alpha * MKV.V) });
      }
      return out;
    }

    // Draw a password from the chain (counts only, no smoothing). rand() -> [0, 1).
    function sample(rand = Math.random, maxLen = 32) {
      let ctx = '^'.repeat(K);
      const out = [];
      while (out.length < maxLen) {
        const node = nodes.get(ctx);
        if (!node) break;
        let r = rand() * node.total;
        let ch = node.chars[node.chars.length - 1];
        for (let i = 0; i < node.chars.length; i++) {
          if ((r -= node.counts[i]) < 0) { ch = node.chars[i]; break; }
        }
        if (ch === '$') break;
        out.push(ch);
        ctx = cps(ctx + ch).slice(-K).join('');
      }
      return out.join('');
    }

    // ---------------- model.py (NaiveBayes) ----------------
    const classN = NB.class_n;
    const total = classN.reduce((a, b) => a + b, 0);
    const dataPrior = classN.map((n) => n / total);

    // Laplace / Dirichlet(alpha) posterior-mean likelihood table from raw counts.
    function table(feature, alpha = NB.alpha) {
      const { levels, counts } = NB.counts[feature];
      const Kf = levels.length;
      return levels.map((lv, r) => ({
        level: lv,
        counts: counts[r],
        p: counts[r].map((n, c) => (n + alpha) / (classN[c] + alpha * Kf)),
      }));
    }

    function priorFor(mode) {
      if (Array.isArray(mode)) return mode;
      return mode === 'uniform' ? Array(C).fill(1 / C) : dataPrior;
    }

    // Full explanation: prior -> likelihoods -> joint -> evidence -> posterior.
    function explain(pw, opts = {}) {
      const alpha = opts.alpha ?? NB.alpha;
      const prior = priorFor(opts.prior ?? 'data');
      const feats = extract(pw);
      const mkScore = perChar(pw);
      const lp = logProb(pw);
      feats.mk_score = mkScore;
      feats.mk_bin = mkBin(mkScore);
      feats.log_prob = lp;

      let logJoint = prior.map((p) => Math.log(p));
      const steps = [];
      for (const f of FEATURES) {
        const value = String(feats[f]);
        const row = table(f, alpha).find((r) => r.level === value);
        const lik = row.p;
        logJoint = logJoint.map((v, c) => v + Math.log(lik[c]));
        const iS = CLASSES.indexOf('Strong'), iW = CLASSES.indexOf('Weak');
        steps.push({
          feature: f, value, kind: CAT.has(f) ? 'cat' : 'bin', counts: row.counts, lik,
          llr: Math.log(lik[iS]) - Math.log(lik[iW]),
          logJointAfter: logJoint.slice(),
        });
      }
      const logPx = logsumexp(logJoint);
      const posterior = logJoint.map((v) => Math.exp(v - logPx));
      const predIndex = posterior.indexOf(Math.max(...posterior));
      return {
        password: pw, chars: cps(pw), features: feats, prior, alpha, steps,
        logJoint, joint: logJoint.map(Math.exp), logEvidence: logPx, evidence: Math.exp(logPx),
        posterior, predIndex, pred: CLASSES[predIndex], confidence: posterior[predIndex],
        common: commonMatch(pw), seqs: seqMatches(pw), baseWord: baseWord(pw),
      };
    }

    // ---------------- overall rating (page-level, documented on the page) ----------------
    const GRADES = [[85, 'A'], [70, 'B'], [55, 'C'], [40, 'D'], [0, 'F']];
    const LABEL = ['Critical', 'Poor', 'Fair', 'Good', 'Excellent'];
    const GUESS_RATE = 1e10; // assumed offline attack speed, guesses per second

    function charsetSize(chars) {
      const has = (re) => chars.some((c) => re.test(c));
      let n = 0;
      if (chars.some((c) => /[a-z]/.test(c))) n += 26;
      if (chars.some((c) => /[A-Z]/.test(c))) n += 26;
      if (chars.some((c) => /[0-9]/.test(c))) n += 10;
      if (chars.some((c) => /[ -/:-@[-`{-~]/.test(c))) n += 33;
      if (has(/[^\x00-\x7F]/u)) n += 100;
      return n;
    }

    function rate(ex) {
      const f = ex.features;
      const n = f.length;
      const P = Object.fromEntries(CLASSES.map((c, i) => [c, ex.posterior[i]]));
      const classes = ['lower', 'upper', 'digit', 'symbol'].filter((k) =>
        ex.chars.some((c) => (k === 'lower' ? RE_LOWER.test(c) : charClass(c) === k)));
      const markovBits = -f.log_prob / LN2;
      const cs = charsetSize(ex.chars);
      const bruteBits = n && cs ? n * Math.log2(cs) : 0;
      const step = (x, cuts) => cuts.filter((c) => x >= c).length; // 0..cuts.length

      const aspects = [
        { key: 'model', label: 'Bayes model verdict', value: `${ex.pred} · ${(100 * ex.confidence).toFixed(1)}%`,
          score: Math.round(4 * (0.5 * P.Medium + P.Strong)) },
        { key: 'length', label: 'Length', value: `${n} characters`, score: step(n, [1, 8, 12, 16]) },
        { key: 'variety', label: 'Character variety', value: `${classes.length} of 4 kinds`, score: classes.length },
        { key: 'common', label: 'Common-password list', value: ex.common.hit ? `matches “${ex.common.word}”` : 'not found', score: ex.common.hit ? 0 : 4 },
        { key: 'seq', label: 'Keyboard / alphabet runs', value: ex.seqs.length ? ex.seqs.map((s) => s.text).join(', ') : 'none', score: f.has_seq ? 1 : 4 },
        { key: 'repeat', label: 'Repeated characters', value: f.has_repeat ? 'three in a row' : 'none', score: f.has_repeat ? 1 : 4 },
        { key: 'year', label: 'Years', value: f.has_year ? (ex.password.match(RE_YEAR) || [''])[0] : 'none', score: f.has_year ? 1 : 4 },
        { key: 'markov', label: 'Markov predictability', value: `${f.mk_bin} (${f.mk_score.toFixed(2)} nats/char)`, score: { High: 1, Med: 2, Low: 4 }[f.mk_bin] },
        { key: 'guess', label: 'Markov guessability', value: `${markovBits.toFixed(1)} bits`, score: step(markovBits, [20, 28, 40, 60]) },
        { key: 'brute', label: 'Brute-force space', value: `${bruteBits.toFixed(1)} bits`, score: step(bruteBits, [28, 40, 56, 72]) },
      ].map((a) => ({ ...a, label_text: LABEL[a.score] }));

      const modelScore = 100 * (0.5 * P.Medium + P.Strong);
      const guessScore = 100 * Math.min(1, Math.max(0, (markovBits - 20) / 50));
      let score = Math.min(modelScore, guessScore) - 10 * (f.has_seq + f.has_repeat + f.has_year);
      if (ex.common.hit) score = Math.min(score, 15);
      score = n ? Math.max(0, Math.min(100, score)) : 0;
      const grade = GRADES.find(([cut]) => score >= cut)[1];
      return {
        score, grade, modelScore, guessScore, markovBits, bruteBits, charset: cs, aspects,
        crackSeconds: Math.pow(2, markovBits) / GUESS_RATE, guessRate: GUESS_RATE,
        limiting: modelScore <= guessScore ? 'model' : 'guess',
      };
    }

    return {
      data, CLASSES, FEATURES, dataPrior, extract, baseWord, deleet, commonMatch, seqMatches, charClass,
      binIndex, table, explain, rate, markovTrace, logProb, perChar, mkBin, topNext, sample,
      ctxCount: (ctx) => ctxCount.get(ctx), logsumexp, cps,
    };
  }

  const api = { create };
  root.PWB = root.PWB || {};
  root.PWB.engineFactory = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
