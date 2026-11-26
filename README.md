# 🎵 Recoterminal

> **Fast, calm, ad-free music in your terminal.**  
> Studio-grade 320 kbps Lossless AAC audio with zero tracking and zero ads.

```text
    ____  __________ ____   ᵛ¹·⁰·⁷
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
*(Automatically sets up Node.js, FFmpeg audio engine, and Recoterminal with native phone media support).*

### 📦 Cross-Platform via npm
```bash
npm install -g "https://github.com/rawenergon/Recoterminal/releases/download/latest/recoterminal.tgz"
```

---

## 🚀 Interactive OpenCode Dashboard (v1.0.7)

Run `reco` to launch the interactive live TUI:
```bash
reco
```

```text
╭────────────────────────────────────────────────────────────────╮
│ ♫  RECOTERMINAL ᵛ¹·⁰·⁷                          ● 320 KBPS AAC │
├────────────────────────────────────────────────────────────────┤
│ Title:   Dil Galti Kar Baitha Hai (Feat. Mouni Roy)            │
│ Artist:  Jubin Nautiyal, Meet Bros, Shardul Rathod             │
│ Audio:   Studio Quality • 320 kbps [Lossless AAC]              │
│                                                                │
│ ▶ PLAYING 01:23 ━━━━━━━━━━━●───────────────── 03:45 (37%)      │
│ Wave:     ▃▅▆▇▆▅▃     Vol: [████████░░] 80%                  │
│ Status:  ● Jam [X9K2] (Host) • Radio: OFF • Last.fm: @dj       │
├────────────────────────────────────────────────────────────────┤
│ [Space] Pause/Play  [↑/↓] Vol  [←/→] Seek  [n] Next  [d] Save   │
│ [a] Radio        [j] Jam  [l] Lastfm [/] Search [q] Quit       │
╰────────────────────────────────────────────────────────────────╯

reco ❯ 
```

### ⌨️ Instant Hotkeys (Zero Typing Required)
- **`[Space]`**: Pause / Resume audio instantly.
- **`[↑ / ↓]`**: Smooth volume adjustment in 5% increments.
- **`[← / →]`**: Seek audio position 10s backward or forward.
- **`[n]`**: Skip to next track.
- **`[d]`**: Instantly download currently playing song to phone/PC.
- **`[a]`**: Toggle continuous radio auto-play mode.
- **`[j]`**: Create or join a Jam synchronized room.
- **`[l]`**: View Last.fm profile & scrobbler status.
- **`[m]`**: Quick Mute / Unmute.
- **`[/]`**: Open command/search prompt (`/play "song"`, `/import`, etc.).
- **`[q]`**: Quit Recoterminal gracefully.

---

## 👥 Live Synchronized Jam Sessions (v1.0.7)

Listen to music together in real time across phones and PCs with zero configuration:

1. **Host a Jam Session**:
   Press `[j]` or type `/create jam` in your terminal. You'll receive a unique 4-character room code (e.g. `X9K2`).
2. **Invite Friends**:
   Your friends anywhere in the world join via `/join jam X9K2`.
3. **Instant Live Catch-Up & Sync**:
   The moment a friend joins, they immediately start hearing what you're listening to at the exact same second. Pauses, resumes, skips, and seeks sync live in real time!

---

## ⬇️ 320 kbps Offline Song Downloader

Download any Master Quality 320 kbps AAC song (in `.mp4` format):
```bash
reco /download "Dil Galti Kar Baitha Hai"
```
Or while playing, press `[d]`:
- **Desktop (Windows/macOS/Linux)**: Saved to your system `Music` or `Downloads` folder.
- **Phone (Termux)**: Saved directly to `~/storage/shared/Music` and automatically launched in Android's default music player via `termux-open`.

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
