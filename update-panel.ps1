# =============================================================================
# Prysmor Panel — Quick Update Script
# Kopira izmijenjene panel fajlove na sve instalirane lokacije.
# Pokrenuti iz project root-a:
#   powershell -ExecutionPolicy Bypass -File update-panel.ps1
# =============================================================================

$ErrorActionPreference = "Continue"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$PanelSrc  = Join-Path $ScriptDir "prysmor-panel"

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  PRYSMOR PANEL — QUICK UPDATE" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# ── Pronadi sve instalirane lokacije panela ───────────────────────────────────

$locations = @()

# System-wide Premiere install (Program Files)
$premiereVersions = @(
    "Adobe Premiere Pro 2025",
    "Adobe Premiere Pro 2024",
    "Adobe Premiere Pro 2023",
    "Adobe Premiere Pro 2022"
)
foreach ($v in $premiereVersions) {
    $p = "C:\Program Files\Adobe\$v\CEP\extensions\prysmor-panel"
    if (Test-Path $p) { $locations += $p }
}

# Per-user AppData
$userPath = "$env:APPDATA\Adobe\CEP\extensions\prysmor-panel"
if (Test-Path $userPath) { $locations += $userPath }

if ($locations.Count -eq 0) {
    Write-Host "  Panel nije pronadjen ni na jednoj lokaciji." -ForegroundColor Yellow
    Write-Host "  Provjeri da li je Prysmor panel instaliran." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Ocekivane lokacije:" -ForegroundColor Gray
    Write-Host "    C:\Program Files\Adobe\Adobe Premiere Pro 20xx\CEP\extensions\prysmor-panel" -ForegroundColor Gray
    Write-Host "    $env:APPDATA\Adobe\CEP\extensions\prysmor-panel" -ForegroundColor Gray
    exit 1
}

Write-Host "  Pronadjene instalacije:" -ForegroundColor Green
foreach ($loc in $locations) {
    Write-Host "    $loc" -ForegroundColor Gray
}
Write-Host ""

# ── Fajlovi koji se azuriraju ─────────────────────────────────────────────────

$files = @(
    @{ Src = "panel\main.js";       Dst = "panel\main.js"  },
    @{ Src = "panel\host.jsx";      Dst = "panel\host.jsx" },
    @{ Src = "panel\index.html";    Dst = "panel\index.html" },
    @{ Src = "panel\styles.css";    Dst = "panel\styles.css" },
    @{ Src = "CSXS\manifest.xml";   Dst = "CSXS\manifest.xml" }
)

# ── Kopiraj fajlove na svaku lokaciju ─────────────────────────────────────────

$updated = 0
$failed  = 0

foreach ($loc in $locations) {
    Write-Host "  Azuriram: $loc" -ForegroundColor Cyan
    foreach ($f in $files) {
        $src = Join-Path $PanelSrc $f.Src
        $dst = Join-Path $loc      $f.Dst
        if (-not (Test-Path $src)) {
            Write-Host "    SKIP  $($f.Src)  (src ne postoji)" -ForegroundColor Yellow
            continue
        }
        try {
            $dstDir = Split-Path $dst -Parent
            if (-not (Test-Path $dstDir)) { New-Item -ItemType Directory -Path $dstDir -Force | Out-Null }
            Copy-Item -Path $src -Destination $dst -Force
            Write-Host "    OK    $($f.Dst)" -ForegroundColor Green
            $updated++
        } catch {
            Write-Host "    FAIL  $($f.Dst): $($_.Exception.Message)" -ForegroundColor Red
            $failed++
        }
    }
    Write-Host ""
}

# ── Ocisti CEP cache ──────────────────────────────────────────────────────────

Write-Host "  Cistim CEP cache…" -ForegroundColor Cyan
$caches = @(
    "$env:APPDATA\Adobe\CEP\Cache",
    "$env:APPDATA\Adobe\CEP\CEPHtmlEngine",
    "$env:LOCALAPPDATA\Temp\cep_cache"
)
foreach ($c in $caches) {
    if (Test-Path $c) {
        try {
            Remove-Item -Path $c -Recurse -Force -ErrorAction SilentlyContinue
            Write-Host "    Ociscen: $c" -ForegroundColor Green
        } catch {
            Write-Host "    Nije ociscen: $c" -ForegroundColor Yellow
        }
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Azurirano: $updated fajlova  |  Gresaka: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Sljedeci korak:" -ForegroundColor White
Write-Host "  1. Zatvori Adobe Premiere Pro" -ForegroundColor White
Write-Host "  2. Otvori ponovo Premiere Pro" -ForegroundColor White
Write-Host "  3. Window -> Extensions -> Prysmor" -ForegroundColor White
Write-Host ""
