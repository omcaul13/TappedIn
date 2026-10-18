# Updates RedZone (run by "Update RedZone.cmd"). Windows PowerShell 5.1.
# Gets the newest version, reinstalls dependencies when they changed, offers to sign Electron again only
# when it changed, then checks the install.
#   -CheckOnly   report each step's status and change nothing (no fetch, no install, no signing)
param([switch]$CheckOnly)

. (Join-Path $PSScriptRoot 'install-common.ps1')
Set-Location -LiteralPath $Root

Write-Host 'RedZone update' -ForegroundColor Cyan
if ($CheckOnly) { Write-Host 'Check only: nothing will be downloaded or changed.' }

if (-not (Get-NodeVersion)) {
    Stop-WithFix 'Node.js is not installed, so RedZone was never set up on this PC.' 'Double-click Setup RedZone.cmd instead.'
}

# 1. Newest version ----------------------------------------------------------------------------------
Write-Step '1/4  Newest version'
if (-not (Test-Path -LiteralPath (Join-Path $Root '.git'))) {
    Write-Info 'This copy was downloaded as a zip, so it cannot download updates itself. To update:'
    Write-Info '  1. Download the newest RedZone zip from where you got this one.'
    Write-Info '  2. Unzip it over this folder (your settings in the .state folder are kept).'
    Write-Info '  3. Double-click Update RedZone.cmd again; it finishes the rest (the steps below).'
} elseif (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    if ($CheckOnly) { Write-Todo 'Git is not installed, so update cannot pull the newest version.' }
    else { Stop-WithFix 'This copy came from git, but Git is not installed.' 'Install Git from https://git-scm.com/download/win, then run Update RedZone.cmd again.' }
} else {
    # --no-optional-locks: read-only git commands never rewrite .git/index.
    $branch = & git --no-optional-locks rev-parse --abbrev-ref HEAD 2>$null
    $upstream = & git --no-optional-locks rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $upstream) {
        Write-Info "Branch $branch does not follow a branch on the server, so there is nothing to pull."
    } elseif ($CheckOnly) {
        $behind = & git --no-optional-locks rev-list --count 'HEAD..@{u}' 2>$null
        Write-Info "Branch $branch follows $upstream. As of the last download it was $behind commit(s) behind."
        Write-Info 'Update would run git pull --ff-only to get the newest version.'
        $changed = @(& git --no-optional-locks status --porcelain --untracked-files=no 2>$null)
        if ($changed.Count -gt 0) { Write-Info "Files you changed (git keeps them unless the update changes them too): $($changed.Count)" }
    } else {
        $code = Invoke-Interactive 'git' @('pull', '--ff-only')
        if ($code -ne 0) {
            Stop-WithFix 'git could not apply the update.' "Run git status in this folder to see the files you changed, undo or move those changes (settings belong in .state\settings.json), then run Update RedZone.cmd again."
        }
        Write-Ok "Up to date with $upstream."
    }
}

# 2. Dependencies ------------------------------------------------------------------------------------
Write-Step '2/4  App dependencies (npm ci)'
$oldElectron = Get-ElectronVersion
$sig = 'kept'
if (Test-DepsInSync) {
    Write-Ok 'Installed and matching package-lock.json.'
} elseif ($CheckOnly) {
    Write-Todo 'npm ci would reinstall them (package-lock.json changed).'
} else {
    $sig = Invoke-NpmCi
    Write-Ok 'Dependencies installed.'
}
$newElectron = Get-ElectronVersion

# 3. Widevine signature ------------------------------------------------------------------------------
Write-Step '3/4  Widevine signature for Electron'
if (Test-SignatureFresh) {
    if ($sig -eq 'restored') { Write-Ok 'Electron did not change, so its signature was kept.' } else { Write-Ok 'electron.exe.sig is present and up to date.' }
} elseif ($CheckOnly) {
    Write-Todo 'Electron is not signed (or the signature is older than electron.exe); update would offer to sign it.'
} else {
    if ($oldElectron -and $newElectron -and $oldElectron -ne $newElectron) {
        Write-Info "Electron changed from $oldElectron to $newElectron, so it needs a new Widevine signature."
    } else {
        Write-Info 'Electron needs a new Widevine signature (it is missing or older than electron.exe).'
    }
    if (Read-YesNo "Sign it now? (uploads electron.exe to castLabs' free EVS service)") {
        Invoke-SignElectron
        Write-Ok 'Signed: electron.exe.sig is present.'
    } else {
        Write-Todo 'Video will not play until Electron is signed: run Update RedZone.cmd again, or npm run sign-electron.'
    }
}

# 4. Check everything --------------------------------------------------------------------------------
Write-Step '4/4  Checking the install (npm run doctor)'
if (Invoke-Doctor) {
    Write-Ok 'All checks passed.'
} else {
    Write-Todo 'The doctor found problems (above). Follow each "Fix:" line.'
}

Write-Host ''
if ($script:Todo -eq 0) {
    if ($CheckOnly) { Write-Host 'Nothing to do right now (beyond git pull, which only a real update checks).' -ForegroundColor Green }
    else { Write-Host 'RedZone is up to date.' -ForegroundColor Green }
    exit 0
}
Write-Host "$($script:Todo) item(s) still to do (above)." -ForegroundColor Yellow
exit 1
