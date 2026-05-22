#!/usr/bin/env node
/**
 * Postinstall: copy the skill files into the Claude Code skills directory.
 *
 * Runs automatically after `npm install -g html-annotated-preview`.
 * Idempotent: existing install is backed up to `.bak.<timestamp>`.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const SKILL_NAME = "html-annotated-preview";
const SKILLS_DIR = process.env.CLAUDE_SKILLS_DIR || path.join(os.homedir(), ".claude", "skills");
const TARGET = path.join(SKILLS_DIR, SKILL_NAME);
const SOURCE = path.resolve(__dirname, "..");

// Files we ship into the skill directory.
const FILES = [
  "SKILL.md",
  "SKILL.zh.md",
  ["src/annotate.js", "annotate.js"],
  ["src/annotate.css", "annotate.css"],
  ["src/inject.py", "inject.py"],
  ["src/md_to_html.py", "md_to_html.py"]
];

function log(msg) {
  process.stdout.write(`[html-annotated-preview] ${msg}\n`);
}
function warn(msg) {
  process.stderr.write(`[html-annotated-preview] ⚠️  ${msg}\n`);
}

function mkdirp(p) {
  fs.mkdirSync(p, { recursive: true });
}

function copyFile(src, dst) {
  const dir = path.dirname(dst);
  mkdirp(dir);
  fs.copyFileSync(src, dst);
}

function backupIfExists(p) {
  if (!fs.existsSync(p)) return null;
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const bak = `${p}.bak.${ts}`;
  fs.renameSync(p, bak);
  return bak;
}

function tryPython3Markdown() {
  try {
    execSync('python3 -c "import markdown"', { stdio: "ignore" });
    return true;
  } catch (e) {
    return false;
  }
}

function main() {
  try {
    log(`Installing to ${TARGET}`);

    // Honor opt-out — useful for CI / dry-run testing
    if (process.env.HTML_ANNOTATED_PREVIEW_SKIP_INSTALL === "1") {
      log("Skipped (HTML_ANNOTATED_PREVIEW_SKIP_INSTALL=1)");
      return;
    }

    mkdirp(SKILLS_DIR);

    const backup = backupIfExists(TARGET);
    if (backup) log(`Existing install backed up → ${backup}`);

    mkdirp(TARGET);

    FILES.forEach(entry => {
      const [rel, dstRel] = Array.isArray(entry) ? entry : [entry, entry];
      const src = path.join(SOURCE, rel);
      const dst = path.join(TARGET, dstRel);
      if (!fs.existsSync(src)) {
        warn(`Source missing: ${rel} — skipped`);
        return;
      }
      copyFile(src, dst);
    });

    log(`✓ Installed ${FILES.length} files`);

    if (!tryPython3Markdown()) {
      warn("Python 'markdown' package not found.");
      warn("  Install with: pip3 install markdown");
    }

    log("");
    log("Next steps:");
    log("  1. Restart Claude Code so the skill is picked up.");
    log("  2. Try it on any markdown report:");
    log(`       python3 ${TARGET}/md_to_html.py your-report.md`);
    log(`       python3 ${TARGET}/inject.py your-report.html`);
    log("       open your-report.html");
    log("");
    log(`Docs: ${TARGET}/SKILL.md`);
  } catch (err) {
    // Never fail the install on copy errors — print and move on so users at least
    // get the npm package; they can re-run via the CLI.
    warn(`Install failed: ${err.message}`);
    warn(`Run 'html-annotated-preview install' to retry.`);
  }
}

main();
