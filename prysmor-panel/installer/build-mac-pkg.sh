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
# Neutral staging location — postinstall relocates to the real user's $HOME.
# /private/var/tmp persists across the install session (unlike /private/tmp
# which can be cleaned mid-session on some macOS versions).
INSTALL_LOCATION="/private/var/tmp/com.prysmor.panel-stage"

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
cat > "$SCRIPTS_DIR/postinstall" << 'POSTINSTALL'
#!/usr/bin/env bash
# All output goes to system log (visible in Console.app → search "prysmor")
log() { echo "[prysmor-postinstall] $*"; logger -t "prysmor-postinstall" "$*" 2>/dev/null || true; }

log "=== Prysmor CEP Panel postinstall START ==="

SOURCE="/private/var/tmp/com.prysmor.panel-stage"

# ── Verify the staged payload is present ────────────────────────────────────
log "Checking source: $SOURCE"
if [ ! -d "$SOURCE" ]; then
  log "ERROR: Stage folder not found: $SOURCE"
  log "Contents of /private/var/tmp:"
  ls -la /private/var/tmp/ 2>&1 | while IFS= read -r line; do log "  $line"; done
  exit 1
fi

log "Source exists. Contents:"
ls -laR "$SOURCE" 2>&1 | while IFS= read -r line; do log "  $line"; done

# ── Resolve the real logged-in user (not root) ──────────────────────────────
# $HOME and $USER are /var/root when the .pkg runs as root during install.
LOGGED_IN_USER=$(stat -f "%Su" /dev/console 2>/dev/null || echo "")
log "stat /dev/console → '$LOGGED_IN_USER'"

if [ -z "$LOGGED_IN_USER" ] || [ "$LOGGED_IN_USER" = "root" ]; then
  LOGGED_IN_USER=$(logname 2>/dev/null || echo "")
  log "logname fallback → '$LOGGED_IN_USER'"
fi

if [ -z "$LOGGED_IN_USER" ] || [ "$LOGGED_IN_USER" = "root" ]; then
  # Last resort: first non-Shared directory under /Users
  LOGGED_IN_USER=$(ls /Users 2>/dev/null | grep -v Shared | grep -v Guest | head -1 || echo "")
  log "/Users scan fallback → '$LOGGED_IN_USER'"
fi

if [ -z "$LOGGED_IN_USER" ]; then
  log "ERROR: Could not determine logged-in user. Aborting."
  exit 1
fi

USER_HOME="/Users/$LOGGED_IN_USER"
DEST="$USER_HOME/Library/Application Support/Adobe/CEP/extensions/com.prysmor.panel"

log "Installing for user: '$LOGGED_IN_USER'"
log "User home:           '$USER_HOME'"
log "Destination:         '$DEST'"

# ── Create destination and copy files ───────────────────────────────────────
mkdir -p "$DEST"
if [ $? -ne 0 ]; then
  log "ERROR: Could not create destination directory: $DEST"
  exit 1
fi

log "Copying from $SOURCE to $DEST ..."
cp -R "$SOURCE/." "$DEST/"
if [ $? -ne 0 ]; then
  log "ERROR: cp failed"
  exit 1
fi
log "Copy complete. Destination contents:"
ls -la "$DEST" 2>&1 | while IFS= read -r line; do log "  $line"; done

# Fix ownership so the user (not root) owns all files
chown -R "$LOGGED_IN_USER" "$DEST"
log "Ownership set to $LOGGED_IN_USER"

# Clean up staging area
rm -rf "$SOURCE"
log "Staging area removed."

# ── Write Adobe CSXS PlayerDebugMode for the real user ──────────────────────
log "Writing CSXS PlayerDebugMode for user $LOGGED_IN_USER ..."
for v in 9 10 11 12 13; do
  sudo -u "$LOGGED_IN_USER" defaults write "com.adobe.CSXS.${v}" PlayerDebugMode 1 2>/dev/null || true
done
log "PlayerDebugMode written."

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
