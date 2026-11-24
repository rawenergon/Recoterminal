// language: JavaScript, file: lib/terminal-player.mjs, target: Node.js CLI
import readline from "node:readline";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CliAudioPlayer } from "./player.mjs";
import { resolveStream, getServerInnertube, smartSearch } from "./resolver.mjs";
import { lastfm, DEFAULT_LASTFM_API_KEY, DEFAULT_LASTFM_API_SECRET, cleanCredential, isValidHex32 } from "./lastfm.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const O = "\x1b[38;5;208m"; // Vivid Orange
const O_BRIGHT = "\x1b[38;5;214m"; // Amber Orange
const R = "\x1b[0m"; // Reset

function formatTime(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]|\x1b\([a-zA-Z]/g, "");
}

function getVisualWidth(str) {
  const clean = stripAnsi(str);
  let w = 0;
  for (const ch of clean) {
    const code = ch.codePointAt(0);
    if (code >= 0xfe00 && code <= 0xfe0f) continue;
    if (
      (code >= 0x1f000 && code <= 0x1ffff) ||
      (code >= 0x23e9 && code <= 0x23ff) ||
      (code >= 0x2b50 && code <= 0x2b55) ||
      (code >= 0x1100 && code <= 0x11ff) ||
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

function padLine(str, width) {
  const w = getVisualWidth(str);
  if (w > width) {
    const clean = stripAnsi(str);
    return clean.slice(0, width - 3) + "...";
  }
  return str + " ".repeat(Math.max(0, width - w));
}

function boxRow(content, width = 54) {
  return `${O}│${R} ${padLine(content, width)} ${O}│${R}`;
}

function openBrowser(url) {
  try {
    if (process.platform === "win32") {
      execSync(`start "" "${url}"`, { stdio: "ignore" });
    } else if (process.platform === "darwin") {
      execSync(`open "${url}"`, { stdio: "ignore" });
    } else if (process.env.TERMUX_VERSION) {
      execSync(`termux-open-url "${url}"`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open "${url}"`, { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

export class TerminalPlayer {
  constructor() {
    this.player = new CliAudioPlayer();
    this.queue = [];
    this.currentIndex = -1;
    this.autoPlay = false;
    this.currentTrack = null;
    this.currentPosition = 0;
    this.currentDuration = 0;
    this.isResolving = false;
    this.rl = null;
    this.trackStartedAt = 0;
    this.hasScrobbled = false;

    this.player.on("ended", () => {
      this.handleSongEnded();
    });

    this.player.on("timeupdate", ({ position, duration }) => {
      this.currentPosition = position;
      if (duration > 0) this.currentDuration = duration;

      if (this.currentTrack) {
        const t1 = formatTime(this.currentPosition);
        const t2 = formatTime(this.currentDuration || this.currentTrack.duration);
        try {
          process.stdout.write(`\x1b]0;▶ ${this.currentTrack.title} [${t1} / ${t2}] - Reco\x07`);
        } catch {}

        // Standard Last.fm scrobble trigger: 50% or 240 seconds
        if (!this.hasScrobbled && this.currentPosition >= 30) {
          const dur = this.currentDuration || this.currentTrack.duration || 0;
          if (dur > 0 && (this.currentPosition >= dur * 0.5 || this.currentPosition >= 240)) {
            this.hasScrobbled = true;
            lastfm.scrobble(this.currentTrack, this.trackStartedAt);
          }
        }
      }
    });
  }

  buildPrompt() {
    return `${O}reco >${R} `;
  }

  updatePrompt() {
    if (this.rl) {
      this.rl.setPrompt(this.buildPrompt());
    }
  }

  askQuestion(query) {
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve("");
        return;
      }
      this.rl.question(query, (ans) => {
        resolve((ans || "").trim());
      });
    });
  }

  renderCard() {
    if (!this.currentTrack) {
      console.log("\x1b[90mNo track currently loaded. Type /play \"song name\" to start.\x1b[0m\n");
      return;
    }
    const W = 54;
    const track = this.currentTrack;
    const pos = Math.max(0, Math.floor(this.currentPosition || 0));
    const dur = Math.max(0, Math.floor(this.currentDuration || (track ? track.duration : 0) || 0));
    const barLen = 18;
    const t1 = formatTime(pos);

    let bar = "";
    let t2 = "--:--";
    let pctText = "";

    if (dur > 0) {
      // IF song has duration metadata:
      t2 = formatTime(dur);
      const pct = Math.min(1, Math.max(0, pos / dur));
      pctText = `${O_BRIGHT}(${Math.round(pct * 100)}%)${R}`;
      const filled = Math.min(barLen, Math.max(0, Math.round(pct * barLen)));
      const filledBar = O + "━".repeat(Math.max(0, filled - 1)) + (filled > 0 ? "●" : "") + R;
      const emptyBar = "\x1b[90m" + "─".repeat(Math.max(0, barLen - filled)) + R;
      bar = filledBar + emptyBar;
    } else {
      // IF song does not have duration metadata: do NOT default to 3:30!
      t2 = "--:--";
      pctText = "\x1b[90m(TIMER)\x1b[0m";
      const tick = pos % barLen;
      const tickBar = "\x1b[90m" + "─".repeat(tick) + R + O + "●" + R + "\x1b[90m" + "─".repeat(Math.max(0, barLen - tick - 1)) + R;
      bar = tickBar;
    }

    const t = track.title.length > 44 ? track.title.slice(0, 41) + "..." : track.title;
    const a = (track.author || "Reco").length > 44 ? (track.author || "Reco").slice(0, 41) + "..." : (track.author || "Reco");

    const stateBadge = this.player.state === "playing" 
      ? `${O}▶ PLAYING${R}` 
      : this.player.state === "paused" 
        ? "\x1b[33m❚❚ PAUSED\x1b[0m" 
        : "\x1b[90m■ STOPPED\x1b[0m";
    const radioBadge = this.autoPlay ? `${O_BRIGHT}[RADIO ON]${R}` : "\x1b[90m[RADIO OFF]\x1b[0m";

    console.log(`\n${O}┌` + "─".repeat(W + 2) + `┐${R}`);
    const headerTitle = `\x1b[1m${O}♫  RECO TERMINAL PLAYER ${O_BRIGHT}ᵛ¹·⁰·⁴${R}`;
    const hSpaces = W - getVisualWidth(headerTitle) - getVisualWidth(radioBadge);
    console.log(boxRow(headerTitle + " ".repeat(Math.max(0, hSpaces)) + radioBadge, W));
    console.log(`${O}├` + "─".repeat(W + 2) + `┤${R}`);
    console.log(boxRow(`\x1b[90mTitle:\x1b[0m  \x1b[1m${t}\x1b[0m`, W));
    console.log(boxRow(`\x1b[90mArtist:\x1b[0m \x1b[37m${a}\x1b[0m`, W));
    console.log(boxRow(`\x1b[90mAudio:\x1b[0m  ${O}Master Quality • 320 kbps [Lossless AAC]${R}`, W));
    console.log(boxRow("", W));
    console.log(boxRow(`${stateBadge} ${t1} ${bar} ${t2} ${pctText}`, W));

    const lfmInfo = lastfm.isConnected()
      ? `${O_BRIGHT}♫ Last.fm: @${lastfm.username}${R}`
      : `\x1b[90m/connect lastfm for scrobbling\x1b[0m`;
    console.log(boxRow(`\x1b[90mVol: ${this.player.volume}% • \x1b[0m${lfmInfo}`, W));
    console.log(`${O}└` + "─".repeat(W + 2) + `┘${R}\n`);
  }

  printBanner() {
    console.log(`
${O}    ____  __________ ____  ${O_BRIGHT} ᵛ¹·⁰·⁴${R}
${O}   / __ \\/ ____/ ____/ __ \\${R}
${O}  / /_/ / __/ / /   / / / /${R}   \x1b[90mStudio-grade 320 kbps Lossless AAC\x1b[0m
${O} / _, _/ /___/ /___/ /_/ / ${R}   \x1b[90mZero ads • Zero tracking\x1b[0m
${O}/_/ |_/_____/\\____/\\____/  ${R}`);
    if (lastfm.isConnected()) {
      console.log(`  ${O_BRIGHT}● Last.fm Connected: @${lastfm.username} (Scrobbling Active)${R}`);
    }
    console.log(`\n  Type ${O}/play "song name"${R} to listen, ${O}/auto${R} for radio, ${O}/help${R} for commands.\n`);
  }

  printHelp() {
    const W = 54;
    console.log(`\n${O}┌` + "─".repeat(W + 2) + `┐${R}`);
    console.log(boxRow("\x1b[1mCommand Reference:\x1b[0m", W));
    console.log(`${O}├` + "─".repeat(W + 2) + `┤${R}`);
    const commands = [
      ["/play [song]", "Search and play song in terminal"],
      ["/now, /status", "Show song progress card"],
      ["/pause, /resume", "Pause or resume playback"],
      ["/stop", "Stop playback and clear queue"],
      ["/next, /skip", "Skip to next song in queue"],
      ["/auto", "Toggle continuous smart radio"],
      ["/volume <0-100>", "Set playback volume (e.g. /vol 80)"],
      ["/connect lastfm", "Link Last.fm profile for scrobble"],
      ["/lastfm", "Show Last.fm scrobbler status"],
      ["/disconnect", "Disconnect Last.fm scrobbler"],
      ["/queue", "Show upcoming songs queue"],
      ["/import [url]", "Import Spotify album or playlist"],
      ["/update", "Update player to latest version"],
      ["/help", "Display this reference guide"],
      ["/exit", "Exit player"]
    ];
    for (const [cmd, desc] of commands) {
      const left = "  " + O + cmd.padEnd(16) + R + " " + desc;
      console.log(boxRow(left, W));
    }
    console.log(`${O}└` + "─".repeat(W + 2) + `┘${R}\n`);
  }

  printLastFmStatus() {
    const status = lastfm.getStatus();
    const W = 54;
    console.log(`\n${O}┌` + "─".repeat(W + 2) + `┐${R}`);
    console.log(boxRow("\x1b[1m♫  Last.fm Connector Status\x1b[0m", W));
    console.log(`${O}├` + "─".repeat(W + 2) + `┤${R}`);
    if (status.connected) {
      console.log(boxRow(`Status:    \x1b[32m● Connected\x1b[0m`, W));
      console.log(boxRow(`Account:   ${O}@${status.username}${R}`, W));
      if (status.apiKey) {
        console.log(boxRow(`API Key:   \x1b[90m${status.apiKey}\x1b[0m`, W));
      }
      console.log(boxRow(`Scrobbles: ${status.scrobblesThisSession} tracks scrobbled this session`, W));
      console.log(boxRow(`Command:   Type /disconnect lastfm to unlink`, W));
    } else {
      console.log(boxRow(`Status:    \x1b[90m○ Disconnected\x1b[0m`, W));
      console.log(boxRow(`Connect:   Type ${O}/connect lastfm${R} to link your profile`, W));
    }
    console.log(`${O}└` + "─".repeat(W + 2) + `┘${R}\n`);
  }

  async handleLastFmConnect(rawInput) {
    if (lastfm.isConnected()) {
      console.log(`\n${O}♫ Already connected to Last.fm as @${lastfm.username}.${R}`);
      console.log(`Type \x1b[33m/disconnect lastfm\x1b[0m to unlink this account.\n`);
      return;
    }

    const parts = (rawInput || "").trim().split(/\s+/);
    if (parts.includes("--session")) {
      const idx = parts.indexOf("--session");
      const sessKey = cleanCredential(parts[idx + 1]) || (parts[idx + 1] || "").trim();
      const uname = (parts[idx + 2] || "User").replace(/^[\[<"']+|[\]>"']+$/g, "").trim();
      if (!sessKey) {
        console.log("\x1b[31m✖ Usage: /connect lastfm --session <session_key> [username]\x1b[0m\n");
        return;
      }
      lastfm.setManualSession(sessKey, uname);
      console.log(`\n\x1b[32m✔ Connected to Last.fm as @${uname} via session key!\x1b[0m`);
      console.log(`Credentials saved in ~/.recoterminal/credentials.json\n`);
      return;
    }

    // Extract potential apiKey and apiSecret passed inline:
    // e.g. /connect lastfm 78542bbb88ff3effc6d905cae1234729 [secret]
    let inlineArgs = parts.slice(1);
    if (inlineArgs[0]?.toLowerCase() === "lastfm") {
      inlineArgs = inlineArgs.slice(1);
    }

    let inlineKeyRaw = inlineArgs[0] && !inlineArgs[0].startsWith("-") ? inlineArgs[0].trim() : null;
    let inlineSecretRaw = inlineArgs[1] && !inlineArgs[1].startsWith("-") ? inlineArgs[1].trim() : null;

    let inlineKey = inlineKeyRaw ? cleanCredential(inlineKeyRaw) : null;
    let inlineSecret = inlineSecretRaw ? cleanCredential(inlineSecretRaw) : null;

    if (inlineKeyRaw && !isValidHex32(inlineKey)) {
      console.log(`\n\x1b[33mℹ Note: "${inlineKeyRaw}" is not a 32-character hex key. Using Recoterminal default.\x1b[0m`);
      inlineKey = null;
    }
    if (inlineSecretRaw && !isValidHex32(inlineSecret)) {
      console.log(`\n\x1b[33mℹ Note: "${inlineSecretRaw}" is not a 32-character hex secret. Using Recoterminal default.\x1b[0m`);
      inlineSecret = null;
    }

    let apiKey = inlineKey || lastfm.apiKey || DEFAULT_LASTFM_API_KEY;
    let apiSecret = inlineSecret || lastfm.apiSecret || DEFAULT_LASTFM_API_SECRET;

    if (inlineKey) lastfm.setApiKey(inlineKey);
    if (inlineSecret) lastfm.setApiSecret(inlineSecret);

    const W = 54;
    try {
      console.log(`\n${O}🔄 Requesting authorization token from Last.fm...${R}`);
      const { token, url } = await lastfm.getAuthToken(apiKey, apiSecret);

      console.log(`\n${O}┌` + "─".repeat(W + 2) + `┐${R}`);
      console.log(boxRow("\x1b[1m♫  AUTHORIZE RECOTERMINAL IN BROWSER\x1b[0m", W));
      console.log(`${O}├` + "─".repeat(W + 2) + `┤${R}`);
      console.log(boxRow("Opening browser to authorize Recoterminal...", W));
      console.log(boxRow("If browser does not open automatically, visit:", W));
      console.log(boxRow(`  ${url.slice(0, 50)}...`, W));
      console.log(boxRow("1. Click 'Yes, allow access' on the Last.fm page.", W));
      console.log(boxRow("2. Return here and press [Enter].", W));
      console.log(`${O}└` + "─".repeat(W + 2) + `┘${R}\n`);

      openBrowser(url);

      await this.askQuestion("Press [Enter] after allowing access on Last.fm: ");

      console.log(`\n${O}🔄 Finalizing Last.fm session authorization...${R}`);
      const session = await lastfm.completeSession(token, apiKey, apiSecret);

      console.log(`\n\x1b[32m✔ Successfully connected to Last.fm as @${session.username}!${R}`);
      console.log(`Credentials saved to ~/.recoterminal/credentials.json`);
      console.log(`Live music scrobbling is now active for all played songs.\n`);
    } catch (err) {
      console.error(`\n\x1b[31m✖ Last.fm connection failed:\x1b[0m`, err?.message || err);
      console.log(`\x1b[90mTip: Ensure you clicked 'Yes, allow access' on the Last.fm web page before pressing Enter.\x1b[0m\n`);
    }
  }

  async searchTrack(query) {
    if (!query) return null;
    const cleanQuery = query.replace(/^["']|["']$/g, "").trim();

    // 1. Primary: Smart Relevancy Search (handles typos, 'by <artist>', synonyms, filters remixes/mashups)
    try {
      const hit = await smartSearch(cleanQuery);
      if (hit?.id) {
        return {
          id: `jiosaavn:${hit.id}`,
          title: hit.title,
          author: hit.author,
          duration: hit.duration,
          query: cleanQuery,
        };
      }
    } catch {}

    // 2. Secondary: YouTube search fallback
    try {
      const yt = await getServerInnertube();
      if (yt) {
        const search = await yt.search(cleanQuery, { type: "video" });
        const video = search?.videos?.[0];
        if (video?.id) {
          return {
            id: video.id,
            title: video.title?.text || cleanQuery,
            author: video.author?.name || "Unknown Artist",
            duration: video.duration?.seconds || 0,
            query: cleanQuery,
          };
        }
      }
    } catch {}
    return null;
  }

  async playTrack(track) {
    if (!track) return;

    if (!track.id && track.query) {
      console.log(`\n${O}🔍 Resolving track audio for:${R} \x1b[1m${track.title || track.query}\x1b[0m...`);
      const hit = await this.searchTrack(track.query);
      if (hit) {
        Object.assign(track, hit);
      } else {
        console.log(`\x1b[31m✖ Could not find audio for:\x1b[0m ${track.title || track.query}`);
        this.handleSongEnded();
        return;
      }
    }

    if (!track.id) return;
    this.currentTrack = track;
    this.currentPosition = 0;
    this.currentDuration = track.duration || 0;
    this.trackStartedAt = Math.floor(Date.now() / 1000);
    this.hasScrobbled = false;

    console.log(`\n${O}▶ Resolving audio stream for:${R} \x1b[1m${track.title}\x1b[0m...`);

    const res = await resolveStream(track.id, track.title || track.query);
    if (!res?.url) {
      console.log(`\x1b[31m✖ Could not resolve audio stream for:\x1b[0m ${track.title}`);
      if (this.autoPlay) {
        setTimeout(() => this.handleSongEnded(), 1500);
      }
      return;
    }

    // Preserve true metadata from resolved stream if present
    if (res.duration && res.duration > 0) {
      track.duration = res.duration;
    }
    if (res.title && (!track.title || track.title === track.query)) {
      track.title = res.title;
    }
    if (res.author && (!track.author || track.author === "Unknown Artist")) {
      track.author = res.author;
    }

    this.currentDuration = track.duration || 0;
    this.player.duration = this.currentDuration;
    this.player.play(res.url);

    // Update Last.fm Now Playing status
    lastfm.updateNowPlaying(track);

    this.renderCard();
    this.updatePrompt();
  }

  async handleSongEnded() {
    if (!this.hasScrobbled && this.currentTrack && this.currentPosition >= 30) {
      this.hasScrobbled = true;
      lastfm.scrobble(this.currentTrack, this.trackStartedAt);
    }

    if (this.queue.length > 0 && this.currentIndex < this.queue.length - 1) {
      this.currentIndex += 1;
      const nextTrack = this.queue[this.currentIndex];
      console.log(`\n${O}⏭ Advancing to next track:${R} \x1b[1m${nextTrack.title}\x1b[0m`);
      await this.playTrack(nextTrack);
    } else if (this.autoPlay && this.currentTrack) {
      console.log(`\n${O_BRIGHT}📻 Finding next recommendation for:${R} ${this.currentTrack.title}...`);
      try {
        const res = await fetch(
          `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(this.currentTrack.author || "trending hits")}&_format=json&_marker=0&ctx=android`,
          { signal: AbortSignal.timeout(3000) }
        );
        if (res.ok) {
          const d = await res.json();
          const songs = d?.songs?.data || [];
          const candidates = songs.filter((s) => `jiosaavn:${s.id}` !== this.currentTrack.id);
          const next = candidates[Math.floor(Math.random() * Math.min(candidates.length, 5))];
          if (next?.id) {
            const track = {
              id: `jiosaavn:${next.id}`,
              title: next.title ? next.title.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&") : "Recommended Track",
              author: (next.more_info?.primary_artists || next.description || "Reco Radio").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&"),
              duration: parseInt(next.more_info?.duration, 10) || 0,
            };
            await this.playTrack(track);
            return;
          }
        }
      } catch {}
      console.log("\x1b[90m[Radio] End of recommendations.\x1b[0m");
    } else {
      console.log("\n\x1b[90m[Queue Finished] Type /play \"<song>\" or /auto to start again.\x1b[0m\n");
    }
  }

  async importSpotifyUrl(url) {
    try {
      console.log(`\n${O}🔍 Inspecting Spotify link:${R} ${url}...`);
      let cleanUrl = url.trim().replace(/^['"]|['"]$/g, "");
      const match = cleanUrl.match(/spotify\.com\/(album|playlist|track)\/([a-zA-Z0-9]+)/);
      if (!match) {
        console.log("\x1b[31m✖ Invalid Spotify link.\x1b[0m Expected: https://open.spotify.com/album/... or playlist/...");
        return;
      }

      const [, kind, id] = match;
      const embedUrl = `https://open.spotify.com/embed/${kind}/${id}`;
      const res = await fetch(embedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      const html = await res.text();
      const idx = html.indexOf("__NEXT_DATA__");
      if (idx === -1) {
        console.log("\x1b[31m✖ Could not read public Spotify metadata.\x1b[0m");
        return;
      }

      const start = html.indexOf(">", idx) + 1;
      const end = html.indexOf("</script>", start);
      const data = JSON.parse(html.slice(start, end));
      const entity = data.props?.pageProps?.state?.data?.entity;

      if (!entity) {
        console.log("\x1b[31m✖ No album/playlist entity found in Spotify response.\x1b[0m");
        return;
      }

      const albumName = entity.name || "Imported Album";
      const rawTracks = entity.trackList || (entity.tracks?.items ? entity.tracks.items.map((i) => i.track || i) : []);

      console.log(`\n${O}=======================================================${R}`);
      console.log(`  \x1b[1m💿 IMPORTED ${kind.toUpperCase()}:\x1b[0m ${O}${albumName}${R} (${rawTracks.length} tracks)`);
      console.log(`${O}=======================================================${R}`);

      const importedTracks = [];
      for (let i = 0; i < rawTracks.length; i++) {
        const t = rawTracks[i];
        const title = t.title || t.name;
        const artist = t.subtitle || (Array.isArray(t.artists) ? t.artists.map((a) => a.name).join(", ") : "");
        console.log(`  \x1b[33m[${i + 1}]\x1b[0m ${title} \x1b[90m- ${artist}\x1b[0m`);
        importedTracks.push({
          query: `${title} ${artist}`.trim(),
          title,
          author: artist,
        });
      }
      console.log(`${O}=======================================================${R}\n`);

      if (importedTracks.length === 0) return;

      console.log(`▶ Resolving and starting track 1/${importedTracks.length}: \x1b[1m${importedTracks[0].title}\x1b[0m...`);
      const firstHit = await this.searchTrack(importedTracks[0].query);
      if (firstHit) {
        this.queue = [];
        this.queue.push(firstHit);

        for (let i = 1; i < importedTracks.length; i++) {
          this.queue.push({
            id: null,
            query: importedTracks[i].query,
            title: importedTracks[i].title,
            author: importedTracks[i].author,
            duration: 0,
          });
        }
        this.currentIndex = 0;
        await this.playTrack(firstHit);
      }
    } catch (err) {
      console.error("\x1b[31m✖ Import failed:\x1b[0m", err?.message);
    }
  }

  async updateSelf() {
    console.log(`\n${O}🔄 Checking for Recoterminal updates...${R}`);
    try {
      const releaseApi = "https://api.github.com/repos/rawenergon/Recoterminal/releases/latest";
      const res = await fetch(releaseApi, {
        headers: { "User-Agent": "Recoterminal-Updater" },
        signal: AbortSignal.timeout(4000),
      });

      if (!res.ok) {
        console.log("[*] Fetching latest package release directly...");
        if (process.platform === "win32") {
          execSync('powershell -NoProfile -Command "irm https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.ps1 | iex"', { stdio: "inherit" });
        } else {
          execSync('curl -fsSL https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.sh | bash', { stdio: "inherit" });
        }
        console.log(`\n\x1b[32m✔ Recoterminal updated successfully!${R}\n`);
        return;
      }

      const release = await res.json();
      const tag = release.tag_name || "latest";
      console.log(`[*] Latest release found: \x1b[1m${tag}\x1b[0m`);

      const tgzAsset = (release.assets || []).find((a) => a.name.endsWith(".tgz"));
      const tgzUrl = tgzAsset?.browser_download_url || `https://github.com/rawenergon/Recoterminal/releases/download/${tag}/recoterminal.tgz`;

      console.log(`[*] Updating via npm global install: ${tgzUrl}...`);
      execSync(`npm install -g "${tgzUrl}" --force`, { stdio: "inherit" });
      console.log(`\n\x1b[32m✔ Recoterminal successfully updated to ${tag}!${R}\n`);
    } catch (err) {
      console.error("\x1b[31m✖ Update failed:\x1b[0m", err?.message);
      console.log("You can manually update anytime with:");
      if (process.platform === "win32") {
        console.log("  irm https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.ps1 | iex\n");
      } else {
        console.log("  curl -fsSL https://raw.githubusercontent.com/rawenergon/Recoterminal/main/install.sh | bash\n");
      }
    }
  }

  async executeCommand(rawInput) {
    const input = rawInput.trim();
    if (!input) return;

    // 1. /help
    if (input === "/help" || input === "help") {
      this.printHelp();
      return;
    }

    // Version
    if (input === "/version" || input === "version" || input === "-v" || input === "--version") {
      this.printBanner();
      return;
    }

    // 2. /update
    if (input === "/update" || input === "update") {
      await this.updateSelf();
      return;
    }

    // 3. /now or /status
    if (input === "/now" || input === "now" || input === "/status" || input === "status") {
      this.renderCard();
      return;
    }

    // 4. Last.fm integration
    if (input.startsWith("/connect") || input === "/lastfm connect") {
      await this.handleLastFmConnect(input);
      return;
    }

    if (input === "/disconnect" || input === "/disconnect lastfm" || input === "/lastfm disconnect") {
      lastfm.disconnect();
      console.log(`\n\x1b[32m✔ Last.fm disconnected.\x1b[0m Scrobbles disabled.\n`);
      return;
    }

    if (input === "/lastfm" || input === "/lastfm status") {
      this.printLastFmStatus();
      return;
    }

    // 5. /stop
    if (input === "/stop" || input === "stop") {
      this.player.stop();
      this.autoPlay = false;
      this.queue = [];
      this.currentTrack = null;
      console.log("\x1b[31m■ Playback stopped.\x1b[0m\n");
      this.updatePrompt();
      return;
    }

    // 6. /pause
    if (input === "/pause" || input === "pause") {
      this.player.pause();
      this.renderCard();
      this.updatePrompt();
      return;
    }

    // 7. /resume
    if (input === "/resume" || input === "resume") {
      this.player.resume();
      this.renderCard();
      this.updatePrompt();
      return;
    }

    // 8. /auto
    if (input === "/auto" || input === "auto") {
      this.autoPlay = !this.autoPlay;
      if (this.autoPlay) {
        console.log(`${O_BRIGHT}📻 Continuous Radio: ON${R} (Songs will play back-to-back continuously).\n`);
        if (!this.currentTrack || this.player.state === "stopped") {
          console.log("Searching trending music to begin...");
          const track = await this.searchTrack("top global hits music");
          if (track) await this.playTrack(track);
        }
      } else {
        console.log("\x1b[90m📻 Continuous Radio: OFF\x1b[0m\n");
      }
      this.updatePrompt();
      return;
    }

    // 9. /volume <val>
    if (input.startsWith("/volume") || input.startsWith("/vol")) {
      const val = parseInt(input.replace(/(\/volume|\/vol)/, "").trim(), 10);
      if (!isNaN(val)) {
        this.player.setVolume(val);
        console.log(`${O}🔊 Volume set to ${val}%${R}\n`);
        this.renderCard();
      }
      return;
    }

    // 10. /queue
    if (input === "/queue" || input === "queue") {
      if (this.queue.length === 0) {
        console.log("\x1b[90mQueue is empty.\x1b[0m\n");
      } else {
        console.log(`\n${O}Upcoming Queue:${R}`);
        this.queue.forEach((t, idx) => {
          const prefix = idx === this.currentIndex ? `${O}▶ ${R}` : "  ";
          console.log(`${prefix}[${idx + 1}] ${t.title} - \x1b[90m${t.author || ""}\x1b[0m`);
        });
        console.log("");
      }
      return;
    }

    // 11. /next
    if (input === "/next" || input === "next" || input === "/skip" || input === "skip") {
      console.log(`${O}⏭ Skipping to next track...${R}`);
      this.handleSongEnded();
      return;
    }

    // 12. play import url "<url>" OR /import "<url>"
    const importMatch = input.match(/^(?:play\s+import\s+url|\/import)\s+["']?([^"'\s]+)["']?/i);
    if (importMatch) {
      await this.importSpotifyUrl(importMatch[1]);
      return;
    }

    // 13. /play "<song name>" or play <song name>
    const playMatch = input.match(/^(?:\/play|play)\s+(.+)$/i);
    if (playMatch) {
      const query = playMatch[1].replace(/^["']|["']$/g, "").trim();
      console.log(`\n${O}🔍 Searching for:${R} "${query}"...`);
      const track = await this.searchTrack(query);
      if (!track) {
        console.log(`\x1b[31m✖ No song found matching:\x1b[0m "${query}"\n`);
        return;
      }
      this.queue = [track];
      this.currentIndex = 0;
      await this.playTrack(track);
      return;
    }

    // 14. /exit or /quit
    if (input === "/exit" || input === "exit" || input === "/quit" || input === "quit") {
      this.player.destroy();
      console.log("\x1b[90mGoodbye from Recoterminal!\x1b[0m\n");
      process.exit(0);
    }

    // Default fallback: search and play
    console.log(`\n${O}🔍 Searching for:${R} "${input}"...`);
    const track = await this.searchTrack(input);
    if (track) {
      this.queue = [track];
      this.currentIndex = 0;
      await this.playTrack(track);
    } else {
      console.log(`\x1b[31m✖ Unknown command or song:\x1b[0m ${input}. Type \x1b[33m/help\x1b[0m for usage.\n`);
    }
  }

  startInteractive(showBanner = true) {
    if (showBanner) {
      this.printBanner();
    }

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.buildPrompt(),
    });

    this.rl.prompt();

    this.rl.on("line", async (line) => {
      await this.executeCommand(line);
      if (this.rl) {
        this.rl.setPrompt(this.buildPrompt());
        this.rl.prompt();
      }
    });

    this.rl.on("close", () => {
      this.player.destroy();
      console.log("\n\x1b[90mRecoterminal closed.\x1b[0m\n");
      process.exit(0);
    });
  }
}
