#define AppName "JIC_YZUIC_Hunyuan3D-Windows"
#define AppVersion "0.1.0"
#define PackageRoot "..\\..\\release\\windows"

[Setup]
AppId={{8E4E9F6D-8C4E-4A41-BD0F-7C0C1E8A3F21}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=JIC / YZUIC
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
OutputDir=..\..\release\installers
OutputBaseFilename=JIC_YZUIC_Hunyuan3D-Windows-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
Uninstallable=yes

[Files]
Source: "{#PackageRoot}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\{#AppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File \"{app}\packaging\windows\Launch.ps1\""; WorkingDir: "{app}"; Comment: "Local image-to-3D generation"
Name: "{group}\{#AppName}"; Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File \"{app}\packaging\windows\Launch.ps1\""; WorkingDir: "{app}"

[Run]
Filename: "{sys}\WindowsPowerShell\v1.0\powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File \"{app}\packaging\windows\Launch.ps1\""; WorkingDir: "{app}"; Description: "Launch JIC_YZUIC_Hunyuan3D-Windows"; Flags: postinstall nowait skipifsilent
