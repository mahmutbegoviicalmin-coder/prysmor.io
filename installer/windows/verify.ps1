<#
.SYNOPSIS
  Prysmor Panel — Installation Verifier
.DESCRIPTION
  Checks that the CEP extension is in place, registry debug keys are set,
  and reports any obvious problems before you open Premiere Pro.
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File verify.ps1
#>

$ErrorActionPreference = 'SilentlyContinue'

$ExtRoot     = Join-Path $env:APPDATA "Adobe\CEP\extensions\prysmor-panel"
$Manifest    = Join-Path $ExtRoot "CSXS\manifest.xml"
$IndexHtml   = Join-Path $ExtRoot "panel\index.html"
$MainJs      = Join-Path $ExtRoot "panel\main.js"
$HostJsx     = Join-Path $ExtRoot "panel\host.jsx"
$DemoMp4     = Join-Path $ExtRoot "panel\assets\prysmor-demo.mp4"
$DemoSvg     = Join-Path $ExtRoot "panel\assets\prysmor-demo.svg"
$CSInterface = Join-Path $ExtRoot "panel\lib\CSInterface.js"

function Check($Label, $Path) {
  $exists = Test-Path $Path
  $color  = if ($exists) { 'Green' } else { 'Red' }
  $mark   = if ($exists) { 'OK  ' } else { 'MISS' }
  Write-Host ("  [{0}]  {1}" -f $mark, $Label) -ForegroundColor $color
  return $exists
}

function CheckReg($KeyPath, $Name) {
  $val = (Get-ItemProperty -Path "HKCU:\$KeyPath" -Name $Name -ErrorAction SilentlyContinue).$Name
  $ok  = ($val -eq 1 -or $val -eq '1')
  $color = if ($ok) { 'Green' } else { 'Yellow' }
  $mark  = if ($ok) { 'OK  ' } else { 'WARN' }
  $display = if ($null -eq $val) { '(not set)' } else { $val }
  Write-Host ("  [{0}]  {1}\{2} = {3}" -f $mark, $KeyPath, $Name, $display) -ForegroundColor $color
  return $ok
}

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Prysmor Panel — Installation Verifier v1.0.0" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan
Write-Host ""

# ── Extension Folder ──────────────────────────────────────────────────────────
Write-Host "Extension Folder" -ForegroundColor White
Write-Host "  $ExtRoot"
Write-Host ""
$folderOK = Check "prysmor-panel\ (root)"    $ExtRoot
$manifOK  = Check "CSXS\manifest.xml"         $Manifest
$idxOK    = Check "panel\index.html"          $IndexHtml
$mainOK   = Check "panel\main.js"             $MainJs
$hostOK   = Check "panel\host.jsx"            $HostJsx
$csOK     = Check "panel\lib\CSInterface.js"  $CSInterface
Write-Host ""

# ── Demo Assets ───────────────────────────────────────────────────────────────
Write-Host "Demo Assets" -ForegroundColor White
$mp4OK  = Check "panel\assets\prysmor-demo.mp4 (REPLACE with real MP4)" $DemoMp4
$svgOK  = Check "panel\assets\prysmor-demo.svg"                          $DemoSvg
Write-Host ""

if ($mp4OK) {
  $mp4Size = (Get-Item $DemoMp4).Length
  if ($mp4Size -lt 10000) {
    Write-Host "  [WARN]  prysmor-demo.mp4 is very small ($mp4Size bytes) — likely still a placeholder." -ForegroundColor Yellow
    Write-Host "           Replace it with a real H.264 MP4 for Import/Insert to work." -ForegroundColor Yellow
    Write-Host ""
  }
}

# ── Registry ──────────────────────────────────────────────────────────────────
Write-Host "Registry (PlayerDebugMode — enables unsigned CEP extensions)" -ForegroundColor White
$reg11 = CheckReg "Software\Adobe\CSXS.11" "PlayerDebugMode"
$reg12 = CheckReg "Software\Adobe\CSXS.12" "PlayerDebugMode"
Write-Host ""

Write-Host "Registry (LogLevel — optional, enables CEP HTML engine logs)" -ForegroundColor White
CheckReg "Software\Adobe\CSXS.11" "LogLevel" | Out-Null
CheckReg "Software\Adobe\CSXS.12" "LogLevel" | Out-Null
Write-Host ""

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "Summary" -ForegroundColor White

$allOK = $folderOK -and $manifOK -and $idxOK -and $mainOK -and $hostOK -and $csOK -and ($reg11 -or $reg12)

if ($allOK) {
  Write-Host "  [OK]   Extension looks good!" -ForegroundColor Green
} else {
  Write-Host "  [FAIL] One or more checks failed — see above." -ForegroundColor Red
  if (-not $folderOK) {
    Write-Host "         Run the installer: dist\PrysmorPanelSetup.exe" -ForegroundColor Yellow
  }
  if (-not $reg11 -and -not $reg12) {
    Write-Host "         Set PlayerDebugMode manually (see README.md)." -ForegroundColor Yellow
  }
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Restart Adobe Premiere Pro (close completely, then reopen)"
Write-Host "  2. Window → Extensions → Prysmor"
Write-Host "  3. Click 'Continue to Prysmor' (no login needed)"
Write-Host ""

if (-not $mp4OK -or ($mp4OK -and (Get-Item $DemoMp4).Length -lt 10000)) {
  Write-Host "Action required:" -ForegroundColor Yellow
  Write-Host "  Replace panel\assets\prysmor-demo.mp4 with a real H.264 MP4"
  Write-Host "  (1920x1080, 4-8 seconds) for Import/Insert to work."
  Write-Host ""
}

# ── Pause ─────────────────────────────────────────────────────────────────────
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
