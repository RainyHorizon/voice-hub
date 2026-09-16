#define MyAppName "VoxNest"
#define MyAppPublisher "RainyHorizon"
#define MyAppURL "https://github.com/RainyHorizon/VoxNest"

#ifndef Version
  #define Version "1.6.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\output\installer-stage"
#endif

[Setup]
AppId={{9A3A4D0E-0F56-4C39-9E3A-1E2B4B0D6A71}
AppName={#MyAppName}
AppVersion={#Version}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={localappdata}\VoxNest
DefaultGroupName=VoxNest
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
DisableProgramGroupPage=yes
OutputDir=..\output\releases
OutputBaseFilename=VoxNest-{#Version}-Windows-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=VoxNest

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\data\audio"

[INI]
Filename: "{app}\voxnest-install.ini"; Section: "Install"; Key: "Type"; String: "setup"

[Icons]
Name: "{userprograms}\VoxNest"; Filename: "{app}\VoxNest.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\VoxNest"; Filename: "{app}\VoxNest.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\VoxNest.exe"; Description: "启动 VoxNest"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\frontend\dist"
Type: files; Name: "{app}\voxnest-install.ini"
