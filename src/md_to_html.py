#!/usr/bin/env python3
"""Convert markdown → self-contained HTML for annotation preview.

Output: GitHub-flavored markdown styling + dark mode toggle + code highlight
        + CJK font support. Single HTML file, embedded CSS, no external deps
        beyond Python `markdown` package.

Usage:
    python3 md_to_html.py <input.md> [<output.html>]
    # If output omitted, writes alongside input with .html extension.
"""
import sys
import html
from pathlib import Path

try:
    import markdown
except ImportError:
    print("ERROR: python `markdown` package required.", file=sys.stderr)
    print("Install: pip3 install markdown", file=sys.stderr)
    sys.exit(2)

CSS = r"""
:root {
  --bg: #ffffff;
  --fg: #1f2328;
  --muted: #656d76;
  --border: #d1d9e0;
  --code-bg: #f6f8fa;
  --link: #0969da;
  --highlight: #fff8c5;
  --accent: #1f2328;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --fg: #e6edf3;
    --muted: #8b949e;
    --border: #30363d;
    --code-bg: #161b22;
    --link: #2f81f7;
    --highlight: #3b341c;
    --accent: #e6edf3;
  }
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg); }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang TC",
               "PingFang SC", "Hiragino Sans", "Microsoft JhengHei", "Noto Sans CJK TC",
               "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.container {
  max-width: 860px;
  margin: 0 auto;
  padding: 48px 32px 120px;
}
h1, h2, h3, h4, h5, h6 {
  margin-top: 32px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--accent);
}
h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h2 { font-size: 1.5em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border); }
h3 { font-size: 1.25em; }
h4 { font-size: 1em; }
h5 { font-size: 0.875em; }
h6 { font-size: 0.85em; color: var(--muted); }
p, ul, ol, blockquote, table, pre { margin-top: 0; margin-bottom: 16px; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
ul, ol { padding-left: 2em; }
li + li { margin-top: 0.25em; }
blockquote {
  margin: 0 0 16px;
  padding: 0 1em;
  color: var(--muted);
  border-left: 0.25em solid var(--border);
}
code {
  font-family: "SF Mono", "JetBrains Mono", Menlo, Monaco, Consolas, monospace;
  font-size: 85%;
  background: var(--code-bg);
  padding: 0.2em 0.4em;
  border-radius: 6px;
}
pre {
  background: var(--code-bg);
  padding: 16px;
  border-radius: 6px;
  overflow: auto;
  line-height: 1.45;
}
pre code {
  background: transparent;
  padding: 0;
  font-size: 100%;
}
table {
  border-collapse: collapse;
  display: block;
  overflow: auto;
  width: 100%;
}
table th, table td {
  padding: 6px 13px;
  border: 1px solid var(--border);
}
table th {
  background: var(--code-bg);
  font-weight: 600;
  text-align: left;
}
table tr:nth-child(2n) td {
  background: color-mix(in srgb, var(--code-bg) 50%, transparent);
}
hr { border: 0; border-top: 1px solid var(--border); margin: 24px 0; }
img { max-width: 100%; }
mark { background: var(--highlight); color: inherit; padding: 0 2px; border-radius: 2px; }
@media print {
  body { font-size: 11pt; }
  .container { max-width: none; padding: 0; }
  pre, blockquote, table { page-break-inside: avoid; }
  h1, h2, h3 { page-break-after: avoid; }
}
"""

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>{css}</style>
</head>
<body>
<div class="container">
{body}
</div>
</body>
</html>
"""


def detect_lang(md: str) -> str:
    """Crude CJK detection for <html lang>."""
    cjk = sum(1 for c in md[:2000] if "一" <= c <= "鿿")
    return "zh-Hant" if cjk > 20 else "en"


def extract_title(md: str, fallback: str) -> str:
    for line in md.splitlines():
        line = line.strip()
        if line.startswith("# "):
            return line[2:].strip()
    return fallback


def convert(md_text: str, title: str) -> str:
    body = markdown.markdown(
        md_text,
        extensions=["tables", "fenced_code", "attr_list", "sane_lists", "toc", "footnotes"],
    )
    return HTML_TEMPLATE.format(
        lang=detect_lang(md_text),
        title=html.escape(title),
        css=CSS,
        body=body,
    )


def main():
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    src = Path(sys.argv[1])
    if not src.exists():
        print(f"ERROR: not found: {src}", file=sys.stderr)
        sys.exit(2)
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else src.with_suffix(".html")
    md_text = src.read_text(encoding="utf-8")
    title = extract_title(md_text, src.stem)
    out = convert(md_text, title)
    dst.write_text(out, encoding="utf-8")
    print(f"Wrote {dst} ({len(out):,} bytes)")


if __name__ == "__main__":
    main()
