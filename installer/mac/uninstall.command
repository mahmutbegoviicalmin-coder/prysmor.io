#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Prysmor Panel — macOS Uninstaller
# ─────────────────────────────────────────────────────────────

DEST="$HOME/Library/Application Support/Adobe/CEP/extensions/prysmor-panel"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║      Prysmor Panel Uninstaller v1.0      ║"
echo "╚══════════════════════════════════════════╝"
echo ""

if [ -d "$DEST" ]; then
  rm -rf "$DEST"
  echo "  ✓ Removed $DEST"
else
  echo "  ℹ Panel was not installed at $DEST"
fi

# Remove PlayerDebugMode keys (optional, commented out to not affect other CEP extensions)
# for VER in 10 11 12; do
#   defaults delete com.adobe.CSXS.$VER PlayerDebugMode 2>/dev/null || true
# done

echo ""
echo "  ✅ Prysmor Panel uninstalled."
echo "  Restart Premiere Pro to complete removal."
echo ""
read -p "Press Enter to close..."
