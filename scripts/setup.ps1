# One-click setup for RedZone (run by "Setup RedZone.cmd"). Windows PowerShell 5.1.
# Every step checks first and skips what is already done, so running it again is safe.
#   -CheckOnly   report each step's status and change nothing (no installs, no signing, no shortcuts)
param([switch]$CheckOnly)

. (Join-Path $PSScriptRoot 'install-common.ps1')
Set-Location -LiteralPath $Root

# Pinned versions for the private Python environment that signs Electron (current on PyPI, 10/18/2026).
$EvsPins = @('castlabs-evs==1.3.2', 'truststore==0.10.5')

Write-Host 'RedZone setup' -ForegroundColor Cyan
if ($CheckOnly) { Write-Host 'Check only: nothing will be installed or changed.' }

# 1. Node.js and Python ------------------------------------------------------------------------------
Write-Step '1/8  Node.js 22+ and Python 3.12'
$nodeVersion = Get-NodeVersion
if ($nodeVersion -and (Get-Major $nodeVersion) -ge 22) {
    Write-Ok "Node $nodeVersion"
} elseif ($CheckOnly) {
    if ($nodeVersion) { Write-Todo "Node $nodeVersion is too old; setup would offer to install Node 22+ ($NodeLink)." } else { Write-Todo "Node.js is not installed; setup would offer to install it ($NodeLink)." }
} else {
    Install-WithWinget 'Node.js (22 or later)' 'RedZone runs on Node.js.' 'OpenJS.NodeJS.LTS' $NodeLink
    $nodeVersion = Get-NodeVersion
    if (-not $nodeVersion -or (Get-Major $nodeVersion) -lt 22) {
        Stop-WithFix 'Node.js was installed, but this window cannot see it yet.' 'Close this window and double-click Setup RedZone.cmd again.'
    }
    Write-Ok "Node $nodeVersion"
}

$python = Find-Python312
if ($python) {
    Write-Ok "Python 3.12 ($python)"
} elseif ($CheckOnly) {
    Write-Todo "Python 3.12 is not installed; setup would offer to install it ($PythonLink)."
} else {
    Install-WithWinget 'Python 3.12' "It runs castLabs' signing tool, which makes the video player work with Widevine (used once, and after Electron updates)." 'Python.Python.3.12' $PythonLink
    $python = Find-Python312
    if (-not $python) {
        Stop-WithFix 'Python 3.12 was installed, but this window cannot see it yet.' 'Close this window and double-click Setup RedZone.cmd again.'
    }
    Write-Ok "Python 3.12 ($python)"
}

# 2. App dependencies --------------------------------------------------------------------------------
Write-Step '2/8  App dependencies (npm ci)'
if (Test-DepsInSync) {
    Write-Ok 'Installed and matching package-lock.json.'
} elseif ($CheckOnly) {
    Write-Todo 'npm ci would install them (including castLabs Electron).'
} else {
    $sig = Invoke-NpmCi
    if ($sig -eq 'restored') { Write-Info 'Electron did not change, so its Widevine signature was kept.' }
    Write-Ok 'Dependencies installed.'
}

# 3. Private Python environment for castLabs EVS -----------------------------------------------------
Write-Step "3/8  Signing tool ($($EvsPins -join ', ') in .venv-evs)"
$venvOk = $false
if (Test-Path -LiteralPath $VenvPython) {
    $versions = & $VenvPython -I -c "import importlib.metadata as m; print(m.version('castlabs-evs') + ' ' + m.version('truststore'))" 2>$null
    $wanted = ($EvsPins | ForEach-Object { ($_ -split '==')[1] }) -join ' '
    $venvOk = ($LASTEXITCODE -eq 0 -and "$versions".Trim() -eq $wanted)
}
if ($venvOk) {
    Write-Ok 'Installed.'
} elseif ($CheckOnly) {
    Write-Todo 'Setup would create .venv-evs and install the signing tool into it (not into your system Python).'
} else {
    if (-not $python) { Stop-WithFix 'Python 3.12 is missing.' 'Run Setup RedZone.cmd again and let it install Python.' }
    if (-not (Test-Path -LiteralPath $VenvPython)) {
        Write-Info 'Creating .venv-evs...'
        & $python -m venv $VenvDir
        if ($LASTEXITCODE -ne 0) { Stop-WithFix 'Could not create the Python environment .venv-evs.' 'Delete the .venv-evs folder and run Setup RedZone.cmd again.' }
    }
    $code = Invoke-Interactive $VenvPython (@('-I', '-m', 'pip', 'install', '--disable-pip-version-check') + $EvsPins)
    if ($code -ne 0) { Stop-WithFix 'Installing the signing tool failed.' 'Check your internet connection and run Setup RedZone.cmd again. If it keeps failing, delete the .venv-evs folder first.' }
    Write-Ok 'Installed.'
}

# 4. castLabs EVS account ----------------------------------------------------------------------------
Write-Step '4/8  castLabs EVS account (free; signs the video player for Widevine)'
$evsConfig = $env:EVS_CONFIG_FILE
if (-not $evsConfig) { $evsConfig = Join-Path $env:USERPROFILE '.config\evs\config.json' }
$evsSaved = $false
if (Test-Path -LiteralPath $evsConfig) {
    try {
        $auth = (Get-Content -LiteralPath $evsConfig -Raw | ConvertFrom-Json).Auth
        $evsSaved = [bool]($auth.AccountName -and $auth.RefreshToken)
    } catch { $evsSaved = $false }
}
if ($CheckOnly) {
    if ($evsSaved) { Write-Ok 'An EVS login is saved on this PC (setup would refresh it).' } else { Write-Todo "No EVS login on this PC; setup would run castLabs' sign-in or sign-up." }
} elseif (-not (Test-Path -LiteralPath $VenvPython)) {
    Stop-WithFix 'The signing tool is missing.' 'Run Setup RedZone.cmd again.'
} else {
    # -n: castLabs' non-interactive mode, so this only succeeds with a saved login.
    $code = Invoke-Interactive $VenvPython @('-I', $EvsScript, 'account', '-n', 'refresh')
    if ($code -eq 0) {
        Write-Ok 'Signed in to EVS.'
    } else {
        Write-Info "RedZone needs a free castLabs EVS account to sign its video player. You type your details"
        Write-Info "into castLabs' own prompts below; RedZone never reads or saves them."
        if (Read-YesNo 'Do you already have a castLabs EVS account?') {
            $code = Invoke-Interactive $VenvPython @('-I', $EvsScript, 'account', 'refresh')
        } else {
            Write-Info 'castLabs will email you a confirmation code; type it when asked.'
            $code = Invoke-Interactive $VenvPython @('-I', $EvsScript, 'account', 'signup')
        }
        if ($code -ne 0) { Stop-WithFix 'The EVS sign-in or sign-up did not finish.' 'Read the castLabs message above, then run Setup RedZone.cmd again and answer its prompts.' }
        Write-Ok 'Signed in to EVS.'
    }
}

# 5. Sign Electron for Widevine ----------------------------------------------------------------------
Write-Step '5/8  Widevine signature for Electron'
if (Test-SignatureFresh) {
    Write-Ok 'electron.exe.sig is present and up to date.'
} elseif ($CheckOnly) {
    Write-Todo 'Setup would run npm run sign-electron.'
} else {
    Invoke-SignElectron
    Write-Ok 'Signed: electron.exe.sig is present.'
}

# 6. Check everything --------------------------------------------------------------------------------
Write-Step '6/8  Checking the install (npm run doctor)'
if (-not (Get-NodeVersion)) {
    Write-Todo 'Needs Node.js first.'
} elseif (Invoke-Doctor) {
    Write-Ok 'All checks passed.'
} elseif ($CheckOnly) {
    Write-Todo 'The doctor found problems (above).'
} else {
    Stop-WithFix 'The doctor found problems (above).' 'Follow each "Fix:" line, then run Setup RedZone.cmd again.'
}

# 7. Shortcuts ---------------------------------------------------------------------------------------
Write-Step '7/8  Start menu and desktop shortcuts'
$shell = New-Object -ComObject WScript.Shell
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'RedZone.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'RedZone.lnk')
)
foreach ($lnkPath in $shortcuts) {
    # CreateShortcut only reads an existing .lnk; nothing is written until Save().
    $lnk = $shell.CreateShortcut($lnkPath)
    if ((Test-Path -LiteralPath $lnkPath) -and $lnk.TargetPath -ieq $Launcher) {
        Write-Ok $lnkPath
    } elseif ($CheckOnly) {
        Write-Todo "Setup would create $lnkPath"
    } else {
        $lnk.TargetPath = $Launcher
        $lnk.WorkingDirectory = $Root
        $lnk.WindowStyle = 7
        $lnk.Description = 'RedZone Director'
        if (Test-Path -LiteralPath $ElectronExe) { $lnk.IconLocation = "$ElectronExe,0" }
        $lnk.Save()
        Write-Ok "Created $lnkPath"
    }
}

# 8. Open RedZone ------------------------------------------------------------------------------------
Write-Step '8/8  Open RedZone'
if ($CheckOnly) {
    Write-Info 'Setup would open RedZone now (skipped in check-only mode).'
    Write-Host ''
    if ($script:Todo -eq 0) {
        Write-Host 'Everything is already set up.' -ForegroundColor Green
        exit 0
    }
    Write-Host "$($script:Todo) item(s) still to do. Double-click Setup RedZone.cmd to do them." -ForegroundColor Yellow
    exit 1
}
Start-Process -FilePath $Launcher -WorkingDirectory $Root
Write-Ok 'RedZone is starting (its console window is minimized). The first start opens the setup screens.'
Write-Host ''
Write-Host 'Setup is done. Next time, open RedZone from the Start menu or the desktop.' -ForegroundColor Green
exit 0
