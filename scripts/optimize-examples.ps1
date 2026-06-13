# Optimizes EXAMPLES.mp4 for web: keeps full 1080p, strips audio, adds faststart.
# Place your original export at public/EXAMPLES-source.mp4 then run:
#   powershell -File scripts/optimize-examples.ps1

$ErrorActionPreference = "Stop"
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$src = Join-Path $repo "public\EXAMPLES-source.mp4"
$tmp = Join-Path $repo "public\_EXAMPLES-opt.mp4"
$out = Join-Path $repo "public\EXAMPLES.mp4"
$poster = Join-Path $repo "public\EXAMPLES-poster.jpg"

if (-not (Test-Path $src)) {
  Write-Error "Missing $src - copy your full-resolution export there first."
}

if (Test-Path $out) { Remove-Item $out -Force }
if (Test-Path $tmp) { Remove-Item $tmp -Force }

# Full resolution (no scale), web-optimized H.264 + faststart for progressive load on Vercel
ffmpeg -y -i $src -an `
  -c:v libx264 -preset medium -crf 22 -pix_fmt yuv420p `
  -movflags +faststart `
  $tmp

Move-Item $tmp $out -Force

ffmpeg -y -ss 00:00:00.5 -i $out -frames:v 1 -q:v 4 -update 1 $poster

Write-Host "Done (1080p preserved):"
Get-Item $out, $poster | Format-Table Name, @{N='MB';E={[math]::Round($_.Length/1MB,2)}}
