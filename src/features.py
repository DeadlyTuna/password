"""All feature extraction -- the ONE source of truth for training and the demo."""
import re

import numpy as np
import pandas as pd

from .data import load_common

# feature name -> (raw count it bins, left-closed bin edges, labels)
BINS = {
    "len_bin": ("length", [0, 6, 8, 10, 12, 16, np.inf], ["<6", "6-7", "8-9", "10-11", "12-15", "16+"]),
    "dig_bin": ("n_digit", [0, 1, 3, 5, np.inf], ["0", "1-2", "3-4", "5+"]),
    "up_bin": ("n_upper", [0, 1, 2, 4, np.inf], ["0", "1", "2-3", "4+"]),
    "sp_bin": ("n_special", [0, 1, 2, 4, np.inf], ["0", "1", "2-3", "4+"]),
}
MK_LABELS = ["Low", "Med", "High"]  # Markov predictability (High = chain finds it easy)

BIN_FEATURES = list(BINS)
PATTERN_FEATURES = ["is_common", "has_seq", "has_repeat", "has_year"]
CONTINUOUS_FEATURES = ["length", "unique_ratio"]
FEATURE_SETS = {
    "base": (BIN_FEATURES, []),
    "pattern": (BIN_FEATURES, PATTERN_FEATURES),
    "markov": (BIN_FEATURES + ["mk_bin"], PATTERN_FEATURES),
}
LEVELS = {**{f: labels for f, (_, _, labels) in BINS.items()}, "mk_bin": MK_LABELS}

COMMON = load_common()
LEET = str.maketrans({"0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i"})
_EDGE_JUNK = re.compile(r"^[\W\d_]+|[\W\d_]+$")
_YEAR = re.compile(r"(19|20)\d{2}")
_REPEAT = re.compile(r"(.)\1\1")
_RUNS = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"]
SEQ3 = frozenset(r[i:i + 3] for run in _RUNS for r in (run, run[::-1]) for i in range(len(r) - 2))


def base_word(pw):
    """Strip digit/symbol padding from both ends, then undo leetspeak."""
    return _EDGE_JUNK.sub("", pw.lower()).translate(LEET)


def is_common(pw):
    low = pw.lower()
    base = base_word(pw)
    return low in COMMON or low.translate(LEET) in COMMON or (len(base) >= 4 and base in COMMON)


def has_seq(pw):
    low = pw.lower()
    return any(low[i:i + 3] in SEQ3 for i in range(len(low) - 2))


def _bin(value, feature):
    _, edges, labels = BINS[feature]
    return labels[int(np.searchsorted(edges, value, side="right")) - 1]


def extract(password):
    p = password
    n = len(p)
    counts = {
        "length": n,
        "n_digit": sum(c.isdigit() for c in p),
        "n_upper": sum(c.isupper() for c in p),
        "n_special": sum(not c.isalnum() for c in p),
    }
    out = {f: _bin(counts[src], f) for f, (src, _, _) in BINS.items()}
    out.update(
        is_common=int(is_common(p)),
        has_seq=int(has_seq(p)),
        has_repeat=int(bool(_REPEAT.search(p))),
        has_year=int(bool(_YEAR.search(p))),
        length=n,
        unique_ratio=len(set(p)) / n if n else 0.0,
    )
    return out


def as_categorical(df):
    """Reindex every binned column to its full label set, so bins unseen in a
    training fold still exist (with count 0) before Laplace smoothing."""
    for f, labels in LEVELS.items():
        if f in df:
            df[f] = pd.Categorical(df[f], categories=labels)
    return df


def add_features(df):
    feats = pd.DataFrame([extract(p) for p in df["password"]], index=df.index)
    return as_categorical(pd.concat([df, feats], axis=1))


def mk_bin(scores, edges):
    """Bin per-char Markov log-probs: higher score = more predictable."""
    idx = np.searchsorted(edges, scores, side="right")
    return pd.Categorical.from_codes(idx, categories=MK_LABELS)
