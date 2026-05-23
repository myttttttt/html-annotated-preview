#!/usr/bin/env node
/**
 * html-annotated-preview CLI
 *
 * Commands:
 *   install   Re-run the skill install (idempotent, file-level diff)
 *   upgrade   Alias for install
 *   uninstall Remove the skill from ~/.claude/skills/
 *   check     Verify installed version matches this package version
 *   path      Print the install target path
 *   version   Print the package version
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

const SKILL_NAME = "html-annotated-preview";
const SKILLS_DIR = process.env.CLAUDE_SKILLS_DIR || path.join(os.homedir(), ".claude", "skills");
const TARGET = path.join(SKILLS_DIR, SKILL_NAME);
const VERSION_MARKER = path.join(TARGET, ".installed-version");
const pkg = require("../package.json");

const cmd = process.argv[2] || "help";

function usage() {
  console.log(`html-annotated-preview v${pkg.version}

Usage:
  html-annotated-preview <command>

Commands:
  install     (Re-)install the skill into ${TARGET}
  upgrade     Alias for install — run after \`npm install -g\`
  check       Verify installed version matches this package version
  uninstall   Remove the skill from that directory
  path        Print the install target path
  version     Print the package version
  help        Show this help

Docs:    https://github.com/myttttttt/html-annotated-preview
Issues:  https://github.com/myttttttt/html-annotated-preview/issues
`);
}

function readInstalledVersion() {
  if (!fs.existsSync(VERSION_MARKER)) return null;
  try { return fs.readFileSync(VERSION_MARKER, "utf8").trim(); }
  catch { return null; }
}

switch (cmd) {
  case "install":
  case "upgrade":
    require("./postinstall.js");
    break;
  case "uninstall": {
    if (!fs.existsSync(TARGET)) {
      console.log(`Nothing to remove — ${TARGET} does not exist.`);
      process.exit(0);
    }
    fs.rmSync(TARGET, { recursive: true, force: true });
    console.log(`Removed ${TARGET}`);
    break;
  }
  case "check": {
    const installed = readInstalledVersion();
    if (!installed) {
      console.log(`✗ Not installed at ${TARGET}`);
      console.log(`  Run 'html-annotated-preview install' to install.`);
      process.exit(1);
    }
    if (installed === pkg.version) {
      console.log(`✓ html-annotated-preview v${pkg.version} installed at ${TARGET}`);
      process.exit(0);
    }
    console.log(`⚠ Version mismatch:`);
    console.log(`    Installed: v${installed}`);
    console.log(`    Package:   v${pkg.version}`);
    console.log(`  Run 'html-annotated-preview install' to sync.`);
    process.exit(2);
  }
  case "path":
    console.log(TARGET);
    break;
  case "version":
  case "--version":
  case "-v":
    console.log(`v${pkg.version}`);
    break;
  case "help":
  case "--help":
  case "-h":
  default:
    usage();
}
