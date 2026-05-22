---
name: html-annotated-preview
description: 為任何 HTML 報告或網頁預覽加入 vanilla-JS annotation overlay。揀文字或框選區域 → 加 comment → 黃色 highlight 存入 LocalStorage。一鍵「Copy as Prompt」輸出結構化 markdown 落剪貼板，畀用戶 paste 返 Claude Code。每個 annotation 有狀態（active / exported / done），確保多輪 iteration 唔會重覆送出舊 annotation；click 已 exported 嘅 highlight 可以 reactivate 入返下次 prompt。觸發詞：「annotation skill」、「html 評論 skill」、「網站評論 skill」、「畀我喺 HTML 入面標註」、「open annotated」、「網頁標註」。亦會喺 markdown 報告轉 HTML 時自動 chain。
---

# html-annotated-preview（繁中版）

> 為 Claude 寫嘅報告 / spec / plan / live preview 加 inline annotation —
> 一鍵 batch 餵返 Claude Code 繼續 iterate。
> 唔使 Chrome extension、唔使 MCP、唔使 server。一個 skill 就搞掂。

英文版見 [SKILL.md](SKILL.md)。

## 功能

零 dependency 嘅 vanilla-JS overlay，inject 入任何 HTML file。兩種 annotation mode：

1. **Text mode**（預設）— 揀文字 → 出 bubble → 加 comment → 黃色 highlight。
2. **Rectangle mode** — 撳底部 `▭ 框選` → click-drag 任何區域（適合 design / UI critique 等要框視覺區域、唔係文字嘅情況）。儲咗嘅 rect 以橙色虛框 + 編號形式 render。

Annotation 存喺 `localStorage`，按 document path 分 key。每個 annotation 有**狀態**：

- **Active** — 黃色 highlight。下一次「Copy as Prompt」會包入嚟。
- **Exported** — 半透明黃 + 虛底線。已經喺之前 round 送過畀 Claude；保留歷史，但唔再入下一個 prompt。
- **Done** — 綠色。用戶手動標記咗已完成。

底部 bar 顯示 `active / total` count + 三個按鈕：`▭ 框選`、`Export JSON`、`Copy N new`。Copy 按鈕只會包入仲未 export 過嘅 annotation。

如想將已 exported 嘅 annotation 放返入下次 prompt：直接 click 該 highlight，bubble 會出「↺ Reactivate」按鈕。

## 點解要呢個 skill

Iterate 緊 Claude 寫嘅嘢（報告、spec、網站）嗰陣，預設 loop 係**逐個位截圖 + 逐個描述**。慢、容易漏、亦難 batch。

呢個 skill 畀你一次過標晒所有想改嘅地方，再一鍵 paste 一個結構化 prompt 返 Claude。

## Pipeline

三步，全部 skill 自帶：

```bash
# 1. markdown → HTML（GitHub 風格、識 dark mode、有 CJK font）
python3 ~/.claude/skills/html-annotated-preview/md_to_html.py report.md

# 2. Inject annotation overlay（idempotent）
python3 ~/.claude/skills/html-annotated-preview/inject.py report.html

# 3. 喺預設 browser 開
open report.html      # macOS
xdg-open report.html  # Linux
start report.html     # Windows
```

當 Claude deliver 一份 markdown 報告 / 分析，預設應該將呢三步 fold 入交付流程。

## 何時觸發

**自動 chain**（首選）：
- 寫完任何 standalone 報告 / 分析 / spec / plan 嘅 `.md` 之後，render 成 HTML 並 inject overlay，再喺 browser 開。

**手動觸發**：
- 「annotate this html」/「open with annotations」
- 「畀我喺 HTML 入面標註」/「open annotated」/「網頁標註」

**唔觸發**：短 snippet、README、CLAUDE.md / SKILL.md、任何 source-of-truth 文件（annotation 唔應該污染 canonical 檔）。

## 檔案結構

```
~/.claude/skills/html-annotated-preview/
├── SKILL.md           # 英文 SKILL 文件
├── SKILL.zh.md        # 呢份（繁中）
├── annotate.js        # overlay engine（selection / persistence / sidebar）
├── annotate.css       # overlay styling
├── inject.py          # post-processor：將 overlay inline 落指定 .html
└── md_to_html.py      # markdown → self-contained HTML（GitHub 風格）
```

## 「Copy as Prompt」格式

按一下，剪貼板會收到類似呢個 markdown：

```markdown
# Annotation follow-up — Q2 市場掃描

**Source**: `/path/to/q2-scan.html`
**Count**: 2 new annotation(s)

我用緊一份報告，喺 HTML preview 入面標註咗以下段落 + comment。
請就每個 annotation 跟進，順序作答；如果 comment 係問題就回答，係指示就執行。

## 1. Section 7 — 預判 vs 數據

> Yen carry unwind 2.0 (USD/JPY 160)

**Comment**: 想要 2024-08 case study + 重演機率 base rate

## 2. (Rectangle region)

> [Rectangle 280×120px @ (450, 880)]

**Comment**: hero CTA 太細，learn more 應該大過 sign up
```

用戶 paste 入 Claude Code，agent 就會一次過跟進每個 annotation。

## Export JSON

如需 audit / archive，可以 download 全部 annotation 做一個 JSON：

```json
{
  "doc": { "path": "...", "title": "...", "href": "..." },
  "generatedAt": "2026-05-22T13:30:00.000Z",
  "annotations": [
    {
      "id": "ann_l9z3p8_x9q4",
      "kind": "text",
      "section": "Section 7 — 預判 vs 數據",
      "quote": "Yen carry unwind 2.0 (USD/JPY 160)",
      "comment": "想要 2024-08 case study",
      "done": false,
      "exported": true,
      "createdAt": "2026-05-22T13:25:42.000Z"
    }
  ]
}
```

## 行為參考

**鍵盤**：
- `⌘+Enter` 或 `Enter`（textarea 內）— 儲存 annotation
- `Shift+Enter` — comment 換行
- `Esc` — 取消 bubble；若無 bubble 開住則退出 rect 模式

**Range serialization**：text mode 用 XPath + offset；rect mode 用 page-absolute pixels。

**Cross-origin**：純前端 overlay，永遠唔會 fire network request。`file://` / `http://` / `https://` 都支援。

**Clipboard fallback**：`navigator.clipboard` 唔可用時（少數 browser 喺 `file://` 唔畀），會 fallback 用傳統 textarea + `execCommand('copy')`。

**列印**：chrome（bar / bubble / sidebar）會自動隱藏；highlight 變淡一點繼續保留，PDF 列印自然。

## 限制（無理由唔好放寬）

- **單一黃色** for text active；**單一綠色** for done。
- 底部 bar **三個主要按鈕**：框選、Export、Copy。
- **無 backend、無 relay、無 auto-spawn** Claude session — 試過、撤走、唔再嚟。手動 copy-paste 就係 canonical 流程。
- **無 reply thread、無 @-mention、無 user-resolved 狀態** — 設計上就係 single-user product。

## 已知 edge cases

- **XPath 失效**：當底層 `.md` source 被重新生成且內容大幅改動，舊嘅 text annotation 可能 render 唔到。佢哋仲喺 `localStorage`，但 silent skip。Rect 用絕對 px，content 改少少都仲喺度，但 layout 大變嘅話會落錯位。
- **Responsive layout**：rect 用 absolute px，唔係 percentage。Resize window 之後 rect 可能指錯位。Single-user、single-device 嘅 acceptable trade-off。
- **LocalStorage scope**：按 `location.pathname` 做 key。改 HTML file 個名 → annotation 變孤兒（仲喺 storage 入面，但 key 對唔上）。
