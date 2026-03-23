; =============================================================================
; Prysmor Panel — Windows Installer Script
; Inno Setup 6  (https://jrsoftware.org/isinfo.php)
;
; Build:
;   ISCC.exe installer\windows\PrysmorPanel.iss
;   (run from project root, or adjust SourceDir below)
;
; What this installer does:
;   1. Detects installed Premiere Pro version (2025, 2024, 2023, 2022)
;   2. Copies the extension to the correct CEP\extensions\ folder
;   3. Sets PlayerDebugMode=1 in registry (CSXS.10 – CSXS.13)
;   4. Clears all CEP caches so Premiere picks up the extension immediately
; =============================================================================

; ── Defines ──────────────────────────────────────────────────────────────────

#define AppName      "Prysmor Panel"
#define AppVersion   "1.0.1"
#define AppPublisher "Prysmor"
#define AppURL       "https://prysmor.com"
#define ExtensionId  "prysmor-panel"

; Path to the CEP panel source, relative to this .iss file
#define SourceDir    "..\..\prysmor-panel"

; Where the compiled installer lands
#define OutputDir    "..\..\dist"

; ── Setup ─────────────────────────────────────────────────────────────────────

[Setup]
AppId={{A9C3F7D2-4B1E-4F8C-2A6D-7E3B0C9F5A1D}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher={#AppPublisher}
AppPublisherURL={#AppURL}
AppSupportURL={#AppURL}/docs
AppUpdatesURL={#AppURL}/downloads

; Default: Premiere Pro 2025 system folder
; The Pascal [Code] section overrides this at runtime if a different version is found.
DefaultDirName={autopf}\Adobe\Adobe Premiere Pro 2025\CEP\extensions\{#ExtensionId}
DisableDirPage=yes
DisableProgramGroupPage=yes

; Admin required to write to Program Files
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=commandline

; ── Output ──
OutputDir={#OutputDir}
OutputBaseFilename=PrysmorPanelSetup

; ── Appearance ──
WizardStyle=modern

; ── Compression ──
Compression=lzma2/ultra64
SolidCompression=yes
InternalCompressLevel=ultra64

; ── Uninstall ──
UninstallDisplayName={#AppName}
CreateUninstallRegKey=yes

; ── Languages ─────────────────────────────────────────────────────────────────

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; ── Finished page message ─────────────────────────────────────────────────────

[Messages]
FinishedLabel=Prysmor Panel installed!%n%nNext steps:%n  1. Restart Adobe Premiere Pro%n  2. Window %→ Extensions %→ Prysmor%n  3. Click "Continue to Prysmor" — no login needed.

; ── Files ─────────────────────────────────────────────────────────────────────

[Files]
Source: "{#SourceDir}\CSXS\manifest.xml";   DestDir: "{app}\CSXS";         Flags: ignoreversion
Source: "{#SourceDir}\panel\index.html";    DestDir: "{app}\panel";        Flags: ignoreversion
Source: "{#SourceDir}\panel\main.js";       DestDir: "{app}\panel";        Flags: ignoreversion
Source: "{#SourceDir}\panel\host.jsx";      DestDir: "{app}\panel";        Flags: ignoreversion
Source: "{#SourceDir}\panel\styles.css";    DestDir: "{app}\panel";        Flags: ignoreversion
Source: "{#SourceDir}\panel\lib\*";         DestDir: "{app}\panel\lib";    Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\panel\assets\*";      DestDir: "{app}\panel\assets"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\.debug";             DestDir: "{app}";              Flags: ignoreversion

; ── Registry ──────────────────────────────────────────────────────────────────
; PlayerDebugMode=1 is required for Premiere to load unsigned CEP extensions.
; Set for all CSXS versions: .10 (older), .11 (2022-2024), .12 (2025), .13 (future).

[Registry]
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.10"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.11"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.12"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1
Root: HKCU; Subkey: "Software\Adobe\CSXS.13"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1; Flags: createvalueifdoesntexist uninsdeletevalue
Root: HKCU; Subkey: "Software\Adobe\CSXS.13"; ValueType: dword; ValueName: "PlayerDebugMode"; ValueData: 1

; ── Post-install cache clear ───────────────────────────────────────────────────

[Run]
Filename: "cmd.exe"; Parameters: "/C rmdir /S /Q ""{userappdata}\Adobe\CEP\Cache"" 2>nul";            Flags: runhidden; StatusMsg: "Clearing CEP cache..."
Filename: "cmd.exe"; Parameters: "/C rmdir /S /Q ""{userappdata}\Adobe\CEP\CEPHtmlEngine"" 2>nul";    Flags: runhidden; StatusMsg: "Clearing CEP engine cache..."
Filename: "cmd.exe"; Parameters: "/C rmdir /S /Q ""{localappdata}\Temp\cep_cache"" 2>nul";            Flags: runhidden; StatusMsg: "Clearing CEP temp cache..."

; ── Uninstall ─────────────────────────────────────────────────────────────────

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

; ── Pascal Script ─────────────────────────────────────────────────────────────

[Code]

{ ── Auto-detect Premiere Pro install folder ── }
{ Checks for Premiere versions 2025, 2024, 2023, 2022 in Program Files.       }
{ Falls back to %AppData%\Adobe\CEP\extensions\ if none found.                 }

function GetInstallDir(Param: String): String;
var
  Versions: TArrayOfString;
  PF: String;
  i: Integer;
  Candidate: String;
begin
  { Build list of Premiere versions to check, newest first }
  SetArrayLength(Versions, 5);
  Versions[0] := 'Adobe Premiere Pro 2025';
  Versions[1] := 'Adobe Premiere Pro 2024';
  Versions[2] := 'Adobe Premiere Pro 2023';
  Versions[3] := 'Adobe Premiere Pro 2022';
  Versions[4] := 'Adobe Premiere Pro 2021';

  PF := ExpandConstant('{autopf}');

  for i := 0 to GetArrayLength(Versions) - 1 do
  begin
    Candidate := PF + '\Adobe\' + Versions[i] + '\CEP\extensions';
    if DirExists(Candidate) then
    begin
      Result := Candidate + '\prysmor-panel';
      Exit;
    end;
  end;

  { No Premiere found — fall back to per-user AppData path }
  Result := ExpandConstant('{userappdata}') + '\Adobe\CEP\extensions\prysmor-panel';
end;

{ Override install dir before wizard starts }
function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
end;

procedure InitializeWizard;
begin
  WizardForm.DirEdit.Text := GetInstallDir('');
end;

{ Verify registry after install, show summary dialog }
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
  InstallPath: String;
begin
  if CurStep = ssPostInstall then
  begin
    InstallPath := WizardDirValue;

    Msg := 'Prysmor Panel installed!' + #13#10 + #13#10;
    Msg := Msg + 'Location:' + #13#10;
    Msg := Msg + '  ' + InstallPath + #13#10 + #13#10;

    Msg := Msg + 'PlayerDebugMode = 1:' + #13#10;
    if CheckDebugMode('Software\Adobe\CSXS.11') then Msg := Msg + '  CSXS.11  OK' + #13#10
    else Msg := Msg + '  CSXS.11  not set' + #13#10;
    if CheckDebugMode('Software\Adobe\CSXS.12') then Msg := Msg + '  CSXS.12  OK' + #13#10
    else Msg := Msg + '  CSXS.12  not set' + #13#10;

    Msg := Msg + #13#10 + 'Next steps:' + #13#10;
    Msg := Msg + '  1. Restart Adobe Premiere Pro' + #13#10;
    Msg := Msg + '  2. Window -> Extensions -> Prysmor' + #13#10;
    Msg := Msg + '  3. Click "Continue to Prysmor"' + #13#10;

    MsgBox(Msg, mbInformation, MB_OK);
  end;
end;

{ Confirm before uninstall }
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
