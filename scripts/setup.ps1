# One-click setup for TappedIn (run by "Setup TappedIn.cmd"). Windows PowerShell 5.1.
# Every step checks first and skips what is already done, so running it again is safe.
#   -CheckOnly   report each step's status and change nothing (no installs, no signing, no shortcuts)
param([switch]$CheckOnly)

. (Join-Path $PSScriptRoot 'install-common.ps1')
Set-Location -LiteralPath $Root

# Pinned versions for the private Python environment that signs Electron (current on PyPI, 10/18/2026).
$EvsPins = @('castlabs-evs==1.3.2', 'truststore==0.10.5')

Write-Host 'TappedIn setup' -ForegroundColor Cyan
if ($CheckOnly) { Write-Host 'Check only: nothing will be installed or changed.' }

# 1. Node.js and Python ------------------------------------------------------------------------------
Write-Step '1/8  Node.js 22+ and Python 3.12'
$nodeVersion = Get-NodeVersion
if ($nodeVersion -and (Get-Major $nodeVersion) -ge 22) {
    Write-Ok "Node $nodeVersion"
} elseif ($CheckOnly) {
    if ($nodeVersion) { Write-Todo "Node $nodeVersion is too old; setup would offer to install Node 22+ ($NodeLink)." } else { Write-Todo "Node.js is not installed; setup would offer to install it ($NodeLink)." }
} else {
    Install-WithWinget 'Node.js (22 or later)' 'TappedIn runs on Node.js.' 'OpenJS.NodeJS.LTS' $NodeLink
    $nodeVersion = Get-NodeVersion
    if (-not $nodeVersion -or (Get-Major $nodeVersion) -lt 22) {
        Stop-WithFix 'Node.js was installed, but this window cannot see it yet.' 'Close this window and double-click Setup TappedIn.cmd again.'
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
        Stop-WithFix 'Python 3.12 was installed, but this window cannot see it yet.' 'Close this window and double-click Setup TappedIn.cmd again.'
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
    if (-not $python) { Stop-WithFix 'Python 3.12 is missing.' 'Run Setup TappedIn.cmd again and let it install Python.' }
    if (-not (Test-Path -LiteralPath $VenvPython)) {
        Write-Info 'Creating .venv-evs...'
        & $python -m venv $VenvDir
        if ($LASTEXITCODE -ne 0) { Stop-WithFix 'Could not create the Python environment .venv-evs.' 'Delete the .venv-evs folder and run Setup TappedIn.cmd again.' }
    }
    $code = Invoke-Interactive $VenvPython (@('-I', '-m', 'pip', 'install', '--disable-pip-version-check') + $EvsPins)
    if ($code -ne 0) { Stop-WithFix 'Installing the signing tool failed.' 'Check your internet connection and run Setup TappedIn.cmd again. If it keeps failing, delete the .venv-evs folder first.' }
    Write-Ok 'Installed.'
}

# 4. castLabs EVS account ----------------------------------------------------------------------------
Write-Step '4/8  castLabs EVS account (free; signs the video player for Widevine)'
# Only needed to sign. With a good signature, setup never contacts castLabs (no login, works offline).
$needSigning = -not (Test-SignatureFresh)
$evsConfig = $env:EVS_CONFIG_FILE
if (-not $evsConfig) { $evsConfig = Join-Path $env:USERPROFILE '.config\evs\config.json' }
$evsSaved = $false
if (Test-Path -LiteralPath $evsConfig) {
    try {
        $auth = (Get-Content -LiteralPath $evsConfig -Raw | ConvertFrom-Json).Auth
        $evsSaved = [bool]($auth.AccountName -and $auth.RefreshToken)
    } catch { $evsSaved = $false }
}
if (-not $needSigning) {
    Write-Ok 'Not needed: Electron is already signed.'
} elseif ($CheckOnly) {
    if ($evsSaved) { Write-Ok 'An EVS login is saved on this PC (setup would refresh it).' } else { Write-Todo "No EVS login on this PC; setup would run castLabs' sign-in or sign-up." }
} elseif (-not (Test-Path -LiteralPath $VenvPython)) {
    Stop-WithFix 'The signing tool is missing.' 'Run Setup TappedIn.cmd again.'
} else {
    # -n: castLabs' non-interactive mode, so this only succeeds with a saved login.
    $code = Invoke-Interactive $VenvPython @('-I', $EvsScript, 'account', '-n', 'refresh')
    if ($code -eq 0) {
        Write-Ok 'Signed in to EVS.'
    } else {
        Write-Info "TappedIn needs a free castLabs EVS account to sign its video player. You type your details"
        Write-Info "into castLabs' own prompts below; TappedIn never reads or saves them."
        Write-Info '  1  I have an EVS account'
        Write-Info '  2  Create an EVS account (castLabs emails you a code to type in)'
        Write-Info '  3  I signed up but did not finish the emailed code (sends a new code)'
        Write-Info '  4  I forgot my EVS password (castLabs emails you a code to reset it)'
        $choice = "$(Read-Host '   Type 1, 2, 3 or 4')".Trim()
        switch ($choice) {
            '1' { $code = Invoke-Interactive $VenvPython @('-I', $EvsScript, 'account', 'refresh') }
            '2' { $code = Invoke-Interactive $VenvPython @('-I', $EvsScript, 'account', 'signup') }
            '3' { $code = Invoke-Interactive $VenvPython @('-I', $EvsScript, 'account', 'resend') }
            '4' {
                $code = Invoke-Interactive $VenvPython @('-I', $EvsScript, 'account', 'reset')
                if ($code -eq 0) { $code = Invoke-Interactive $VenvPython @('-I', $EvsScript, 'account', 'refresh') }
            }
            default { Stop-WithFix 'No choice was made.' 'Run Setup TappedIn.cmd again and type 1, 2, 3 or 4.' }
        }
        if ($code -ne 0) { Stop-WithFix 'The EVS sign-in or sign-up did not finish.' 'Read the castLabs message above, then run Setup TappedIn.cmd again (a typo in the emailed code: choose 3; a forgotten password: choose 4).' }
        Write-Ok 'Signed in to EVS.'
    }
}

# 5. Sign Electron for Widevine ----------------------------------------------------------------------
Write-Step '5/8  Widevine signature for Electron'
if (-not $needSigning) {
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
} else {
    # Not fatal: some problems (ESPN briefly down, TappedIn already open) aren't install problems, and the
    # shortcuts below are still worth making.
    Write-Todo 'The doctor found problems (above). Follow each "Fix:" line.'
}

# 7. Shortcuts ---------------------------------------------------------------------------------------
Write-Step '7/8  Start menu and desktop shortcuts'
$shell = New-Object -ComObject WScript.Shell
$shortcuts = @(
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'TappedIn.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'TappedIn.lnk')
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
        $lnk.Description = 'TappedIn'
        if (Test-Path -LiteralPath $ElectronExe) { $lnk.IconLocation = "$ElectronExe,0" }
        $lnk.Save()
        Write-Ok "Created $lnkPath"
    }
}
# The app was called RedZone before; remove its old shortcuts to this folder (RedZone.cmd is gone).
foreach ($folder in 'Programs', 'Desktop') {
    $old = Join-Path ([Environment]::GetFolderPath($folder)) 'RedZone.lnk'
    if ((Test-Path -LiteralPath $old) -and $shell.CreateShortcut($old).TargetPath -ieq (Join-Path $Root 'RedZone.cmd')) {
        if ($CheckOnly) { Write-Todo "Setup would remove the old shortcut $old" } else { Remove-Item -LiteralPath $old; Write-Ok "Removed the old shortcut $old" }
    }
}

# 8. Open TappedIn ------------------------------------------------------------------------------------
Write-Step '8/8  Open TappedIn'
if ($CheckOnly) {
    Write-Info 'Setup would open TappedIn now (skipped in check-only mode).'
    Write-Host ''
    if ($script:Todo -eq 0) {
        Write-Host 'Everything is already set up.' -ForegroundColor Green
        exit 0
    }
    Write-Host "$($script:Todo) item(s) still to do. Double-click Setup TappedIn.cmd to do them." -ForegroundColor Yellow
    exit 1
}
Start-Process -FilePath $Launcher -WorkingDirectory $Root
Write-Ok 'TappedIn is starting (its console window is minimized). The first start opens the setup screens.'
Write-Host ''
if ($script:Todo -gt 0) { Write-Host "Setup is done, but $($script:Todo) item(s) above still need a look." -ForegroundColor Yellow }
Write-Host 'Next time, open TappedIn from the Start menu or the desktop.' -ForegroundColor Green
exit 0
