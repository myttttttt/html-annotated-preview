# html-annotated-preview

> **A Claude Code skill that lets you annotate anything Claude writes — reports, specs, plans, and live previews. Zero install, no extension, no MCP.**
>
> 為 Claude Code 而設嘅 annotation skill — 報告、spec、plan、live preview 任你 highlight 標註，一鍵餵返 Claude 繼續 iterate。免裝 extension，免 MCP。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Why this exists · 點解要呢個 skill

**EN** — When you iterate on something Claude writes — a research report, a spec, a website — the default loop is to screenshot each issue and describe it separately. That's slow, lossy, and impossible to batch. This skill lets you mark up everything in one pass on a rendered HTML preview, then paste a single structured prompt back to Claude.

**中文** — Iterate Claude 寫嘅嘢嗰陣，預設 loop 係**逐個位截圖 + 逐個描述**。慢、容易漏、又難 batch。呢個 skill 畀你一次過喺 HTML preview 標晒所有想改嘅地方，再一鍵 paste 一個結構化 prompt 返 Claude。

---

## How it works · 點點玩

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│ Claude writes   │ →  │ md_to_html       │ →  │ inject.py adds   │
│ a markdown      │    │ renders to HTML  │    │ annotation       │
│ report          │    │ (GitHub style)   │    │ overlay          │
└─────────────────┘    └──────────────────┘    └──────────────────┘
                                                         │
                                                         ▼
                              ┌──────────────────────────────────┐
                              │ Open in browser. Highlight text  │
                              │ or 框選 a region. Add comments.  │
                              │ Click "Copy N new"               │
                              └──────────────────────────────────┘
                                                         │
                                                         ▼
                                       Paste back to Claude Code.
                                       Claude iterates in batch.
                                       Annotations marked exported.
```

---

## Features

- **Text annotation** — select any text, add a comment, get a yellow highlight (persisted in `localStorage`).
- **Rectangle annotation** — click-drag any region (great for design / UI critique). Numbered orange-outlined boxes.
- **Status state machine** — every annotation is **active** / **exported** / **done**. Successive iteration rounds never re-export the same annotation. Click any exported highlight to reactivate it.
- **Bilingual docs** (English + 繁體中文).
- **Print-friendly** — chrome auto-hides; highlights remain in a softer shade.
- **Zero dependencies on the runtime side** — pure vanilla JS + CSS. Only requires Python `markdown` for the (optional) md→html step.

---

## Install · 安裝

Pick whichever you prefer — both drop the skill into `~/.claude/skills/html-annotated-preview/`.

**Option 1 — npm** (recommended for vibe coders):

```bash
npm install -g html-annotated-preview
```

Auto-update via `npm update -g html-annotated-preview`. CLI helpers: `html-annotated-preview path` / `install` / `uninstall`.

**Option 2 — Shell installer** (no Node required):

```bash
curl -fsSL https://raw.githubusercontent.com/myttttttt/html-annotated-preview/main/install.sh | bash
```

**Option 3 — From a local clone**:

```bash
git clone https://github.com/myttttttt/html-annotated-preview.git
cd html-annotated-preview
./install.sh
```

After install, restart Claude Code so the skill is picked up.

**Dependencies**: Python 3.8+ with the `markdown` package (`pip3 install markdown`). That's it.

---

## Quick start · 試一試

```bash
# Use the skill's own md_to_html + inject as the canonical pipeline:
python3 ~/.claude/skills/html-annotated-preview/md_to_html.py your-report.md
python3 ~/.claude/skills/html-annotated-preview/inject.py your-report.html
open your-report.html      # macOS
# xdg-open your-report.html  # Linux
# start your-report.html     # Windows
```

You should now see:
- The report rendered in GitHub-flavored HTML
- A bottom bar with `💡 揀文字 或 撳「框選」標註區域`
- A `▭ 框選` button to toggle rectangle mode

Highlight a sentence, type a comment, hit Enter. Then click **Copy N new** and paste anywhere — Claude Code, Claude Desktop, web Claude. It's all just clipboard markdown.

---

## "Copy as Prompt" output · 輸出格式

The clipboard receives a structured prompt like:

```markdown
# Annotation follow-up — Q2 Market Scan

**Source**: `/path/to/q2-scan.html`
**Count**: 2 new annotation(s)

I've annotated the following passages in the HTML preview.
Please respond to each, in order.

## 1. Section 7 — Forecast vs. data

> Yen carry unwind 2.0 (USD/JPY 160)

**Comment**: Want a 2024-08 case study + base rate.

## 2. (Rectangle region)

> [Rectangle 280×120px @ (450, 880)]

**Comment**: Hero CTA is too small.
```

Already-exported annotations are filtered out automatically. Round 2 of feedback only ships new annotations.

---

## File layout

```
html-annotated-preview/
├── SKILL.md            # Skill definition (English)
├── SKILL.zh.md         # 繁體中文 SKILL 定義
├── LICENSE             # MIT
├── README.md           # This file
├── install.sh          # One-line installer
└── src/
    ├── annotate.js     # Overlay engine (~700 LOC vanilla JS)
    ├── annotate.css    # Overlay styling
    ├── inject.py       # Post-processor: inlines overlay into a given .html
    └── md_to_html.py   # markdown → self-contained HTML (GitHub-flavored)
```

---

## Related work · 同類工具對比

| Tool | Form factor | Live URL | AI-coding native | OSS |
|---|---|---|---|---|
| **html-annotated-preview** | Claude Code skill (this repo) | ✅ via inject.py | ✅ | ✅ MIT |
| [Vibe Annotations](https://www.vibe-annotations.com/) | Chrome extension | ✅ | via MCP | ❌ |
| [Agentation](https://github.com/benjitaylor/agentation) | npm package | localhost only | via MCP | ✅ |
| [Pointa.dev](https://www.pointa.dev/) | Chrome extension | localhost only | via MCP | ❌ |
| [browser-annotations](https://github.com/wiebekaai/browser-annotations) | Chrome DevTools panel | ✅ | direct to Claude Code | ✅ |
| Cursor 3 Design Mode | Built into Cursor IDE | ✅ | Cursor only | ❌ |
| [Plannotator](https://github.com/backnotprop/plannotator) | Claude Code plugin | ❌ (plans / diffs only) | ✅ | ✅ |

This repo's niche: **no Chrome extension required**, no MCP setup, works on the user's HTML reports as much as on live previews, and stays installable inside `~/.claude/skills/` like any other native Claude Code skill.

---

## Design constraints

The author intentionally rejects:

- **Server / relay** — tried, removed. Manual copy-paste is simpler.
- **Auto-spawn second Claude session** — tried, removed (confusing).
- **Reply threads / @-mentions / multi-user state** — single-user product by design.
- **Heavyweight annotation library** — vanilla is the point.
- **A browser extension** — defeats "zero install."
- **A bookmarklet** — too much friction for typical vibe coders.

Open issues that *don't* fit these constraints will likely be closed with thanks.

---

## Contributing

Issues and PRs welcome — please keep them aligned with the **Design constraints** above. If you're adding a new feature, propose it in an issue first so we can discuss whether it fits the scope.

This is a side project of a single maintainer. Response time may vary.

---

## License

[MIT](LICENSE) © 2026 Michael Mok

---

## Acknowledgements · 鳴謝

- The Python `markdown` package — does the actual md→html lifting.
- Anthropic's Claude Code team — the skill system that made this distributable.
- Vibe Annotations, Agentation, Pointa.dev, Plannotator — prior art that helped clarify the niche.
