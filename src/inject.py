#!/usr/bin/env python3
"""Inject annotation overlay (CSS + JS) into an existing HTML report.

Usage:
    python3 inject.py <input.html> [<output.html>] [--preann <preann.json>]
    # If output omitted, modifies in place.
    # If --preann omitted, auto-detects <stem>.preann.json next to the HTML.
    # The .preann.json file is produced by a self-review pass (Claude reading
    # its own markdown draft and flagging spans that warrant verification).
    # Each entry renders as a "suggested" annotation (light-blue) that the
    # user can Accept (becomes regular active) or Dismiss.
"""
import json
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent
CSS = (SKILL_DIR / "annotate.css").read_text(encoding="utf-8")
JS = (SKILL_DIR / "annotate.js").read_text(encoding="utf-8")

MARKER = "<!-- html-annotated-preview injected -->"


def find_preann(html_path: Path):
    """Look for <stem>.preann.json next to the html file. Returns Path or None."""
    candidates = [
        html_path.with_suffix(".preann.json"),                # report.preann.json
        html_path.parent / (html_path.stem + ".preann.json"), # same (defensive)
        html_path.with_suffix(".html.preann.json"),           # report.html.preann.json
    ]
    seen = set()
    for c in candidates:
        if c in seen:
            continue
        seen.add(c)
        if c.exists():
            return c
    return None


def load_preann(path: Path) -> list:
    data = json.loads(path.read_text(encoding="utf-8"))
    # Accept either a bare list, or {"annotations": [...]}
    if isinstance(data, dict):
        return data.get("annotations", [])
    return data


def inject(html: str, preann=None) -> str:
    if MARKER in html:
        return html  # idempotent
    seed_script = ""
    if preann:
        seed_script = (
            f"<script data-source=\"html-annotated-preview-preseed\">\n"
            f"window.__annPreseed = {json.dumps(preann, ensure_ascii=False)};\n"
            f"</script>\n"
        )
    payload = (
        f"\n{MARKER}\n"
        f"<style data-source=\"html-annotated-preview\">\n{CSS}\n</style>\n"
        f"{seed_script}"
        f"<script data-source=\"html-annotated-preview\">\n{JS}\n</script>\n"
    )
    if "</body>" in html:
        return html.replace("</body>", payload + "</body>")
    return html + payload


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    args = list(sys.argv[1:])
    preann_path = None
    if "--preann" in args:
        idx = args.index("--preann")
        preann_path = Path(args.pop(idx + 1))
        args.pop(idx)
    src = Path(args[0])
    dst = Path(args[1]) if len(args) > 1 else src

    if preann_path is None:
        preann_path = find_preann(src)

    preann = []
    if preann_path and preann_path.exists():
        try:
            preann = load_preann(preann_path)
        except Exception as e:
            print(f"Warning: could not parse {preann_path}: {e}", file=sys.stderr)

    html = src.read_text(encoding="utf-8")
    out = inject(html, preann=preann)
    dst.write_text(out, encoding="utf-8")
    msg = f"Injected annotation overlay into {dst} ({len(out):,} bytes)"
    if preann:
        msg += f" with {len(preann)} pre-annotation(s) from {preann_path.name}"
    print(msg)


if __name__ == "__main__":
    main()
