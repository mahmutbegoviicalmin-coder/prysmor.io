# Prysmor Panel — After Effects (CEP)

Separate CEP extension for **Adobe After Effects**. Same Prysmor account, auth flow, and VFX pipeline as the Premiere panel — isolated install (`com.prysmor.panel.ae`).

## Structure

```
prysmor-panel-ae/
├── CSXS/manifest.xml     Host: AEFT, bundle com.prysmor.panel.ae
├── panel/
│   ├── index.html
│   ├── main.js           AE-specific UI + API (version/ae OTA)
│   ├── host.jsx          After Effects ExtendScript (comps + layers)
│   └── version.txt       1.0.0
└── installer/
    ├── windows/installer.nsi   → dist/PrysmorAE-Setup.exe
    └── build-mac-pkg.sh        → dist/PrysmorAE-1.0.0.pkg
```

## Dev install (no installer)

**Windows**
```powershell
Copy-Item -Recurse prysmor-panel-ae "$env:APPDATA\Adobe\CEP\extensions\com.prysmor.panel.ae"
Copy-Item prysmor-panel-ae\.debug "$env:APPDATA\Adobe\CEP\extensions\com.prysmor.panel.ae\"
```

**macOS**
```bash
cp -R prysmor-panel-ae ~/Library/Application\ Support/Adobe/CEP/extensions/com.prysmor.panel.ae
```

Enable debug: `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` (match your AE CEP version).

Restart After Effects → **Window → Extensions → Prysmor**.

## Build installers

**Windows** (NSIS required):
```powershell
makensis prysmor-panel-ae\installer\windows\installer.nsi
```

**macOS** (on a Mac):
```bash
bash prysmor-panel-ae/installer/build-mac-pkg.sh
```

## Usage

1. Open a comp in the Timeline
2. Select a **footage layer**
3. Panel auto-detects selection (polls every 500 ms)
4. Generate → result inserts as a new layer above the selection

## Firestore / dashboard

- Auth uses the same `/api/panel/auth/*` endpoints
- Device ID prefix: `panel-ae-{userId}-{fingerprint}` (separate from Premiere `panel-{userId}-…`)
- Dashboard shows host app as **After Effects** when connected from AE
