#!/usr/bin/env bash
# Deploy the Obsidian Quick Memo plugin into a vault's plugins folder.
#
# Usage:
#   ./scripts/deploy.sh                       # uses default target below
#   OQM_TARGET=/path/to/vault/.obsidian/plugins/aqu-quick-memos ./scripts/deploy.sh
#   ./scripts/deploy.sh /path/to/vault/.obsidian/plugins/aqu-quick-memos
#
# What it does:
#   1. Runs the production build (typecheck + esbuild).
#   2. Creates the target plugin folder if missing.
#   3. Copies manifest.json, main.js, styles.css into it.
#   4. Prints the reload reminder.

set -euo pipefail

# Resolve the project root (directory containing this script's parent).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Default target vault plugin folder.
DEFAULT_TARGET="/Users/qudange/Documents/测试用OB/.obsidian/plugins/aqu-quick-memos"

# Allow override via first arg or OQM_TARGET env var.
TARGET="${1:-${OQM_TARGET:-$DEFAULT_TARGET}}"

ARTIFACTS=("manifest.json" "main.js" "styles.css")

echo "→ Project root: $PROJECT_ROOT"
echo "→ Target:       $TARGET"
echo

cd "$PROJECT_ROOT"

# 1. Build.
echo "→ Building plugin (production)…"
if ! npm run build; then
  echo "✗ Build failed. Aborting deploy." >&2
  exit 1
fi

# Verify artifacts exist after build.
for file in "${ARTIFACTS[@]}"; do
  if [[ ! -f "$PROJECT_ROOT/$file" ]]; then
    echo "✗ Missing build artifact: $file" >&2
    exit 1
  fi
done

# 2. Ensure target folder exists.
mkdir -p "$TARGET"

# 3. Copy artifacts.
echo "→ Copying artifacts…"
for file in "${ARTIFACTS[@]}"; do
  cp "$PROJECT_ROOT/$file" "$TARGET/$file"
  echo "   copied $file"
done

echo
echo "✓ Deployed Quick Memo to:"
echo "  $TARGET"
echo
echo "Next steps in Obsidian:"
echo "  1. Open the vault (if not already)."
echo "  2. Settings → Community plugins → enable 'Quick Memo' (reload if updating)."
echo "  3. Click the Quick Memo ribbon icon, or run 'Quick Memo: Open Quick Memo overview'."
