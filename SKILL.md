---
name: html-annotated-preview
description: Inject a vanilla-JS annotation overlay into any HTML report or live web preview. Select text or click-drag a region → bubble for comments → yellow highlight saved to LocalStorage. One-click "Copy as Prompt" exports a structured markdown bundle to clipboard for the user to paste back to Claude Code. Tracks status per annotation (active / exported / done) so successive iteration rounds don't duplicate work — click any exported highlight to reactivate it. Triggers — English: "annotate this html", "open with annotations", "html annotation overlay", "add annotations to the preview", "preview with comments". 中文觸發：「annotation skill」、「html 評論 skill」、「網站評論 skill」、「讓我在 HTML 裡面標註」、「open annotated」、「網頁標註」。Auto-chain — whenever a markdown report is rendered to HTML for browser preview, run `inject.py` on the result so the user can annotate inline.
---

# html-annotated-preview

> Annotate anything Claude writes — reports, specs, plans, live previews —
> then batch your feedback back to Claude Code with one click.
> No Chrome extension, no MCP, no server. Just a skill.

For a Traditional Chinese version, see [SKILL.zh.md](SKILL.zh.md).

## What it does

A zero-dependency vanilla-JS overlay that injects into any HTML file. Two annotation modes:

1. **Text mode** (default) — select text → bubble → comment → yellow highlight.
2. **Rectangle mode** — toggle `▭ 框選` button → click-drag any region of the page (useful when the target is a visual area, not a text run, e.g. design critique). Saved rects render as orange-outlined numbered boxes.

Annotations persist in `localStorage`, keyed by document path. Each annotation has a **status**:

- **Active** — yellow highlight, will be included in the next "Copy as Prompt" batch.
- **Exported** — faded yellow + dotted underline. Already sent to Claude in a prior round; preserved as history but excluded from future prompts.
- **Done** — green. User has manually marked the annotation as resolved.

A bottom command bar shows `active / total` counts and three buttons: `▭ 框選`, `Export JSON`, `Copy N new`. The Copy button automatically filters to only the new (active) annotations.

To reactivate a previously exported annotation, click it in the page — the bubble shows a `↺ Reactivate` button that puts it back into the active queue.

## Why this exists

The default loop when iterating on something Claude wrote — a report, a spec, a website — is to screenshot each issue and describe it separately. That's slow, lossy, and hard to batch.

This skill lets the user mark up everything in one pass, then paste a single structured prompt back to Claude.

## Pipeline

Three steps, all bundled with the skill:

```bash
# 1. markdown → HTML (GitHub-style, dark mode aware, CJK font stack)
python3 ~/.claude/skills/html-annotated-preview/md_to_html.py report.md

# 2. Inject the annotation overlay (idempotent)
python3 ~/.claude/skills/html-annotated-preview/inject.py report.html

# 3. Open in the default browser
open report.html      # macOS
xdg-open report.html  # Linux
start report.html     # Windows
```

When Claude delivers a markdown report or analysis, it should fold steps 1–3 into the build by default.

## When to invoke

**Automatic** (preferred):
- After writing any standalone report / analysis / spec / plan as `.md`, render to HTML and inject the overlay before opening in the browser.

**Manual triggers**:
- "annotate this html" / "open with annotations"
- 「讓我在 HTML 裡面標註」/「open annotated」

**Skip** for: short snippets, READMEs, CLAUDE.md / SKILL.md, or any source-of-truth document where annotations would pollute the canonical file.

## File layout

```
~/.claude/skills/html-annotated-preview/
├── SKILL.md           # this file (EN)
├── SKILL.zh.md        # Traditional Chinese version
├── annotate.js        # overlay engine (selection capture, persistence, sidebar)
├── annotate.css       # overlay styling
├── inject.py          # post-processor: inlines overlay into a given .html
└── md_to_html.py      # markdown → self-contained HTML (GitHub-flavored)
```

## "Copy as Prompt" payload

The clipboard receives structured markdown like:

```markdown
# Annotation follow-up — Q2 Market Scan

**Source**: `/path/to/q2-scan.html`
**Count**: 2 new annotation(s)

I've annotated the following passages in the HTML preview.
Please respond to each, in order. If the comment is a question, answer it;
if it's an instruction, execute it.

## 1. Section 7 — Forecast vs. data

> Yen carry unwind 2.0 (USD/JPY 160)

**Comment**: Want a 2024-08 case study + base rate for a re-run.

## 2. (Rectangle region)

> [Rectangle 280×120px @ (450, 880)]

**Comment**: Hero CTA is too small — "Learn more" should be larger than "Sign up".
```

The user pastes this into Claude Code and the agent acts on each annotation in batch.

## Export JSON

For audit / archival, every annotation can be downloaded as a single JSON file:

```json
{
  "doc": { "path": "...", "title": "...", "href": "..." },
  "generatedAt": "2026-05-22T13:30:00.000Z",
  "annotations": [
    {
      "id": "ann_l9z3p8_x9q4",
      "kind": "text",
      "section": "Section 7 — Forecast vs. data",
      "quote": "Yen carry unwind 2.0 (USD/JPY 160)",
      "comment": "Want a 2024-08 case study + base rate.",
      "done": false,
      "exported": true,
      "createdAt": "2026-05-22T13:25:42.000Z"
    }
  ]
}
```

## Behavior reference

**Keyboard**:
- `⌘+Enter` or `Enter` (in textarea) — save annotation
- `Shift+Enter` — newline inside comment
- `Esc` — cancel bubble; exits rectangle mode if no bubble is open

**Range serialization**: XPath + offset for text mode; page-absolute pixels for rectangle mode.

**Cross-origin**: pure overlay, never makes network requests. Works on `file://`, `http://`, `https://` alike.

**Clipboard fallback**: when `navigator.clipboard` is unavailable (rare on `file://` in some browsers), falls back to legacy textarea + `execCommand('copy')`.

**Print**: chrome (bar / bubble / sidebar) is hidden; highlights remain in a lighter shade so the printed PDF reads naturally.

## Constraints (do not loosen without reason)

- **Single yellow** for text active state; **single green** for done.
- **Three primary action buttons** on the bottom bar: 框選, Export, Copy.
- **No backend, no relay server, no auto-spawn** of Claude sessions — these were tried and removed. Manual copy-paste is the canonical loop.
- **No reply threads, no @-mentions, no resolved-by-user states** — single-user product by design.

## Known edge cases

- **Stale XPath**: when the underlying `.md` source is regenerated with materially different content, old text annotations may fail to render. They remain in `localStorage` but are silently skipped. Rectangles use page-absolute pixels and survive content edits, but can land off-target if layout shifts significantly.
- **Responsive layout**: rectangle coords are absolute, not percentage. Resizing the window can leave rects pointing at the wrong region. Acceptable trade-off for a single-user, single-device tool.
- **LocalStorage scope**: keyed by `location.pathname`. Renaming the HTML file orphans its annotations (they're still in storage, just under the old key).
