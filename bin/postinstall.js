#!/usr/bin/env node
/**
 * Postinstall: copy the skill files into the Claude Code skills directory.
 *
 * Runs automatically after `npm install -g html-annotated-preview`.
 *
 * Behaviour (v0.2.1+):
 *   - Writes a `.installed-version` marker into the target dir.
 *   - On re-run, compares each file's content. Skips files that already match.
 *   - Backs up only files whose content actually differs (no more whole-dir .bak cruft).
 *   - Always overwrites the SKILL.md / source files when the package version is newer.
 *   - Idempotent: re-running at the same version is a no-op.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const pkg = require("../package.json");
const VERSION = pkg.version;
const SKILL_NAME = "html-annotated-preview";
const SKILLS_DIR = process.env.CLAUDE_SKILLS_DIR || path.join(os.homedir(), ".claude", "skills");
const TARGET = path.join(SKILLS_DIR, SKILL_NAME);
const VERSION_MARKER = path.join(TARGET, ".installed-version");
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

function log(msg)  { process.stdout.write(`[html-annotated-preview] ${msg}\n`); }
function warn(msg) { process.stderr.write(`[html-annotated-preview] ⚠️  ${msg}\n`); }

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }

function readInstalledVersion() {
  if (!fs.existsSync(VERSION_MARKER)) return null;
  try { return fs.readFileSync(VERSION_MARKER, "utf8").trim(); }
  catch { return null; }
}

function writeInstalledVersion(v) {
  fs.writeFileSync(VERSION_MARKER, v + "\n", "utf8");
}

function tryPython3Markdown() {
  try { execSync('python3 -c "import markdown"', { stdio: "ignore" }); return true; }
  catch { return false; }
}

function main() {
  try {
    if (process.env.HTML_ANNOTATED_PREVIEW_SKIP_INSTALL === "1") {
      log(`Skipped (HTML_ANNOTATED_PREVIEW_SKIP_INSTALL=1)`);
      return;
    }

    mkdirp(SKILLS_DIR);
    mkdirp(TARGET);

    const installedVersion = readInstalledVersion();
    if (installedVersion === VERSION) {
      log(`html-annotated-preview v${VERSION} already installed at ${TARGET}`);
      // Still re-check files in case skill dir was tampered with
    } else if (installedVersion) {
      log(`Upgrading ${SKILL_NAME}: v${installedVersion} → v${VERSION}`);
    } else {
      log(`Installing ${SKILL_NAME} v${VERSION} → ${TARGET}`);
    }

    const isUpgrade = installedVersion && installedVersion !== VERSION;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");

    let changed = [];
    let unchanged = [];
    let backups = [];

    FILES.forEach(entry => {
      const [rel, dstRel] = Array.isArray(entry) ? entry : [entry, entry];
      const src = path.join(SOURCE, rel);
      const dst = path.join(TARGET, dstRel);
      if (!fs.existsSync(src)) {
        warn(`Source missing: ${rel} — skipped`);
        return;
      }
      mkdirp(path.dirname(dst));
      const srcBuf = fs.readFileSync(src);
      const dstBuf = fs.existsSync(dst) ? fs.readFileSync(dst) : null;
      if (dstBuf && Buffer.compare(srcBuf, dstBuf) === 0) {
        unchanged.push(dstRel);
        return;
      }
      // Content differs — backup ONLY if this is a version upgrade (preserve user diff)
      // and the destination file actually had content.
      if (dstBuf && isUpgrade) {
        const bak = `${dst}.bak.${ts}`;
        fs.writeFileSync(bak, dstBuf);
        backups.push(path.basename(bak));
      }
      fs.writeFileSync(dst, srcBuf);
      changed.push(dstRel);
    });

    writeInstalledVersion(VERSION);

    if (changed.length === 0) {
      log(`✓ All ${FILES.length} files already at v${VERSION} — no changes needed`);
    } else {
      log(`✓ Wrote ${changed.length} file(s) at v${VERSION}: ${changed.join(", ")}`);
      if (unchanged.length > 0) {
        log(`  (${unchanged.length} file(s) unchanged: ${unchanged.join(", ")})`);
      }
      if (backups.length > 0) {
        log(`  Backups (prior version): ${backups.length} file(s)`);
      }
    }

    if (!tryPython3Markdown()) {
      warn("Python 'markdown' package not found.");
      warn("  Install with: pip3 install markdown");
    }

    if (changed.length > 0) {
      log("");
      log("Next steps:");
      log("  1. Restart Claude Code so the skill is picked up.");
      log("  2. Try it on any markdown report:");
      log(`       python3 ${TARGET}/md_to_html.py your-report.md`);
      log(`       python3 ${TARGET}/inject.py your-report.html`);
      log("       open your-report.html");
      log("");
      log(`Docs: ${TARGET}/SKILL.md`);
    }
  } catch (err) {
    // Never fail the npm install on copy errors.
    warn(`Install failed: ${err.message}`);
    warn(`Run 'html-annotated-preview install' to retry.`);
  }
}

main();
