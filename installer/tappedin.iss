; TappedIn installer (Inno Setup 6). Built by scripts\build-installer.ps1, which stages the app,
; node_modules (castLabs Electron, signed) and runtime\node.exe, then passes AppVersion and Stage.
; Per-user install: no admin prompt, and the folder stays writable for .state, logs and recordings.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef Stage
  #define Stage "..\build\stage"
#endif
#define Icon "{app}\electron\tappedin.ico"
#define Electron "{app}\node_modules\electron\dist\electron.exe"
#define Launch """{app}\electron\launcher.cjs"""

[Setup]
; Never change AppId: it is how a newer installer finds and upgrades an existing install.
AppId={{7CB96E0F-E6D8-4940-8C00-BB05A856DE5F}
AppName=TappedIn
AppVersion={#AppVersion}
AppPublisher=TappedIn
DefaultDirName={localappdata}\Programs\TappedIn
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputBaseFilename=TappedIn-Setup-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={#Icon}
SetupIconFile={#Stage}\electron\tappedin.ico
UninstallDisplayName=TappedIn

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; An upgrade replaces the app's code wholesale, so files a newer version dropped don't linger.
; .state (settings, sign-in state), logs and recordings are never touched.
Type: filesandordirs; Name: "{app}\node_modules"
Type: filesandordirs; Name: "{app}\src"
Type: filesandordirs; Name: "{app}\scripts"
Type: filesandordirs; Name: "{app}\electron"

[Files]
; Keep a copy of an edited config file before the new version's file replaces it.
Source: "{app}\config\tappedin.config.json5"; DestDir: "{app}\config"; DestName: "tappedin.config.json5.bak"; Flags: external skipifsourcedoesntexist uninsneveruninstall
Source: "{#Stage}\*"; DestDir: "{app}"; Excludes: "\test,\docs,\.github,\installer,\Setup TappedIn.cmd,\Update TappedIn.cmd"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
; electron.exe runs electron\launcher.cjs, which starts the app with no console window.
Name: "{autoprograms}\TappedIn"; Filename: "{#Electron}"; Parameters: "{#Launch}"; WorkingDir: "{app}"; IconFilename: "{#Icon}"
Name: "{autodesktop}\TappedIn"; Filename: "{#Electron}"; Parameters: "{#Launch}"; WorkingDir: "{app}"; IconFilename: "{#Icon}"; Tasks: desktopicon

[Run]
Filename: "{#Electron}"; Parameters: "{#Launch}"; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,TappedIn}"; Flags: nowait postinstall skipifsilent
