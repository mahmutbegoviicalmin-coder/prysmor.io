; =============================================================================
; Prysmor Panel v2.2.0 — Windows Installer
; Inno Setup 6  (https://jrsoftware.org/isinfo.php)
;
; Build:
;   "C:\Users\Almin\AppData\Local\Programs\Inno Setup 6\ISCC.exe" installer\windows\PrysmorPanel.iss
;
; What this installer does:
;   1. Installs the CEP panel to %APPDATA%\Adobe\CEP\extensions\com.prysmor.panel
;   2. Bundles ffmpeg.exe for client-side video preprocessing
;   3. Sets PlayerDebugMode=1 in registry (CSXS.10 – CSXS.13)
;   4. Clears CEP caches so panel loads immediately
; =============================================================================

; ── Defines ──────────────────────────────────────────────────────────────────

#define AppName      "Prysmor Panel"
#define AppVersion   "2.2.0"
#define AppPublisher "Prysmor"
#define AppURL       "https://prysmor.io"
#define ExtensionId  "com.prysmor.panel"

#define SourceDir    "..\..\prysmor-panel"
#define OutputDir    "..\..\dist"

; ── Setup ─────────────────────────────────────────────────────────────────────

[Setup]
AppId={{A9C3F7D2-4B1E-4F8C-2A6D-7E3B0C9F5A2E}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/docs
AppUpdatesURL={#AppURL}/dashboard/downloads

DefaultDirName={userappdata}\Adobe\CEP\extensions\{#ExtensionId}
DisableDirPage=yes
DisableProgramGroupPage=yes

PrivilegesRequired=lowest

OutputDir={#OutputDir}
OutputBaseFilename=PrysmorPanelSetup

WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
InternalCompressLevel=ultra64

UninstallDisplayName={#AppName}
CreateUninstallRegKey=yes

; ── Languages ─────────────────────────────────────────────────────────────────

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; ── Finished page message ─────────────────────────────────────────────────────

[Messages]
FinishedLabel=Prysmor Panel v2.2.0 installed successfully!%n%nNext steps:%n  1. Restart Adobe Premiere Pro%n  2. Window %→ Extensions %→ Prysmor%n  3. Sign in and start generating AI effects.

; ── Files ─────────────────────────────────────────────────────────────────────

[Files]
; CEP Panel core files
Source: "{#SourceDir}\CSXS\manifest.xml";          DestDir: "{app}\CSXS";              Flags: ignoreversion
Source: "{#SourceDir}\panel\index.html";            DestDir: "{app}\panel";             Flags: ignoreversion
Source: "{#SourceDir}\panel\main.js";               DestDir: "{app}\panel";             Flags: ignoreversion
Source: "{#SourceDir}\panel\host.jsx";              DestDir: "{app}\panel";             Flags: ignoreversion
Source: "{#SourceDir}\panel\styles.css";            DestDir: "{app}\panel";             Flags: ignoreversion
Source: "{#SourceDir}\panel\lib\*";                 DestDir: "{app}\panel\lib";         Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\panel\assets\*";              DestDir: "{app}\panel\assets";      Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "{#SourceDir}\.debug";                      DestDir: "{app}";                   Flags: ignoreversion skipifsourcedoesntexist

; ffmpeg bundled binary — used by panel for client-side video preprocessing
; (center-crop + scale wide videos to 1280x720 before Runway upload)
Source: "{#SourceDir}\panel\ffmpeg\win\ffmpeg.exe"; DestDir: "{app}\panel\ffmpeg\win";  Flags: ignoreversion

; ── Registry ──────────────────────────────────────────────────────────────────

[Registry]
; PlayerDebugMode=1 — required for unsigned CEP extensions
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1
Root: HKCU; Subkey: "Software\Adobe\CSXS.13"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.13"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1

; ── Post-install steps ────────────────────────────────────────────────────────

[Run]
; Clear CEP caches so the panel loads immediately on next Premiere launch
Filename: "cmd.exe"; Parameters: "/C rmdir /S /Q ""{userappdata}\Adobe\CEP\Cache"" 2>nul";              Flags: runhidden; StatusMsg: "Clearing CEP cache..."
Filename: "cmd.exe"; Parameters: "/C rmdir /S /Q ""{userappdata}\Adobe\CEP\CEPHtmlEngine"" 2>nul";      Flags: runhidden; StatusMsg: "Clearing CEP engine cache..."
Filename: "cmd.exe"; Parameters: "/C rmdir /S /Q ""{localappdata}\Temp\cep_cache"" 2>nul";              Flags: runhidden; StatusMsg: "Clearing CEP temp cache..."

; ── Uninstall ─────────────────────────────────────────────────────────────────

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

; ── Pascal Script ─────────────────────────────────────────────────────────────

[Code]

function GetInstallDir(Param: String): String;
begin
  Result := ExpandConstant('{userappdata}') + '\Adobe\CEP\extensions\com.prysmor.panel';
end;

procedure InitializeWizard;
begin
  WizardForm.DirEdit.Text := GetInstallDir('');
end;

function CheckDebugMode(const SubKey: String): Boolean;
var
  DwordVal: Cardinal;
begin
  Result := RegQueryDWordValue(HKEY_CURRENT_USER, SubKey, 'PlayerDebugMode', DwordVal)
            and (DwordVal = 1);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Msg: String;
begin
  if CurStep = ssPostInstall then
  begin
    Msg := 'Prysmor Panel v2.2.0 installed!' + #13#10 + #13#10;
    Msg := Msg + 'Panel location:' + #13#10;
    Msg := Msg + '  ' + WizardDirValue + #13#10 + #13#10;

    Msg := Msg + 'PlayerDebugMode = 1:' + #13#10;
    if CheckDebugMode('Software\Adobe\CSXS.11') then Msg := Msg + '  CSXS.11  OK' + #13#10
    else Msg := Msg + '  CSXS.11  not set' + #13#10;
    if CheckDebugMode('Software\Adobe\CSXS.12') then Msg := Msg + '  CSXS.12  OK' + #13#10
    else Msg := Msg + '  CSXS.12  not set' + #13#10;
    if CheckDebugMode('Software\Adobe\CSXS.13') then Msg := Msg + '  CSXS.13  OK' + #13#10
    else Msg := Msg + '  CSXS.13  not set' + #13#10;

    Msg := Msg + #13#10 + 'What''s included:' + #13#10;
    Msg := Msg + '  - Claude AI vision for smart prompt enhancement' + #13#10;
    Msg := Msg + '  - ffmpeg for automatic video preprocessing' + #13#10;
    Msg := Msg + '  - Runway Gen-4 video-to-video AI generation' + #13#10;

    Msg := Msg + #13#10 + 'Next steps:' + #13#10;
    Msg := Msg + '  1. Restart Adobe Premiere Pro' + #13#10;
    Msg := Msg + '  2. Window -> Extensions -> Prysmor' + #13#10;
    Msg := Msg + '  3. Sign in and generate your first effect' + #13#10;

    MsgBox(Msg, mbInformation, MB_OK);
  end;
end;

function InitializeUninstall(): Boolean;
begin
  Result := True;
  if MsgBox(
    'Uninstall Prysmor Panel?' + #13#10 + #13#10 +
    'The extension folder will be removed.' + #13#10 +
    'Registry keys will be cleaned up.',
    mbConfirmation, MB_YESNO
  ) = IDNO then
    Result := False;
end;
