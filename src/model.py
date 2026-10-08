"""Naive Bayes over binned + binary password features, with an optional Markov feature."""
import pickle

import numpy as np
import pandas as pd
from scipy.special import logsumexp

from .data import CLASSES, ROOT, load
from .features import FEATURE_SETS, LEVELS, add_features, as_categorical, extract, mk_bin
from .markov import MarkovChain

MODEL_PATH = ROOT / "results" / "model.pkl"


class NaiveBayes:
    """P(C | x) ∝ P(C) · ∏_f P(x_f | C), every likelihood Laplace-smoothed.

    Binary pattern features are Bernoulli: a 2-level categorical with the same
    add-alpha smoothing, theta_f|C = (count + alpha) / (n_C + 2 alpha).
    """

    def __init__(self, cat_features, bin_features=(), alpha=1.0, prior_mode="data"):
        self.cat_features = list(cat_features)
        self.bin_features = list(bin_features)
        self.alpha = alpha
        self.prior_mode = prior_mode

    @property
    def features(self):
        return self.cat_features + self.bin_features

    def fit(self, X, y):
        y = np.asarray(y)
        C = len(CLASSES)
        n_c = np.bincount(y, minlength=C)
        self.prior = pd.Series(n_c / n_c.sum() if self.prior_mode == "data" else np.full(C, 1 / C), index=CLASSES)
        self.tables = {}
        for f in self.features:
            levels = LEVELS[f] if f in self.cat_features else [0, 1]
            counts = pd.crosstab(np.asarray(X[f]), y).reindex(index=levels, columns=range(C), fill_value=0)
            tab = (counts + self.alpha) / (n_c + self.alpha * len(levels))
            tab.columns = CLASSES
            self.tables[f] = tab
        self.bernoulli = {f: self.tables[f].loc[1] for f in self.bin_features}
        return self

    def log_joint(self, X):
        lj = np.tile(np.log(self.prior.values), (len(X), 1))
        for f, tab in self.tables.items():
            codes = pd.Categorical(np.asarray(X[f]), categories=tab.index).codes
            assert (codes >= 0).all(), f"unknown value in {f}"
            lj += np.log(tab.values)[codes]
        return lj

    def predict_proba(self, X):
        lj = self.log_joint(X)
        return np.exp(lj - logsumexp(lj, axis=1, keepdims=True))

    def predict(self, X):
        return self.log_joint(X).argmax(axis=1)

    def explain_row(self, row):
        """Step table (prior -> likelihoods -> joint -> evidence -> posterior)
        and per-feature log-evidence ln P(f|Strong) - ln P(f|Weak)."""
        steps = {"P(C)  prior": self.prior.values}
        log_joint = np.log(self.prior.values)
        evidence = {}
        for f, tab in self.tables.items():
            lik = tab.loc[row[f]].values
            steps[f"P({f}={row[f]} | C)"] = lik
            log_joint = log_joint + np.log(lik)
            evidence[f"{f}={row[f]}"] = np.log(tab.loc[row[f], "Strong"]) - np.log(tab.loc[row[f], "Weak"])
        log_px = logsumexp(log_joint)
        steps["P(C)·∏P(f|C)  joint"] = np.exp(log_joint)
        steps["P(x) = Σ_C joint  evidence"] = np.full(len(CLASSES), np.exp(log_px))
        steps["P(C | x)  posterior"] = np.exp(log_joint - log_px)
        return pd.DataFrame(steps, index=CLASSES).T, pd.Series(evidence, name="log-evidence")


def fit_markov_feature(train_passwords, order=2, alpha=1.0):
    chain = MarkovChain(order, alpha).train(train_passwords)
    edges = np.quantile(chain.score(train_passwords), [1 / 3, 2 / 3])  # tertiles -> Low/Med/High
    return chain, edges


class PasswordModel:
    """Feature pipeline + NaiveBayes. feature_set is 'base', 'pattern' or 'markov'."""

    def __init__(self, feature_set="markov", alpha=1.0, prior_mode="data", markov_order=2):
        self.feature_set = feature_set
        self.markov_order = markov_order
        cat, binf = FEATURE_SETS[feature_set]
        self.nb = NaiveBayes(cat, binf, alpha, prior_mode)
        self.uses_markov = "mk_bin" in cat

    def transform(self, df):
        if self.uses_markov:
            df = df.assign(mk_score=self.chain.score(df["password"]))
            df["mk_bin"] = mk_bin(df["mk_score"].values, self.mk_edges)
        return df

    def fit(self, df):
        if self.uses_markov:
            self.chain, self.mk_edges = fit_markov_feature(df["password"], self.markov_order)
        self.nb.fit(self.transform(df), df["strength"])
        return self

    def predict_proba(self, df):
        return self.nb.predict_proba(self.transform(df))

    def predict(self, df):
        return self.nb.predict(self.transform(df))

    def explain(self, password):
        row = pd.DataFrame([{"password": password, **extract(password)}])
        row = self.transform(as_categorical(row)).iloc[0]
        steps, evidence = self.nb.explain_row(row)
        post = steps.loc["P(C | x)  posterior"]
        return {
            "password": password,
            "features": row.drop("password").to_dict(),
            "steps": steps,
            "evidence": evidence,
            "posterior": post,
            "pred": post.idxmax(),
            "confidence": float(post.max()),
        }


def train_full(save=True, df=None):
    df = add_features(load()) if df is None else df
    model = PasswordModel().fit(df)
    if save:
        MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(MODEL_PATH, "wb") as f:
            pickle.dump(model, f)
    return model


def load_model():
    if MODEL_PATH.exists():
        with open(MODEL_PATH, "rb") as f:
            return pickle.load(f)
    return train_full()


if __name__ == "__main__":
    from sklearn.model_selection import train_test_split

    df = add_features(load())
    tr, te = train_test_split(df, test_size=0.2, stratify=df["strength"], random_state=0)
    for fs in FEATURE_SETS:
        m = PasswordModel(fs).fit(tr)
        print(f"{fs:<8} accuracy = {(m.predict(te) == te['strength'].values).mean():.4f}")
    print(m.explain("Summer2026!")["steps"].round(5))
