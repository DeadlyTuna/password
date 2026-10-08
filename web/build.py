"""Bundle the website into single self-contained HTML files.

    python web/build.py

web/dist/index.html     full document; open it straight from disk, no server needed
web/dist/artifact.html  same page without <html>/<head>/<body>, for the claude.ai Artifact host

Every section script gets its own <script> tag, so a bug in one section cannot stop the others.
"""
import os
import re
import time
from pathlib import Path

WEB = Path(__file__).resolve().parent
SRC, DIST = WEB / "src", WEB / "dist"
FONTS = ("https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,200..800"
         "&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400"
         "&family=Caveat:wght@500;700&display=swap")
LIBS = ["https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js"]
TITLE = "Bayesian Password Lab"


def read(p):
    return Path(p).read_text(encoding="utf-8")


def script(code, name):
    # "</script" inside JS would end the tag early.
    safe = re.sub(r"</(script)", r"<\\/\1", code, flags=re.I)
    return f'<script data-src="{name}">\n{safe}\n</script>'


def body():
    data = read(WEB / "data" / "model.json").replace("</", "<\\/")
    sections = sorted((SRC / "sections").glob("*.js"))
    return "\n".join([
        '<header class="topbar"><div class="topbar-in">',
        '  <a class="brand" href="#top">Bayesian <span>Password</span> Lab</a>',
        '  <div class="mini-pw"><span class="mini-grade" id="mini-grade" aria-label="overall grade">–</span>',
        '    <label class="sr-only" for="mini-pw">Password being explained</label>',
        '    <input id="mini-pw" type="text" autocomplete="off" spellcheck="false" placeholder="type a password"></div>',
        '  <nav class="toc" id="toc" aria-label="Sections"></nav>',
        '  <button class="btn small theme-btn" id="theme-btn" type="button" title="Switch theme">Auto</button>',
        '</div></header>',
        '<main id="main"><span id="top"></span></main>',
        '<footer class="foot">Runs entirely in your browser: the password you type is never sent or stored. '
        'Model trained on a 200,000-password sample of PWLDS (Infinitode, CC BY 4.0). '
        'Common list: SecLists 10k-most-common. BAMAT207 Probability and Statistics.</footer>',
        f'<script type="application/json" id="pwb-data">{data}</script>',
        script(read(SRC / "kit.js"), "kit.js"),
        script(read(SRC / "engine.js"), "engine.js"),
        *[script(read(p), f"sections/{p.name}") for p in sections],
        script(read(SRC / "boot.js"), "boot.js"),
    ])


def head():
    return "\n".join([
        f"<title>{TITLE}</title>",
        '<link rel="preconnect" href="https://fonts.googleapis.com">',
        '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        f'<link rel="stylesheet" href="{FONTS}">',
        f"<style>\n{read(SRC / 'styles.css')}\n</style>",
        *[f'<script src="{u}"></script>' for u in LIBS],
    ])


def write_atomic(path, text):
    tmp = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
    tmp.write_text(text, encoding="utf-8")
    for attempt in range(50):  # Windows refuses to replace a file another process has open
        try:
            os.replace(tmp, path)
            return
        except PermissionError:
            time.sleep(0.1)
    raise PermissionError(f"could not replace {path}")


def main():
    DIST.mkdir(exist_ok=True)
    b, hd = body(), head()
    full = ("<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n"
            f"{hd}\n</head>\n<body>\n{b}\n</body>\n</html>\n")
    write_atomic(DIST / "index.html", full)
    write_atomic(DIST / "artifact.html", f"{hd}\n{b}\n")
    n = len(list((SRC / "sections").glob("*.js")))
    print(f"built web/dist/index.html ({(DIST / 'index.html').stat().st_size / 1e6:.2f} MB, {n} sections)")


if __name__ == "__main__":
    main()
