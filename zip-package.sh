#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
OUT="$ROOT/jump-kick.zip"
rm -f "$OUT"

cd "$ROOT/extension"
zip -r "$OUT" \
  manifest.json \
  background/background.js \
  popup/popup.html popup/popup.js popup/popup.css popup/fuse.min.js \
  options/options.html options/options.js options/options.css \
  icons

cd "$ROOT"
zip -j "$OUT" LICENSE.md NOTICE.md
