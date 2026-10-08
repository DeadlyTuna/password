"""Character-level Markov chain: P(pw) = prod_i P(c_i | c_{i-k..i-1})."""
from collections import Counter
import math

import numpy as np

START, END = "^", "$"


class MarkovChain:
    def __init__(self, order=2, alpha=1.0):
        self.order = order
        self.alpha = alpha

    def _pad(self, pw):
        return START * self.order + pw + END

    def train(self, passwords):
        """Count padded (k+1)-grams. Call on TRAIN passwords only."""
        k = self.order
        grams = Counter()
        for pw in passwords:
            s = self._pad(pw)
            grams.update(s[i:i + k + 1] for i in range(len(s) - k))
        ctx = Counter()
        for g, n in grams.items():
            ctx[g[:k]] += n
        self.grams, self.ctx = dict(grams), dict(ctx)
        # Vocabulary of possible next symbols: every char seen plus END, plus 1 for unseen chars.
        self.V = len({g[-1] for g in grams}) + 1
        return self

    def log_prob(self, pw):
        """Laplace-smoothed log P(pw) via the chain rule (natural log)."""
        k, a, V = self.order, self.alpha, self.V
        s = self._pad(pw)
        lp = 0.0
        for i in range(len(s) - k):
            g = s[i:i + k + 1]
            lp += math.log((self.grams.get(g, 0) + a) / (self.ctx.get(g[:k], 0) + a * V))
        return lp

    def per_char(self, pw):
        return self.log_prob(pw) / (len(pw) + 1)

    def score(self, passwords):
        return np.array([self.per_char(p) for p in passwords])

    def unseen_context_rate(self, passwords):
        """Share of transitions whose context never appeared in training (sparsity)."""
        k = self.order
        seen = total = 0
        for pw in passwords:
            s = self._pad(pw)
            for i in range(len(s) - k):
                total += 1
                seen += s[i:i + k] in self.ctx
        return 1 - seen / total
