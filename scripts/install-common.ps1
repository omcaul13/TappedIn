# Helpers shared by scripts\setup.ps1 and scripts\update.ps1. Dot-source it; Windows PowerShell 5.1.
# Native commands report failure through $LASTEXITCODE: keep $ErrorActionPreference at Continue,
# because with Stop, PowerShell 5.1 turns a redirected stderr line into a terminating error.

$Root = Split-Path -Parent $PSScriptRoot
$VenvDir = Join-Path $Root '.venv-evs'
$VenvPython = Join-Path $VenvDir 'Scripts\python.exe'
$EvsScript = Join-Path $Root 'scripts\evs.py'
$ElectronExe = Join-Path $Root 'node_modules\electron\dist\electron.exe'
$ElectronSig = "$ElectronExe.sig"
$SigBackupDir = Join-Path $Root '.state\installer'
$Launcher = Join-Path $Root 'TappedIn.cmd'
$NodeLink = 'https://nodejs.org/en/download'
$PythonLink = 'https://www.python.org/downloads/windows/ (pick Python 3.12)'

$script:Todo = 0

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "== $Text" -ForegroundColor Cyan
}
function Write-Ok([string]$Text) { Write-Host "   OK: $Text" -ForegroundColor Green }
function Write-Info([string]$Text) { Write-Host "   $Text" }
function Write-Todo([string]$Text) {
    $script:Todo++
    Write-Host "   TO DO: $Text" -ForegroundColor Yellow
}

# Stops the script with a plain-English problem and the fix.
function Stop-WithFix([string]$Problem, [string]$Fix) {
    Write-Host ''
    Write-Host "   PROBLEM: $Problem" -ForegroundColor Red
    Write-Host "   FIX: $Fix" -ForegroundColor Yellow
    exit 1
}

# Runs a program attached to this console (its prompts and progress show normally; it reads your answers
# itself) and returns its exit code.
function Invoke-Interactive([string]$File, [string[]]$Arguments) {
    $cmd = Get-Command $File -ErrorAction SilentlyContinue
    if ($cmd) { $File = $cmd.Source }
    $quoted = @($Arguments | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } })
    $p = Start-Process -FilePath $File -ArgumentList $quoted -WorkingDirectory $Root -NoNewWindow -Wait -PassThru
    return $p.ExitCode
}

# True only when the user types Y.
function Read-YesNo([string]$Question) {
    $answer = Read-Host "   $Question (Y/N)"
    return ("$answer".Trim() -ieq 'y')
}

# Picks up PATH changes from an installer that ran in this window.
function Update-SessionPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Get-NodeVersion {
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { return $null }
    $v = & node --version 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    return "$v".Trim()
}

function Get-Major([string]$Version) {
    if ($Version -match '^v?(\d+)\.') { return [int]$Matches[1] }
    return 0
}

# Full path of a Python 3.12 python.exe, or $null.
function Find-Python312 {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        $exe = & py -3.12 -c 'import sys; print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0 -and $exe) { return "$exe".Trim() }
    }
    if (Get-Command python -ErrorAction SilentlyContinue) {
        $out = & python -c 'import sys; print(sys.version_info[:2] == (3, 12)); print(sys.executable)' 2>$null
        if ($LASTEXITCODE -eq 0 -and $out -and "$($out[0])" -eq 'True') { return "$($out[1])".Trim() }
    }
    return $null
}

# Offers a winget install. Returns only when winget succeeded; otherwise stops with the download link.
function Install-WithWinget([string]$Name, [string]$Why, [string]$WingetId, [string]$Link) {
    Write-Info "$Name is not installed. $Why"
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        Stop-WithFix "$Name is not installed." "Install it from $Link, then double-click Setup TappedIn.cmd again."
    }
    if (-not (Read-YesNo 'Install it with winget now?')) {
        Stop-WithFix "$Name is not installed." "Install it from $Link, then double-click Setup TappedIn.cmd again."
    }
    # No --accept-* flags: winget shows its own agreement prompts and you answer them.
    $code = Invoke-Interactive 'winget' @('install', '--id', $WingetId, '--exact', '--source', 'winget')
    if ($code -ne 0) {
        Stop-WithFix "winget could not install $Name (exit code $code)." "Install it from $Link, then double-click Setup TappedIn.cmd again."
    }
    Update-SessionPath
}

function Get-ElectronVersion {
    $pkg = Join-Path $Root 'node_modules\electron\package.json'
    if (-not (Test-Path -LiteralPath $pkg)) { return $null }
    try { return (Get-Content -LiteralPath $pkg -Raw | ConvertFrom-Json).version } catch { return $null }
}

# Whether node_modules matches package-lock.json (scripts\doctor.ts --deps; read-only) and castLabs'
# electron.exe is really there (antivirus can quarantine it while the lockfiles still match).
function Test-DepsInSync {
    if (-not (Test-Path -LiteralPath $ElectronExe)) { return $false }
    if ("$(Get-ElectronVersion)" -notlike '*+wvcus*') { return $false }
    $tsx = Join-Path $Root 'node_modules\.bin\tsx.cmd'
    if (-not (Test-Path -LiteralPath $tsx)) { return $false }
    & $tsx (Join-Path $Root 'scripts\doctor.ts') --deps | Out-Null
    return ($LASTEXITCODE -eq 0)
}

# Same rule as the doctor: electron.exe.sig exists and is not older than electron.exe.
function Test-SignatureFresh {
    if (-not (Test-Path -LiteralPath $ElectronExe) -or -not (Test-Path -LiteralPath $ElectronSig)) { return $false }
    return ((Get-Item -LiteralPath $ElectronSig).LastWriteTime -ge (Get-Item -LiteralPath $ElectronExe).LastWriteTime)
}

# npm ci deletes node_modules, signature included. Keep a copy of a good signature with the hash of the
# electron.exe it signs, so an unchanged Electron doesn't need another upload to castLabs.
function Save-ElectronSignature {
    if (-not (Test-SignatureFresh)) { return }
    New-Item -ItemType Directory -Force -Path $SigBackupDir | Out-Null
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ElectronExe).Hash
    Copy-Item -LiteralPath $ElectronSig -Destination (Join-Path $SigBackupDir 'electron.exe.sig') -Force
    Set-Content -LiteralPath (Join-Path $SigBackupDir 'electron.exe.sha256') -Value $hash -Encoding ASCII
}

# Returns 'kept' (still there), 'restored' (same electron.exe, saved signature put back), 'changed'
# (electron.exe differs: sign again) or 'none' (nothing saved).
function Restore-ElectronSignature {
    if (Test-SignatureFresh) { return 'kept' }
    $savedSig = Join-Path $SigBackupDir 'electron.exe.sig'
    $savedHash = Join-Path $SigBackupDir 'electron.exe.sha256'
    if (-not (Test-Path -LiteralPath $savedSig) -or -not (Test-Path -LiteralPath $savedHash) -or -not (Test-Path -LiteralPath $ElectronExe)) { return 'none' }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ElectronExe).Hash
    if ($hash -ne (Get-Content -LiteralPath $savedHash -Raw).Trim()) { return 'changed' }
    Copy-Item -LiteralPath $savedSig -Destination $ElectronSig -Force
    # The file is byte-for-byte the one that was signed; mark the copy as newer than the fresh install.
    (Get-Item -LiteralPath $ElectronSig).LastWriteTime = Get-Date
    return 'restored'
}

# npm ci, keeping the Widevine signature when electron.exe didn't change. Returns Restore-ElectronSignature's result.
function Invoke-NpmCi {
    Save-ElectronSignature
    $env:TAPPEDIN_INSTALLER = '1'
    $code = Invoke-Interactive 'npm.cmd' @('ci')
    Remove-Item Env:\TAPPEDIN_INSTALLER -ErrorAction SilentlyContinue
    if ($code -ne 0) {
        Stop-WithFix "npm ci failed (exit code $code)." 'Close TappedIn if it is open (its files are in use), check your internet connection, and run this again.'
    }
    # castLabs Electron downloads electron.exe on first use, not during npm ci (same step as build-installer.ps1).
    $code = Invoke-Interactive 'node' @('node_modules\electron\install.js')
    if ($code -ne 0 -or -not (Test-Path -LiteralPath $ElectronExe)) {
        Stop-WithFix "Downloading castLabs Electron failed (exit code $code)." 'Check your internet connection and run this again.'
    }
    return (Restore-ElectronSignature)
}

function Invoke-SignElectron {
    Write-Info "Signing uploads electron.exe to castLabs' free EVS service and saves electron.exe.sig next to it."
    $code = Invoke-Interactive 'npm.cmd' @('run', 'sign-electron')
    if ($code -ne 0 -or -not (Test-SignatureFresh)) {
        Stop-WithFix 'Signing Electron did not finish.' 'Read the castLabs message above. If your EVS login expired, run Setup TappedIn.cmd again; if it says CERTIFICATE_VERIFY_FAILED, see "Norton or other antivirus" in README.md.'
    }
}

function Invoke-Doctor {
    if (-not (Test-Path -LiteralPath (Join-Path $Root 'node_modules\.bin\tsx.cmd'))) {
        Write-Info 'The check needs the app dependencies (npm ci) first.'
        return $false
    }
    return ((Invoke-Interactive 'npm.cmd' @('run', '-s', 'doctor')) -eq 0)
}
