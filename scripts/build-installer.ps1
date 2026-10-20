# Builds the Windows installer dist\TappedIn-Setup-<version>.exe (Inno Setup). Windows PowerShell 5.1.
# The installer carries everything: app files, node_modules with castLabs Electron signed for Widevine,
# and its own node.exe, so users need no Node, Python or castLabs account.
#   -Unsigned   skip the Widevine signing (a test build: video will not play)
# Signing reuses this checkout's electron.exe.sig when the staged electron.exe is byte-for-byte the same;
# otherwise it uploads electron.exe to castLabs EVS, which needs a saved EVS login (Setup TappedIn.cmd
# makes one; CI writes it from the EVS_CONFIG secret).
param([switch]$Unsigned)

. (Join-Path $PSScriptRoot 'install-common.ps1')
Set-Location -LiteralPath $Root

# Node bundled into the installer. Hash from https://nodejs.org/dist/v24.20.0/SHASUMS256.txt
$NodeVersion = 'v24.20.0'
$NodeSha256 = '6cac9ffbca8f6a47091e4b5c772e0606049c3871cb67d900c0cedde630e545ba'

$Version = (Get-Content -LiteralPath (Join-Path $Root 'package.json') -Raw | ConvertFrom-Json).version
$Build = Join-Path $Root 'build'
$Stage = Join-Path $Build 'stage'
$Dist = Join-Path $Root 'dist'
$StageElectron = Join-Path $Stage 'node_modules\electron\dist\electron.exe'

Write-Host "Building TappedIn-Setup-$Version.exe" -ForegroundColor Cyan

# 1. Stage the committed files ----------------------------------------------------------------------
Write-Step '1/5  Staging the committed files (git archive HEAD)'
if (@(& git status --porcelain --untracked-files=no).Count -gt 0) { Write-Info 'Note: uncommitted changes are not included; commit them first to ship them.' }
if (Test-Path -LiteralPath $Stage) { Remove-Item -LiteralPath $Stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $Stage | Out-Null
$zip = Join-Path $Build 'source.zip'
& git archive --format=zip -o $zip HEAD
if ($LASTEXITCODE -ne 0) { Stop-WithFix 'git archive failed.' 'Run this from a git checkout of TappedIn.' }
Expand-Archive -LiteralPath $zip -DestinationPath $Stage -Force
Write-Ok $Stage

# 2. Dependencies -----------------------------------------------------------------------------------
Write-Step '2/5  App dependencies (npm ci in the stage)'
$env:TAPPEDIN_INSTALLER = '1'
$p = Start-Process -FilePath 'npm.cmd' -ArgumentList 'ci' -WorkingDirectory $Stage -NoNewWindow -Wait -PassThru
Remove-Item Env:\TAPPEDIN_INSTALLER -ErrorAction SilentlyContinue
if ($p.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $StageElectron)) { Stop-WithFix "npm ci failed (exit code $($p.ExitCode))." 'Check your internet connection and run this again.' }
Write-Ok 'Installed.'

# 3. Widevine signature -----------------------------------------------------------------------------
Write-Step '3/5  Widevine signature for Electron'
if ($Unsigned) {
    Write-Host '   UNSIGNED TEST BUILD: video will not play in this installer.' -ForegroundColor Yellow
} elseif ((Test-SignatureFresh) -and (Get-FileHash -LiteralPath $ElectronExe).Hash -eq (Get-FileHash -LiteralPath $StageElectron).Hash) {
    Copy-Item -LiteralPath $ElectronSig -Destination "$StageElectron.sig" -Force
    # Same rule as Restore-ElectronSignature: the signature must not look older than the fresh electron.exe.
    (Get-Item -LiteralPath "$StageElectron.sig").LastWriteTime = Get-Date
    Write-Ok "Same electron.exe as this checkout: reused its signature."
} else {
    $python = if (Test-Path -LiteralPath $VenvPython) { $VenvPython } else { 'python' }
    Write-Info "Uploading electron.exe to castLabs EVS to sign it..."
    $code = Invoke-Interactive $python @('-I', $EvsScript, 'vmp', 'sign-pkg', (Split-Path -Parent $StageElectron))
    if ($code -ne 0 -or -not (Test-Path -LiteralPath "$StageElectron.sig")) {
        Stop-WithFix 'Signing Electron failed.' 'Sign in to EVS first (Setup TappedIn.cmd does it), or build with -Unsigned for a test build.'
    }
    Write-Ok 'Signed.'
}

# 4. Bundled Node -----------------------------------------------------------------------------------
Write-Step "4/5  Node $NodeVersion for the installer"
$nodeZip = Join-Path $Build "node-$NodeVersion-win-x64.zip"
if (-not (Test-Path -LiteralPath $nodeZip) -or (Get-FileHash -LiteralPath $nodeZip).Hash -ne $NodeSha256) {
    Invoke-WebRequest -UseBasicParsing -Uri "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip" -OutFile $nodeZip
}
if ((Get-FileHash -LiteralPath $nodeZip).Hash -ne $NodeSha256) {
    Remove-Item -LiteralPath $nodeZip
    Stop-WithFix 'The Node download does not match its published SHA256.' 'Run this again; if it keeps failing, do not ship this build.'
}
$nodeDir = Join-Path $Build 'node'
if (Test-Path -LiteralPath $nodeDir) { Remove-Item -LiteralPath $nodeDir -Recurse -Force }
Expand-Archive -LiteralPath $nodeZip -DestinationPath $nodeDir
$nodeSrc = Join-Path $nodeDir "node-$NodeVersion-win-x64"
New-Item -ItemType Directory -Force -Path (Join-Path $Stage 'runtime') | Out-Null
Copy-Item -LiteralPath (Join-Path $nodeSrc 'node.exe'), (Join-Path $nodeSrc 'LICENSE') -Destination (Join-Path $Stage 'runtime')
Write-Ok 'runtime\node.exe'

# 5. Compile ----------------------------------------------------------------------------------------
Write-Step '5/5  Compiling the installer (Inno Setup)'
$iscc = @(
    (Get-Command iscc -ErrorAction SilentlyContinue).Source,
    (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe'),
    (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $iscc) { Stop-WithFix 'Inno Setup 6 is not installed.' 'Install it (winget install JRSoftware.InnoSetup, or https://jrsoftware.org/isdl.php) and run this again.' }
$code = Invoke-Interactive $iscc @("/DAppVersion=$Version", "/DStage=$Stage", "/O$Dist", (Join-Path $Root 'installer\tappedin.iss'))
if ($code -ne 0) { Stop-WithFix "Inno Setup failed (exit code $code)." 'Read its message above.' }
Write-Ok (Join-Path $Dist "TappedIn-Setup-$Version.exe")
exit 0
