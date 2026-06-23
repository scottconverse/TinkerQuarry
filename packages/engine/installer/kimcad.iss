#ifndef AppVersion
#error AppVersion must be passed by scripts/build_installer.py with /DAppVersion
#endif

#ifndef AppVersionQuad
#error AppVersionQuad must be passed by scripts/build_installer.py with /DAppVersionQuad
#endif

#ifndef StagingDir
#error StagingDir must be passed by scripts/build_installer.py with /DStagingDir
#endif

[Setup]
AppId={{7E6F0A56-4E4D-4C8F-9A2C-KimCadBeta}
AppName=KimCad
AppVersion={#AppVersion}
VersionInfoVersion={#AppVersionQuad}
DefaultDirName={autopf}\KimCad
DefaultGroupName=KimCad
OutputBaseFilename=KimCad-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
DisableProgramGroupPage=yes

[Files]
Source: "{#StagingDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Icons]
Name: "{group}\KimCad"; Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\kimcad_launcher.py"""
Name: "{autodesktop}\KimCad"; Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\kimcad_launcher.py"""; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\python\pythonw.exe"; Parameters: """{app}\kimcad_launcher.py"""; Description: "Launch KimCad"; Flags: nowait postinstall skipifsilent
