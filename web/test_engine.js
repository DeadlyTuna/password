// Parity test: the JS engine must reproduce Python's outputs.   node web/test_engine.js
const fs = require('fs');
const path = require('path');
const { create } = require('./src/engine.js');

const dir = path.join(__dirname, 'data');
const E = create(JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8')));
const vectors = JSON.parse(fs.readFileSync(path.join(dir, 'test_vectors.json'), 'utf8'));

const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const FEATS = ['len_bin', 'dig_bin', 'up_bin', 'sp_bin', 'is_common', 'has_seq', 'has_repeat', 'has_year', 'length'];
let fails = 0;
const fail = (pw, what, got, want) => {
  fails++;
  if (fails <= 25) console.log(`FAIL ${JSON.stringify(pw)} ${what}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

for (const v of vectors) {
  const pw = v.password;
  const f = E.extract(pw);
  for (const k of FEATS) if (String(f[k]) !== String(v.features[k])) fail(pw, k, f[k], v.features[k]);
  if (!close(f.unique_ratio, v.features.unique_ratio)) fail(pw, 'unique_ratio', f.unique_ratio, v.features.unique_ratio);
  if (E.baseWord(pw) !== v.base_word) fail(pw, 'base_word', E.baseWord(pw), v.base_word);
  if (!close(E.logProb(pw), v.log_prob)) fail(pw, 'log_prob', E.logProb(pw), v.log_prob);
  if (!close(E.perChar(pw), v.mk_score)) fail(pw, 'mk_score', E.perChar(pw), v.mk_score);
  const ex = E.explain(pw);
  if (ex.features.mk_bin !== v.mk_bin) fail(pw, 'mk_bin', ex.features.mk_bin, v.mk_bin);
  const checks = [
    ['posterior', ex.posterior, v.posterior],
    ['posterior_alpha01', E.explain(pw, { alpha: 0.1 }).posterior, v.posterior_alpha01],
    ['posterior_uniform', E.explain(pw, { prior: 'uniform' }).posterior, v.posterior_uniform],
    ['evidence', ex.steps.map((s) => s.llr), v.evidence],
  ];
  for (const [name, got, want] of checks) {
    if (got.length !== want.length || got.some((g, i) => !close(g, want[i], 1e-8))) fail(pw, name, got, want);
  }
  E.rate(ex); // must not throw
}

// Rating sanity on hand-picked passwords.
for (const pw of ['Summer2026!', 'password123', 'qwerty', 'Tr0ub4dor&3', 'kq7#Vx!9mZ@2kLp$', 'correcthorsebatterystaple', 'qodn', '']) {
  const r = E.rate(E.explain(pw));
  console.log(`${JSON.stringify(pw).padEnd(30)} grade ${r.grade}  score ${r.score.toFixed(1).padStart(5)}  model ${r.modelScore.toFixed(1).padStart(5)}  markov ${r.markovBits.toFixed(1)} bits`);
}
console.log(`sample from chain: ${Array.from({ length: 6 }, () => E.sample()).join('  ')}`);
console.log(fails ? `\n${fails} mismatches across ${vectors.length} passwords` : `\nOK: ${vectors.length} passwords match Python exactly`);
process.exit(fails ? 1 : 0);
