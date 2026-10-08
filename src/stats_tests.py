"""Chi-square independence (tests the NB assumption), entropy, Zipf's law."""
from itertools import combinations

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy.stats import chi2_contingency

from .data import CLASSES, FIG_DIR, TAB_DIR
from .features import base_word

ALPHA = 0.05


def chi_square(df, features):
    """Within each class, test every feature pair for independence.
    NB assumes P(f1, f2 | C) = P(f1 | C) P(f2 | C); a significant chi-square
    (after Bonferroni) means that pair violates the assumption."""
    pairs = list(combinations(features, 2))
    n_tests = len(pairs) * len(CLASSES)
    rows = []
    for c, name in enumerate(CLASSES):
        sub = df[df["strength"] == c]
        for f1, f2 in pairs:
            ct = pd.crosstab(np.asarray(sub[f1]), np.asarray(sub[f2]))
            row = {"class": name, "f1": f1, "f2": f2, "n": len(sub)}
            if min(ct.shape) < 2:  # one feature is constant inside this class
                rows.append({**row, "chi2": np.nan, "dof": 0, "p": np.nan, "cramers_v": 0.0,
                             "pct_expected_lt5": np.nan, "violates": False})
                continue
            chi2, p, dof, expected = chi2_contingency(ct)
            v = np.sqrt(chi2 / (len(sub) * (min(ct.shape) - 1)))
            rows.append({**row, "chi2": chi2, "dof": dof, "p": p, "cramers_v": v,
                         "pct_expected_lt5": float((expected < 5).mean()),
                         "violates": p < ALPHA / n_tests})
    out = pd.DataFrame(rows)
    out.attrs["bonferroni_alpha"] = ALPHA / n_tests
    return out


def plot_cramers_v(res, features, path=FIG_DIR / "cramers_v.png"):
    fig, axes = plt.subplots(1, len(CLASSES), figsize=(4.2 * len(CLASSES), 4))
    for ax, name in zip(axes, CLASSES):
        m = pd.DataFrame(0.0, index=features, columns=features)
        for r in res[res["class"] == name].itertuples():
            m.loc[r.f1, r.f2] = m.loc[r.f2, r.f1] = r.cramers_v
        im = ax.imshow(m.values, vmin=0, vmax=1, cmap="magma_r")
        ax.set_xticks(range(len(features)), features, rotation=60, ha="right", fontsize=7)
        ax.set_yticks(range(len(features)), features if ax is axes[0] else [], fontsize=7)
        for i in range(len(features)):
            for j in range(len(features)):
                if i != j:
                    ax.text(j, i, f"{m.iat[i, j]:.2f}", ha="center", va="center", fontsize=5.5,
                            color="white" if m.iat[i, j] > 0.5 else "black")
        ax.set_title(f"C = {name}", fontsize=10)
    fig.colorbar(im, ax=axes, shrink=0.8, label="Cramér's V")
    fig.suptitle("Conditional dependence of feature pairs given the class (chi-square effect size)")
    fig.savefig(path, dpi=150, bbox_inches="tight")
    plt.close(fig)


def entropy_stats(items):
    """Shannon, guessing and min-entropy (bits) of the empirical distribution."""
    counts = np.sort(pd.Series(items).value_counts().values)[::-1]
    p = counts / counts.sum()
    guess = float(np.sum(np.arange(1, len(p) + 1) * p))  # expected guesses, optimal order
    return {
        "N": int(counts.sum()),
        "distinct": len(p),
        "shannon_bits": float(-(p * np.log2(p)).sum()),
        "guessing_G": guess,
        "log2_G": float(np.log2(guess)),
        "min_entropy_bits": float(-np.log2(p[0])),
        "max_bits_log2_distinct": float(np.log2(len(p))),
        "top_item": pd.Series(items).value_counts().index[0],
        "top_p": float(p[0]),
    }


def entropy_table(df):
    rows = []
    for unit, series in (("password", df["password"]), ("base word", df["password"].map(base_word))):
        keep = series.str.len() > 0  # all-digit/symbol passwords have no base word
        for name, mask in [("All", keep)] + [(n, keep & (df["strength"] == c)) for c, n in enumerate(CLASSES)]:
            rows.append({"unit": unit, "class": name, **entropy_stats(series[mask])})
    return pd.DataFrame(rows)


def zipf(df, path=FIG_DIR / "zipf.png", top=1000):
    fig, ax = plt.subplots(figsize=(6, 4.2))
    fits = []
    for unit, series, color in (("password", df["password"], "#4361ee"),
                                ("base word", df["password"].map(base_word), "#f72585")):
        freq = series[series.str.len() > 0].value_counts().values
        rank = np.arange(1, len(freq) + 1)
        k = min(top, len(freq))
        slope, intercept = np.polyfit(np.log10(rank[:k]), np.log10(freq[:k]), 1)
        fits.append({"unit": unit, "distinct": len(freq), "max_freq": int(freq[0]),
                     "n_freq_ge2": int((freq >= 2).sum()), "fit_ranks": k,
                     "slope": slope, "zipf_s": -slope})
        ax.loglog(rank, freq, ".", ms=2, color=color, alpha=0.5, label=f"{unit} (s = {-slope:.2f})")
        ax.loglog(rank[:k], 10 ** (intercept + slope * np.log10(rank[:k])), "-", color=color, lw=1.5)
    ax.set_xlabel("rank r")
    ax.set_ylabel("frequency f(r)")
    ax.set_title(f"Zipf: log f = log c − s·log r  (fit on top {top} ranks)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)
    return pd.DataFrame(fits)


def run_all(df, features):
    chi = chi_square(df, features)
    chi.to_csv(TAB_DIR / "chi_square.csv", index=False)
    plot_cramers_v(chi, features)
    ent = entropy_table(df)
    ent.to_csv(TAB_DIR / "entropy.csv", index=False)
    z = zipf(df)
    z.to_csv(TAB_DIR / "zipf.csv", index=False)
    return chi, ent, z
