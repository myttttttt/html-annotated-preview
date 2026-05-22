---
name: html-annotated-preview
description: 為任何 HTML 報告或網頁預覽加入 vanilla-JS annotation overlay。選取文字或框選區域 → 加 comment → 黃色 highlight 存入 LocalStorage。一鍵「Copy as Prompt」輸出結構化 markdown 到剪貼板，讓用戶 paste 回 Claude Code。每個 annotation 有狀態（active / exported / done），確保多輪 iteration 不會重複送出舊 annotation；點擊已 exported 的 highlight 可以 reactivate 加入下次 prompt。觸發詞：「annotation skill」、「html 評論 skill」、「網站評論 skill」、「讓我在 HTML 裡面標註」、「open annotated」、「網頁標註」。亦會在 markdown 報告轉 HTML 時自動 chain。
---

# html-annotated-preview（繁中版）

> 為 Claude 寫的報告 / spec / plan / live preview 加 inline annotation —
> 一鍵 batch 送回 Claude Code 繼續 iterate。
> 不需 Chrome extension、不需 MCP、不需 server。一個 skill 就完成。

英文版見 [SKILL.md](SKILL.md)。

## 功能

零 dependency 的 vanilla-JS overlay，inject 入任何 HTML file。兩種 annotation mode：

1. **Text mode**（預設）— 選取文字 → 彈出 bubble → 加 comment → 黃色 highlight。
2. **Rectangle mode** — 點擊底部 `▭ 框選` → click-drag 任何區域（適合 design / UI critique 等要框選視覺區域、而非文字的情況）。儲存的 rect 以橙色虛框 + 編號形式 render。

Annotation 存在 `localStorage`，按 document path 分 key。每個 annotation 有**狀態**：

- **Active** — 黃色 highlight。下一次「Copy as Prompt」會包含進去。
- **Exported** — 半透明黃 + 虛底線。已經在之前 round 送過給 Claude；保留為歷史，但不再進入下一個 prompt。
- **Done** — 綠色。用戶手動標記為已完成。

底部 bar 顯示 `active / total` count + 三個按鈕：`▭ 框選`、`Export JSON`、`Copy N new`。Copy 按鈕只會包含尚未 export 過的 annotation。

如想將已 exported 的 annotation 放回下次 prompt：直接點擊該 highlight，bubble 會出現「↺ Reactivate」按鈕。

## 為甚麼要這個 skill

在 iterate Claude 寫的內容（報告、spec、網站）時，預設 loop 是**逐個位截圖 + 逐個描述**。慢、容易遺漏、亦難以 batch 處理。

這個 skill 讓你一次過標完所有想改的地方，再一鍵 paste 一個結構化 prompt 回 Claude。

## Pipeline

四步。Step 1.5 為可選但強烈建議 — 讓 Claude 將自己對報告的不確定處標出來，讓 user 直接見到。

```bash
# 1. markdown → HTML（GitHub 風格、支援 dark mode、附 CJK font）
python3 ~/.claude/skills/html-annotated-preview/md_to_html.py report.md

# 1.5. （可選）AI 自審 pass — 詳見下面「AI pre-annotation」章節
#       Claude 將 report.preann.json 寫到 .md 同一目錄
#       inject.py 會自動偵測並讀取

# 2. Inject annotation overlay（idempotent，自動讀取 .preann.json）
python3 ~/.claude/skills/html-annotated-preview/inject.py report.html

# 3. 在預設 browser 開啟
open report.html      # macOS
xdg-open report.html  # Linux
start report.html     # Windows
```

當 Claude deliver 一份 markdown 報告 / 分析時，預設應該將這 3 步（及合適時加入 1.5）fold 入交付流程。

## AI pre-annotation（Claude 自審 pass）

當 Claude deliver 一份重要 markdown 報告（研究、市場分析、spec、plan，任何 > 500 字、claims / 邏輯 matter 的文件），請在執行 `inject.py` 之前產生一份 `<report-stem>.preann.json` 放在同一個 directory。Inject.py 會自動讀取，並將每個 entry 渲染成淺藍 ✨「suggested」highlight，user 可以 Accept（轉成 active feedback）或 Dismiss。

這是 Claude 將自己的不確定處主動 surface 給 user 的機會 — 將 iteration loop 縮短一輪。

**要標的內容**（謹慎挑選 — 一份典型報告 3-8 個，最多 ~15 個）：

- **無 source 的 quantitative claims** — 數字、百分比、市值、預測，你沒有直接 verify 的
- **邏輯跳躍** — 推論依賴你沒有完全把握的假設
- **過度自信的 forecast** — 預測語氣強於證據
- **與你 prior data 衝突** — 你記憶過時 / contested / sources 不一致的位置
- **行話可能與 user vocabulary 不 match** — 業外讀者會誤解的 term
- **依賴 user-specific context 的段落** — 你沒有用戶的 portfolio / team / 定義

**不要標**：copy-edit 細節、文體偏好、user 自己改 .md 還快過走 annotation loop 的事情。Bar：「user 30 秒澄清會否 materially 改善這段？」

**File format** — `<report-stem>.preann.json`：

```json
{
  "doc": { "path": "report.md", "title": "Q2 市場掃描" },
  "generatedAt": "2026-05-23T03:12:00Z",
  "annotations": [
    {
      "id": "ai_q2scan_001",
      "kind": "text",
      "quote": "BTC 將在 Q3 2026 達到 $200K",
      "section": "Section 3 — Bull case",
      "intent": "question",
      "severity": "important",
      "comment": "無 source — consensus forecast 多數 cluster 在 $150K。請確認 source / 你的 conviction level。"
    }
  ]
}
```

**必填**：`id`（穩定、唯一）、`kind`（"text" 或 "rect"）、`quote`（rendered HTML 內逐字 match 的子字串）、`comment`（你的 reasoning）。

**可選**：`section`、`intent`（fix / change / question / approve）、`severity`（blocking / important / suggestion）。

**Quote 匹配**：用 5-30 字 unambiguous 子字串。避免出現多次的 quote。CJK 字直接使用，無特別處理。

**Id 穩定性**：regenerate `.preann.json` 時 reuse 同一個 id。skill 記住 user dismiss 過的 id，stable id 防止 dismissed suggestion 重複出現。

**不做 pre-annotation**：< 500 字、純 code/config、README/SKILL.md/canonical doc、或你對所有 claims 都很高 confidence。寧可不出 anything 也好過 spam user。

## 何時觸發

**自動 chain**（首選）：
- 寫完任何 standalone 報告 / 分析 / spec / plan 的 `.md` 之後，render 成 HTML 並 inject overlay，再在 browser 開啟。

**手動觸發**：
- 「annotate this html」/「open with annotations」
- 「讓我在 HTML 裡面標註」/「open annotated」/「網頁標註」

**不觸發**：短 snippet、README、CLAUDE.md / SKILL.md、任何 source-of-truth 文件（annotation 不應污染 canonical 檔案）。

## 檔案結構

```
~/.claude/skills/html-annotated-preview/
├── SKILL.md           # 英文 SKILL 文件
├── SKILL.zh.md        # 這份（繁中）
├── annotate.js        # overlay engine（selection / persistence / sidebar）
├── annotate.css       # overlay styling
├── inject.py          # post-processor：將 overlay inline 到指定 .html
└── md_to_html.py      # markdown → self-contained HTML（GitHub 風格）
```

## 「Copy as Prompt」格式

按一下，剪貼板會收到類似以下 markdown：

```markdown
# Annotation follow-up — Q2 市場掃描

**Source**: `/path/to/q2-scan.html`
**Count**: 2 new annotation(s)

我正在處理一份報告，在 HTML preview 中標註了以下段落 + comment。
請就每個 annotation 跟進，按順序作答；如果 comment 是問題就回答，是指示就執行。

## 1. Section 7 — 預判 vs 數據

> Yen carry unwind 2.0 (USD/JPY 160)

**Comment**: 想要 2024-08 case study + 重演機率 base rate

## 2. (Rectangle region)

> [Rectangle 280×120px @ (450, 880)]

**Comment**: hero CTA 太細，learn more 應該大於 sign up
```

用戶 paste 入 Claude Code，agent 就會一次過跟進每個 annotation。

## Export JSON

如需 audit / archive，可以 download 全部 annotation 成一個 JSON：

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
- `Esc` — 取消 bubble；若無 bubble 開啓則退出 rect 模式

**Range serialization**：text mode 用 XPath + offset；rect mode 用 page-absolute pixels。

**Cross-origin**：純前端 overlay，永遠不會 fire network request。`file://` / `http://` / `https://` 都支援。

**Clipboard fallback**：當 `navigator.clipboard` 不可用時（少數 browser 在 `file://` 不允許），會 fallback 用傳統 textarea + `execCommand('copy')`。

**列印**：chrome（bar / bubble / sidebar）會自動隱藏；highlight 變淡一點繼續保留，PDF 列印自然。

## 限制（無理由不要放寬）

- **單一黃色** for text active；**單一綠色** for done。
- 底部 bar **三個主要按鈕**：框選、Export、Copy。
- **無 backend、無 relay、無 auto-spawn** Claude session — 試過、撤走、不再加回。手動 copy-paste 就是 canonical 流程。
- **無 reply thread、無 @-mention、無 user-resolved 狀態** — 設計上就是 single-user product。

## 已知 edge cases

- **XPath 失效**：當底層 `.md` source 被重新生成且內容大幅改動，舊的 text annotation 可能 render 不出來。它們仍然在 `localStorage`，但 silent skip。Rect 用絕對 px，content 改動少許仍在原位，但 layout 大變動的話會落錯位。
- **Responsive layout**：rect 用 absolute px，不是 percentage。Resize window 之後 rect 可能指錯位。Single-user、single-device 的 acceptable trade-off。
- **LocalStorage scope**：按 `location.pathname` 做 key。改 HTML file 名稱 → annotation 變孤兒（仍然在 storage 中，但 key 對不上）。
