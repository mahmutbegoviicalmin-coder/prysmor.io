; ─────────────────────────────────────────────────────────────────────────────
; Prysmor CEP Panel — Windows NSIS Installer
;
; Requirements:
;   NSIS 3.x  (https://nsis.sourceforge.io/)
;   Run: makensis prysmor-panel\installer\prysmor-windows.nsi
;   (from repo root)
;
; Output:
;   dist\Prysmor-1.4.0-Setup.exe
; ─────────────────────────────────────────────────────────────────────────────

Unicode True

!define PRODUCT_NAME      "Prysmor"
!define PRODUCT_VERSION   "1.4.0"
!define PRODUCT_PUBLISHER "Prysmor"
!define PRODUCT_URL       "https://prysmor.io"
!define BUNDLE_ID         "com.prysmor.panel"

; Install into per-user CEP extensions folder — no admin rights needed
!define INSTALL_DIR       "$APPDATA\Adobe\CEP\extensions\${BUNDLE_ID}"

; Registry key for uninstaller
!define REG_KEY           "Software\Microsoft\Windows\CurrentVersion\Uninstall\${BUNDLE_ID}"

Name              "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile           "..\..\dist\Prysmor-${PRODUCT_VERSION}-Setup.exe"
InstallDir        "${INSTALL_DIR}"
InstallDirRegKey  HKCU "${REG_KEY}" "InstallLocation"
RequestExecutionLevel user   ; no UAC prompt needed

; ── UI ────────────────────────────────────────────────────────────────────────
!include "MUI2.nsh"

!define MUI_ABORTWARNING
!define MUI_ICON            "win-resources\prysmor.ico"
!define MUI_UNICON          "win-resources\prysmor.ico"
!define MUI_WELCOMEFINISHPAGE_BITMAP  "win-resources\installer-banner.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP "win-resources\installer-banner.bmp"

!define MUI_WELCOMEPAGE_TITLE    "Welcome to Prysmor ${PRODUCT_VERSION}"
!define MUI_WELCOMEPAGE_TEXT     "This will install the Prysmor AI VFX panel for Adobe Premiere Pro.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_TITLE     "Installation Complete"
!define MUI_FINISHPAGE_TEXT      "Prysmor has been installed successfully.$\r$\n$\r$\nRestart Premiere Pro, then go to:$\r$\nWindow → Extensions → Prysmor"
!define MUI_FINISHPAGE_LINK      "Open prysmor.io"
!define MUI_FINISHPAGE_LINK_LOCATION  "${PRODUCT_URL}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE    "win-resources\license.txt"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

; ── Install section ───────────────────────────────────────────────────────────

Section "Prysmor Panel" SecMain

  SetOutPath "$INSTDIR"

  ; ── CSXS manifest
  SetOutPath "$INSTDIR\CSXS"
  File "..\CSXS\manifest.xml"

  ; ── Panel HTML / JS / CSS
  SetOutPath "$INSTDIR\panel"
  File "..\panel\index.html"
  File "..\panel\main.js"
  File "..\panel\styles.css"
  File "..\panel\host.jsx"

  ; ── Panel assets
  SetOutPath "$INSTDIR\panel\assets"
  File /r "..\panel\assets\*.*"

  ; ── Panel lib
  SetOutPath "$INSTDIR\panel\lib"
  File "..\panel\lib\CSInterface.js"

  ; ── ffmpeg Windows binary
  SetOutPath "$INSTDIR\panel\ffmpeg\win"
  File "..\panel\ffmpeg\win\ffmpeg.exe"

  ; ── Enable unsigned CEP extensions in Premiere Pro (CSXS 9–12)
  WriteRegDWORD HKCU "Software\Adobe\CSXS.9"  "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" 1

  ; ── Write uninstall registry entries
  WriteRegStr   HKCU "${REG_KEY}" "DisplayName"      "${PRODUCT_NAME}"
  WriteRegStr   HKCU "${REG_KEY}" "DisplayVersion"   "${PRODUCT_VERSION}"
  WriteRegStr   HKCU "${REG_KEY}" "Publisher"        "${PRODUCT_PUBLISHER}"
  WriteRegStr   HKCU "${REG_KEY}" "URLInfoAbout"     "${PRODUCT_URL}"
  WriteRegStr   HKCU "${REG_KEY}" "InstallLocation"  "$INSTDIR"
  WriteRegStr   HKCU "${REG_KEY}" "UninstallString"  '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "${REG_KEY}" "NoModify"         1
  WriteRegDWORD HKCU "${REG_KEY}" "NoRepair"         1

  WriteUninstaller "$INSTDIR\uninstall.exe"

SectionEnd

; ── Uninstall section ─────────────────────────────────────────────────────────

Section "Uninstall"

  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "${REG_KEY}"

  ; Note: PlayerDebugMode registry keys are left in place intentionally —
  ; removing them could break other unsigned CEP extensions the user has installed.

SectionEnd
