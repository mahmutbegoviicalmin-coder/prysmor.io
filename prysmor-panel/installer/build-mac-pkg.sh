#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prysmor CEP Panel — macOS .pkg builder (run on macOS only)
#
# Prerequisites:
#   - macOS + Xcode Command Line Tools (pkgbuild, productbuild)
#   - Repo clone with `prysmor-panel/panel/ffmpeg/mac/ffmpeg` present (Git LFS)
#
# From repo root:
#   bash prysmor-panel/installer/build-mac-pkg.sh
#
# What it does:
#   1. Stages `com.prysmor.panel/` (CSXS + panel + mac ffmpeg, no win exe)
#   2. pkgbuild → flat component package PrysmorPanel.pkg
#   3. productbuild + mac-resources/distribution.xml → dist/Prysmor-2.2.0.pkg
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

if [[ "$(uname)" != "Darwin" ]]; then
  echo "ERROR: This script must be run on macOS." >&2
  exit 1
fi

for tool in pkgbuild productbuild; do
  if ! command -v "$tool" &>/dev/null; then
    echo "ERROR: '$tool' not found. Install Xcode Command Line Tools: xcode-select --install" >&2
    exit 1
  fi
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PANEL_SRC="$REPO_ROOT/prysmor-panel"
RES_DIR="$SCRIPT_DIR/mac-resources"

VERSION="2.2.0"
BUNDLE_ID="com.prysmor.panel"
INSTALL_LOCATION="$HOME/Library/Application Support/Adobe/CEP/extensions/com.prysmor.panel"

WORKDIR="$REPO_ROOT/dist/mac-pkg-work"
ROOT="$WORKDIR/com.prysmor.panel"
COMPONENT_PKG="PrysmorPanel.pkg"
FINAL_PKG="$REPO_ROOT/dist/Prysmor-${VERSION}.pkg"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Prysmor macOS PKG build  v${VERSION}                  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

FFMPEG_MAC="$PANEL_SRC/panel/ffmpeg/mac/ffmpeg"
if [[ ! -f "$FFMPEG_MAC" ]]; then
  echo "ERROR: Missing macOS ffmpeg at: $FFMPEG_MAC" >&2
  echo "  git lfs pull   # if using LFS" >&2
  exit 1
fi

echo "▶  Staging com.prysmor.panel under $WORKDIR"
rm -rf "$WORKDIR"
mkdir -p "$ROOT"

cp -R "$PANEL_SRC/CSXS" "$ROOT/"
mkdir -p "$ROOT/panel"
cp "$PANEL_SRC/panel/index.html" "$PANEL_SRC/panel/main.js" "$PANEL_SRC/panel/styles.css" "$PANEL_SRC/panel/host.jsx" "$ROOT/panel/"
cp -R "$PANEL_SRC/panel/assets" "$ROOT/panel/"
cp -R "$PANEL_SRC/panel/lib"    "$ROOT/panel/"
mkdir -p "$ROOT/panel/ffmpeg/mac"
cp "$FFMPEG_MAC" "$ROOT/panel/ffmpeg/mac/ffmpeg"
chmod +x "$ROOT/panel/ffmpeg/mac/ffmpeg"
rm -f "$ROOT/panel/ffmpeg/win/ffmpeg.exe" 2>/dev/null || true
rm -f "$ROOT/.debug" 2>/dev/null || true

SCRIPTS_DIR="$WORKDIR/scripts"
mkdir -p "$SCRIPTS_DIR"
cat > "$SCRIPTS_DIR/postinstall" << 'POSTINSTALL'
#!/usr/bin/env bash
for v in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.${v}" PlayerDebugMode 1 2>/dev/null || true
done
exit 0
POSTINSTALL
chmod +x "$SCRIPTS_DIR/postinstall"

echo "▶  pkgbuild → $COMPONENT_PKG"
cd "$WORKDIR"
pkgbuild \
  --root             "./com.prysmor.panel" \
  --identifier       "$BUNDLE_ID" \
  --version          "$VERSION" \
  --install-location "$INSTALL_LOCATION" \
  --scripts          "$SCRIPTS_DIR" \
  "$COMPONENT_PKG"

echo "▶  productbuild → $(basename "$FINAL_PKG")"
mkdir -p "$(dirname "$FINAL_PKG")"
productbuild \
  --distribution "$RES_DIR/distribution.xml" \
  --package-path "$WORKDIR" \
  --resources    "$RES_DIR" \
  "$FINAL_PKG"

echo ""
echo "✅  Done: $FINAL_PKG"
echo "   Size: $(du -sh "$FINAL_PKG" | cut -f1)"
