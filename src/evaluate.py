"""Reproduce every metric, table and figure:  python -m src.evaluate"""
import json
import random
import string
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import binomtest, chi2
from sklearn.metrics import classification_report, confusion_matrix, f1_score, recall_score
from sklearn.model_selection import StratifiedKFold

from . import stats_tests
from .data import CLASSES, FIG_DIR, ROOT, SEED, TAB_DIR, load, plot_class_dist
from .features import FEATURE_SETS, PATTERN_FEATURES, add_features, mk_bin
from .model import NaiveBayes, fit_markov_feature, train_full

K_FOLDS = 5
ALPHAS = [0.01, 0.1, 0.5, 1, 2]
ORDERS = [1, 2, 3]
SMALL_TRAIN = 300  # tiny training set for the smoothing experiment
MODEL_NAMES = {"base": "base-4 bins", "pattern": "+ pattern", "markov": "+ Markov"}


def wilson_ci(k, n, z=1.96):
    p = k / n
    centre = (p + z * z / (2 * n)) / (1 + z * z / n)
    half = z * np.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return centre - half, centre + half


def bootstrap_ci(correct, reps=1000, seed=SEED):
    rng = np.random.default_rng(seed)
    n = len(correct)
    accs = [correct[rng.integers(0, n, n)].mean() for _ in range(reps)]
    return tuple(np.percentile(accs, [2.5, 97.5]))


def mcnemar(correct_a, correct_b):
    """b = A right & B wrong, c = A wrong & B right. Chi-square with continuity
    correction, plus the exact binomial p-value (b ~ Bin(b + c, 1/2) under H0)."""
    b = int((correct_a & ~correct_b).sum())
    c = int((~correct_a & correct_b).sum())
    stat = (abs(b - c) - 1) ** 2 / (b + c) if b + c else 0.0
    return {"b_A_only": b, "c_B_only": c, "chi2": stat, "p_chi2": chi2.sf(stat, 1),
            "p_exact": binomtest(b, b + c, 0.5).pvalue if b + c else 1.0}


def to_md(df, fmt="{:.4g}"):
    """Minimal DataFrame -> Markdown table (no tabulate dependency)."""
    cells = lambda r: [fmt.format(v) if isinstance(v, (float, np.floating)) else str(v) for v in r]
    head = [df.index.name or ""] + [str(c) for c in df.columns]
    lines = ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
    lines += ["| " + " | ".join([str(i)] + cells(r)) + " |" for i, r in zip(df.index, df.values)]
    return "\n".join(lines)


class CV:
    """Stratified K folds with the Markov feature fitted on each TRAIN fold only."""

    def __init__(self, df):
        self.df, self.y = df, df["strength"].values
        self.folds = list(StratifiedKFold(K_FOLDS, shuffle=True, random_state=SEED).split(df, self.y))
        self.mk, self.order_rows = {}, []
        for order in ORDERS:
            for k, (tr, te) in enumerate(self.folds):
                chain, edges = fit_markov_feature(df["password"].iloc[tr], order)
                s = chain.score(df["password"])
                self.mk[order, k] = mk_bin(s, edges)
                te_pw = df["password"].iloc[te]
                self.order_rows.append({
                    "order": order, "fold": k, "contexts": len(chain.ctx),
                    **{f"unseen_ctx_{n}": chain.unseen_context_rate(te_pw[self.y[te] == c].iloc[:3000])
                       for c, n in enumerate(CLASSES)},
                    **{f"mean_score_{n}": s[te][self.y[te] == c].mean() for c, n in enumerate(CLASSES)},
                })
                print(f"  Markov order {order} fold {k}: {len(chain.ctx):,} contexts")

    def run(self, feature_set, alpha=1.0, prior_mode="data", order=2, train_size=None):
        cat, binf = FEATURE_SETS[feature_set]
        oof = np.empty(len(self.y), dtype=int)
        accs = []
        for k, (tr, te) in enumerate(self.folds):
            X = self.df.assign(mk_bin=self.mk[order, k]) if "mk_bin" in cat else self.df
            if train_size:
                tr = np.random.default_rng(SEED + k).choice(tr, train_size, replace=False)
            nb = NaiveBayes(cat, binf, alpha, prior_mode).fit(X.iloc[tr], self.y[tr])
            oof[te] = nb.predict(X.iloc[te])
            accs.append((oof[te] == self.y[te]).mean())
        return np.array(accs), oof


def plot_confusions(y, preds, path=FIG_DIR / "confusion.png"):
    fig, axes = plt.subplots(1, len(preds), figsize=(4 * len(preds), 3.8))
    for ax, (name, p) in zip(axes, preds.items()):
        cm = confusion_matrix(y, p)
        rate = cm / cm.sum(1, keepdims=True)
        ax.imshow(rate, vmin=0, vmax=1, cmap="Blues")
        for i in range(len(CLASSES)):
            for j in range(len(CLASSES)):
                ax.text(j, i, f"{rate[i, j]:.1%}\n{cm[i, j]:,}", ha="center", va="center", fontsize=8,
                        color="white" if rate[i, j] > 0.5 else "black")
        ax.set_xticks(range(3), CLASSES)
        ax.set_yticks(range(3), CLASSES)
        ax.set_xlabel("predicted")
        ax.set_ylabel("true")
        ax.set_title(f"{name}  (acc {np.mean(p == y):.2%})", fontsize=10)
    fig.suptitle("Row-normalised confusion = P(predicted | true class), 5-fold out-of-fold")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_alpha(sweep, path=FIG_DIR / "alpha.png"):
    fig, axes = plt.subplots(1, 2, figsize=(9, 3.6))
    for ax, (label, sub) in zip(axes, sweep.groupby("train_size", sort=False)):
        for fs, g in sub.groupby("model", sort=False):
            ax.errorbar(g["alpha"], g["cv_mean"], yerr=g["cv_std"], marker="o", capsize=3, label=fs)
        ax.set_xscale("log")
        ax.set_xlabel("Laplace / Dirichlet pseudo-count α")
        ax.set_ylabel("5-fold accuracy")
        ax.set_title(f"train size per fold = {label}")
        ax.legend(fontsize=8)
    fig.suptitle("Smoothing: posterior-mean likelihood (n_fc + α) / (n_c + αK) under a Dirichlet(α) prior")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_prior(prior_tab, path=FIG_DIR / "prior_recall.png"):
    fig, ax = plt.subplots(figsize=(5.5, 3.4))
    x = np.arange(len(CLASSES))
    for i, (mode, row) in enumerate(prior_tab.iterrows()):
        bars = ax.bar(x + (i - 0.5) * 0.38, row[CLASSES].values, 0.38, label=f"{mode} prior")
        ax.bar_label(bars, fmt="%.3f", fontsize=7)
    ax.set_xticks(x, CLASSES)
    ax.set_ylim(0.6, 1.02)
    ax.set_ylabel("recall  P(ŷ = C | y = C)")
    ax.set_title("Prior experiment: data prior vs uniform 1/3 prior")
    ax.legend(fontsize=8, loc="lower right")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def plot_markov_scores(df, model, path=FIG_DIR / "markov_scores.png"):
    s = model.chain.score(df["password"])
    fig, ax = plt.subplots(figsize=(6, 3.4))
    for c, name in enumerate(CLASSES):
        ax.hist(s[df["strength"].values == c], bins=80, alpha=0.55, density=True, label=name)
    for e in model.mk_edges:
        ax.axvline(e, color="k", ls="--", lw=1)
    ax.set_xlabel("per-char log P(pw) / (len + 1)   [order-2 chain, nats]")
    ax.set_ylabel("density")
    ax.set_title("Markov chain-rule score by class (dashed = Low/Med/High cuts)")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def worked_examples(model):
    rng = random.Random(SEED)
    rand = "".join(rng.choice(string.ascii_letters + string.digits + string.punctuation) for _ in range(16))
    out, lines = {}, ["# Worked examples (generated by `python -m src.evaluate`)\n"]
    for pw in ("Summer2026!", rand):
        ex = model.explain(pw)
        out[pw] = {"pred": ex["pred"], "confidence": ex["confidence"],
                   "posterior": ex["posterior"].to_dict(), "evidence": ex["evidence"].to_dict(),
                   "steps": ex["steps"].to_dict()}
        lines += [f"## `{pw}` -> **{ex['pred']}** ({ex['confidence']:.4f})\n",
                  to_md(ex["steps"], "{:.6g}"), "",
                  "Per-feature log-evidence  ln P(f|Strong) - ln P(f|Weak):\n",
                  to_md(ex["evidence"].to_frame(), "{:+.3f}"), ""]
    (TAB_DIR / "worked_examples.md").write_text("\n".join(lines), encoding="utf-8")
    return out


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    TAB_DIR.mkdir(parents=True, exist_ok=True)
    summary = {}

    df = add_features(load())
    y = df["strength"].values
    print("shape:", df.shape)
    print(df["strength"].map(dict(enumerate(CLASSES))).value_counts().to_string())
    plot_class_dist(df)
    summary["n"] = len(df)
    summary["class_counts"] = dict(zip(CLASSES, np.bincount(y).tolist()))

    # Majority-class baseline (Weak and Strong tie at 40%; argmax picks Weak).
    major = int(np.bincount(y).argmax())
    summary["baseline_acc"] = float((y == major).mean())
    print(f"\nMajority baseline (always {CLASSES[major]}): {summary['baseline_acc']:.4f}")

    print("\nPrecomputing per-fold Markov features...")
    cv = CV(df)

    # Ablation: base-4 -> + pattern -> + Markov
    rows, oof, correct = [], {}, {}
    for fs, name in MODEL_NAMES.items():
        accs, pred = cv.run(fs)
        oof[name], correct[fs] = pred, pred == y
        k = int(correct[fs].sum())
        rows.append({"model": name, "features": " + ".join(FEATURE_SETS[fs][0] + FEATURE_SETS[fs][1]),
                     "cv_mean": accs.mean(), "cv_std": accs.std(ddof=1), "oof_acc": k / len(y),
                     "wilson_lo": wilson_ci(k, len(y))[0], "wilson_hi": wilson_ci(k, len(y))[1],
                     "boot_lo": bootstrap_ci(correct[fs])[0], "boot_hi": bootstrap_ci(correct[fs])[1],
                     "macro_f1": f1_score(y, pred, average="macro"),
                     **{f"recall_{n}": r for n, r in zip(CLASSES, recall_score(y, pred, average=None))}})
        pd.DataFrame(confusion_matrix(y, pred), index=CLASSES, columns=CLASSES).to_csv(TAB_DIR / f"confusion_{fs}.csv")
        rep = classification_report(y, pred, target_names=CLASSES, digits=4, output_dict=True)
        pd.DataFrame(rep).T.to_csv(TAB_DIR / f"classification_report_{fs}.csv")
        print(f"\n== {name}: {accs.mean():.4f} ± {accs.std(ddof=1):.4f}")
        print(classification_report(y, pred, target_names=CLASSES, digits=4))
    ablation = pd.DataFrame(rows)
    ablation.insert(1, "delta_vs_base", ablation["oof_acc"] - ablation["oof_acc"].iloc[0])
    ablation.to_csv(TAB_DIR / "ablation.csv", index=False)
    summary["ablation"] = ablation.to_dict("records")
    plot_confusions(y, {n: p for n, p in oof.items()})

    # McNemar's test on paired out-of-fold predictions
    mc = pd.DataFrame([{"A": MODEL_NAMES[a], "B": MODEL_NAMES[b], **mcnemar(correct[a], correct[b])}
                       for a, b in [("base", "pattern"), ("base", "markov"), ("pattern", "markov")]])
    mc.to_csv(TAB_DIR / "mcnemar.csv", index=False)
    summary["mcnemar"] = mc.to_dict("records")
    print("\nMcNemar:\n", mc.to_string(index=False))

    # Example flips caused by adding the Markov feature
    cols = ["password", "level"] + FEATURE_SETS["pattern"][0] + PATTERN_FEATURES
    flips = []
    for kind, mask in (("fixed_by_markov", ~correct["pattern"] & correct["markov"]),
                       ("broken_by_markov", correct["pattern"] & ~correct["markov"])):
        sub = df.loc[mask, cols].head(15).copy()
        sub.insert(0, "flip", kind)
        sub["true"] = [CLASSES[v] for v in y[mask][:15]]
        sub["pred_pattern"] = [CLASSES[v] for v in oof[MODEL_NAMES["pattern"]][mask][:15]]
        sub["pred_markov"] = [CLASSES[v] for v in oof[MODEL_NAMES["markov"]][mask][:15]]
        flips.append(sub)
    pd.concat(flips).to_csv(TAB_DIR / "flips.csv", index=False)

    # Markov order comparison (sparsity)
    orders = pd.DataFrame(cv.order_rows).groupby("order").mean().drop(columns="fold")
    orders["cv_acc"] = [cv.run("markov", order=o)[0].mean() for o in orders.index]
    orders.to_csv(TAB_DIR / "markov_orders.csv")
    summary["markov_orders"] = orders.reset_index().to_dict("records")
    print("\nMarkov orders:\n", orders.round(4).to_string())

    # Smoothing sweep (full folds and a tiny training set where alpha matters)
    sweep = []
    for size in (None, SMALL_TRAIN):
        for fs in ("pattern", "markov"):
            for a in ALPHAS:
                accs, _ = cv.run(fs, alpha=a, train_size=size)
                sweep.append({"train_size": size or "full (160k)", "model": MODEL_NAMES[fs], "alpha": a,
                              "cv_mean": accs.mean(), "cv_std": accs.std(ddof=1)})
    sweep = pd.DataFrame(sweep)
    sweep.to_csv(TAB_DIR / "alpha_sweep.csv", index=False)
    plot_alpha(sweep)
    summary["alpha_sweep"] = sweep.to_dict("records")

    # Prior experiment: data prior vs uniform 1/3
    prior_rows = {}
    for mode in ("data", "uniform"):
        accs, pred = cv.run("markov", prior_mode=mode)
        prior_rows[mode] = {**dict(zip(CLASSES, recall_score(y, pred, average=None))),
                            "accuracy": accs.mean(), "macro_f1": f1_score(y, pred, average="macro")}
    prior_tab = pd.DataFrame(prior_rows).T
    prior_tab.index.name = "prior"
    prior_tab.to_csv(TAB_DIR / "prior_experiment.csv")
    plot_prior(prior_tab)
    summary["prior_experiment"] = prior_tab.to_dict("index")

    # Final model on all data -> likelihood tables, demo model, worked examples
    model = train_full(df=df)
    model.nb.prior.rename("P(C)").to_csv(TAB_DIR / "prior.csv")
    for f, tab in model.nb.tables.items():
        tab.to_csv(TAB_DIR / f"likelihood_{f}.csv")
    plot_markov_scores(df, model)
    summary["mk_edges"] = model.mk_edges.tolist()
    summary["worked_examples"] = worked_examples(model)

    # Statistical tests on the full sample (mk_bin from the final chain)
    full = model.transform(df)
    feats = FEATURE_SETS["markov"][0] + FEATURE_SETS["markov"][1]
    chi, ent, z = stats_tests.run_all(full, feats)
    summary["chi_square"] = {"tests": len(chi), "violations": int(chi["violates"].sum()),
                             "bonferroni_alpha": chi.attrs["bonferroni_alpha"],
                             "top_v": chi.nlargest(8, "cramers_v")[["class", "f1", "f2", "cramers_v", "p"]]
                             .to_dict("records")}
    summary["entropy"] = ent.to_dict("records")
    summary["zipf"] = z.to_dict("records")
    print(f"\nChi-square: {summary['chi_square']['violations']}/{len(chi)} pairs violate independence")
    print(ent[["unit", "class", "distinct", "shannon_bits", "log2_G", "min_entropy_bits"]].round(3).to_string())
    print(z.round(3).to_string())

    (ROOT / "results" / "summary.json").write_text(json.dumps(summary, indent=2, default=float), encoding="utf-8")
    print("\nSaved figures to results/figures and tables to results/tables.")


if __name__ == "__main__":
    main()
