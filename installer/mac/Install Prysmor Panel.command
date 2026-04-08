#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Prysmor Panel v2.2.0 — macOS Installer
#  Double-click this file in Finder to install automatically.
#
#  Installs:
#   1. CEP panel → ~/Library/Application Support/Adobe/CEP/extensions/com.prysmor.panel/
#   2. ffmpeg binary → bundled inside the panel (used for auto video preprocessing)
#   3. PlayerDebugMode=1 for CSXS.10–13 (unsigned extension support)
#   4. CEP caches cleared for immediate panel load
# ─────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")"

PANEL_SRC="./prysmor-panel"
CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$CEP_DIR/com.prysmor.panel"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      Prysmor Panel Installer v2.2.0      ║"
echo "║       AI VFX for Adobe Premiere Pro      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Enable unsigned extension loading ──────────────────
echo "▸ Enabling unsigned extension loading..."
for VER in 10 11 12 13; do
  defaults write com.adobe.CSXS.$VER PlayerDebugMode 1 2>/dev/null && \
    echo "  ✓ CSXS.$VER PlayerDebugMode = 1" || true
done

# ── Step 2: Prepare extensions directory ───────────────────────
echo ""
echo "▸ Preparing extensions folder..."
mkdir -p "$CEP_DIR"
echo "  ✓ $CEP_DIR"

# ── Step 3: Remove old panel installations ─────────────────────
for OLD_NAME in "prysmor-panel" "com.prysmor.panel"; do
  OLD_PATH="$CEP_DIR/$OLD_NAME"
  if [ -d "$OLD_PATH" ]; then
    rm -rf "$OLD_PATH"
    echo "  ✓ Removed old installation: $OLD_PATH"
  fi
done

# ── Step 4: Install CEP panel ──────────────────────────────────
echo ""
echo "▸ Installing Prysmor panel..."
if [ ! -d "$PANEL_SRC" ]; then
  echo "  ✗ ERROR: 'prysmor-panel' folder not found next to this installer."
  echo "    Extract the full ZIP before running."
  read -p "Press Enter to close..."; exit 1
fi
cp -R "$PANEL_SRC" "$DEST"
echo "  ✓ Panel installed → $DEST"

# ── Step 5: Set ffmpeg executable permission ───────────────────
FFMPEG_BIN="$DEST/panel/ffmpeg/mac/ffmpeg"
if [ -f "$FFMPEG_BIN" ]; then
  chmod +x "$FFMPEG_BIN"
  echo "  ✓ ffmpeg binary marked executable"
else
  echo "  ⚠ ffmpeg binary not found — auto video preprocessing will use system ffmpeg if available"
fi

# ── Step 6: Clear CEP caches ───────────────────────────────────
echo ""
echo "▸ Clearing CEP caches..."
for CACHE in \
  "$HOME/Library/Caches/CSXS" \
  "$HOME/Library/Caches/Adobe/CEP" \
  "$HOME/Library/Application Support/Adobe/CEP/cache"
do
  if [ -d "$CACHE" ]; then
    rm -rf "$CACHE" && echo "  ✓ Cleared: $CACHE"
  fi
done

# ── Done ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         ✅  Installation complete!        ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  What's installed:"
echo "  ✅ CEP panel → $DEST"
echo "  ✅ Claude AI vision for scene analysis"
echo "  ✅ Auto video preprocessing (ffmpeg crop + scale to 720p)"
echo "  ✅ PlayerDebugMode set for CEP 10, 11, 12, 13"
echo "  ✅ CEP caches cleared"
echo ""
echo "  Next steps:"
echo "  1. Restart Adobe Premiere Pro"
echo "  2. Window → Extensions → Prysmor"
echo "  3. Sign in and generate your first AI effect"
echo ""
echo "  Need help? https://prysmor.io/docs"
echo ""
read -p "Press Enter to close this window..."
