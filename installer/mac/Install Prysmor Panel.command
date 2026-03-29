#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Prysmor Panel — macOS Installer
#  Double-click this file in Finder to install automatically.
#
#  Installs:
#   1. CEP panel → ~/Library/Application Support/Adobe/CEP/extensions/
#   2. Identity Lock sidecar (Python) → ~/Library/Prysmor/
#   3. Python dependencies (pip3 install, one-time ~5 min)
#   4. LaunchAgent → starts sidecar automatically on login
# ─────────────────────────────────────────────────────────────

set -e
cd "$(dirname "$0")"

PANEL_SRC="./prysmor-panel"
SIDECAR_PY="./face_embedding_server.py"  # Python script (no exe needed)
SIDECAR_DEST="$HOME/Library/Prysmor"
SIDECAR_SCRIPT="$SIDECAR_DEST/face_embedding_server.py"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"
PLIST="$LAUNCH_AGENTS/io.prysmor.sidecar.plist"
CEP_DIR="$HOME/Library/Application Support/Adobe/CEP/extensions"
DEST="$CEP_DIR/prysmor-panel"

# Python dependencies needed for Identity Lock
PIP_DEPS="insightface fastapi uvicorn opencv-python numpy torch torchvision huggingface_hub Pillow"

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

# ── Step 5: Check Python3 ──────────────────────────────────────
echo ""
echo "▸ Checking Python3..."
PYTHON3=""
for CMD in python3 python3.12 python3.11 python3.10 python3.9; do
  if command -v $CMD &>/dev/null; then
    PYTHON3=$CMD
    break
  fi
done

if [ -z "$PYTHON3" ]; then
  echo "  ⚠ Python3 not found — Identity Lock will be disabled."
  echo "    Install Python from https://python.org and re-run this installer."
  SKIP_SIDECAR=1
else
  PY_VER=$($PYTHON3 --version 2>&1)
  echo "  ✓ Found: $PY_VER"
  SKIP_SIDECAR=0
fi

# ── Step 6: Install Python dependencies ────────────────────────
if [ "$SKIP_SIDECAR" = "0" ]; then
  echo ""
  echo "▸ Installing Identity Lock dependencies..."
  echo "  (This may take 5-10 minutes on first install — please wait)"
  echo ""
  $PYTHON3 -m pip install --quiet --upgrade pip 2>/dev/null || true
  $PYTHON3 -m pip install --quiet $PIP_DEPS
  echo "  ✓ Dependencies installed"
fi

# ── Step 7: Install sidecar Python script ──────────────────────
if [ "$SKIP_SIDECAR" = "0" ] && [ -f "$SIDECAR_PY" ]; then
  echo ""
  echo "▸ Installing Identity Lock sidecar..."
  mkdir -p "$SIDECAR_DEST"
  cp "$SIDECAR_PY" "$SIDECAR_SCRIPT"
  echo "  ✓ Sidecar installed → $SIDECAR_SCRIPT"

  # ── Step 8: Create LaunchAgent (auto-start on login) ──────────
  echo ""
  echo "▸ Setting up auto-start on login..."
  mkdir -p "$LAUNCH_AGENTS"

  # Write plist — LaunchAgent runs python3 face_embedding_server.py
  cat > "$PLIST" << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>io.prysmor.sidecar</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(which $PYTHON3)</string>
    <string>$SIDECAR_SCRIPT</string>
  </array>
  <key>WorkingDirectory</key>
  <string>$SIDECAR_DEST</string>
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

  # Load LaunchAgent now — starts sidecar immediately
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load -w "$PLIST"
  echo "  ✓ LaunchAgent created → sidecar auto-starts on every login"
  echo "  ✓ Sidecar started now (loading face models ~15s)"

elif [ "$SKIP_SIDECAR" = "0" ]; then
  echo "  ⚠ face_embedding_server.py not found — Identity Lock disabled"
fi

# ── Step 9: Clear CEP caches ───────────────────────────────────
echo ""
echo "▸ Clearing CEP caches..."
for CACHE in \
  "$HOME/Library/Caches/CSXS" \
  "$HOME/Library/Caches/Adobe/CEP"
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
if [ "$SKIP_SIDECAR" = "0" ]; then
  echo "  Identity Lock: ✅ Active (sidecar running)"
else
  echo "  Identity Lock: ⚠ Disabled (Python not found)"
fi
echo ""
echo "  Next steps:"
echo "  1. Restart Adobe Premiere Pro"
echo "  2. Window → Extensions → Prysmor"
echo "  3. Sign in — everything works automatically"
echo ""
echo "  Sidecar log: /tmp/prysmor-sidecar.log"
echo "  Need help?   https://prysmor.io/docs"
echo ""
read -p "Press Enter to close this window..."
