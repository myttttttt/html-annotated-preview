# html-annotated-preview

> **A Claude Code skill that lets you annotate anything Claude writes — reports, specs, plans, and live previews. Zero install, no extension, no MCP.**
>
> 為 Claude Code 而設的 annotation skill — 報告、spec、plan、live preview 任你 highlight 標註，一鍵送回 Claude 繼續 iterate。免裝 extension，免 MCP。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## Why this exists · 為甚麼要這個 skill

**EN** — When you iterate on something Claude writes — a research report, a spec, a website — the default loop is to screenshot each issue and describe it separately. That's slow, lossy, and impossible to batch. This skill lets you mark up everything in one pass on a rendered HTML preview, then paste a single structured prompt back to Claude.

**中文** — 在 iterate Claude 寫的內容時（報告、spec、網站），預設 loop 是**逐個位截圖 + 逐個描述**。慢、容易遺漏、又難以 batch 處理。這個 skill 讓你一次過在 HTML preview 上標註所有想改的地方，再一鍵 paste 一個結構化 prompt 回 Claude。

---

## How it works · 運作流程

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

- **AI pre-annotation** (v0.2) — Claude can run a self-review pass on its own draft and pre-highlight spans that warrant verification (unsourced figures, weak logic, ambiguous jargon). User Accepts or Dismisses each. Cuts the iteration loop by one round on substantive reports.
- **Text annotation** — select any text, add a comment, get a yellow highlight (persisted in `localStorage`).
- **Rectangle annotation** — click-drag any region (great for design / UI critique). Numbered orange-outlined boxes.
- **CSS live-edit** — open the bubble on any text/region, edit CSS inline, see changes instantly. Saved with the annotation so Claude knows what to reconcile in source.
- **Status state machine** — every annotation is **suggested** / **active** / **exported** / **done**. Successive iteration rounds never re-export the same annotation. Click any exported highlight to reactivate it.
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

### Upgrading

```bash
npm install -g html-annotated-preview@latest
```

The postinstall hook auto-detects existing installs by checking `.installed-version` and overwrites only the files that actually changed (creating timestamped `.bak.<ts>` backups). To verify your local install matches the latest npm release:

```bash
html-annotated-preview check
```

If `check` reports a version mismatch, force a refresh:

```bash
html-annotated-preview install
```

#### ⚠️ If you use `ignore-scripts=true`

Some users — corporate / security-conscious setups, or anyone following npm hardening advice — set `ignore-scripts=true` in `~/.npmrc`. With that flag, **npm will not run the postinstall hook of any package**, so `npm install -g` won't update the skill files. The package itself is updated in npm's global lib, but the skill directory at `~/.claude/skills/html-annotated-preview/` stays at the old version. Symptom: you upgraded but Claude Code still loads the old SKILL.md.

The fix is to run the explicit install command after every upgrade:

```bash
npm install -g html-annotated-preview@latest
html-annotated-preview install
```

To check whether you're affected:

```bash
npm config get ignore-scripts   # if it prints "true", you are
```

For a one-liner alias in `~/.zshrc` / `~/.bashrc`:

```bash
alias hap-update='npm i -g html-annotated-preview@latest && html-annotated-preview install'
```

Or run an install once with the flag overridden (per-invocation, doesn't change global config):

```bash
npm install -g html-annotated-preview@latest --ignore-scripts=false
```

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
- A bottom bar with `💡 選文字 或 按「框選」標註區域`
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

| Tool | Form factor | Static `.html` | AI loop | OSS |
|---|---|---|---|---|
| **html-annotated-preview** | Claude Code skill (this repo) | ✅ double-click any .html | copy-paste markdown | ✅ MIT |
| [Agentation](https://github.com/benjitaylor/agentation) | npm package + MCP mode | ❌ requires running app | MCP (bidirectional) or copy-paste | ✅ |
| [Stagewise](https://github.com/stagewise-io/stagewise) | Browser toolbar → full IDE | ❌ requires dev server | direct to Cursor / Claude Code / Windsurf | ✅ |
| [Vibe Annotations](https://www.vibe-annotations.com/) | Chrome extension | ❌ live URLs only | via MCP | ❌ |
| [Browser Feedback MCP](https://github.com/itk-dev/mcp-claude-code-browser-feedback) | localhost daemon + widget | ❌ requires WebSocket server | via MCP | ✅ |
| [Pointa.dev](https://www.pointa.dev/) | Chrome extension | ❌ localhost only | via MCP | ❌ |
| [browser-annotations](https://github.com/wiebekaai/browser-annotations) | Chrome DevTools panel | ✅ | direct to Claude Code | ✅ |
| Cursor 3 Design Mode | Built into Cursor IDE | ❌ | Cursor only | ❌ |
| [Plannotator](https://github.com/backnotprop/plannotator) | Claude Code plugin | ❌ (plans / diffs only) | ✅ | ✅ |

**This repo's niche**: the only tool that works on a flat `.html` file you double-click from Finder. No Chrome extension, no MCP server, no dev server, no WebSocket. Designed for the "I read a markdown report and want to give batch feedback" loop — not just the "iterate on a live React app" loop.

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
