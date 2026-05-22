#!/usr/bin/env node
/**
 * html-annotated-preview CLI
 *
 * Commands:
 *   install   Re-run the skill install (idempotent)
 *   uninstall Remove the skill from ~/.claude/skills/
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
const pkg = require("../package.json");

const cmd = process.argv[2] || "help";

function usage() {
  console.log(`html-annotated-preview v${pkg.version}

Usage:
  html-annotated-preview <command>

Commands:
  install     (Re-)install the skill into ${TARGET}
  uninstall   Remove the skill from that directory
  path        Print the install target path
  version     Print the package version
  help        Show this help

Docs:    https://github.com/myttttttt/html-annotated-preview
Issues:  https://github.com/myttttttt/html-annotated-preview/issues
`);
}

switch (cmd) {
  case "install":
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
