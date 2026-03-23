# Prysmor — Adobe Premiere Pro CEP Panel

AI-powered VFX generation panel for Adobe Premiere Pro (Windows & macOS).

---

## Demo Mode

This build runs in **full Demo Mode** — no API key, no backend calls, no internet required.

### What Demo Mode does

| Feature | Behaviour |
|---|---|
| Login | One click — no credentials |
| Generate VFX | ~9-second simulated animation, then loads local demo clip |
| Import to Project | Calls `app.project.importFiles()` with the local MP4 path |
| Insert to Timeline | Imports + places clip at the playhead on track V1 |
| Download / Show File | Opens the file via `file://` URL or cep.fs save dialog |
| Usage counter | Increments in-session (resets on panel reload) |

### Replacing the demo assets

| File | Purpose |
|---|---|
| `panel/assets/prysmor-demo.mp4` | Demo VFX clip — **replace with a real MP4** |
| `panel/assets/prysmor-demo.svg` | Thumbnail shown in the result card — replace with `.jpg` or `.png` if desired (update the extension in `main.js` → `getDemoPaths()`) |

Recommended MP4 spec:
- Codec: H.264
- Resolution: 1920 × 1080
- Duration: 4–8 seconds
- Filename must remain `prysmor-demo.mp4`

---

## File Structure

```
prysmor-panel/
├── CSXS/
│   └── manifest.xml              CEP extension manifest
├── panel/
│   ├── assets/
│   │   ├── prysmor-demo.mp4      ← REPLACE with real MP4
│   │   └── prysmor-demo.svg      ← Replace with real thumbnail
│   ├── lib/
│   │   └── CSInterface.js        Adobe CEP bridge + cep.fs guard
│   ├── index.html                Panel UI (Demo Mode login + main views)
│   ├── styles.css                Premium dark UI styles
│   ├── main.js                   Panel logic (Demo Mode — no API calls)
│   └── host.jsx                  ExtendScript (importFile, insertToTimeline)
├── .debug                        Dev mode port config
└── README.md
```

---

## Install — Development (Unsigned Extension)

### Step 1 — Enable unsigned extensions

**Windows** (Registry Editor):
```
HKEY_CURRENT_USER\Software\Adobe\CSXS.10
  Add DWORD: PlayerDebugMode = 1
```

Or via PowerShell:
```powershell
Set-ItemProperty -Path "HKCU:\Software\Adobe\CSXS.10" -Name "PlayerDebugMode" -Value 1
```

**macOS** (Terminal):
```bash
defaults write com.adobe.CSXS.10 PlayerDebugMode 1
```

> Adjust `CSXS.10` to match your installed CEP version:
> - Premiere 2020–2021 → CSXS.10
> - Premiere 2022+     → CSXS.11

### Step 2 — Copy to CEP extensions folder

**Windows:**
```
C:\Users\<you>\AppData\Roaming\Adobe\CEP\extensions\prysmor-panel\
```

**macOS:**
```
~/Library/Application Support/Adobe/CEP/extensions/prysmor-panel/
```

Copy the entire `prysmor-panel/` folder into that location.

### Step 3 — Open in Premiere Pro

Restart Premiere Pro, then:
**Window → Extensions → Prysmor**

---

## CSInterface.js Note

`panel/lib/CSInterface.js` is a minimal stub sufficient for Demo Mode.
For production (live API calls, full event system), replace it with the official Adobe version:
→ https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_11.x/CSInterface.js

---

## Build Distributions (Signed ZXP)

To distribute as a signed `.zxp` file:

```bash
# 1. Download ZXPSignCmd from Adobe CEP Resources
# 2. Create self-signed cert
ZXPSignCmd -selfSignedCert US CA Prysmor prysmor password cert.p12

# 3. Sign and package
ZXPSignCmd -sign prysmor-panel/ prysmor-panel.zxp cert.p12 password
```

Install `.zxp` files with [ZXP Installer](https://aescripts.com/learn/zxp-installer/).

---

## API Endpoints (Production — not used in Demo Mode)

| Method | Endpoint             | Purpose                    |
|--------|----------------------|----------------------------|
| GET    | /api/user/me         | Verify API key + load user |
| POST   | /api/generate        | Generate VFX clip          |
| POST   | /api/device/register | Register CEP device        |

---

## User Flow (Demo)

1. Open Premiere Pro → Window → Extensions → Prysmor
2. Click **Continue to Prysmor**
3. Type any VFX prompt, pick aspect ratio + duration
4. Click **Generate VFX** — watch the 9-second progress animation
5. Click **Import to Project** → demo clip appears in the Project panel
6. Click **Insert to Timeline** → clip placed at current playhead
7. Click **Download / Show File** → opens the file in your OS
