# Prysmor Panel — Windows Installer

This folder contains the [Inno Setup](https://jrsoftware.org/isinfo.php) script
that builds a one-click `.exe` installer for the Prysmor CEP panel.

---

## Prerequisites

| Tool | Version | Download |
|---|---|---|
| Inno Setup | 6.x | https://jrsoftware.org/isdl.php |
| Node.js / npm | any | (already installed for the Next.js project) |

---

## Build the Installer

Run from the **project root** (`prysmor.io/`):

```powershell
# Option A — using the default ISCC path (if added to PATH during installation)
ISCC.exe installer\windows\PrysmorPanel.iss

# Option B — full path (common default install location)
& "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\windows\PrysmorPanel.iss
```

The compiled installer lands at:
```
dist\PrysmorPanelSetup.exe
```

Copy it to `public\downloads\PrysmorPanelSetup.exe` to serve it from the web dashboard:
```powershell
Copy-Item dist\PrysmorPanelSetup.exe public\downloads\PrysmorPanelSetup.exe
```

---

## What the Installer Does

1. **Copies** `prysmor-panel/` → `%AppData%\Adobe\CEP\extensions\prysmor-panel\`
2. **Sets registry keys** (per-user, no admin needed):
   - `HKCU\Software\Adobe\CSXS.11\PlayerDebugMode = 1` (Premiere 2022–2024)
   - `HKCU\Software\Adobe\CSXS.12\PlayerDebugMode = 1` (Premiere 2025+)
   - `LogLevel = 1` (optional, enables CEP diagnostic logs)
3. **Clears CEP caches** (best-effort, safe):
   - `%AppData%\Adobe\CEP\Cache`
   - `%AppData%\Adobe\CEP\CEPHtmlEngine`
4. **Shows a success dialog** with next steps.

---

## After Installing

1. **Restart** Adobe Premiere Pro completely.
2. **Open** the panel: `Window → Extensions → Prysmor`
3. Click **Continue to Prysmor** — no login required (Demo Mode).

---

## Replace Demo Assets

The bundled `panel/assets/prysmor-demo.mp4` is a text placeholder.
Replace it with a real H.264 MP4 **before building** the installer:

```
Format:     H.264 MP4
Resolution: 1920 × 1080
Duration:   4–8 seconds
Filename:   prysmor-demo.mp4 (exact name required)
```

---

## Verify Installation

Run the verification helper from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File installer\windows\verify.ps1
```

This checks:
- Extension folder and required files exist
- Registry `PlayerDebugMode` is set for CSXS.11 and CSXS.12
- Whether the demo MP4 is still a placeholder
- Prints next steps

---

## Uninstall

The installer registers itself in **Programs and Features** (Settings → Apps):
- Search for **Prysmor Panel**
- Click **Uninstall**

This removes the extension folder.
Registry keys are left as-is (safe — they don't affect other CEP extensions).

---

## CSXS Version Reference

| Premiere Pro Version | CEP Version | Registry Key |
|---|---|---|
| 2020 (v14) | CEP 10 | CSXS.10 |
| 2021 (v15) | CEP 10 | CSXS.10 |
| 2022 (v22) | CEP 11 | CSXS.11 |
| 2023 (v23) | CEP 11 | CSXS.11 |
| 2024 (v24) | CEP 11 | CSXS.11 |
| 2025 (v25) | CEP 12 | CSXS.12 |

The installer sets both **CSXS.11** and **CSXS.12** to cover Premiere 2022–2025.
For Premiere 2020/2021, set CSXS.10 manually:
```powershell
Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.10" -Name "PlayerDebugMode" -Value 1
```

---

## Troubleshooting

**Panel not in Window → Extensions:**
- Run `verify.ps1` and check output.
- Confirm the folder name is exactly `prysmor-panel`.
- Restart Premiere Pro completely after install.
- Try setting both CSXS.11 and CSXS.12 debug keys.

**Import/Insert fails:**
- The demo MP4 is a text placeholder — replace it with a real MP4.
- Open a sequence in the Timeline before clicking Insert.

**CEP version mismatch:**
- Update `CSXS/manifest.xml` `<RequiredRuntime Version="X.0"/>` to match your Premiere CEP version.
