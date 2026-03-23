#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Prysmor Panel — macOS Installer
#  Double-click this file in Finder to install automatically.
# ─────────────────────────────────────────────────────────────

set -e

# Change directory to where THIS script lives (so relative paths work)
cd "$(dirname "$0")"

PANEL_SRC="./prysmor-panel"
CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$CEP_DIR/prysmor-panel"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       Prysmor Panel Installer v1.0       ║"
echo "║       AI VFX for Adobe Premiere Pro       ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ── Step 1: Enable unsigned extension loading ──────────────────
echo "▸ Enabling unsigned extension loading..."

for VER in 10 11 12; do
  defaults write com.adobe.CSXS.$VER PlayerDebugMode 1 2>/dev/null && \
    echo "  ✓ CSXS.$VER PlayerDebugMode = 1" || true
done

# ── Step 2: Create extensions directory if missing ─────────────
echo ""
echo "▸ Preparing extensions folder..."

if [ ! -d "$CEP_DIR" ]; then
  mkdir -p "$CEP_DIR"
  echo "  ✓ Created $CEP_DIR"
else
  echo "  ✓ Found $CEP_DIR"
fi

# ── Step 3: Remove old version if present ──────────────────────
if [ -d "$DEST" ]; then
  echo ""
  echo "▸ Removing previous installation..."
  rm -rf "$DEST"
  echo "  ✓ Old version removed"
fi

# ── Step 4: Copy panel ─────────────────────────────────────────
echo ""
echo "▸ Installing Prysmor panel..."

if [ ! -d "$PANEL_SRC" ]; then
  echo ""
  echo "  ✗ ERROR: Cannot find 'prysmor-panel' folder next to this installer."
  echo "    Make sure you extracted the entire ZIP before running this script."
  echo ""
  read -p "Press Enter to close..."
  exit 1
fi

cp -R "$PANEL_SRC" "$DEST"
echo "  ✓ Installed to: $DEST"

# ── Step 5: Clear CEP caches ───────────────────────────────────
echo ""
echo "▸ Clearing CEP caches..."

CEP_CACHE="$HOME/Library/Caches/CSXS"
if [ -d "$CEP_CACHE" ]; then
  rm -rf "$CEP_CACHE"
  echo "  ✓ Cleared $CEP_CACHE"
fi

ADOBE_CACHE="$HOME/Library/Caches/Adobe/CEP"
if [ -d "$ADOBE_CACHE" ]; then
  rm -rf "$ADOBE_CACHE"
  echo "  ✓ Cleared Adobe CEP cache"
fi

# ── Done ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         ✅  Installation complete!        ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo "  1. Open (or restart) Adobe Premiere Pro"
echo "  2. Go to:  Window → Extensions → Prysmor"
echo "  3. Sign in with your Prysmor account"
echo ""
echo "  ─────────────────────────────────────────"
echo "  Need help? Visit: https://prysmor.io/docs"
echo ""

read -p "Press Enter to close this window..."
