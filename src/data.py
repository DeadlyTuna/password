"""Load PWLDS, merge its 5 strength levels into 3 classes, sample, and cache.

PWLDS ships as five CSVs (one per level, ~3M rows each). Reading all 15M rows
on every run is slow, so we draw a stratified random sample once and cache it
to data/sample.csv. Every later step reads the cache.
"""
import csv
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
RAW_DIR = ROOT / "datasets" / "PWLDS-main"
DATA_DIR = ROOT / "data"
SAMPLE_PATH = DATA_DIR / "sample.csv"
COMMON_PATH = DATA_DIR / "common_passwords.txt"
FIG_DIR = ROOT / "results" / "figures"
TAB_DIR = ROOT / "results" / "tables"

LEVEL_FILES = {0: "very_weak", 1: "weak", 2: "average", 3: "strong", 4: "very_strong"}
# 5 PWLDS levels -> 3 classes: {0,1} Weak, {2} Medium, {3,4} Strong.
LEVEL_TO_CLASS = {0: 0, 1: 0, 2: 1, 3: 2, 4: 2}
CLASSES = ["Weak", "Medium", "Strong"]
N_PER_FILE = 40_000
SEED = 42


def _read_raw(level):
    path = RAW_DIR / f"pwlds_{LEVEL_FILES[level]}.csv"
    # Standard RFC-4180 CSV: passwords containing commas/quotes are quoted and
    # inner quotes doubled, so the default parser already unescapes "" -> ".
    df = pd.read_csv(path, dtype=str, keep_default_na=False, quoting=csv.QUOTE_MINIMAL)
    return df.rename(columns={"Password": "password", "Strength_Level": "level"})


def clean(df):
    """Restore escaped commas, drop empty passwords, cast labels to int."""
    df = df.copy()
    df["password"] = df["password"].str.replace("###COMMA###", ",", regex=False)
    df = df[df["password"].str.len() > 0]
    df["level"] = df["level"].astype(int)
    df["strength"] = df["level"].map(LEVEL_TO_CLASS)
    return df.reset_index(drop=True)


def build_sample(n_per_file=N_PER_FILE, seed=SEED):
    parts = []
    for level in LEVEL_FILES:
        raw = _read_raw(level)
        print(f"  {LEVEL_FILES[level]:<12} {len(raw):>9,} rows")
        parts.append(raw.sample(n=n_per_file, random_state=seed))
    df = clean(pd.concat(parts, ignore_index=True))
    df = df.sample(frac=1, random_state=seed).reset_index(drop=True)
    DATA_DIR.mkdir(exist_ok=True)
    df.to_csv(SAMPLE_PATH, index=False, quoting=csv.QUOTE_NONNUMERIC)
    return df


def load(rebuild=False):
    if rebuild or not SAMPLE_PATH.exists():
        print("Building sample from raw PWLDS files...")
        return build_sample()
    df = pd.read_csv(SAMPLE_PATH, dtype={"password": str}, keep_default_na=False)
    return clean(df[["password", "level"]])


def load_common():
    if not COMMON_PATH.exists():
        return frozenset()
    with open(COMMON_PATH, encoding="utf-8", errors="ignore") as f:
        return frozenset(line.strip().lower() for line in f if line.strip())


def plot_class_dist(df, path=FIG_DIR / "class_dist.png"):
    counts = df["strength"].value_counts().sort_index()
    fig, ax = plt.subplots(figsize=(5, 3.2))
    bars = ax.bar(CLASSES, counts.values, color=["#e4572e", "#f3a712", "#29bf12"])
    ax.bar_label(bars, labels=[f"{v:,}\n({v / counts.sum():.0%})" for v in counts.values], fontsize=8)
    ax.set_ylabel("passwords")
    ax.set_title("Class prior P(C): empirical class distribution")
    ax.set_ylim(0, counts.max() * 1.25)
    ax.spines[["top", "right"]].set_visible(False)
    fig.tight_layout()
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=150)
    plt.close(fig)


if __name__ == "__main__":
    df = load(rebuild=True)
    print("shape:", df.shape)
    print(df["strength"].map(dict(enumerate(CLASSES))).value_counts())
    plot_class_dist(df)
