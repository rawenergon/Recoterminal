# 🎵 Recoterminal

> **Fast, calm, ad-free music in your terminal.**  
> Studio-grade 320 kbps Lossless AAC audio with zero tracking and zero ads.

```text
    ____  __________ ____   ᵛ¹·⁰·⁶
   / __ \/ ____/ ____/ __ \
  / /_/ / __/ / /   / / / /   Studio-grade 320 kbps Lossless AAC
 / _, _/ /___/ /___/ /_/ /    Zero ads • Zero tracking
/_/ |_/_____/\____/\____/  
```

---

## ⚡ Quick Install

### 🪟 Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.ps1 | iex
```

### 🍎 macOS & 🐧 Linux (Terminal)
```bash
curl -fsSL https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.sh | bash
```

### 📱 Android (Termux)
In the Termux app on your phone, paste this single line:
```bash
curl -fsSL https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.sh | bash
```
*(Automatically sets up Node.js, FFmpeg audio engine, and Recoterminal).*

### 📦 Cross-Platform via npm
```bash
npm install -g "https://github.com/rawenergon/Recoterminal/releases/download/latest/recoterminal.tgz"
```

---

## 🚀 How to Play

### 1. Direct Command Line Playback
Play any song directly from your terminal:
```bash
reco /play "Starboy The Weeknd"
```
Or start continuous smart radio mode:
```bash
reco /auto
```
Or import an entire Spotify album or playlist:
```bash
reco /import "https://open.spotify.com/album/4yP0hdKOZPNshxUOjY0cZj"
```

### 2. Interactive Terminal Player
Run `reco` to enter the interactive console:
```bash
reco
```

Inside the player, you get a beautiful vibrant orange status card with song details and progress:
```text
┌────────────────────────────────────────────────────────┐
│ ♫  RECO TERMINAL PLAYER ᵛ¹·⁰·⁶             [RADIO OFF] │
├────────────────────────────────────────────────────────┤
│ Title:  Sajan Sajan Teri Dulhan                        │
│ Artist: Anu Malik, Alka Yagnik                         │
│ Audio:  Master Quality • 320 kbps [Lossless AAC]       │
│                                                        │
│ ▶ PLAYING 01:23 ━━━━━●──────────── 03:30 (39%)         │
│ Vol: 100% • ♫ Last.fm: @dj                             │
└────────────────────────────────────────────────────────┘

reco > 
```

### 3. Download Songs for Offline Playback (v1.0.6)
Download any 320 kbps Master Quality AAC song (in `.mp4` container) with real-time download progress:
```bash
reco /download "Starboy The Weeknd"
```
Or while listening inside `reco`, simply type:
```text
reco > /download
```
- **On Desktop (Windows/macOS/Linux)**: Saved directly to your system `Music` or `Downloads` folder.
- **On Phone (Termux)**: Saved directly to `~/storage/shared/Music` and automatically dispatched to Android's default media player via `termux-open`.

---

## 👥 Live Synchronized Jam Sessions (v1.0.5)

Listen to music together in real time with zero configuration and zero setup:

1. **Host a Jam Session**:
   Type `/create jam` in your terminal. You'll receive a unique 4-character room code (e.g. `X9K2`).
2. **Invite Friends**:
   Your friends anywhere in the world join via `/join jam X9K2`.
3. **Real-time Synchronization**:
   Whenever the host plays a song, pauses, resumes, or skips, all listeners play along in real time!

---

## 🎮 Command Reference

| Command | Action |
|---|---|
| `/play "<song>"` | Search and play any song instantly |
| `/download [song]` | **Download 320 kbps Master MP4 song to device / phone** |
| `/now` or `/status` | Redraw the current song status card |
| `/pause` / `/resume` | Pause or resume audio playback |
| `/stop` | Stop playback and clear the queue |
| `/next` or `/skip` | Skip to the next song in the queue |
| `/auto` | Toggle continuous smart radio mode |
| `/volume <0-100>` | Adjust volume (e.g. `/volume 80`) |
| `/create jam` | **Host a live synchronized Jam session (gives 4-digit code)** |
| `/join jam <code>` | **Join a Jam room via 4-character code (live real-time sync)** |
| `/leave jam` | Leave Jam session and return to solo playback |
| `/jam` | Show Jam room code, role, and connected status |
| `/connect lastfm [key] [secret]` | **Connect Last.fm for scrobbling (saves to local storage)** |
| `/lastfm` | Show Last.fm scrobbler status & stats |
| `/disconnect` | Disconnect Last.fm account |
| `/queue` | View upcoming tracks in the queue |
| `/import <spotify-url>` | Import full Spotify playlist or album |
| `/update` | **Auto-update Recoterminal to the latest release** |
| `/help` | Show command reference |
| `/exit` | Exit the player |

---

## 🔄 Easy Updates

Updating Recoterminal is effortless. You have two options:

### Option 1: In-App Update Command
Inside the player or CLI, simply run:
```bash
reco /update
```
Recoterminal will automatically fetch the latest release from GitHub, install it in place, and reload!

### Option 2: 1-Line Terminal Re-run
Re-running the installation command automatically updates Recoterminal to the newest build:
```powershell
# Windows
irm https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.ps1 | iex
```
```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.sh | bash
```

---

## 🛡️ License
GPL-3.0-only. Built with care by [rawenergon](https://github.com/rawenergon).
