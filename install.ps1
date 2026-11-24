# Recoterminal Installer for Windows
# Run: irm https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$O = "$([char]27)[38;5;208m"
$R = "$([char]27)[0m"

Write-Host ""
Write-Host "${O}=======================================================${R}"
Write-Host "${O}  🎵  Recoterminal - Installer & Updater for Windows${R}"
Write-Host "${O}=======================================================${R}"
Write-Host ""

# 1. Verify Node.js is installed
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Node.js is required. Installing Node.js LTS via winget..." -ForegroundColor Yellow
    try {
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } catch {
        Write-Host "[!] Could not auto-install Node.js. Please download from https://nodejs.org/" -ForegroundColor Red
        exit 1
    }
}

# 2. Check ffplay audio engine
if (-not (Get-Command ffplay -ErrorAction SilentlyContinue)) {
    Write-Host "[*] Setting up high-performance audio engine (ffplay)..." -ForegroundColor Yellow
    try {
        winget install Gyan.FFmpeg --silent --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    } catch {
        Write-Host "[!] Note: PowerShell MediaPlayer fallback will be used if ffplay is absent." -ForegroundColor DarkGray
    }
}

# 3. Download and install Recoterminal
Write-Host "[*] Installing / Updating Recoterminal CLI globally..." -ForegroundColor Cyan

$releaseUrl = "https://github.com/rawenergon/Recoterminal/releases/download/latest/recoterminal.tgz"
$tempTgz = Join-Path $env:TEMP "recoterminal.tgz"

try {
    Invoke-WebRequest -Uri $releaseUrl -OutFile $tempTgz -UseBasicParsing -ErrorAction Stop
    npm install -g $tempTgz --force
    Remove-Item -Path $tempTgz -Force -ErrorAction SilentlyContinue
} catch {
    # If GitHub release asset is building, install directly from git repo
    Write-Host "[*] Installing directly from repository..." -ForegroundColor Yellow
    npm install -g "https://github.com/rawenergon/Recoterminal.git" --force
}

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  ✔ Recoterminal installed successfully!" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Commands you can run anytime:" -ForegroundColor Cyan
Write-Host "  reco                        Launch interactive player" -ForegroundColor White
Write-Host '  reco /play "song name"      Search and play immediately' -ForegroundColor White
Write-Host "  reco /auto                  Play continuous radio" -ForegroundColor White
Write-Host '  reco /import "<spotify>"    Import Spotify playlist/album' -ForegroundColor White
Write-Host "  reco /update                Update to latest version" -ForegroundColor White
Write-Host "  reco /help                  Show all commands" -ForegroundColor White
Write-Host ""
Write-Host "Launching Recoterminal now..." -ForegroundColor Yellow
Write-Host ""

reco /help
