"""Live, animated ipywidgets demo. The notebook only calls launch() / show().

Every keystroke re-renders one HTML card. To keep it fluid, Python remembers the
previous values and each bar/ring animates from old -> new with CSS keyframes
(custom properties --w0/--w1 etc.), so nothing ever jumps.
"""
import html
import time

import ipywidgets as w
from IPython.display import HTML

from .data import CLASSES
from .model import load_model

ACCENT = {"Weak": "#ff4d6d", "Medium": "#ffb703", "Strong": "#2ee6a6"}
EV_MAX = 10.0  # evidence axis half-width in nats (clipped beyond)
EXAMPLES = ["password123", "Summer2026!", "qwerty", "asdfgh1234", "Tr0ub4dor&3", "kq7#Vx!9mZ@2kLp$"]
PATTERNS = {
    "is_common": ("common password", "not on common list"),
    "has_seq": ("keyboard / alphabet run", "no runs"),
    "has_repeat": ("triple repeat", "no repeats"),
    "has_year": ("year inside", "no year"),
}
LABELS = {"len_bin": "length", "dig_bin": "digits", "up_bin": "upper", "sp_bin": "symbols", "mk_bin": "Markov"}

CSS = """
<style>
@property --pwb-p { syntax: '<number>'; inherits: false; initial-value: 0; }
@property --pwb-n { syntax: '<integer>'; inherits: false; initial-value: 0; }
@property --pwb-glow { syntax: '<color>'; inherits: true; initial-value: #7c5cff; }
.pwb-shell { background: #070b18; border-radius: 24px; padding: 18px 18px 6px; color: #e8ecff;
  font-family: "Segoe UI Variable", "Segoe UI", Inter, system-ui, sans-serif; max-width: 980px;
  box-shadow: 0 30px 80px -30px rgba(10, 10, 40, .8); }
.pwb-title { font-size: 22px; font-weight: 700; letter-spacing: -.02em; margin: 2px 4px 2px; }
.pwb-title span { background: linear-gradient(90deg, #7c5cff, #2ee6a6); -webkit-background-clip: text;
  background-clip: text; color: transparent; }
.pwb-sub { font-size: 12.5px; color: #8a93b8; margin: 0 4px 10px; }
.pwb-input { width: 100% !important; }
.pwb-input input { background: #0f1530 !important; color: #f3f5ff !important; height: 52px !important;
  border: 1px solid rgba(255,255,255,.12) !important; border-radius: 16px !important; padding: 0 18px !important;
  font: 20px "Cascadia Code", "JetBrains Mono", Consolas, monospace !important; letter-spacing: .03em;
  transition: border-color .25s, box-shadow .25s; }
.pwb-input input:focus { outline: none !important; border-color: #7c5cff !important;
  box-shadow: 0 0 0 4px rgba(124,92,255,.22), 0 0 30px rgba(124,92,255,.25) !important; }
.pwb-try-row { gap: 6px; flex-wrap: wrap; margin: 4px 0 2px; }
.pwb-try { background: rgba(255,255,255,.05) !important; color: #c9d1ff !important; border-radius: 999px !important;
  border: 1px solid rgba(255,255,255,.1) !important; font-family: Consolas, monospace !important; width: auto !important;
  padding: 0 14px !important; transition: background .2s, transform .15s, border-color .2s; }
.pwb-try:hover { background: rgba(124,92,255,.2) !important; border-color: #7c5cff !important; transform: translateY(-1px); }
.pwb-try:active { transform: scale(.96); }

.pwb { position: relative; overflow: hidden; isolation: isolate; border-radius: 20px; padding: 22px;
  margin: 8px 0 12px; background: rgba(16, 22, 48, .85); border: 1px solid rgba(255,255,255,.08);
  animation: pwb-glow .7s ease both; }
@keyframes pwb-glow { from { --pwb-glow: var(--a0); } to { --pwb-glow: var(--a1); } }
.pwb::before { content: ""; position: absolute; inset: -50%; z-index: -1; filter: blur(40px); opacity: .55;
  background: radial-gradient(circle at 30% 35%, color-mix(in srgb, var(--pwb-glow) 45%, transparent), transparent 32%),
              radial-gradient(circle at 70% 65%, rgba(124,92,255,.35), transparent 35%);
  animation: pwb-drift 24s linear infinite; animation-delay: var(--t); }
@keyframes pwb-drift { to { transform: rotate(360deg); } }
.pwb h4 { margin: 0 0 10px; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #8a93b8; }
.pwb h4 em { font-style: normal; text-transform: none; letter-spacing: 0; color: #5f6890; }
.pwb section { background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.06); border-radius: 16px; padding: 14px 16px; }

.pwb-hero { display: flex; gap: 26px; align-items: center; margin-bottom: 16px; }
.pwb-ring { --size: 132px; width: var(--size); height: var(--size); flex: none; border-radius: 50%; display: grid; place-items: center;
  background: conic-gradient(var(--pwb-glow) calc(var(--pwb-p) * 1%), rgba(255,255,255,.07) 0);
  box-shadow: 0 0 40px color-mix(in srgb, var(--pwb-glow) 35%, transparent);
  animation: pwb-ring .7s cubic-bezier(.2,.8,.2,1) both; }
@keyframes pwb-ring { from { --pwb-p: var(--p0); } to { --pwb-p: var(--p1); } }
.pwb-ring > div { width: calc(var(--size) - 22px); height: calc(var(--size) - 22px); border-radius: 50%; background: #0c1128;
  display: grid; place-content: center; text-align: center; }
.pwb-num { font-size: 32px; font-weight: 750; letter-spacing: -.03em; counter-reset: n var(--pwb-n);
  animation: pwb-count .7s cubic-bezier(.2,.8,.2,1) both; }
.pwb-num::after { content: counter(n) "%"; }
@keyframes pwb-count { from { --pwb-n: var(--n0); } to { --pwb-n: var(--n1); } }
.pwb-ring small { font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: #8a93b8; }
.pwb-verdict { flex: 1; min-width: 0; }
.pwb-kicker { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: #8a93b8; }
.pwb-class { font-size: 46px; font-weight: 800; letter-spacing: -.04em; line-height: 1.05; color: var(--pwb-glow);
  text-shadow: 0 0 28px color-mix(in srgb, var(--pwb-glow) 55%, transparent); }
.pwb-pw { font: 15px "Cascadia Code", Consolas, monospace; color: #b9c2ec; margin: 4px 0 14px; word-break: break-all; }
.pwb-meter { position: relative; height: 10px; border-radius: 99px;
  background: linear-gradient(90deg, #ff4d6d, #ffb703 50%, #2ee6a6); box-shadow: inset 0 0 0 1px rgba(255,255,255,.08); }
.pwb-thumb { position: absolute; top: 50%; width: 20px; height: 20px; margin: -10px 0 0 -10px; border-radius: 50%;
  background: #fff; box-shadow: 0 0 0 4px rgba(255,255,255,.18), 0 0 18px var(--pwb-glow);
  animation: pwb-m .7s cubic-bezier(.2,.8,.2,1) both; }
@keyframes pwb-m { from { left: var(--m0); } to { left: var(--m1); } }
.pwb-ticks { display: flex; justify-content: space-between; font-size: 11px; color: #6c76a0; margin-top: 6px; }

.pwb-grid { display: grid; grid-template-columns: 1fr 1.35fr; gap: 14px; margin-bottom: 14px; }
.pwb-row { display: grid; grid-template-columns: 64px 1fr 58px; align-items: center; gap: 10px; margin: 9px 0; font-size: 13px; }
.pwb-track { position: relative; height: 12px; border-radius: 99px; background: rgba(255,255,255,.06); overflow: hidden; }
.pwb-track i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; background: var(--c);
  box-shadow: 0 0 14px color-mix(in srgb, var(--c) 60%, transparent); animation: pwb-w .6s cubic-bezier(.2,.8,.2,1) both; }
@keyframes pwb-w { from { width: var(--w0); } to { width: var(--w1); } }
.pwb-val { font: 12px Consolas, monospace; color: #c9d1ff; text-align: right; }
.pwb-ev .pwb-row { grid-template-columns: 128px 1fr 50px; margin: 6px 0; }
.pwb-ev .pwb-lab { font: 11.5px Consolas, monospace; color: #b9c2ec; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pwb-ev .pwb-track { height: 10px; border-radius: 4px; overflow: visible; }
.pwb-ev .pwb-track::after { content: ""; position: absolute; left: 50%; top: -3px; bottom: -3px; width: 1px; background: rgba(255,255,255,.25); }
.pwb-ev .pwb-track i { border-radius: 3px; animation-name: pwb-ev; }
@keyframes pwb-ev { from { left: var(--l0); width: var(--w0); } to { left: var(--l1); width: var(--w1); } }
.pwb-axis { display: flex; justify-content: space-between; font-size: 10.5px; color: #6c76a0; margin: 2px 0 0 138px; padding-right: 60px; }

.pwb-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.pwb-chip { font-size: 12.5px; padding: 6px 12px; border-radius: 999px; background: rgba(255,255,255,.05);
  border: 1px solid rgba(255,255,255,.09); color: #c9d1ff; transition: all .3s; }
.pwb-chip b { color: #fff; font-weight: 650; }
.pwb-chip.off { color: #5f6890; }
.pwb-chip.bad { background: rgba(255,77,109,.14); border-color: rgba(255,77,109,.7); color: #ffd3dc;
  box-shadow: 0 0 18px rgba(255,77,109,.25); }
.pwb-chip.flip { animation: pwb-pop .45s cubic-bezier(.3,1.6,.5,1) both; }
@keyframes pwb-pop { from { transform: scale(.7); opacity: .2; } }
.pwb-tips { list-style: none; margin: 0; padding: 0; }
.pwb-tips li { padding: 9px 12px 9px 38px; margin: 6px 0; border-radius: 12px; background: rgba(255,255,255,.04); position: relative; font-size: 13.5px; line-height: 1.4; }
.pwb-tips li::before { content: attr(data-i); position: absolute; left: 12px; top: 8px; }
.pwb-tips li.new { animation: pwb-in .5s cubic-bezier(.2,.8,.2,1) both; }
.pwb-tips li.note { color: #9aa3cc; font-size: 12.5px; }
@keyframes pwb-in { from { transform: translateX(-14px); opacity: 0; } }
.pwb-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
.pwb details { background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.06); border-radius: 16px; padding: 12px 16px; }
.pwb summary { cursor: pointer; font-size: 11px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: #8a93b8; }
.pwb table { width: 100%; border-collapse: collapse; margin-top: 10px; font: 12px Consolas, monospace; }
.pwb th, .pwb td { padding: 6px 10px; text-align: right; border-bottom: 1px solid rgba(255,255,255,.05); color: #c9d1ff; background: transparent !important; }
.pwb th:first-child, .pwb td:first-child { text-align: left; color: #8a93b8; }
.pwb tr.sum td { color: #fff; font-weight: 700; border-top: 1px solid rgba(255,255,255,.2); }
.pwb td.max { color: var(--pwb-glow); }
.pwb-empty { text-align: center; padding: 40px 10px; color: #6c76a0; font-size: 15px; }
@media (max-width: 720px) { .pwb-grid, .pwb-cols { grid-template-columns: 1fr; } .pwb-hero { flex-direction: column; align-items: flex-start; } }
@media (prefers-reduced-motion: reduce) { .pwb *, .pwb, .pwb::before { animation-duration: 1ms !important; } }
</style>
"""


def tips(ex):
    f = ex["features"]
    out = []
    if f["is_common"]:
        out.append(("🚫", "It is (or is built on) a top-10k common password, so guessers try it first. Pick something unique."))
    if f["has_year"]:
        out.append(("📅", "Remove the year. Dates like 1999 or 2026 are among the first things attackers append."))
    if f["has_seq"]:
        out.append(("⌨️", "Avoid keyboard and alphabet runs (qwe, asd, abc, 123)."))
    if f["has_repeat"]:
        out.append(("🔁", "Break up repeated characters (aaa, 111)."))
    if f["length"] < 12:
        out.append(("📏", f"Make it longer: {f['length']} chars now, aim for 12+. Length grows the search space fastest."))
    missing = [n for n, b in (("an uppercase letter", "up_bin"), ("a digit", "dig_bin"), ("a symbol", "sp_bin")) if f[b] == "0"]
    if missing:
        out.append(("🔣", "Mix in " + ", ".join(missing) + "."))
    if f.get("mk_bin") == "High":
        out.append(("🔮", "It reads like natural text, so the Markov chain finds it very predictable. Use random words or characters."))
    if ex["pred"] == "Strong" and any(f[p] for p in PATTERNS):
        out.append(("ℹ️", "Note: the model says Strong mainly because PWLDS 'Weak' passwords never contain symbols. "
                          "The red flags above are what real attackers exploit."))
    return out or [("✨", "Nothing obvious to fix. Nice.")]


def _fmt(v):
    return "0" if v == 0 else (f"{v:.2e}" if abs(v) < 1e-3 else f"{v:.4f}")


def _pct(x):
    return f"{100 * x:.2f}%"


class App:
    def __init__(self, model=None):
        self.model = model or load_model()
        self.prev = {"post": [1 / 3] * 3, "conf": 33, "meter": 0.5, "accent": "#7c5cff", "ev": {}, "flags": {}, "tips": set()}

    def _ev_geom(self, e):
        x = max(-EV_MAX, min(EV_MAX, e)) / EV_MAX * 50  # percent of track from centre
        return 50 + min(0.0, x), abs(x)

    def render(self, password):
        if not password:
            return '<div class="pwb" style="--a0:#7c5cff;--a1:#7c5cff;--t:0s"><div class="pwb-empty">Start typing a password ✨</div></div>'
        ex = self.model.explain(password)
        p, prev = ex["posterior"].values, self.prev
        accent = ACCENT[ex["pred"]]
        conf = round(100 * ex["confidence"])
        meter = p[1] * 0.5 + p[2]
        f = ex["features"]

        bars = "".join(
            f'<div class="pwb-row"><span>{c}</span><div class="pwb-track"><i style="--c:{ACCENT[c]};'
            f'--w0:{_pct(prev["post"][i])};--w1:{_pct(p[i])}"></i></div><span class="pwb-val">{p[i]:.4f}</span></div>'
            for i, c in enumerate(CLASSES))

        ev_rows, ev_now = [], {}
        for key, e in ex["evidence"].items():
            feat = key.split("=")[0]
            l1, w1 = self._ev_geom(e)
            l0, w0 = self._ev_geom(prev["ev"].get(feat, 0.0))
            ev_now[feat] = e
            color = ACCENT["Strong"] if e >= 0 else ACCENT["Weak"]
            ev_rows.append(
                f'<div class="pwb-row"><span class="pwb-lab" title="{html.escape(key)}">{html.escape(key)}</span>'
                f'<div class="pwb-track"><i style="--c:{color};--l0:{l0:.2f}%;--w0:{w0:.2f}%;--l1:{l1:.2f}%;--w1:{w1:.2f}%"></i></div>'
                f'<span class="pwb-val">{e:+.2f}</span></div>')

        chips = [f'<span class="pwb-chip">{LABELS[k]} <b>{html.escape(str(f[k]))}</b></span>' for k in ("len_bin", "dig_bin", "up_bin", "sp_bin")]
        if "mk_bin" in f:
            chips.append(f'<span class="pwb-chip">Markov predictability <b>{f["mk_bin"]}</b> '
                         f'<span style="opacity:.6">({f["mk_score"]:.2f} nats/char)</span></span>')
        chips.append(f'<span class="pwb-chip">unique ratio <b>{f["unique_ratio"]:.2f}</b></span>')
        for k, (on_txt, off_txt) in PATTERNS.items():
            flip = " flip" if prev["flags"].get(k) is not None and prev["flags"][k] != f[k] else ""
            chips.append(f'<span class="pwb-chip {"bad" if f[k] else "off"}{flip}">{"⚠ " + on_txt if f[k] else "✓ " + off_txt}</span>')

        tip_list = tips(ex)
        tip_html = "".join(
            f'<li data-i="{icon}" class="{"note" if icon == "ℹ️" else ""} {"new" if text not in prev["tips"] else ""}">{html.escape(text)}</li>'
            for icon, text in tip_list)

        steps = ex["steps"]
        best = int(p.argmax())
        rows = []
        for name, vals in steps.iterrows():
            cls = ' class="sum"' if name.startswith("P(C | x)") else ""
            cells = "".join(f'<td class="{"max" if (cls and i == best) else ""}">{_fmt(v)}</td>' for i, v in enumerate(vals))
            rows.append(f"<tr{cls}><td>{html.escape(name)}</td>{cells}</tr>")
        table = f'<table><tr><th>step</th>{"".join(f"<th>{c}</th>" for c in CLASSES)}</tr>{"".join(rows)}</table>'

        self.prev = {"post": list(p), "conf": conf, "meter": meter, "accent": accent, "ev": ev_now,
                     "flags": {k: f[k] for k in PATTERNS}, "tips": {t for _, t in tip_list}}
        return f"""
<div class="pwb" style="--a0:{prev['accent']};--a1:{accent};--t:-{time.time() % 24:.2f}s">
  <div class="pwb-hero">
    <div class="pwb-ring" style="--p0:{prev['conf']};--p1:{100 * ex['confidence']:.2f}">
      <div><span class="pwb-num" style="--n0:{prev['conf']};--n1:{conf}"></span><small>confidence</small></div>
    </div>
    <div class="pwb-verdict">
      <div class="pwb-kicker">argmax P(C | password)</div>
      <div class="pwb-class">{ex['pred']}</div>
      <div class="pwb-pw">{html.escape(password)}</div>
      <div class="pwb-meter"><div class="pwb-thumb" style="--m0:{100 * prev['meter']:.2f}%;--m1:{100 * meter:.2f}%"></div></div>
      <div class="pwb-ticks"><span>Weak</span><span>Medium</span><span>Strong</span></div>
    </div>
  </div>
  <div class="pwb-grid">
    <section><h4>Posterior <em>P(C | x)</em></h4>{bars}</section>
    <section class="pwb-ev"><h4>Evidence <em>ln P(f|Strong) − ln P(f|Weak)</em></h4>{"".join(ev_rows)}
      <div class="pwb-axis"><span>← Weak</span><span>0</span><span>Strong →</span></div></section>
  </div>
  <div class="pwb-cols">
    <section><h4>Features found</h4><div class="pwb-chips">{"".join(chips)}</div></section>
    <section><h4>Tips</h4><ul class="pwb-tips">{tip_html}</ul></section>
  </div>
  <details><summary>Bayes step table · prior → likelihoods → joint → evidence → posterior</summary>{table}</details>
</div>"""


def launch(initial="Summer2026!", model=None):
    app = App(model)
    box = w.Text(value=initial, placeholder="type a password…", continuous_update=True, layout=w.Layout(width="100%"))
    box.add_class("pwb-input")
    card = w.HTML(app.render(initial))
    box.observe(lambda change: setattr(card, "value", app.render(change["new"])), names="value")

    buttons = []
    for ex in EXAMPLES:
        b = w.Button(description=ex, layout=w.Layout(width="auto", height="30px"))
        b.add_class("pwb-try")
        b.on_click(lambda _, ex=ex: setattr(box, "value", ex))
        buttons.append(b)
    row = w.HBox(buttons)
    row.add_class("pwb-try-row")

    head = w.HTML(CSS + '<div class="pwb-title"><span>Bayesian</span> Password Lab</div>'
                  '<div class="pwb-sub">naive Bayes over 9 features · order-2 character Markov chain · trained on 200k PWLDS passwords</div>')
    shell = w.VBox([head, box, row, card])
    shell.add_class("pwb-shell")
    return shell


def show(password, model=None):
    """Static (non-widget) render, e.g. for exported notebooks or the report."""
    return HTML(CSS + f'<div class="pwb-shell">{App(model).render(password)}</div>')
