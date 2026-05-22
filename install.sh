#!/usr/bin/env bash
# html-annotated-preview — one-line installer for Claude Code skills directory.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/myttttttt/html-annotated-preview/main/install.sh | bash
#
# Or, from a local clone:
#   ./install.sh

set -euo pipefail

SKILL_NAME="html-annotated-preview"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
TARGET="$SKILLS_DIR/$SKILL_NAME"
REPO_URL="https://github.com/myttttttt/html-annotated-preview.git"
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "→ Installing $SKILL_NAME to $TARGET"

# Detect: running from a local clone vs piped from curl
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)" 2>/dev/null || SCRIPT_DIR=""
if [[ -n "$SCRIPT_DIR" && -d "$SCRIPT_DIR/src" && -f "$SCRIPT_DIR/SKILL.md" ]]; then
  SRC="$SCRIPT_DIR"
  echo "  Using local clone at $SRC"
else
  echo "  Cloning $REPO_URL"
  git clone --depth 1 "$REPO_URL" "$TMPDIR/repo" >/dev/null 2>&1
  SRC="$TMPDIR/repo"
fi

mkdir -p "$SKILLS_DIR"
if [[ -d "$TARGET" ]]; then
  BACKUP="$TARGET.bak.$(date +%Y%m%d-%H%M%S)"
  echo "  Existing install found — backing up to $BACKUP"
  mv "$TARGET" "$BACKUP"
fi

mkdir -p "$TARGET"
cp "$SRC/SKILL.md" "$TARGET/SKILL.md"
[[ -f "$SRC/SKILL.zh.md" ]] && cp "$SRC/SKILL.zh.md" "$TARGET/SKILL.zh.md"
cp "$SRC/src/annotate.js" "$TARGET/annotate.js"
cp "$SRC/src/annotate.css" "$TARGET/annotate.css"
cp "$SRC/src/inject.py" "$TARGET/inject.py"
cp "$SRC/src/md_to_html.py" "$TARGET/md_to_html.py"

# Sanity check: python markdown package
if ! python3 -c "import markdown" 2>/dev/null; then
  echo ""
  echo "⚠️  Python 'markdown' package not found."
  echo "   Install with: pip3 install markdown"
fi

echo ""
echo "✓ Installed $SKILL_NAME"
echo ""
echo "Next steps:"
echo "  1. Restart Claude Code so the skill is picked up."
echo "  2. Try it on any markdown report:"
echo "       python3 $TARGET/md_to_html.py your-report.md"
echo "       python3 $TARGET/inject.py your-report.html"
echo "       open your-report.html"
echo ""
echo "Docs: $TARGET/SKILL.md"
