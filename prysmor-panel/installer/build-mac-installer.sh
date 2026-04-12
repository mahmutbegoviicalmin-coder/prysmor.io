#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Prysmor CEP Panel — macOS .pkg Installer Builder
#
# Requirements:
#   - macOS only (uses pkgbuild + productbuild — Xcode Command Line Tools)
#   - Run from the repo root:  bash prysmor-panel/installer/build-mac-installer.sh
#
# Output:
#   dist/Prysmor-1.4.0.pkg
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PANEL_SRC="$REPO_ROOT/prysmor-panel"
INSTALLER_RES="$SCRIPT_DIR/mac-resources"

VERSION="1.4.0"
BUNDLE_ID="com.prysmor.panel"
INSTALL_LOCATION="$HOME/Library/Application Support/Adobe/CEP/extensions/com.prysmor.panel"
STAGING="$REPO_ROOT/dist/mac-staging"
COMPONENT_PKG="$REPO_ROOT/dist/PrysmOrComponent.pkg"
FINAL_PKG="$REPO_ROOT/dist/Prysmor-${VERSION}.pkg"

echo "╔══════════════════════════════════════════════════════╗"
echo "║  Prysmor macOS Installer Builder  v${VERSION}          ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Preflight checks ─────────────────────────────────────────────────────────

if [[ "$(uname)" != "Darwin" ]]; then
  echo "ERROR: This script must be run on macOS." >&2
  exit 1
fi

for tool in pkgbuild productbuild; do
  if ! command -v "$tool" &>/dev/null; then
    echo "ERROR: '$tool' not found. Install Xcode Command Line Tools:" >&2
    echo "  xcode-select --install" >&2
    exit 1
  fi
done

FFMPEG_MAC="$PANEL_SRC/panel/ffmpeg/mac/ffmpeg"
if [[ ! -f "$FFMPEG_MAC" ]]; then
  echo "ERROR: macOS ffmpeg binary missing at: $FFMPEG_MAC" >&2
  echo "  Download from: https://evermeet.cx/ffmpeg/getrelease/zip" >&2
  exit 1
fi

# ── Prepare staging folder ────────────────────────────────────────────────────

echo "▶  Preparing staging folder..."
rm -rf "$STAGING"
mkdir -p "$STAGING"

# Copy entire panel into staging (this IS the install root)
cp -R "$PANEL_SRC/." "$STAGING/"

# Ensure ffmpeg is executable
chmod +x "$STAGING/panel/ffmpeg/mac/ffmpeg"

# Remove Windows ffmpeg — not needed on macOS
rm -f "$STAGING/panel/ffmpeg/win/ffmpeg.exe"

# Remove dev files
rm -f "$STAGING/.debug"

echo "   Staged files:"
find "$STAGING" -type f | sort | sed 's|^|     |'

# ── Scripts: pre/post-install ─────────────────────────────────────────────────

SCRIPTS_DIR="$REPO_ROOT/dist/mac-scripts"
mkdir -p "$SCRIPTS_DIR"

# postinstall — sets PlayerDebugMode so unsigned CEP extension loads
cat > "$SCRIPTS_DIR/postinstall" << 'POSTINSTALL'
#!/usr/bin/env bash
# Enable unsigned CEP extensions in Premiere Pro
# Tries CSXS versions 9 through 12 (covers Premiere 2020–2026)
for v in 9 10 11 12; do
  defaults write "com.adobe.CSXS.${v}" PlayerDebugMode 1 2>/dev/null || true
done
exit 0
POSTINSTALL
chmod +x "$SCRIPTS_DIR/postinstall"

# ── Build component .pkg ──────────────────────────────────────────────────────

echo ""
echo "▶  Building component package..."
mkdir -p "$(dirname "$COMPONENT_PKG")"

pkgbuild \
  --root        "$STAGING" \
  --identifier  "$BUNDLE_ID" \
  --version     "$VERSION" \
  --install-location "$INSTALL_LOCATION" \
  --scripts     "$SCRIPTS_DIR" \
  "$COMPONENT_PKG"

echo "   Component pkg: $COMPONENT_PKG"

# ── Build final .pkg with productbuild ────────────────────────────────────────

echo ""
echo "▶  Building final installer..."

productbuild \
  --distribution "$INSTALLER_RES/distribution.xml" \
  --resources    "$INSTALLER_RES" \
  --package-path "$(dirname "$COMPONENT_PKG")" \
  "$FINAL_PKG"

echo ""
echo "✅  Done!"
echo "   Output: $FINAL_PKG"
echo "   Size:   $(du -sh "$FINAL_PKG" | cut -f1)"
