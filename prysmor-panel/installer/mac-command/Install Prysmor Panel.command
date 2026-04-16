#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prysmor CEP Panel — macOS Installer
# Double-click to run. Terminal will open automatically.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUNDLE_ID="com.prysmor.panel"
CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
INSTALL_DIR="$CEP_DIR/$BUNDLE_ID"
PANEL_SRC="$SCRIPT_DIR/com.prysmor.panel"

# Pretty output helpers
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC}  $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
fail() { echo -e "${RED}✗${NC}  $*"; exit 1; }

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║   Prysmor Panel Installer v2.6.3      ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""

# ── Preflight ─────────────────────────────────────────────────────────────────
[[ "$(uname)" == "Darwin" ]] || fail "This installer is for macOS only."
[[ -d "$PANEL_SRC" ]]       || fail "Panel source folder not found: $PANEL_SRC"

# ── Remove old installation ───────────────────────────────────────────────────
if [[ -d "$INSTALL_DIR" ]]; then
  warn "Removing previous installation..."
  rm -rf "$INSTALL_DIR"
fi

# ── Create CEP extensions directory ──────────────────────────────────────────
mkdir -p "$CEP_DIR"
ok "CEP extensions directory ready"

# ── Copy panel files ──────────────────────────────────────────────────────────
cp -R "$PANEL_SRC" "$INSTALL_DIR"
ok "Panel files installed to: $INSTALL_DIR"

# ── Make ffmpeg executable ────────────────────────────────────────────────────
FFMPEG="$INSTALL_DIR/panel/ffmpeg/mac/ffmpeg"
if [[ -f "$FFMPEG" ]]; then
  chmod +x "$FFMPEG"
  # Remove quarantine attribute so macOS doesn't block it
  xattr -d com.apple.quarantine "$FFMPEG" 2>/dev/null || true
  ok "ffmpeg binary made executable"
else
  warn "ffmpeg binary not found — panel will fall back to system ffmpeg"
fi

# ── Enable unsigned CEP extensions (PlayerDebugMode) ─────────────────────────
for v in 9 10 11 12 13; do
  defaults write "com.adobe.CSXS.${v}" PlayerDebugMode 1 2>/dev/null || true
done
ok "PlayerDebugMode enabled for CSXS 9–13"

# ── Clear CEP cache (prevents stale extension list) ──────────────────────────
CEP_CACHE="$HOME/Library/Caches/CSXS"
if [[ -d "$CEP_CACHE" ]]; then
  rm -rf "$CEP_CACHE"
  ok "CEP cache cleared"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "  ┌───────────────────────────────────────────────────────┐"
echo "  │  ✅  Prysmor installed successfully!                  │"
echo "  │                                                       │"
echo "  │  Next steps:                                          │"
echo "  │  1. Restart Adobe Premiere Pro                        │"
echo "  │  2. Go to  Window → Extensions → Prysmor             │"
echo "  │  3. Sign in at prysmor.io                            │"
echo "  └───────────────────────────────────────────────────────┘"
echo ""

# Keep Terminal window open
read -n 1 -s -r -p "  Press any key to close..."
echo ""
