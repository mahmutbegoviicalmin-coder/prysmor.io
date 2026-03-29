#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Prysmor Panel — macOS Installer
#  Double-click this file in Finder to install automatically.
#
#  Installs:
#   1. CEP panel → ~/Library/Application Support/Adobe/CEP/extensions/
#   2. Identity Lock sidecar → /Applications/Prysmor/
#   3. LaunchAgent → starts sidecar automatically on login
# ─────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")"

PANEL_SRC="./prysmor-panel"
SIDECAR_SRC="./prysmor-sidecar"          # PyInstaller folder bundle
SIDECAR_DEST="/Applications/Prysmor"
SIDECAR_EXE="$SIDECAR_DEST/prysmor-sidecar"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST="$LAUNCH_AGENTS/io.prysmor.sidecar.plist"
CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$CEP_DIR/prysmor-panel"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║       Prysmor Panel Installer v1.5       ║"
echo "║       AI VFX for Adobe Premiere Pro       ║"
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

# ── Step 3: Remove old panel ───────────────────────────────────
if [ -d "$DEST" ]; then
  rm -rf "$DEST"
  echo "  ✓ Old panel version removed"
fi

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

# ── Step 5: Install Identity Lock sidecar ──────────────────────
echo ""
echo "▸ Installing Identity Lock sidecar..."
if [ -d "$SIDECAR_SRC" ]; then
  sudo mkdir -p "$SIDECAR_DEST" 2>/dev/null || mkdir -p "$SIDECAR_DEST"
  cp -R "$SIDECAR_SRC/"* "$SIDECAR_DEST/"
  chmod +x "$SIDECAR_EXE" 2>/dev/null || true
  # Remove quarantine flag (macOS Gatekeeper)
  xattr -rd com.apple.quarantine "$SIDECAR_DEST" 2>/dev/null || true
  echo "  ✓ Sidecar installed → $SIDECAR_DEST"
else
  echo "  ⚠ Sidecar bundle not found (prysmor-sidecar folder missing)"
  echo "    Identity Lock will be unavailable until sidecar is installed."
fi

# ── Step 6: Create LaunchAgent (auto-start on login) ───────────
echo ""
echo "▸ Setting up auto-start on login..."
if [ -f "$SIDECAR_EXE" ]; then
  mkdir -p "$LAUNCH_AGENTS"
  cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.prysmor.sidecar</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SIDECAR_EXE</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/prysmor-sidecar.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/prysmor-sidecar-err.log</string>
</dict>
</plist>
PLIST_EOF
  # Load LaunchAgent now (start immediately without reboot)
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
  echo "  ✓ LaunchAgent created → sidecar starts automatically on login"
  echo "  ✓ Sidecar started now (warming up face models, ~15s)"
else
  echo "  ⚠ Skipped LaunchAgent (no sidecar exe)"
fi

# ── Step 7: Clear CEP caches ───────────────────────────────────
echo ""
echo "▸ Clearing CEP caches..."
for CACHE in \
  "$HOME/Library/Caches/CSXS" \
  "$HOME/Library/Caches/Adobe/CEP"
do
  if [ -d "$CACHE" ]; then
    rm -rf "$CACHE" && echo "  ✓ Cleared $CACHE"
  fi
done

# ── Done ───────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         ✅  Installation complete!        ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Next steps:"
echo "  1. Restart Adobe Premiere Pro"
echo "  2. Window → Extensions → Prysmor"
echo "  3. Sign in — Identity Lock runs automatically"
echo ""
echo "  Sidecar log: /tmp/prysmor-sidecar.log"
echo "  Need help?   https://prysmor.io/docs"
echo ""
read -p "Press Enter to close this window..."
