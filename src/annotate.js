/* ============================================================
 * html-annotated-preview — vanilla JS annotation engine
 *
 * Features:
 *   - Select text → bubble → comment → yellow highlight
 *   - LocalStorage persistence (keyed by document path)
 *   - Bottom bar: count, Copy as Prompt (clipboard), Export JSON
 *
 * No server, no auto-spawn. Manual copy-paste to Claude.
 * No deps. Self-contained. ~250 LOC.
 * ============================================================ */
(function () {
  "use strict";

  const STORAGE_KEY = "html-annotations::" + location.pathname;
  const PRESEED_KEY = "html-annotations::preseed-applied::" + location.pathname;
  const DOC_TITLE = document.title || "untitled";

  // ----- state -----
  let annotations = loadAnnotations();
  mergePreseed();              // inject AI suggestions (idempotent per preseed-signature)
  let activeBubble = null;
  let rectMode = false;        // toggled by user via bottom-bar button
  let rectDraft = null;        // { startX, startY, el } during drag
  let rectLayer = null;        // container for rect overlays (created lazily)

  // ----- persistence -----
  function loadAnnotations() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }
  function saveAnnotations() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
  }

  // ----- AI pre-annotation seed -----
  // window.__annPreseed is injected by inject.py when a sibling .preann.json is found.
  // Each entry is rendered as a "suggested" annotation (light-blue) until the user
  // clicks Accept (becomes regular active) or Dismiss (removed entirely).
  //
  // Re-runs are idempotent: a signature of the preseed payload is recorded in
  // localStorage so a regenerated .preann.json with new content can introduce new
  // suggestions without duplicating ones the user has already accepted/dismissed.
  function mergePreseed() {
    const seed = window.__annPreseed;
    if (!Array.isArray(seed) || seed.length === 0) return;
    const existingIds = new Set(annotations.map(a => a.id));
    const seenSig = (function() {
      try { return JSON.parse(localStorage.getItem(PRESEED_KEY) || "[]"); } catch { return []; }
    })();
    const seenSet = new Set(seenSig);
    let added = 0;
    seed.forEach(s => {
      // Each preseed must have a stable id so user dismissals stick across reloads.
      if (!s || !s.id) return;
      if (existingIds.has(s.id)) return;     // already merged previously
      if (seenSet.has(s.id)) return;         // user dismissed in a prior session
      const ann = {
        id: s.id,
        kind: s.kind || "text",
        suggested: true,
        intent: s.intent || "question",
        severity: s.severity || "important",
        comment: s.comment || "",
        section: s.section || "",
        aiNote: s.comment || "",             // preserve original AI note even after Accept
        createdAt: s.createdAt || new Date().toISOString(),
        done: false,
        exported: false,
      };
      if (s.kind === "rect" && s.rect) ann.rect = s.rect;
      if (s.range) ann.range = s.range;
      if (s.quote || (s.range && s.range.text)) {
        ann.range = ann.range || {};
        ann.range.text = s.quote || ann.range.text;
      }
      annotations.push(ann);
      added += 1;
    });
    if (added > 0) {
      saveAnnotations();
      // Record that we've seen these ids (so dismissals stick)
      const merged = Array.from(new Set([...seenSig, ...seed.map(s => s && s.id).filter(Boolean)]));
      try { localStorage.setItem(PRESEED_KEY, JSON.stringify(merged)); } catch {}
    }
  }

  // ----- range serialization (XPath + offset) -----
  function xpathOf(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentNode;
      const idx = Array.from(parent.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).indexOf(node);
      return xpathOf(parent) + "/text()[" + (idx + 1) + "]";
    }
    if (node === document.body) return "/html/body";
    const parent = node.parentNode;
    if (!parent) return "";
    const tag = node.tagName.toLowerCase();
    const sibs = Array.from(parent.children).filter(c => c.tagName === node.tagName);
    const idx = sibs.indexOf(node);
    return xpathOf(parent) + "/" + tag + "[" + (idx + 1) + "]";
  }
  function nodeFromXPath(xpath) {
    try {
      return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    } catch {
      return null;
    }
  }
  function serializeRange(range) {
    return {
      startXPath: xpathOf(range.startContainer),
      startOffset: range.startOffset,
      endXPath: xpathOf(range.endContainer),
      endOffset: range.endOffset,
      text: range.toString()
    };
  }
  function restoreRange(s) {
    const sn = nodeFromXPath(s.startXPath);
    const en = nodeFromXPath(s.endXPath);
    if (!sn || !en) return null;
    const r = document.createRange();
    try {
      r.setStart(sn, s.startOffset);
      r.setEnd(en, s.endOffset);
    } catch {
      return null;
    }
    return r;
  }

  // Fallback: when XPath fails, find the quote text by searching the document.
  // Returns a Range over the first matching text occurrence, or null.
  function findRangeByQuote(quote) {
    if (!quote || quote.length < 2) return null;
    const needle = quote.replace(/\s+/g, " ").trim();
    if (!needle) return null;
    const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, IFRAME: 1 };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: n => {
        if (!n.parentNode) return NodeFilter.FILTER_REJECT;
        // Skip script / style / noscript so we never match into raw HTML or JSON-serialized state
        let p = n.parentNode;
        while (p && p !== document.body) {
          if (SKIP_TAGS[p.tagName]) return NodeFilter.FILTER_REJECT;
          p = p.parentNode;
        }
        // Skip overlay chrome
        if (n.parentNode.closest && (n.parentNode.closest(".ann-bar") || n.parentNode.closest(".ann-bubble") || n.parentNode.closest(".ann-toast"))) {
          return NodeFilter.FILTER_REJECT;
        }
        return n.nodeValue && n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    // Try direct single-node match first (fast common case)
    let node;
    while ((node = walker.nextNode())) {
      const idx = node.nodeValue.indexOf(needle);
      if (idx >= 0) {
        const r = document.createRange();
        try {
          r.setStart(node, idx);
          r.setEnd(node, idx + needle.length);
          return r;
        } catch {}
      }
    }
    // No single-node hit — give up; multi-node fuzzy match would be costly + fragile
    return null;
  }

  // ----- context capture: viewport + computed styles for prompt context -----
  const STYLE_KEYS = [
    "color", "backgroundColor", "fontSize", "fontWeight", "lineHeight",
    "fontFamily", "padding", "margin", "border", "borderRadius",
    "width", "height", "display"
  ];
  function captureContext(targetEl) {
    const ctx = {
      viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    };
    if (targetEl && targetEl.nodeType === 1) {
      const cs = window.getComputedStyle(targetEl);
      const styles = {};
      STYLE_KEYS.forEach(k => {
        const v = cs[k];
        if (v && v !== "auto" && v !== "normal" && v !== "0px" && v !== "rgba(0, 0, 0, 0)") {
          styles[k] = v;
        }
      });
      ctx.element = {
        tag: targetEl.tagName.toLowerCase(),
        id: targetEl.id || undefined,
        classes: targetEl.className && typeof targetEl.className === "string"
          ? targetEl.className.trim().split(/\s+/).slice(0, 6).join(" ")
          : undefined,
        selector: buildSelector(targetEl),
        computed: styles,
      };
    }
    return ctx;
  }
  function buildSelector(el) {
    // Build a stable-ish CSS selector — tag + id + first 2 classes; walk up max 3 levels
    const parts = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 3 && cur !== document.body) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) { s += "#" + cur.id; parts.unshift(s); break; }
      if (cur.className && typeof cur.className === "string") {
        const cls = cur.className.trim().split(/\s+/).slice(0, 2).filter(Boolean);
        if (cls.length) s += "." + cls.join(".");
      }
      parts.unshift(s);
      cur = cur.parentElement;
      depth += 1;
    }
    return parts.join(" > ");
  }
  function elementAtPagePoint(pageX, pageY) {
    const vpX = pageX - window.scrollX;
    const vpY = pageY - window.scrollY;
    return document.elementFromPoint(vpX, vpY);
  }

  // ----- CSS live-edit: apply a "color: red; font-size: 20px" string as inline !important rules -----
  function parseCssDeclarations(text) {
    const out = [];
    (text || "").split(/[;\n]+/).forEach(line => {
      const idx = line.indexOf(":");
      if (idx < 0) return;
      const prop = line.slice(0, idx).trim();
      const val = line.slice(idx + 1).trim();
      if (prop && val) out.push({ prop, val });
    });
    return out;
  }
  function applyCssEdit(el, cssText) {
    if (!el || el.nodeType !== 1) return null;
    // Snapshot current inline style values for the properties we're about to override
    const snapshot = {};
    const decls = parseCssDeclarations(cssText);
    decls.forEach(({ prop }) => {
      snapshot[prop] = el.style.getPropertyValue(prop);
    });
    decls.forEach(({ prop, val }) => {
      try { el.style.setProperty(prop, val, "important"); } catch (e) {}
    });
    return { snapshot, applied: decls };
  }
  function revertCssEdit(el, snapshot) {
    if (!el || !snapshot) return;
    Object.entries(snapshot).forEach(([prop, val]) => {
      if (val) el.style.setProperty(prop, val);
      else el.style.removeProperty(prop);
    });
  }

  // ----- section context -----
  function findSectionFromPageY(pageY) {
    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
    let best = null;
    for (const h of headings) {
      const hTop = h.getBoundingClientRect().top + window.scrollY;
      if (hTop <= pageY) best = h;
      else break;
    }
    return best ? best.textContent.trim() : "";
  }

  // ----- highlight render -----
  function findSectionContext(range) {
    let n = range.startContainer;
    while (n && n !== document.body) {
      if (n.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/.test(n.tagName)) {
        return n.textContent.trim();
      }
      if (n.previousElementSibling) {
        let p = n.previousElementSibling;
        while (p) {
          if (/^H[1-6]$/.test(p.tagName)) return p.textContent.trim();
          p = p.previousElementSibling;
        }
      }
      n = n.parentNode;
    }
    return "";
  }

  function wrapRange(range, annId) {
    try {
      const mark = document.createElement("mark");
      mark.className = "ann-mark";
      mark.dataset.annId = annId;
      range.surroundContents(mark);
      mark.addEventListener("click", e => {
        e.stopPropagation();
        openBubbleForAnnotation(annId, mark);
      });
      return mark;
    } catch (err) {
      // Range crosses element boundaries — fall back to text-node-by-text-node wrapping
      return wrapRangeMulti(range, annId);
    }
  }

  function wrapRangeMulti(range, annId) {
    const walker = document.createTreeWalker(
      range.commonAncestorContainer,
      NodeFilter.SHOW_TEXT,
      { acceptNode: n => range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
    );
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(node => {
      const r = document.createRange();
      r.selectNodeContents(node);
      if (node === range.startContainer) r.setStart(node, range.startOffset);
      if (node === range.endContainer) r.setEnd(node, range.endOffset);
      const mark = document.createElement("mark");
      mark.className = "ann-mark";
      mark.dataset.annId = annId;
      try {
        r.surroundContents(mark);
        mark.addEventListener("click", e => {
          e.stopPropagation();
          openBubbleForAnnotation(annId, mark);
        });
      } catch {}
    });
    return null;
  }

  function ensureRectLayer() {
    if (rectLayer && document.body.contains(rectLayer)) return rectLayer;
    rectLayer = document.createElement("div");
    rectLayer.className = "ann-rect-layer";
    document.body.appendChild(rectLayer);
    return rectLayer;
  }

  function renderAll() {
    document.querySelectorAll("mark.ann-mark").forEach(m => {
      const text = m.textContent;
      m.replaceWith(document.createTextNode(text));
    });
    // Clear previous rect overlays
    ensureRectLayer();
    rectLayer.querySelectorAll(".ann-rect").forEach(r => r.remove());

    let rectIdx = 0;
    let staleCount = 0;
    annotations.forEach(a => {
      if (a.kind === "rect" && a.rect) {
        rectIdx += 1;
        renderRectOverlay(a, rectIdx);
        return;
      }
      // Try XPath first, then fall back to quote-text search
      let r = a.range ? restoreRange(a.range) : null;
      if (!r && a.range && a.range.text) {
        r = findRangeByQuote(a.range.text);
        if (r) a._restoredByFallback = true;
      }
      if (r) {
        wrapRange(r, a.id);
        const marks = document.querySelectorAll('mark.ann-mark[data-ann-id="' + a.id + '"]');
        if (a.done) marks.forEach(m => m.classList.add('done'));
        if (a.exported && !a.done) marks.forEach(m => m.classList.add('exported'));
        if (a._restoredByFallback) marks.forEach(m => m.classList.add('fallback'));
        if (a.suggested) marks.forEach(m => m.classList.add('suggested'));
      } else {
        staleCount += 1;
      }
    });
    document.body.normalize();
    // A1: Auto re-apply CSS overrides so reload preserves the visual changes
    let cssApplied = 0;
    annotations.forEach(a => {
      if (!a.cssOverride) return;
      let target = null;
      if (a.kind === "rect" && a.rect) {
        target = elementAtPagePoint(a.rect.x + a.rect.w / 2, a.rect.y + a.rect.h / 2);
      } else if (a.context && a.context.element && a.context.element.selector) {
        try { target = document.querySelector(a.context.element.selector); } catch {}
      }
      if (target) {
        applyCssEdit(target, a.cssOverride);
        cssApplied += 1;
      }
    });
    if (cssApplied > 0 && !window.__annotateBootToastShown) {
      window.__annotateBootToastShown = true;
      // Defer so DOM has time to render
      setTimeout(() => toast(`Re-applied ${cssApplied} CSS override${cssApplied>1?"s":""} from saved annotations`, "success"), 200);
    }
    if (staleCount > 0 && !window.__annotateStaleToastShown) {
      window.__annotateStaleToastShown = true;
      setTimeout(() => toast(`${staleCount} annotation${staleCount>1?"s":""} couldn't be located (content changed)`, "warn"), 400);
    }
    updateBar();
  }

  function renderRectOverlay(ann, idx) {
    const layer = ensureRectLayer();
    const box = document.createElement("div");
    const stateClass = ann.done ? " done" : (ann.exported ? " exported" : (ann.suggested ? " suggested" : ""));
    box.className = "ann-rect" + stateClass;
    box.dataset.annId = ann.id;
    box.style.left = ann.rect.x + "px";
    box.style.top = ann.rect.y + "px";
    box.style.width = ann.rect.w + "px";
    box.style.height = ann.rect.h + "px";
    const badge = document.createElement("span");
    badge.className = "ann-rect-badge";
    badge.textContent = "#" + idx;
    box.appendChild(badge);
    box.addEventListener("click", e => {
      e.stopPropagation();
      openBubbleForAnnotation(ann.id, box);
    });
    layer.appendChild(box);
  }

  // ----- bubble UI -----
  let bubbleShownAt = 0;
  let pendingMarks = [];  // temp <mark.ann-pending> wraps shown while bubble is open
  let pendingOnDismiss = null;  // callback when bubble dismissed without save

  function dismissBubble() {
    if (activeBubble) {
      activeBubble.remove();
      activeBubble = null;
    }
    if (pendingOnDismiss) {
      const fn = pendingOnDismiss;
      pendingOnDismiss = null;
      fn();
    }
  }

  function unwrapPending() {
    pendingMarks.forEach(m => {
      const parent = m.parentNode;
      if (!parent) return;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      m.remove();
    });
    pendingMarks = [];
    document.body.normalize();
  }

  function wrapPending(range) {
    // Try simple surroundContents first (works for single-text-node ranges)
    try {
      const mark = document.createElement("mark");
      mark.className = "ann-pending";
      range.surroundContents(mark);
      pendingMarks.push(mark);
      return;
    } catch {
      // Range spans element boundaries — fall back to per-text-node wrap
    }
    // Find walker root: if commonAncestor is text node, walk from its parent
    let root = range.commonAncestorContainer;
    if (root.nodeType === Node.TEXT_NODE) root = root.parentNode;
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      { acceptNode: n => range.intersectsNode(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT }
    );
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach(node => {
      const r = document.createRange();
      r.selectNodeContents(node);
      if (node === range.startContainer) r.setStart(node, range.startOffset);
      if (node === range.endContainer) r.setEnd(node, range.endOffset);
      const mark = document.createElement("mark");
      mark.className = "ann-pending";
      try {
        r.surroundContents(mark);
        pendingMarks.push(mark);
      } catch {}
    });
  }

  function showBubbleAt(rect, opts) {
    dismissBubble();
    const b = document.createElement("div");
    const isSuggested = !!opts.suggested;
    b.className = "ann-bubble" + (isSuggested ? " suggested-bubble" : "");
    const aiNoteBlock = isSuggested && opts.aiNote
      ? `<div class="ann-bubble-ai-note">✨ <strong>Claude:</strong> ${escapeHtml(opts.aiNote)}</div>`
      : "";
    const actionsHtml = isSuggested
      ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            <button class="ann-btn ann-btn-dismiss" data-action="dismiss" title="Dismiss this suggestion (won't reappear)">✗ Dismiss</button>
            <button class="ann-btn" data-action="cancel">Cancel</button>
            <button class="ann-btn ann-btn-accept" data-action="accept" title="Accept — promotes to your active feedback">✓ Accept</button>
          </div>`
      : `
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            ${opts.targetEl ? '<button class="ann-btn ann-btn-css" data-action="toggle-css" title="Live-edit CSS for this element">🎨 Edit CSS</button>' : ''}
            ${opts.id && opts.exported ? '<button class="ann-btn ann-btn-reactivate" data-action="reactivate" title="Put this annotation back into the active queue">↺ Reactivate</button>' : ''}
            ${opts.id ? '<button class="ann-btn ann-btn-done' + (opts.done ? ' active' : '') + '" data-action="toggle-done">' + (opts.done ? '↻ Undone' : '✓ Done') + '</button>' : ''}
            ${opts.id ? '<button class="ann-btn ann-btn-danger" data-action="delete">Delete</button>' : ""}
            <button class="ann-btn" data-action="cancel">Cancel</button>
            <button class="ann-btn ann-btn-primary" data-action="save">Save</button>
          </div>`;
    const headerLabel = isSuggested
      ? "✨ AI suggestion"
      : (opts.id ? (opts.exported ? "exported · history" : "edit") : "new");
    b.innerHTML = `
      <div class="ann-bubble-quote" style="font-size:11px;opacity:0.6;margin-bottom:6px;max-height:60px;overflow:hidden">${escapeHtml((opts.quote || "").slice(0, 200))}${(opts.quote||"").length > 200 ? "…" : ""}</div>
      ${aiNoteBlock}
      <textarea placeholder="${isSuggested ? "Edit Claude's note before accepting, or accept as-is" : "comment… (Enter = save, Shift+Enter = newline, Esc = cancel)"}" autofocus>${escapeHtml(opts.comment || "")}</textarea>
      <div class="ann-bubble-css" data-role="css-panel" style="display:none;margin-top:8px">
        <div class="ann-bubble-css-target" data-role="css-target" style="font-size:10px;opacity:0.5;margin-bottom:4px;font-family:ui-monospace,Menlo,monospace"></div>
        <textarea class="ann-bubble-css-input" data-role="css-input" placeholder="CSS overrides — e.g.&#10;color: #1d4ed8;&#10;font-size: 18px;" rows="3"></textarea>
        <div style="font-size:10px;opacity:0.45;margin-top:3px">↑ Live preview. Saved as part of the prompt. Refresh reverts visuals.</div>
      </div>
      <div class="ann-bubble-actions">
        <div class="left">${headerLabel}</div>
        ${actionsHtml}
      </div>`;
    b.style.left = (rect.left + window.scrollX) + "px";
    b.style.top = (rect.top + window.scrollY - 8 - 150) + "px"; // approx height 150
    document.body.appendChild(b);
    // If would clip top, flip below
    const bb = b.getBoundingClientRect();
    if (bb.top < 8) {
      b.style.top = (rect.bottom + window.scrollY + 10) + "px";
      b.classList.add("below");
    }
    activeBubble = b;
    bubbleShownAt = Date.now();
    const ta = b.querySelector("textarea");
    // Defer focus until next frame — selection still active when bubble appears,
    // immediate focus() gets eaten by the selection handler in some browsers.
    requestAnimationFrame(() => {
      ta.focus();
      if (opts.comment) ta.setSelectionRange(ta.value.length, ta.value.length);
    });
    b.addEventListener("click", e => e.stopPropagation());

    // ---- CSS live-edit wiring ----
    let cssSnapshot = null;
    let cssApplied = "";
    const cssToggle = b.querySelector('[data-action="toggle-css"]');
    const cssPanel = b.querySelector('[data-role="css-panel"]');
    const cssInput = b.querySelector('[data-role="css-input"]');
    const cssTarget = b.querySelector('[data-role="css-target"]');
    if (cssToggle && opts.targetEl) {
      cssToggle.addEventListener("click", () => {
        const show = cssPanel.style.display === "none";
        cssPanel.style.display = show ? "" : "none";
        cssToggle.classList.toggle("active", show);
        if (show) {
          cssTarget.textContent = "Target: " + buildSelector(opts.targetEl);
          if (opts.cssOverride && cssInput.value === "") cssInput.value = opts.cssOverride;
          cssInput.focus();
        }
      });
      cssInput.addEventListener("input", () => {
        // Revert prior application, then apply current input
        if (cssSnapshot) revertCssEdit(opts.targetEl, cssSnapshot);
        const result = applyCssEdit(opts.targetEl, cssInput.value);
        if (result) { cssSnapshot = result.snapshot; cssApplied = cssInput.value; }
      });
      // Pre-populate when editing an existing annotation that had a CSS override
      if (opts.cssOverride) {
        cssPanel.style.display = "";
        cssToggle.classList.add("active");
        cssTarget.textContent = "Target: " + buildSelector(opts.targetEl);
        cssInput.value = opts.cssOverride;
        const result = applyCssEdit(opts.targetEl, opts.cssOverride);
        if (result) { cssSnapshot = result.snapshot; cssApplied = opts.cssOverride; }
      }
    }

    b.querySelector('[data-action="cancel"]').addEventListener("click", () => {
      // Cancel — revert any live CSS preview that wasn't saved
      if (cssSnapshot) revertCssEdit(opts.targetEl, cssSnapshot);
      dismissBubble();
    });
    const saveBtn = b.querySelector('[data-action="save"]');
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        const text = ta.value.trim();
        if (!text) { dismissBubble(); return; }
        opts.onSave(text, { cssOverride: cssApplied || null });
        dismissBubble();
      });
    }
    const acceptBtn = b.querySelector('[data-action="accept"]');
    if (acceptBtn) {
      acceptBtn.addEventListener("click", () => {
        const text = ta.value.trim();
        if (!text) { dismissBubble(); return; }
        opts.onAccept(text);
        dismissBubble();
      });
    }
    const dismissBtn = b.querySelector('[data-action="dismiss"]');
    if (dismissBtn) {
      dismissBtn.addEventListener("click", () => {
        opts.onDismiss();
        dismissBubble();
      });
    }
    if (opts.id) {
      const deleteBtn = b.querySelector('[data-action="delete"]');
      if (deleteBtn) deleteBtn.addEventListener("click", () => {
        opts.onDelete();
        dismissBubble();
      });
      const toggleDoneBtn = b.querySelector('[data-action="toggle-done"]');
      if (toggleDoneBtn) toggleDoneBtn.addEventListener("click", () => {
        opts.onToggleDone();
        dismissBubble();
      });
      const reactivateBtn = b.querySelector('[data-action="reactivate"]');
      if (reactivateBtn) {
        reactivateBtn.addEventListener("click", () => {
          if (opts.onReactivate) opts.onReactivate();
          dismissBubble();
        });
      }
    }
    ta.addEventListener("keydown", e => {
      // Enter alone = primary action (save / accept); Shift+Enter = newline; Esc = cancel
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const primary = b.querySelector('[data-action="save"]') || b.querySelector('[data-action="accept"]');
        if (primary) primary.click();
      } else if (e.key === "Escape") {
        e.preventDefault();
        dismissBubble();
      }
    });
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function openBubbleForAnnotation(annId, mark) {
    const ann = annotations.find(a => a.id === annId);
    if (!ann) return;
    const rect = mark.getBoundingClientRect();
    const quote = ann.kind === "rect"
      ? `[Rectangle ${Math.round(ann.rect.w)}×${Math.round(ann.rect.h)}px @ (${Math.round(ann.rect.x)}, ${Math.round(ann.rect.y)})]`
      : (ann.range ? ann.range.text : "");
    // Find target element for existing annotation:
    //   text → the mark's own parent (always reliable when the highlight is rendered)
    //          falling back to a stored selector for non-rendered cases
    //   rect → element at the rect's center
    let existingTargetEl = null;
    if (ann.kind === "rect" && ann.rect) {
      existingTargetEl = elementAtPagePoint(ann.rect.x + ann.rect.w / 2, ann.rect.y + ann.rect.h / 2);
    } else {
      // Try the live mark first (works for both XPath-restored and fallback-restored marks)
      if (mark && mark.parentElement) existingTargetEl = mark.parentElement;
      // Fall back to stored selector
      if (!existingTargetEl && ann.context && ann.context.element && ann.context.element.selector) {
        try { existingTargetEl = document.querySelector(ann.context.element.selector); } catch (e) {}
      }
    }
    showBubbleAt(rect, {
      id: annId,
      quote,
      comment: ann.comment,
      done: !!ann.done,
      exported: !!ann.exported,
      suggested: !!ann.suggested,
      aiNote: ann.aiNote || null,
      targetEl: existingTargetEl,
      cssOverride: ann.cssOverride || null,
      onSave: (text, extras) => {
        ann.comment = text;
        if (extras && extras.cssOverride !== undefined) ann.cssOverride = extras.cssOverride;
        ann.updatedAt = Date.now();
        saveAnnotations();
        updateBar();
      },
      onAccept: (text) => {
        ann.comment = text;
        ann.suggested = false;
        ann.updatedAt = Date.now();
        saveAnnotations();
        renderAll();
        toast("Suggestion accepted — now in your active queue", "success");
      },
      onDismiss: () => {
        // Recorded in PRESEED_KEY (already done at merge time), so reload won't reintroduce.
        annotations = annotations.filter(a => a.id !== annId);
        saveAnnotations();
        renderAll();
        toast("Suggestion dismissed", "info");
      },
      onDelete: () => {
        annotations = annotations.filter(a => a.id !== annId);
        saveAnnotations();
        renderAll();
      },
      onToggleDone: () => {
        ann.done = !ann.done;
        ann.updatedAt = Date.now();
        saveAnnotations();
        renderAll();
      },
      onReactivate: () => {
        ann.exported = false;
        ann.updatedAt = Date.now();
        saveAnnotations();
        renderAll();
      }
    });
  }

  // ----- rectangle mode (persistent — stays on after each rect; exit via ESC / ✕ button) -----
  function setRectMode(on) {
    rectMode = !!on;
    document.body.classList.toggle("ann-rect-mode", rectMode);
    // Clear any text selection that might be lingering
    const sel = window.getSelection();
    if (sel) sel.removeAllRanges();
    const btn = document.querySelector('.ann-bar [data-action="rect-toggle"]');
    if (btn) {
      btn.classList.toggle("active", rectMode);
      btn.textContent = rectMode ? "✕ 退出框選 (持續中)" : "▭ 框選";
      btn.title = rectMode ? "持續框選模式 — 按 ESC 或此處退出" : "切換到矩形框選模式（可以連續加入多個 rect）";
    }
  }

  document.addEventListener("mousedown", e => {
    if (!rectMode) return;
    if (e.target.closest(".ann-bubble") || e.target.closest(".ann-bar") || e.target.closest(".ann-rect")) return;
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.pageX;
    const startY = e.pageY;
    const layer = ensureRectLayer();
    const el = document.createElement("div");
    el.className = "ann-rect ann-rect-draft";
    el.style.left = startX + "px";
    el.style.top = startY + "px";
    el.style.width = "0px";
    el.style.height = "0px";
    layer.appendChild(el);
    rectDraft = { startX, startY, el };
  });

  document.addEventListener("mousemove", e => {
    if (!rectDraft) return;
    const x = Math.min(rectDraft.startX, e.pageX);
    const y = Math.min(rectDraft.startY, e.pageY);
    const w = Math.abs(e.pageX - rectDraft.startX);
    const h = Math.abs(e.pageY - rectDraft.startY);
    rectDraft.el.style.left = x + "px";
    rectDraft.el.style.top = y + "px";
    rectDraft.el.style.width = w + "px";
    rectDraft.el.style.height = h + "px";
  });

  document.addEventListener("mouseup", e => {
    if (!rectDraft) return;
    const draft = rectDraft;
    rectDraft = null;
    const w = parseFloat(draft.el.style.width);
    const h = parseFloat(draft.el.style.height);
    // Reject tiny accidental drags
    if (w < 8 || h < 8) {
      draft.el.remove();
      return;
    }
    const x = parseFloat(draft.el.style.left);
    const y = parseFloat(draft.el.style.top);
    // Show bubble next to draft rect — pass viewport-relative rect
    const vpRect = {
      left: x - window.scrollX,
      top: y - window.scrollY,
      right: x - window.scrollX + w,
      bottom: y - window.scrollY + h,
    };
    const rectTargetEl = elementAtPagePoint(x + w / 2, y + h / 2);
    showBubbleAt(vpRect, {
      quote: `[Rectangle ${Math.round(w)}×${Math.round(h)}px @ (${Math.round(x)}, ${Math.round(y)})]`,
      targetEl: rectTargetEl,
      onSave: (comment, extras) => {
        const id = "ann_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
        const ann = {
          id,
          kind: "rect",
          rect: { x, y, w, h },
          comment,
          sectionTitle: findSectionFromPageY(y + h / 2),
          context: captureContext(rectTargetEl),
          cssOverride: (extras && extras.cssOverride) || null,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        annotations.push(ann);
        saveAnnotations();
        draft.el.remove();
        renderAll();
      },
    });
    // If user dismisses bubble without saving, draft will be unwrapped here
    pendingOnDismiss = () => {
      if (draft.el && draft.el.parentNode) draft.el.remove();
    };
  }, true);  // capture phase, so we run before the text-selection mouseup handler

  // ----- selection handler -----
  document.addEventListener("mouseup", e => {
    if (rectMode) return;  // rect mode handled above
    if (e.target.closest(".ann-bubble") || e.target.closest(".ann-bar")) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text || text.length < 2) return;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const serialized = serializeRange(range);
    const sectionTitle = findSectionContext(range);

    // Wrap in pending highlight so user sees what they're annotating
    wrapPending(range);
    // Recompute rect (pending wrap may have shifted layout slightly)
    const wrappedRect = pendingMarks.length > 0
      ? pendingMarks[0].getBoundingClientRect()
      : rect;
    const textParentEl = range.commonAncestorContainer.nodeType === 1
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    showBubbleAt(wrappedRect, {
      quote: text,
      targetEl: textParentEl,
      onSave: (comment, extras) => {
        pendingOnDismiss = null;  // do not unwrap; will be replaced by renderAll
        unwrapPending();
        const id = "ann_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6);
        const ann = {
          id,
          range: serialized,
          comment,
          sectionTitle,
          context: captureContext(textParentEl),
          cssOverride: (extras && extras.cssOverride) || null,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        annotations.push(ann);
        saveAnnotations();
        renderAll();
      }
    });
    // Register unwrap on dismiss AFTER showBubbleAt (which itself calls dismissBubble for any prior bubble)
    pendingOnDismiss = unwrapPending;
    sel.removeAllRanges();
  });

  document.addEventListener("click", e => {
    // Guard: ignore clicks within 250ms of bubble appearing
    // (mouseup that creates the bubble also fires a click event after — would instantly dismiss)
    if (Date.now() - bubbleShownAt < 250) return;
    if (!e.target.closest(".ann-bubble") && !e.target.closest(".ann-mark") && !e.target.closest(".ann-bar")) {
      dismissBubble();
    }
  });

  // ----- bottom bar -----
  function makeBar() {
    const bar = document.createElement("div");
    bar.className = "ann-bar visible";  // always visible
    bar.innerHTML = `
      <span class="ann-bar-hint" data-role="hint">💡 選取文字 或 按「框選」標註區域</span>
      <span class="ann-bar-count" data-role="count" style="display:none">0</span>
      <span data-role="label" style="display:none">annotations</span>
      <button data-action="rect-toggle" title="切換到矩形框選模式">▭ 框選</button>
      <button data-action="import" title="Import annotations from a previously exported JSON file">⬆ Import</button>
      <button data-action="export" style="display:none">Export JSON</button>
      <button class="primary" data-action="copy" style="display:none">Copy as Prompt</button>
    `;
    document.body.appendChild(bar);
    bar.querySelector('[data-action="export"]').addEventListener("click", exportJSON);
    bar.querySelector('[data-action="copy"]').addEventListener("click", copyAsPrompt);
    bar.querySelector('[data-action="rect-toggle"]').addEventListener("click", () => setRectMode(!rectMode));
    bar.querySelector('[data-action="import"]').addEventListener("click", importJSON);
    // Global ESC exits rect mode
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && rectMode && !activeBubble) {
        setRectMode(false);
      }
    });
    return bar;
  }
  const bar = makeBar();

  // History sidebar / full-prompt features removed 2026-05-22 — pending UX rework.


  function updateBar() {
    const n = annotations.length;
    // Active = user-confirmed, not yet exported, not done, not still a suggestion
    const activeCount = annotations.filter(a => !a.done && !a.exported && !a.suggested).length;
    const suggestedCount = annotations.filter(a => a.suggested).length;
    const exportedCount = annotations.filter(a => a.exported && !a.done).length;
    const doneCount = annotations.filter(a => a.done).length;
    const hint = bar.querySelector('[data-role="hint"]');
    const count = bar.querySelector('[data-role="count"]');
    const label = bar.querySelector('[data-role="label"]');
    const exportBtn = bar.querySelector('[data-action="export"]');
    const copyBtn = bar.querySelector('[data-action="copy"]');
    if (n === 0) {
      hint.style.display = "";
      count.style.display = "none";
      label.style.display = "none";
      exportBtn.style.display = "none";
      copyBtn.style.display = "none";
    } else {
      hint.style.display = "none";
      count.style.display = "";
      const hasHistory = exportedCount > 0 || doneCount > 0 || suggestedCount > 0;
      count.textContent = hasHistory ? `${activeCount} / ${n}` : `${n}`;
      label.style.display = "";
      const labelParts = [];
      if (hasHistory) {
        labelParts.push("active");
        if (suggestedCount > 0) labelParts.push(`✨ ${suggestedCount} suggested`);
        if (exportedCount > 0) labelParts.push(`${exportedCount} exported`);
        if (doneCount > 0) labelParts.push(`${doneCount} done`);
        label.textContent = labelParts.join(" · ");
      } else {
        label.textContent = n === 1 ? "annotation" : "annotations";
      }
      exportBtn.style.display = "";
      copyBtn.style.display = "";
      copyBtn.textContent = activeCount > 0
        ? `Copy ${activeCount} new`
        : "Copy as Prompt";
      copyBtn.disabled = activeCount === 0;
    }
  }

  // ----- actions -----
  function toast(msg, kind) {
    const t = document.createElement("div");
    t.className = "ann-toast " + (kind || "success");
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  function buildPayload(opts) {
    // onlyActive = annotations that haven't been exported yet, aren't marked done,
    //              and aren't still pending AI suggestion (user must Accept first)
    const filter = opts && opts.onlyActive ? (a => !a.done && !a.exported && !a.suggested) : (() => true);
    return {
      doc: { path: location.pathname, title: DOC_TITLE, href: location.href },
      generatedAt: new Date().toISOString(),
      annotations: annotations.filter(filter).map(a => ({
        id: a.id,
        kind: a.kind || "text",
        section: a.sectionTitle,
        quote: a.kind === "rect"
          ? `[Rectangle ${Math.round(a.rect.w)}×${Math.round(a.rect.h)}px @ (${Math.round(a.rect.x)}, ${Math.round(a.rect.y)})]`
          : (a.range ? a.range.text : ""),
        rect: a.kind === "rect" ? a.rect : undefined,
        comment: a.comment,
        done: !!a.done,
        exported: !!a.exported,
        context: a.context,
        cssOverride: a.cssOverride || null,
        createdAt: new Date(a.createdAt).toISOString()
      }))
    };
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = DOC_TITLE.replace(/[^a-z0-9]+/gi, "-") + ".annotations.json";
    a.click();
    URL.revokeObjectURL(url);
    toast("Exported " + annotations.length + " annotations", "success");
  }

  function importJSON() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          const incoming = Array.isArray(parsed) ? parsed
            : Array.isArray(parsed.annotations) ? parsed.annotations
            : null;
          if (!incoming) throw new Error("File doesn't look like an annotations export.");
          // Merge by id — incoming wins for duplicates; preserve unrelated existing
          const existingById = new Map(annotations.map(a => [a.id, a]));
          let added = 0, replaced = 0;
          incoming.forEach(raw => {
            if (!raw || typeof raw !== "object" || !raw.id) return;
            // Normalize: createdAt may be ISO string from export
            const norm = Object.assign({}, raw);
            if (typeof norm.createdAt === "string") norm.createdAt = Date.parse(norm.createdAt) || Date.now();
            if (typeof norm.updatedAt === "string") norm.updatedAt = Date.parse(norm.updatedAt) || norm.createdAt;
            if (norm.kind === "text" && norm.range == null && norm.quote) {
              // Imported text annotation without a serialized range — keep it but mark unrenderable
              norm.range = null;
            }
            if (existingById.has(norm.id)) replaced += 1;
            else added += 1;
            existingById.set(norm.id, norm);
          });
          annotations = Array.from(existingById.values());
          saveAnnotations();
          renderAll();
          toast(`Imported ${added} new + ${replaced} updated annotation(s)`, "success");
        } catch (err) {
          toast(`Import failed: ${err.message}`, "error");
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function buildPromptMarkdown() {
    const p = buildPayload({ onlyActive: true });
    const lines = [
      `# Annotation follow-up — ${p.doc.title}`,
      "",
      `**Source**: \`${p.doc.path}\``,
      `**Count**: ${p.annotations.length} new annotation(s)`,
      "",
      "我正在處理一份報告，在 HTML preview 中標註了以下段落 + comment。",
      "請就每個 annotation 跟進，按順序作答；如果 comment 是問題就回答，是指示就執行。",
      "（注意：之前 round 已 export 過的 annotation 不會在此，無需再處理。）",
      "",
    ];
    p.annotations.forEach((a, i) => {
      lines.push(`## ${i + 1}. ${a.section || "Untitled section"}`);
      lines.push("");
      lines.push("> " + (a.quote || "").replace(/\n/g, "\n> ").slice(0, 1500));
      lines.push("");
      lines.push(`**Comment**: ${a.comment}`);
      // CSS override — first-class, shown above element context because it's actionable
      if (a.cssOverride) {
        lines.push("");
        lines.push(`**CSS override (applied live in preview)** — please reconcile in source:`);
        lines.push("```css");
        const sel = (a.context && a.context.element && a.context.element.selector) || "/* target element */";
        lines.push(`${sel} {`);
        a.cssOverride.split(/[;\n]+/).forEach(line => {
          const t = line.trim();
          if (t) lines.push(`  ${t};`);
        });
        lines.push("}");
        lines.push("```");
      }
      // Append element context if we captured it (only useful for design / UI critique)
      if (a.context && a.context.element) {
        const el = a.context.element;
        const styleBits = el.computed ? Object.entries(el.computed).map(([k, v]) => `${k}: ${v}`).join("; ") : "";
        const ctxLines = [
          "",
          "<details><summary>Element context</summary>",
          "",
          `- **Selector**: \`${el.selector}\``,
          `- **Viewport**: ${a.context.viewport.w}×${a.context.viewport.h}${a.context.viewport.dpr > 1 ? ` @${a.context.viewport.dpr}x` : ""}`,
        ];
        if (styleBits) ctxLines.push(`- **Computed**: \`${styleBits}\``);
        ctxLines.push("");
        ctxLines.push("</details>");
        lines.push(...ctxLines);
      }
      lines.push("");
    });
    return lines.join("\n");
  }


  function copyAsPrompt() {
    const activeIds = annotations.filter(a => !a.done && !a.exported).map(a => a.id);
    const activeCount = activeIds.length;
    if (activeCount === 0) {
      toast("No new annotations to copy — all already exported or done", "warn");
      return;
    }
    const md = buildPromptMarkdown();
    const markExported = () => {
      const idSet = new Set(activeIds);
      annotations.forEach(a => {
        if (idSet.has(a.id)) {
          a.exported = true;
          a.exportedAt = Date.now();
          a.updatedAt = Date.now();
        }
      });
      saveAnnotations();
      renderAll();
    };
    const onOk = () => {
      markExported();
      toast(`Copied ${activeCount} new annotation${activeCount>1?"s":""} — paste into Claude. Marked as exported.`, "success");
    };
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = md;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        onOk();
      } catch (e) {
        toast("Copy failed — use Export JSON instead", "error");
      }
      ta.remove();
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(md).then(onOk, fallback);
    } else {
      fallback();
    }
  }

  // ----- gutter markers (light visual cue) -----
  function renderGutter() {
    // Skipped for v1 — keeping highlights as primary cue; gutter optional
  }

  // ----- boot -----
  window.addEventListener("DOMContentLoaded", () => {
    renderAll();
  });
  if (document.readyState !== "loading") renderAll();
})();
