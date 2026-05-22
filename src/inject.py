#!/usr/bin/env python3
"""Inject annotation overlay (CSS + JS) into an existing HTML report.

Usage:
    python3 inject.py <input.html> [<output.html>]
    # If output omitted, modifies in place.
"""
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent
CSS = (SKILL_DIR / "annotate.css").read_text(encoding="utf-8")
JS = (SKILL_DIR / "annotate.js").read_text(encoding="utf-8")

MARKER = "<!-- html-annotated-preview injected -->"

def inject(html: str) -> str:
    if MARKER in html:
        return html  # idempotent
    payload = (
        f"\n{MARKER}\n"
        f"<style data-source=\"html-annotated-preview\">\n{CSS}\n</style>\n"
        f"<script data-source=\"html-annotated-preview\">\n{JS}\n</script>\n"
    )
    if "</body>" in html:
        return html.replace("</body>", payload + "</body>")
    return html + payload

def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src
    html = src.read_text(encoding="utf-8")
    out = inject(html)
    dst.write_text(out, encoding="utf-8")
    print(f"Injected annotation overlay into {dst} ({len(out):,} bytes)")

if __name__ == "__main__":
    main()
