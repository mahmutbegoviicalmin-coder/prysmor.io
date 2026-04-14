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
# Install to system-wide CEP path. pkgbuild copies files here BEFORE postinstall
# runs. postinstall then copies to the real user's ~/Library and cleans up.
INSTALL_LOCATION="/Library/Application Support/Adobe/CEP/extensions/com.prysmor.panel"

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
# version.txt enables the auto-update check to know the installed version
[[ -f "$PANEL_SRC/panel/version.txt" ]] && cp "$PANEL_SRC/panel/version.txt" "$ROOT/panel/"
cp -R "$PANEL_SRC/panel/assets" "$ROOT/panel/"
cp -R "$PANEL_SRC/panel/lib"    "$ROOT/panel/"
mkdir -p "$ROOT/panel/ffmpeg/mac"
cp "$FFMPEG_MAC" "$ROOT/panel/ffmpeg/mac/ffmpeg"
chmod +x "$ROOT/panel/ffmpeg/mac/ffmpeg"
rm -f "$ROOT/panel/ffmpeg/win/ffmpeg.exe" 2>/dev/null || true
rm -f "$ROOT/.debug" 2>/dev/null || true

SCRIPTS_DIR="$WORKDIR/scripts"
mkdir -p "$SCRIPTS_DIR"

# preinstall — creates the parent CEP directory so pkgbuild can install there
cat > "$SCRIPTS_DIR/preinstall" << 'PREINSTALL'
#!/usr/bin/env bash
log() { echo "[prysmor-preinstall] $*"; logger -t "prysmor-preinstall" "$*" 2>/dev/null || true; }
log "Creating parent CEP extensions directory if absent..."
mkdir -p "/Library/Application Support/Adobe/CEP/extensions"
log "Done: $(ls -la '/Library/Application Support/Adobe/CEP/extensions' 2>&1 | head -3)"
exit 0
PREINSTALL
chmod +x "$SCRIPTS_DIR/preinstall"

cat > "$SCRIPTS_DIR/postinstall" << 'POSTINSTALL'
#!/usr/bin/env bash
# All output goes to Console.app — search "prysmor-postinstall"
log() { echo "[prysmor-postinstall] $*"; logger -t "prysmor-postinstall" "$*" 2>/dev/null || true; }

log "=== Prysmor CEP Panel postinstall START ==="

SYS_INSTALL="/Library/Application Support/Adobe/CEP/extensions/com.prysmor.panel"

# ── Verify system install path exists (pkgbuild put files here) ─────────────
log "Checking system install path: $SYS_INSTALL"
if [ ! -d "$SYS_INSTALL" ]; then
  log "ERROR: System install path not found: $SYS_INSTALL"
  log "Contents of /Library/Application Support/:"
  ls -la "/Library/Application Support/" 2>&1 | while IFS= read -r line; do log "  $line"; done
  log "Contents of /Library/Application Support/Adobe/ (if exists):"
  ls -la "/Library/Application Support/Adobe/" 2>&1 | while IFS= read -r line; do log "  $line"; done
  log "Contents of /Library/Application Support/Adobe/CEP/ (if exists):"
  ls -la "/Library/Application Support/Adobe/CEP/" 2>&1 | while IFS= read -r line; do log "  $line"; done
  log "Contents of /Library/Application Support/Adobe/CEP/extensions/ (if exists):"
  ls -la "/Library/Application Support/Adobe/CEP/extensions/" 2>&1 | while IFS= read -r line; do log "  $line"; done
  exit 1
fi
log "OK: System install path exists."
log "Contents:"
ls -la "$SYS_INSTALL" 2>&1 | while IFS= read -r line; do log "  $line"; done

# ── Resolve the real logged-in user ─────────────────────────────────────────
log "Detecting logged-in user..."
LOGGED_IN_USER=$(stat -f "%Su" /dev/console 2>/dev/null || echo "")
log "  stat /dev/console → '$LOGGED_IN_USER'"

if [ -z "$LOGGED_IN_USER" ] || [ "$LOGGED_IN_USER" = "root" ]; then
  LOGGED_IN_USER=$(logname 2>/dev/null || echo "")
  log "  logname fallback → '$LOGGED_IN_USER'"
fi

if [ -z "$LOGGED_IN_USER" ] || [ "$LOGGED_IN_USER" = "root" ]; then
  LOGGED_IN_USER=$(ls /Users 2>/dev/null | grep -v Shared | grep -v Guest | head -1 || echo "")
  log "  /Users scan fallback → '$LOGGED_IN_USER'"
fi

if [ -z "$LOGGED_IN_USER" ]; then
  log "ERROR: Could not determine logged-in user."
  exit 1
fi
log "OK: Logged-in user = '$LOGGED_IN_USER'"

USER_DEST="/Users/$LOGGED_IN_USER/Library/Application Support/Adobe/CEP/extensions/com.prysmor.panel"
log "User destination: $USER_DEST"

# ── Create user CEP extensions directory ────────────────────────────────────
log "Creating user dest directory..."
mkdir -p "$USER_DEST"
if [ $? -ne 0 ]; then
  log "ERROR: mkdir -p '$USER_DEST' failed"
  exit 1
fi
log "OK: Directory created."

# ── Copy files from system install → user directory ─────────────────────────
log "Copying files: '$SYS_INSTALL/.' → '$USER_DEST/'"
cp -R "$SYS_INSTALL/." "$USER_DEST/"
if [ $? -ne 0 ]; then
  log "ERROR: cp failed"
  exit 1
fi
log "OK: Copy complete."

log "Destination contents:"
ls -la "$USER_DEST" 2>&1 | while IFS= read -r line; do log "  $line"; done

# ── Fix ownership ────────────────────────────────────────────────────────────
log "Setting ownership to '$LOGGED_IN_USER'..."
chown -R "$LOGGED_IN_USER" "$USER_DEST"
log "OK: Ownership set."

# ── Remove system-level copy (user copy is sufficient) ───────────────────────
log "Cleaning up system install path..."
rm -rf "$SYS_INSTALL"
log "OK: System path cleaned."

# ── Write PlayerDebugMode for the real user ──────────────────────────────────
log "Writing CSXS PlayerDebugMode for '$LOGGED_IN_USER'..."
for v in 10 11 12 13; do
  sudo -u "$LOGGED_IN_USER" defaults write "com.adobe.CSXS.${v}" PlayerDebugMode 1 2>/dev/null || true
  log "  CSXS.$v PlayerDebugMode = 1"
done
log "OK: PlayerDebugMode written."

log "=== Prysmor CEP Panel postinstall DONE ==="
exit 0
POSTINSTALL
chmod +x "$SCRIPTS_DIR/postinstall"

echo "▶  Verifying staged root before pkgbuild"
echo "   Root dir : $ROOT"
echo "   Contents :"
ls -laR "$ROOT"
echo "   INSTALL_LOCATION : $INSTALL_LOCATION"
echo "   Scripts dir      :"
ls -la "$SCRIPTS_DIR"
echo ""

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
