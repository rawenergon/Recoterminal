#!/usr/bin/env bash
# Recoterminal Installer for macOS & Linux
# Run: curl -fsSL https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.sh | bash

set -e

echo ""
echo "======================================================="
echo "  🎵  Recoterminal - Installer & Updater"
echo "======================================================="
echo ""

# 1. Check Node.js
if ! command -v node >/dev/null 2>&1; then
    echo "[!] Node.js is required. Please install Node.js 20+ from https://nodejs.org/"
    exit 1
fi

# 2. Check audio engine
if [ "$(uname)" = "Darwin" ]; then
    echo "[*] macOS detected: native afplay engine ready."
else
    if ! command -v ffplay >/dev/null 2>&1; then
        echo "[*] Installing ffmpeg/ffplay for audio playback..."
        if command -v apt-get >/dev/null 2>&1; then
            sudo apt-get update -qq && sudo apt-get install -y ffmpeg
        elif command -v dnf >/dev/null 2>&1; then
            sudo dnf install -y ffmpeg
        elif command -v pacman >/dev/null 2>&1; then
            sudo pacman -S --noconfirm ffmpeg
        fi
    fi
fi

# 3. Install globally via npm
echo "[*] Installing / Updating Recoterminal CLI globally..."
RELEASE_URL="https://github.com/rawenergon/Recoterminal/releases/download/latest/recoterminal.tgz"

if curl -sLf "$RELEASE_URL" -o /tmp/recoterminal.tgz 2>/dev/null; then
    npm install -g /tmp/recoterminal.tgz --force
    rm -f /tmp/recoterminal.tgz
else
    npm install -g "https://github.com/rawenergon/Recoterminal.git" --force
fi

echo ""
echo "======================================================="
echo "  ✔ Recoterminal installed successfully!"
echo "======================================================="
echo ""
echo "Commands you can run anytime:"
echo "  reco                        Launch interactive player"
echo '  reco /play "song name"      Search and play immediately'
echo "  reco /auto                  Play continuous radio"
echo '  reco /import "<spotify>"    Import Spotify playlist/album'
echo "  reco /update                Update to latest version"
echo "  reco /help                  Show all commands"
echo ""

reco /help
