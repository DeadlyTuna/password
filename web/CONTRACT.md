# Bayesian Password Lab: section author contract

The website is one long interactive explainer of the password-strength model in this repo, plus a live password checker. Everything runs in the browser from `web/data/model.json`. **Read this whole file before writing code.**

Audience: students and teachers of a probability course (BAMAT207), plus anyone who wants to check a password. The page must be **correct first**, then delightful: rich interactivity, smooth motion, live reaction to the password being typed.

## How the page is built

```
web/src/styles.css        design system (tokens + components)   DO NOT EDIT
web/src/kit.js            helpers (PWB.kit)                       DO NOT EDIT
web/src/engine.js         JS port of the Python model (PWB.E)     DO NOT EDIT (bit-exact with Python, tested)
web/src/boot.js           mounts sections, top bar, theme         DO NOT EDIT
web/src/sections/NN-id.js ONE FILE PER SECTION                    <- you write exactly one of these
web/build.py              bundles everything into web/dist/index.html (single self-contained file)
```

Build with `python web/build.py`. A dev server serves `web/dist` at **http://localhost:8770/**. Each section file becomes its own `<script>` tag, so a syntax error only breaks your own section.

## Section file shape

A plain script: no `import`/`export`. Wrap everything in an IIFE and register once:

```js
(function () {
  'use strict';
  PWB.register({
    id: 'markov',            // DOM id of the <section>; also the #anchor. Lowercase, unique.
    order: 90,               // position on the page (given in your brief)
    nav: 'Markov',           // short label for the top-bar contents (<= 12 chars)
    kicker: 'Character chain',// small uppercase label in the margin under the number
    title: 'A Markov chain reads it one character at a time',
    lede: 'One or two plain sentences saying what this section shows.',
    mount(el, ctx) {         // el = the section body <div>; build your DOM inside it
      const { E, kit, data, store, h, s, fmt } = ctx;
      // ... build static structure once ...
      store.subscribe((st) => { /* update for st.password / st.ex / st.rating */ }, 'markov');
    },
  });
})();
```

`boot.js` creates the `<section id=…>` with the number, kicker, title and lede for you (except the hero), then calls `mount`. Do not create your own `<h2>`.

## ctx

- `E`: the engine (below).
- `kit`: helpers (below). `h`, `s`, `fmt` are shortcuts for `kit.h`, `kit.s`, `kit.fmt`.
- `data`: the parsed `model.json` (schema below).
- `store`: the live password. `store.subscribe(fn, id)` calls `fn(state)` immediately and on every change, at most once per animation frame. `state = { password, ex, rating }`, where `ex = E.explain(password)` and `rating = E.rate(ex)` are precomputed for the default model (α = 1, data prior). Call `store.set(pw)` to load a password everywhere, e.g. a "try this one" button.

## Engine API (`E`)

```
E.CLASSES                      ['Weak','Medium','Strong']
E.FEATURES                     ['len_bin','dig_bin','up_bin','sp_bin','mk_bin','is_common','has_seq','has_repeat','has_year']
E.dataPrior                    [0.4, 0.2, 0.4]
E.extract(pw)                  {len_bin,dig_bin,up_bin,sp_bin,is_common,has_seq,has_repeat,has_year,length,unique_ratio,
                                _counts:{length,n_digit,n_upper,n_special}}
E.explain(pw, {alpha?, prior?}) prior: 'data' | 'uniform' | [pW,pM,pS]; alpha default 1. Returns:
   password, chars (array of code points), alpha, prior[3],
   features: extract(pw) + {mk_score (nats/char), mk_bin ('Low'|'Med'|'High'), log_prob (natural log of P(pw))},
   steps: [ { feature, value (string level), kind 'cat'|'bin', counts[3] (raw n per class),
              lik[3] = P(f=value|C), llr = ln P(f|Strong) - ln P(f|Weak), logJointAfter[3] } x9 ],
   logJoint[3], joint[3], logEvidence, evidence (= P(x) = sum of joint), posterior[3], predIndex, pred, confidence,
   common: {hit, via: 'exact'|'deleet'|'base'|null, word}, seqs: [{start, text}], baseWord
E.rate(ex)                     {score 0-100, grade 'A'..'F', modelScore, guessScore, markovBits, bruteBits, charset,
                                crackSeconds, guessRate (1e10/s assumption), limiting:'model'|'guess',
                                aspects: [{key,label,value,score 0-4,label_text}]}
   Rule (document it exactly like this if you explain it):
     modelScore = 100 * (0.5 P(Medium|x) + P(Strong|x))
     guessScore = 100 * clamp((markovBits - 20) / 50, 0, 1), markovBits = -log2 P_markov(pw)
     score = min(modelScore, guessScore) - 10 * (has_seq + has_repeat + has_year); if common: min(score, 15); clamp 0..100
     grade: A >= 85, B >= 70, C >= 55, D >= 40, else F.   Empty password -> 0 / F.
E.table(feature, alpha=1)      [{level, counts[3], p[3]}] Laplace/Dirichlet posterior mean (n+α)/(n_C+αK)
E.markovTrace(pw, alpha=1)     [{i, ctx, ch, n, nctx, p, logp, seen}] one per transition incl. the final '$'
E.topNext(ctx, k=6)            [{ch, n, p}] most likely next characters after a 2-char context
E.sample(rand=Math.random)     a password drawn from the chain (no smoothing)
E.logProb(pw), E.perChar(pw), E.mkBin(score), E.ctxCount(ctx)
E.commonMatch(pw), E.seqMatches(pw), E.baseWord(pw), E.deleet(s), E.charClass(c) 'digit'|'upper'|'lower'|'letter'|'symbol'
E.binIndex(feature, value), E.logsumexp(xs), E.cps(str)
```
The chain pads with `^^` at the start and `$` at the end. Order k = 2, V = 95, Laplace α = 1.

## kit API

```
h(tag, props, ...children) / s(tag, props, ...children)   create HTML / SVG elements
   props: class, style (object), dataset, text, html, onClick..., '--css-var': value, any attribute
replace(el, ...children)            replace children
fmt.sci(x,d) '6.10 × 10⁻¹²'   fmt.prob(x) '0.9990' or sci   fmt.post(x) handles values near 1 ('1 − 1.5 × 10⁻¹¹')
fmt.pct(x,d)  fmt.int(n) '80,000'  fmt.fixed  fmt.signed(x) '+9.49'/'−3.17'  fmt.bits  fmt.duration(sec)
tex(latex, display) -> HTML string (KaTeX rendered to native MathML). texEl(latex, display) -> element
cls.names, cls.color(i|name) 'var(--weak)', cls.ink(i) text-safe colour, cls.className(i) 'c-weak'
gradeColor(grade)
animate({from,to,duration,onUpdate,onDone}) -> cancel()   countTo(el, value, formatFn)   reducedMotion()
tip.show(html, evt) / tip.move(evt) / tip.hide() / tip.attach(el, evt => html)
responsive(el, draw) calls draw(width) now and on resize; redraw charts from it
meter(score0to4)  escape(str)  showPw(pw) (spaces shown as ␣)  debounce(fn, ms)
```
D3 v7 is loaded as the global `d3`. KaTeX is loaded as the global `katex`, but use `kit.tex`.

## Data schema (`data`)

```
meta: {n:200000, classes, class_counts:[80000,40000,80000], levels:{0:'very_weak',1:'weak',2:'average',3:'strong',4:'very_strong'},
       level_to_class:{0:0,1:0,2:1,3:2,4:2}, n_per_file:40000, pwlds_rows:15001121, common_list_size:10001, seed:42}
features: {cat:[5 names], bin:[4 names], order:[9]}
bins: {len_bin:{source:'length', edges:[0,6,8,10,12,16,null(=inf)], labels:['<6','6-7','8-9','10-11','12-15','16+']}, dig_bin, up_bin, sp_bin}
mk: {labels:['Low','Med','High'], edges:[-3.8677, -2.5950]}   (tertiles of the training per-char score)
nb: {alpha:1, class_n:[80000,40000,80000], counts:{feature:{kind, levels:[...], counts:[[nW,nM,nS] per level]}}}
markov: {order:2, alpha:1, V:95, grams:{'abc':count,...}}   (612k keys; use the E.* functions instead)
lex: {common:[10001 words], leet:{'0':'o',...}, runs:[...]}
results:
  baseline_acc 0.4
  ablation [{model:'base-4 bins'|'+ pattern'|'+ Markov', delta_vs_base, features, cv_mean, cv_std, oof_acc,
             wilson_lo, wilson_hi, boot_lo, boot_hi, macro_f1, recall_Weak, recall_Medium, recall_Strong}]
  mcnemar [{A, B, b_A_only, c_B_only, chi2, p_chi2, p_exact}]
  report {base|pattern|markov: [{label:'Weak'|'Medium'|'Strong'|'accuracy'|'macro avg'|'weighted avg', precision, recall, 'f1-score', support}]}
  confusion {base|pattern|markov: 3x3 counts, rows = true class, cols = predicted}
  alpha_sweep [{train_size:'full (160k)'|'300', model:'+ pattern'|'+ Markov', alpha, cv_mean, cv_std}]
  prior_experiment [{prior:'data'|'uniform', Weak, Medium, Strong (recalls), accuracy, macro_f1}]
  markov_orders [{order, contexts, unseen_ctx_Weak/Medium/Strong, mean_score_Weak/Medium/Strong, cv_acc}]
  chi_square [{class, f1, f2, n, chi2|null, dof, p|null, cramers_v, pct_expected_lt5|null, violates}] (108 rows)
  bonferroni_alpha 0.000463
  entropy [{unit:'password'|'base word', class:'All'|'Weak'|'Medium'|'Strong', N, distinct, shannon_bits, guessing_G,
            log2_G, min_entropy_bits, max_bits_log2_distinct, top_item, top_p}]
  zipf_fits [{unit, distinct, max_freq, n_freq_ge2, fit_ranks, slope, zipf_s}]
  flips [{flip:'fixed_by_markov'|'broken_by_markov', password, level, len_bin, ..., true, pred_pattern, pred_markov}]
  worked_examples {'Summer2026!': {pred, confidence, posterior, evidence, steps}, '>odJFCrn](l.2edl': {...}}
eda:
  length_hist {very_weak:{'2':n,...}, weak, average, strong, very_strong}   length_stats {level:{count,mean,std,min,25%,50%,75%,max}}
  samples {level: [12 example passwords]}
  mk_hist {Weak|Medium|Strong: {edges[101] from -6 to -1 step .05, counts[100]}}
  zipf {password|base_word: {rank[], freq[], distinct, top:{item:count}}}
  contingency [{class, f1, f2, rows[], cols[], observed[rows][cols]}] (108, same order as chi_square)
```

## The story (ground truth; quote numbers only by reading them from `data` at runtime)

- PWLDS has 15,001,121 synthetic passwords in 5 levels. We sampled 40,000 per level = 200,000 and merged the levels into Weak {0,1}, Medium {2}, Strong {3,4}, giving prior 0.4 / 0.2 / 0.4.
- 9 features: 4 binned counts, 4 binary patterns, and mk_bin (order-2 Markov per-char score, cut at the training tertiles). Naive Bayes with Laplace α = 1, computed in log space and normalised with log-sum-exp.
- 5-fold stratified CV: base 0.8939, + pattern 0.9066 (best), + Markov 0.8980. Majority baseline 0.40. McNemar: all three pairwise differences are significant. The Markov feature helps Weak and Medium recall but hurts Strong recall, because it double-counts information already in length/composition (chi-square: 55 of 108 within-class pairs violate independence at Bonferroni 0.05/108).
- `Summer2026!` is classified **Strong** at 0.999 because PWLDS Weak passwords never contain a symbol: P(sp_bin=1 | Weak) is a smoothed zero, (0+1)/(80000+4) = 1.25e-5, worth +9.49 nats. The common-word and year flags vote Weak (−3.17, −2.86) but lose. The overall **rating** catches it (grade F) because the common-password check caps the score.
- α barely matters with 160k training rows but matters with 300 (smaller α is better). The uniform prior raises Medium recall by about 2.3 points.
- Synthetic data: the Zipf slope is nearly flat (s ≈ 0.17 for passwords) and the top password appears only 3 times.

## Hard rules

1. **Never invent numbers.** Any statistic shown must be read from `data` or computed live with `E`. You may hard-code only definitional constants: 3 classes, 9 features, 5 folds, order 2, α = 1 default, tertiles, the rating rule. If prose mentions a result ("accuracy 90.66%"), build that string from `data.results`.
2. **Every figure has a caption** `<p class="cap"><b>Concept</b>…</p>` that names the probability concept it shows (e.g. "Conditional probability", "Law of total probability", "Dirichlet prior").
3. **Complete at rest.** On mount, render the full state for the current password immediately. Never leave content at `opacity: 0` waiting for scroll. Entrance animation is fine if it starts visible.
4. **Live and fluid.** Update on every keystroke via `store.subscribe`. Prefer updating existing nodes (d3 joins with ≤ 450 ms transitions, `kit.countTo`) over rebuilding everything, so things glide rather than flash. Use 0 duration when `kit.reducedMotion()`. Keep each update under ~4 ms of JS for normal passwords; cache what does not depend on the password.
5. **Colours only from tokens**: `var(--ink)`, `--ink-2`, `--ink-3`, `--paper`, `--surface`, `--line`, `--line-2`, `--grid`, `--grid-strong`, `--accent`, `--accent-soft`, `--accent-ink`, `--pencil`, `--weak`/`--medium`/`--strong` (fills) and `--weak-ink`/`--medium-ink`/`--strong-ink` (text). Class colour mapping is fixed: Weak = `--weak`, Medium = `--medium`, Strong = `--strong`. In SVG set colours with `style` (`.style('fill','var(--strong)')`), not presentation attributes. `color-mix(in srgb, var(--x) 20%, transparent)` is fine for tints. Never write a literal hex/rgb colour. Both themes must work.
6. **Fonts only from tokens**: `var(--display)` headings/big numbers, `var(--body)` text, `var(--mono)` data/code, `var(--hand)` pencilled margin notes (sparingly, `.note` class).
7. **Use the design system classes** (`panel`, `note`, `callout`, `chip`, `chip.on/.bad/.good/.warn`, `meter`, `btn`, `btn.primary`, `btn.small`, `seg` with `aria-pressed`, `tbl`, `tr.hl`, `td.hl`, `fig`, `cap`, `grid-2`, `grid-3`, `grid-auto`, `stack`, `row`, `between`, `scroll-x`, `eyebrow`, `lede`, `muted`, `faint`, `num`, `mono`, `formula`, `c-weak/c-medium/c-strong` which set `--c`/`--c-ink`, `swatch`, `ax`, `chart-text`, `gridline`). Extra CSS goes in ONE `<style>` element you append inside your section body, with **every selector prefixed by `#<your-id>`**. Do not restyle global classes.
8. **Responsive**: works at 380 px wide with no horizontal page scroll. Charts redraw via `kit.responsive`. Wide tables go inside `.scroll-x`. Give flex/grid children holding text `min-width: 0`.
9. **Accessible**: real `<button>`s and labelled inputs; every control `id` is prefixed with your section id; visible focus (global style handles it); colour is never the only signal (add text or labels).
10. **Robust**: must not throw for `''`, `'a'`, `'Summer2026!'`, `'password123'`, `'kq7#Vx!9mZ@2kLp$'`, `'😀😀😀abc'`, `'x'.repeat(40)`, `'  spaced  pass '`, `'١٢٣٤'`. Use `kit.showPw` or `E.cps` when displaying characters. Escape user text in HTML strings (`kit.escape`) or build with `h()` and `text`.
11. **Privacy**: never send, log or store the password (no `localStorage` for it, no network).
12. **Copy**: plain and direct. Short sentences, active voice. Name things the way a student would. No em-dash asides, no "not X, but Y" framing, no "worth noting"/"honest caveat"-style stock phrases, no emoji as decoration. Explain the probability idea in one or two sentences next to the visual that shows it, with live numbers.
13. Do not edit any file except your own section file. If you need a helper, write it inside your IIFE.

## Testing your section

1. `node --check web/src/sections/<your-file>.js`
2. `python web/build.py`
3. Browser: open your own tab with `mcp__Claude_Browser__tabs_create`, then `mcp__Claude_Browser__navigate` it to `http://localhost:8770/#<id>`. Load the browser tools with ToolSearch first: `select:mcp__Claude_Browser__tabs_create,mcp__Claude_Browser__navigate,mcp__Claude_Browser__javascript_tool,mcp__Claude_Browser__get_page_text,mcp__Claude_Browser__read_console_messages,mcp__Claude_Browser__computer,mcp__Claude_Browser__resize_window,mcp__Claude_Browser__tabs_close`. **Always pass your own `tabId`.** Never touch other tabs; other agents use them. Close your tab when done.
4. Reload after every build. Then run JS in your tab:
   `await new Promise(r=>setTimeout(r,800)); for (const p of ['', 'a', 'password123', '😀😀😀abc', 'x'.repeat(40), 'kq7#Vx!9mZ@2kLp$', 'Summer2026!']) { PWB.store.set(p); await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,60))); } window.__pwbErrors`
   It must return `[]` for your section.
5. Check layout from the DOM: no element in your section wider than its container (`el.scrollWidth > el.clientWidth`), nothing overlapping. Use `resize_window` with `{width: 390, height: 844, tabId}` for a phone check, then preset `desktop`. Screenshots of a background tab may be blank; prefer DOM checks, and use `computer` `screenshot` with your `tabId` only after `tabs_select`-free checks pass.
