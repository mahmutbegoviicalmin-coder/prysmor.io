; ─────────────────────────────────────────────────────────────────────────────
; Prysmor CEP Panel — Windows NSIS Installer (no external icon dependencies)
; Run from repo root: "C:\Program Files (x86)\NSIS\makensis.exe" prysmor-panel\installer\prysmor-windows-build.nsi
; Output: dist\PrysmorPanelSetup.exe
; ─────────────────────────────────────────────────────────────────────────────

Unicode True

!define PRODUCT_NAME      "Prysmor"
!define PRODUCT_VERSION   "2.6.2"
!define PRODUCT_PUBLISHER "Prysmor"
!define PRODUCT_URL       "https://prysmor.io"
!define BUNDLE_ID         "com.prysmor.panel"
!define INSTALL_DIR       "$APPDATA\Adobe\CEP\extensions\${BUNDLE_ID}"
!define REG_KEY           "Software\Microsoft\Windows\CurrentVersion\Uninstall\${BUNDLE_ID}"

Name              "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile           "..\..\dist\PrysmorPanelSetup.exe"
InstallDir        "${INSTALL_DIR}"
InstallDirRegKey  HKCU "${REG_KEY}" "InstallLocation"
RequestExecutionLevel user

; ── UI ────────────────────────────────────────────────────────────────────────
!include "MUI2.nsh"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE    "Welcome to Prysmor ${PRODUCT_VERSION}"
!define MUI_WELCOMEPAGE_TEXT     "This will install the Prysmor AI VFX panel for Adobe Premiere Pro.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_TITLE     "Installation Complete"
!define MUI_FINISHPAGE_TEXT      "Prysmor has been installed successfully.$\r$\n$\r$\nRestart Premiere Pro, then:$\r$\nWindow > Extensions > Prysmor"
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

; ── Install ───────────────────────────────────────────────────────────────────
Section "Prysmor Panel" SecMain

  ; Remove old installation first
  RMDir /r "$INSTDIR"

  SetOutPath "$INSTDIR\CSXS"
  File "..\CSXS\manifest.xml"

  SetOutPath "$INSTDIR\panel"
  File "..\panel\index.html"
  File "..\panel\main.js"
  File "..\panel\styles.css"
  File "..\panel\host.jsx"

  SetOutPath "$INSTDIR\panel\assets"
  File /r "..\panel\assets\*.*"

  SetOutPath "$INSTDIR\panel\lib"
  File "..\panel\lib\CSInterface.js"

  SetOutPath "$INSTDIR\panel\ffmpeg\win"
  File "..\panel\ffmpeg\win\ffmpeg.exe"

  ; Enable unsigned CEP extensions
  WriteRegDWORD HKCU "Software\Adobe\CSXS.9"  "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.13" "PlayerDebugMode" 1

  ; Uninstaller registry entries
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

Section "Uninstall"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${REG_KEY}"
SectionEnd
