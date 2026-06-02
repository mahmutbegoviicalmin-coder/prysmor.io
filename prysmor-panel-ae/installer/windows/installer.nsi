; Prysmor CEP Panel for After Effects — Windows NSIS
; Run from repo root:
;   makensis prysmor-panel-ae\installer\windows\installer.nsi
; Output: dist\PrysmorAE-Setup.exe

Unicode True

!define PRODUCT_NAME      "Prysmor for After Effects"
!define PRODUCT_VERSION   "1.0.0"
!define PRODUCT_PUBLISHER "Prysmor"
!define PRODUCT_URL       "https://prysmor.io"
!define BUNDLE_ID         "com.prysmor.panel.ae"
!define INSTALL_DIR       "$APPDATA\Adobe\CEP\extensions\${BUNDLE_ID}"
!define REG_KEY           "Software\Microsoft\Windows\CurrentVersion\Uninstall\${BUNDLE_ID}"

Name              "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile           "..\..\..\dist\PrysmorAE-Setup.exe"
InstallDir        "${INSTALL_DIR}"
InstallDirRegKey  HKCU "${REG_KEY}" "InstallLocation"
RequestExecutionLevel user

!include "MUI2.nsh"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE    "Welcome to Prysmor AE ${PRODUCT_VERSION}"
!define MUI_WELCOMEPAGE_TEXT     "This will install the Prysmor AI VFX panel for Adobe After Effects.$\r$\n$\r$\nClick Next to continue."
!define MUI_FINISHPAGE_TITLE     "Installation Complete"
!define MUI_FINISHPAGE_TEXT      "Prysmor for After Effects has been installed.$\r$\n$\r$\nRestart After Effects, then:$\r$\nWindow > Extensions > Prysmor"
!define MUI_FINISHPAGE_LINK      "Open prysmor.io"
!define MUI_FINISHPAGE_LINK_LOCATION  "${PRODUCT_URL}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE    "..\win-resources\license.txt"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

!insertmacro MUI_LANGUAGE "English"

Section "Prysmor AE Panel" SecMain
  RMDir /r "$APPDATA\Adobe\CEP\extensions\${BUNDLE_ID}\Local Storage"
  RMDir /r "$APPDATA\Adobe\CEP\extensions\${BUNDLE_ID}\Session Storage"

  RMDir /r "$INSTDIR"

  SetOutPath "$INSTDIR\CSXS"
  File "..\..\CSXS\manifest.xml"

  SetOutPath "$INSTDIR\panel"
  File "..\..\panel\index.html"
  File "..\..\panel\main.js"
  File "..\..\panel\styles.css"
  File "..\..\panel\host.jsx"
  File "..\..\panel\version.txt"

  SetOutPath "$INSTDIR\panel\assets"
  File /r "..\..\panel\assets\*.*"

  SetOutPath "$INSTDIR\panel\lib"
  File "..\..\panel\lib\CSInterface.js"

  SetOutPath "$INSTDIR\panel\ffmpeg\win"
  File "..\..\panel\ffmpeg\win\ffmpeg.exe"

  WriteRegDWORD HKCU "Software\Adobe\CSXS.9"  "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.10" "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.11" "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.12" "PlayerDebugMode" 1
  WriteRegDWORD HKCU "Software\Adobe\CSXS.13" "PlayerDebugMode" 1

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
