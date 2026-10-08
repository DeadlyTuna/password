# Password Strength Estimation with Bayesian Intelligence

BAMAT207 (Probability and Statistics), Bayesian Intelligence track.
This project estimates P(strength | password) with a naive Bayes classifier, extends it with a character-level Markov chain, and evaluates it rigorously.

## Quick start

```bash
pip install -r requirements.txt
python -m src.data        # one-off: sample 40k rows per PWLDS file into data/sample.csv
python -m src.evaluate    # every metric, figure and table (about 2 min)
```

Then open `notebooks/demo.ipynb` in JupyterLab or VS Code and run all cells to get the live demo.

## Website (password checker + interactive explainer)

```bash
python -m src.export_web   # model + results -> web/data/model.json (+ Python test vectors)
node web/test_engine.js    # JS engine must match Python on every test password
python web/build.py        # -> web/dist/index.html, one self-contained file
```

Open `web/dist/index.html` directly in a browser; no server is needed. The trained model runs in the page itself, so a typed password never leaves the browser.
The source lives in `web/src/`: `engine.js` (JS port of the model), `kit.js` (helpers), `styles.css` (design system) and one file per section in `web/src/sections/`. See `web/CONTRACT.md` for how the sections fit together.

## Data

- **PWLDS** (Infinitode, CC BY 4.0) goes in `datasets/PWLDS-main/`. It is not committed because it is 223 MB.
- The 5 PWLDS levels are merged into 3 classes: Weak = {0, 1}, Medium = {2}, Strong = {3, 4}.
  This gives a 40/20/40 class split over the 200k-row sample.
- `data/common_passwords.txt` is SecLists' `10k-most-common.txt`.

## Layout

| path | role |
|---|---|
| `src/data.py` | load, clean, merge labels, sample, class-distribution plot |
| `src/features.py` | **the only place features are computed**: `BINS`, `extract()`, `add_features()` |
| `src/markov.py` | order-k character Markov chain with Laplace smoothing |
| `src/model.py` | `NaiveBayes` (fit / predict_proba / explain_row), `PasswordModel` pipeline |
| `src/evaluate.py` | 5-fold CV, baseline, CIs, McNemar, ablation, α sweep, prior experiment |
| `src/stats_tests.py` | chi-square independence, entropy, Zipf |
| `src/ui.py` | animated ipywidgets demo used by the notebook |
| `results/` | figures (PNG), tables (CSV), `summary.json`, `evaluate_log.txt` |
| `src/export_web.py` | exports the model and results for the website |
| `web/` | the website (see above) |
| `report/report.md` | the write-up |
