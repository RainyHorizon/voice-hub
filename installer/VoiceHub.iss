#define MyAppName "Voice Hub"
#define MyAppPublisher "RainyHorizon"
#define MyAppURL "https://github.com/RainyHorizon/voice-hub"

#ifndef Version
  #define Version "1.7.0"
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
DefaultDirName={localappdata}\Voice Hub
DefaultGroupName=Voice Hub
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
DisableProgramGroupPage=yes
OutputDir=..\output\releases
OutputBaseFilename=VoiceHub-{#Version}-Windows-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName=Voice Hub

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{app}\data\audio"

[INI]
Filename: "{app}\voice-hub-install.ini"; Section: "Install"; Key: "Type"; String: "setup"

[Icons]
Name: "{userprograms}\Voice Hub"; Filename: "{app}\VoiceHub.exe"; WorkingDir: "{app}"
Name: "{userdesktop}\Voice Hub"; Filename: "{app}\VoiceHub.exe"; WorkingDir: "{app}"

[Run]
Filename: "{app}\VoiceHub.exe"; Description: "启动 Voice Hub"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}\frontend\dist"
Type: files; Name: "{app}\voice-hub-install.ini"
