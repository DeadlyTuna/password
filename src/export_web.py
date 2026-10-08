"""Export the trained model and every result the website needs.

    python -m src.export_web      (run after python -m src.evaluate)

Writes web/data/model.json (model counts, Markov chain, results, EDA) and
web/data/test_vectors.json (Python outputs the JS engine must reproduce).
"""
import json
import random
import string
from itertools import combinations

import numpy as np
import pandas as pd

from .data import CLASSES, LEVEL_FILES, ROOT, SEED, TAB_DIR, load
from .features import BINS, COMMON, FEATURE_SETS, LEET, LEVELS, MK_LABELS, _RUNS, add_features, base_word, extract
from .model import NaiveBayes, load_model

WEB_DATA = ROOT / "web" / "data"
EDGE_CASES = ["", "a", "Summer2026!", "password123", "P@ssw0rd!", "qwerty", "aaa", "abc", "1999", "pässwörd",
              "😀😀😀abc", "  spaced  pass ", "ÄBC123", "x" * 40, "Tr0ub4dor&3", "kq7#Vx!9mZ@2kLp$",
              "correcthorsebatterystaple", "١٢٣٤", "Dragon!1987", "zxcvbnm", "iloveyou", "MONKEY", "l3tm31n"]


TEXT_COLS = {"password", "top_item", "model", "A", "B", "flip", "true", "pred_pattern", "pred_markov", "class", "unit",
             "f1", "f2", "features", "prior", "train_size", "label", "len_bin", "dig_bin", "up_bin", "sp_bin"}


def records(name):
    """CSV -> list of dicts with real numbers, None for missing (never NaN), text kept verbatim."""
    df = pd.read_csv(TAB_DIR / name, keep_default_na=False).rename(columns={"Unnamed: 0": "label"})
    for col in df.columns:
        if col in TEXT_COLS:
            df[col] = df[col].astype(str)
            continue
        if df[col].dtype == bool:
            continue
        num = pd.to_numeric(df[col].replace("", np.nan), errors="coerce")
        df[col] = num.astype(object).where(num.notna(), None)
    return df.to_dict("records")


def counts_block(nb, df):
    y = df["strength"].values
    out = {}
    for f in nb.features:
        levels = LEVELS[f] if f in nb.cat_features else [0, 1]
        ct = pd.crosstab(np.asarray(df[f]), y).reindex(index=levels, columns=range(3), fill_value=0)
        out[f] = {"kind": "cat" if f in nb.cat_features else "bin", "levels": [str(v) for v in levels],
                  "counts": ct.values.astype(int).tolist()}
        # sanity: smoothed counts reproduce the fitted table
        K = len(levels)
        tab = (ct.values + nb.alpha) / (np.bincount(y, minlength=3) + nb.alpha * K)
        assert np.allclose(tab, nb.tables[f].values), f
    return out


def hist(values, lo, hi, step):
    edges = np.arange(lo, hi + step / 2, step)
    return {"edges": edges.round(6).tolist(), "counts": np.histogram(np.clip(values, lo, hi - 1e-9), edges)[0].tolist()}


def zipf_points(series, n_points=260):
    freq = series[series.str.len() > 0].value_counts().values
    ranks = np.unique(np.round(np.logspace(0, np.log10(len(freq)), n_points)).astype(int))
    return {"rank": ranks.tolist(), "freq": freq[ranks - 1].astype(int).tolist(), "distinct": len(freq),
            "top": series[series.str.len() > 0].value_counts().head(12).to_dict()}


def contingency(df, feats):
    out = []
    for c, name in enumerate(CLASSES):
        sub = df[df["strength"] == c]
        for f1, f2 in combinations(feats, 2):
            l1 = LEVELS.get(f1, [0, 1])
            l2 = LEVELS.get(f2, [0, 1])
            ct = pd.crosstab(np.asarray(sub[f1]), np.asarray(sub[f2])).reindex(index=l1, columns=l2, fill_value=0)
            out.append({"class": name, "f1": f1, "f2": f2, "rows": [str(v) for v in l1], "cols": [str(v) for v in l2],
                        "observed": ct.values.astype(int).tolist()})
    return out


def main():
    WEB_DATA.mkdir(parents=True, exist_ok=True)
    model = load_model()
    nb, chain = model.nb, model.chain
    df = model.transform(add_features(load()))
    y = df["strength"].values
    summary = json.loads((ROOT / "results" / "summary.json").read_text(encoding="utf-8"))
    feats = nb.features

    samples = {LEVEL_FILES[l]: df.loc[df["level"] == l, "password"].sample(12, random_state=SEED).tolist() for l in LEVEL_FILES}
    lengths = df["password"].str.len()

    data = {
        "meta": {"n": len(df), "classes": CLASSES, "class_counts": np.bincount(y).tolist(), "seed": SEED,
                 "levels": {str(k): v for k, v in LEVEL_FILES.items()}, "level_to_class": {"0": 0, "1": 0, "2": 1, "3": 2, "4": 2},
                 "n_per_file": int((df["level"] == 0).sum()), "pwlds_rows": 15_001_121, "common_list_size": len(COMMON)},
        "features": {"cat": nb.cat_features, "bin": nb.bin_features, "order": feats},
        "bins": {f: {"source": src, "edges": [e if np.isfinite(e) else None for e in edges], "labels": labels}
                 for f, (src, edges, labels) in BINS.items()},
        "mk": {"labels": MK_LABELS, "edges": model.mk_edges.tolist()},
        "nb": {"alpha": nb.alpha, "class_n": np.bincount(y).tolist(), "counts": counts_block(nb, df)},
        "markov": {"order": chain.order, "alpha": chain.alpha, "V": chain.V, "grams": chain.grams},
        "lex": {"common": sorted(COMMON), "leet": {chr(k): v for k, v in LEET.items()}, "runs": _RUNS},
        "results": {
            "baseline_acc": summary["baseline_acc"],
            "ablation": records("ablation.csv"),
            "mcnemar": records("mcnemar.csv"),
            "report": {fs: records(f"classification_report_{fs}.csv") for fs in FEATURE_SETS},
            "confusion": {fs: pd.read_csv(TAB_DIR / f"confusion_{fs}.csv", index_col=0).values.tolist() for fs in FEATURE_SETS},
            "alpha_sweep": records("alpha_sweep.csv"),
            "prior_experiment": records("prior_experiment.csv"),
            "markov_orders": records("markov_orders.csv"),
            "chi_square": records("chi_square.csv"),
            "bonferroni_alpha": summary["chi_square"]["bonferroni_alpha"],
            "entropy": records("entropy.csv"),
            "zipf_fits": records("zipf.csv"),
            "flips": records("flips.csv"),
            "worked_examples": summary["worked_examples"],
        },
        "eda": {
            "length_hist": {LEVEL_FILES[l]: lengths[df["level"] == l].value_counts().sort_index().to_dict() for l in LEVEL_FILES},
            "length_stats": {LEVEL_FILES[l]: lengths[df["level"] == l].describe().round(3).to_dict() for l in LEVEL_FILES},
            "samples": samples,
            "mk_hist": {name: hist(df.loc[y == c, "mk_score"].values, -6.0, -1.0, 0.05) for c, name in enumerate(CLASSES)},
            "zipf": {"password": zipf_points(df["password"]), "base_word": zipf_points(df["password"].map(base_word))},
            "contingency": contingency(df, feats),
        },
    }
    data["eda"]["length_hist"] = {k: {str(a): int(b) for a, b in v.items()} for k, v in data["eda"]["length_hist"].items()}
    data["eda"]["zipf"] = {k: {**v, "top": {str(a): int(b) for a, b in v["top"].items()}} for k, v in data["eda"]["zipf"].items()}

    def clean(o):  # JSON has no NaN/Infinity
        if isinstance(o, float) and not np.isfinite(o):
            return None
        if isinstance(o, dict):
            return {k: clean(v) for k, v in o.items()}
        if isinstance(o, (list, tuple)):
            return [clean(v) for v in o]
        return o

    data = clean(data)
    path = WEB_DATA / "model.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=float, allow_nan=False), encoding="utf-8")
    print(f"model.json: {path.stat().st_size / 1e6:.2f} MB, {len(chain.grams):,} Markov grams")

    # ---- test vectors: Python is the reference the JS engine must match ----
    nb01 = NaiveBayes(nb.cat_features, nb.bin_features, 0.1).fit(df, y)
    nbu = NaiveBayes(nb.cat_features, nb.bin_features, 1.0, "uniform").fit(df, y)
    rand = ["".join(random.Random(i).choice(string.printable[:94]) for _ in range(random.Random(i).randint(1, 30))) for i in range(40)]
    pws = EDGE_CASES + rand + df["password"].sample(300, random_state=1).tolist()
    vec = []
    for pw in pws:
        ex = model.explain(pw)
        row = model.transform(pd.DataFrame([{"password": pw, **extract(pw)}])).iloc[[0]]
        from .features import as_categorical
        row = as_categorical(row)
        vec.append({
            "password": pw,
            "features": {k: (v if isinstance(v, (int, float, str)) else str(v)) for k, v in extract(pw).items()},
            "base_word": base_word(pw),
            "mk_score": float(chain.per_char(pw)), "log_prob": float(chain.log_prob(pw)), "mk_bin": str(ex["features"]["mk_bin"]),
            "posterior": ex["posterior"].tolist(),
            "posterior_alpha01": nb01.predict_proba(row)[0].tolist(),
            "posterior_uniform": nbu.predict_proba(row)[0].tolist(),
            "evidence": ex["evidence"].tolist(),
        })
    (WEB_DATA / "test_vectors.json").write_text(json.dumps(vec, ensure_ascii=False, default=float), encoding="utf-8")
    print(f"test_vectors.json: {len(vec)} passwords")


if __name__ == "__main__":
    main()
