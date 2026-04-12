# ─────────────────────────────────────────────────────────────────────────────
# Prysmor CEP Panel — Windows NSIS Installer Builder
#
# Requirements:
#   NSIS 3.x installed and makensis.exe in PATH
#   (https://nsis.sourceforge.io/Download)
#
# Run from repo root:
#   powershell -ExecutionPolicy Bypass -File prysmor-panel\installer\build-windows-installer.ps1
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

$repoRoot  = (Resolve-Path "$PSScriptRoot\..\..").Path
$nsiScript = "$PSScriptRoot\prysmor-windows.nsi"
$distDir   = "$repoRoot\dist"

Write-Host "╔══════════════════════════════════════════════════════╗"
Write-Host "║  Prysmor Windows Installer Builder                  ║"
Write-Host "╚══════════════════════════════════════════════════════╝"
Write-Host ""

# ── Check makensis ────────────────────────────────────────────────────────────
$makensis = Get-Command "makensis" -ErrorAction SilentlyContinue
if (-not $makensis) {
    # Common install locations
    $candidates = @(
        "C:\Program Files (x86)\NSIS\makensis.exe",
        "C:\Program Files\NSIS\makensis.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $makensis = $c; break }
    }
}
if (-not $makensis) {
    Write-Error "makensis not found. Install NSIS from: https://nsis.sourceforge.io/Download"
    exit 1
}

Write-Host "▶  makensis: $makensis"

# ── Check icon files (optional — warn if missing) ─────────────────────────────
$icoPath    = "$PSScriptRoot\win-resources\prysmor.ico"
$bannerPath = "$PSScriptRoot\win-resources\installer-banner.bmp"

if (-not (Test-Path $icoPath) -or -not (Test-Path $bannerPath)) {
    Write-Warning "Icon/banner assets missing in win-resources\ — building without custom branding."
    Write-Warning "See: $PSScriptRoot\win-resources\README.txt"
    # Patch .nsi to remove icon references temporarily
    $nsiContent = Get-Content $nsiScript -Raw
    $nsiContent = $nsiContent -replace '(?m)^!define MUI_ICON.*$', '; MUI_ICON not set'
    $nsiContent = $nsiContent -replace '(?m)^!define MUI_UNICON.*$', '; MUI_UNICON not set'
    $nsiContent = $nsiContent -replace '(?m)^!define MUI_WELCOMEFINISHPAGE_BITMAP.*$', '; MUI_WELCOMEFINISHPAGE_BITMAP not set'
    $nsiContent = $nsiContent -replace '(?m)^!define MUI_UNWELCOMEFINISHPAGE_BITMAP.*$', '; MUI_UNWELCOMEFINISHPAGE_BITMAP not set'
    $tmpNsi = "$env:TEMP\prysmor-windows-nobrand.nsi"
    Set-Content $tmpNsi $nsiContent
    $nsiScript = $tmpNsi
    Write-Host "▶  Using no-branding .nsi: $nsiScript"
}

# ── Create dist dir ───────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path $distDir | Out-Null

# ── Run makensis ──────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "▶  Running makensis..."
Set-Location $repoRoot

& $makensis $nsiScript
if ($LASTEXITCODE -ne 0) {
    Write-Error "makensis failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

$output = Get-ChildItem "$distDir\Prysmor-*-Setup.exe" | Sort-Object LastWriteTime | Select-Object -Last 1
Write-Host ""
Write-Host "✅  Done!"
Write-Host "   Output: $($output.FullName)"
Write-Host "   Size:   $([math]::Round($output.Length / 1MB, 1)) MB"
