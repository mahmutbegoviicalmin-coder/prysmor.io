; =============================================================================
; Prysmor Panel v2.1.0 — Windows Installer
; Inno Setup 6  (https://jrsoftware.org/isinfo.php)
;
; Build:
;   ISCC.exe installer\windows\PrysmorPanel.iss
;
; What this installer does:
;   1. Installs the CEP panel to the correct Premiere Pro extension folder
;   2. Sets PlayerDebugMode=1 in registry (CSXS.10 – CSXS.13)
;   3. Copies the Identity Lock Python sidecar (face_embedding_server.py)
;   4. Installs Python dependencies via pip (insightface, torch, etc.)
;   5. Registers auto-start so sidecar runs on every Windows login
;   6. Clears CEP caches so panel loads immediately
; =============================================================================

; ── Defines ──────────────────────────────────────────────────────────────────

#define AppName      "Prysmor Panel"
#define AppVersion   "2.1.0"
#define AppPublisher "Prysmor"
#define AppURL       "https://prysmor.io"
#define ExtensionId  "prysmor-panel"

#define SourceDir    "..\..\prysmor-panel"
#define SidecarPy    "..\..\face_embedding_server.py"
#define SidecarDest  "{userappdata}\Prysmor"
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
AppUpdatesURL={#AppURL}/dashboard/downloads

DefaultDirName={autopf}\Adobe\Adobe Premiere Pro 2025\CEP\extensions\{#ExtensionId}
DisableDirPage=yes
DisableProgramGroupPage=yes

PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=commandline

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
FinishedLabel=Prysmor Panel v2.1.0 installed successfully!%n%nNext steps:%n  1. Restart Adobe Premiere Pro%n  2. Window %→ Extensions %→ Prysmor%n  3. Sign in — Identity Lock starts automatically in the background.

; ── Files ─────────────────────────────────────────────────────────────────────

[Files]
; CEP Panel files
Source: "{#SourceDir}\CSXS\manifest.xml";   DestDir: "{app}\CSXS";         Flags: ignoreversion
Source: "{#SourceDir}\panel\index.html";    DestDir: "{app}\panel";        Flags: ignoreversion
Source: "{#SourceDir}\panel\main.js";       DestDir: "{app}\panel";        Flags: ignoreversion
Source: "{#SourceDir}\panel\host.jsx";      DestDir: "{app}\panel";        Flags: ignoreversion
Source: "{#SourceDir}\panel\styles.css";    DestDir: "{app}\panel";        Flags: ignoreversion
Source: "{#SourceDir}\panel\lib\*";         DestDir: "{app}\panel\lib";    Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#SourceDir}\panel\assets\*";      DestDir: "{app}\panel\assets"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "{#SourceDir}\.debug";             DestDir: "{app}";              Flags: ignoreversion

; Identity Lock Python sidecar
Source: "{#SidecarPy}"; DestDir: "{#SidecarDest}"; Flags: ignoreversion

; pip dependency installer helper script (written by [Code] section, not a file copy)

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

; Sidecar auto-start — runs python on every Windows login
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
  ValueType: string; ValueName: "PrysmorSidecar"; \
  ValueData: "pythonw.exe ""{userappdata}\Prysmor\face_embedding_server.py"""; \
  Flags: uninsdeletevalue

; ── Post-install steps ────────────────────────────────────────────────────────

[Run]
; Clear CEP caches
Filename: "cmd.exe"; Parameters: "/C rmdir /S /Q ""{userappdata}\Adobe\CEP\Cache"" 2>nul";              Flags: runhidden; StatusMsg: "Clearing CEP cache..."
Filename: "cmd.exe"; Parameters: "/C rmdir /S /Q ""{userappdata}\Adobe\CEP\CEPHtmlEngine"" 2>nul";      Flags: runhidden; StatusMsg: "Clearing CEP engine cache..."
Filename: "cmd.exe"; Parameters: "/C rmdir /S /Q ""{localappdata}\Temp\cep_cache"" 2>nul";              Flags: runhidden; StatusMsg: "Clearing CEP temp cache..."

; Install Python dependencies for Identity Lock (runs hidden, one-time)
Filename: "cmd.exe"; \
  Parameters: "/C pythonw -m pip install --quiet insightface fastapi uvicorn opencv-python numpy torch torchvision huggingface_hub Pillow 2>>{userappdata}\Prysmor\install.log"; \
  Flags: runhidden nowait; StatusMsg: "Installing Identity Lock engine (background, ~5-10 min first time)..."

; Start the sidecar immediately (it will wait for pip to finish if needed)
Filename: "cmd.exe"; \
  Parameters: "/C start /B pythonw.exe ""{userappdata}\Prysmor\face_embedding_server.py"" >> ""{userappdata}\Prysmor\sidecar.log"" 2>&1"; \
  Flags: runhidden nowait; StatusMsg: "Starting Identity Lock engine..."

; ── Uninstall ─────────────────────────────────────────────────────────────────

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[UninstallRun]
Filename: "cmd.exe"; Parameters: "/C taskkill /F /IM pythonw.exe /FI ""WINDOWTITLE eq face_embedding_server*"" 2>nul"; Flags: runhidden

; ── Pascal Script ─────────────────────────────────────────────────────────────

[Code]

function GetInstallDir(Param: String): String;
var
  Versions: TArrayOfString;
  PF: String;
  i: Integer;
  Candidate: String;
begin
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

  Result := ExpandConstant('{userappdata}') + '\Adobe\CEP\extensions\prysmor-panel';
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
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

function PythonAvailable(): Boolean;
var
  ResultCode: Integer;
begin
  Result := Exec('cmd.exe', '/C python --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
            and (ResultCode = 0);
  if not Result then
    Result := Exec('cmd.exe', '/C pythonw --version', '', SW_HIDE, ewWaitUntilTerminated, ResultCode)
              and (ResultCode = 0);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Msg: String;
  HasPython: Boolean;
begin
  if CurStep = ssPostInstall then
  begin
    HasPython := PythonAvailable();
    Msg := 'Prysmor Panel v2.1.0 installed!' + #13#10 + #13#10;
    Msg := Msg + 'Panel location:' + #13#10;
    Msg := Msg + '  ' + WizardDirValue + #13#10 + #13#10;

    Msg := Msg + 'PlayerDebugMode = 1:' + #13#10;
    if CheckDebugMode('Software\Adobe\CSXS.11') then Msg := Msg + '  CSXS.11  OK' + #13#10
    else Msg := Msg + '  CSXS.11  not set' + #13#10;
    if CheckDebugMode('Software\Adobe\CSXS.12') then Msg := Msg + '  CSXS.12  OK' + #13#10
    else Msg := Msg + '  CSXS.12  not set' + #13#10;

    Msg := Msg + #13#10;
    if HasPython then
      Msg := Msg + 'Identity Lock: Installing in background (~5-10 min)' + #13#10
    else
      Msg := Msg + 'Identity Lock: Python not found — install from python.org and re-run' + #13#10;

    Msg := Msg + #13#10 + 'Next steps:' + #13#10;
    Msg := Msg + '  1. Restart Adobe Premiere Pro' + #13#10;
    Msg := Msg + '  2. Window -> Extensions -> Prysmor' + #13#10;
    Msg := Msg + '  3. Sign in — Identity Lock runs automatically' + #13#10;

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
