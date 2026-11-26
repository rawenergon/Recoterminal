// language: JavaScript, file: lib/downloader.mjs, target: Node.js 18+
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { resolveStream } from "./resolver.mjs";

const O = "\x1b[38;5;208m"; // Vivid Orange
const O_BRIGHT = "\x1b[38;5;214m"; // Amber
const R = "\x1b[0m";

export function isTermux() {
  return Boolean(
    process.env.TERMUX_VERSION ||
    process.env.PREFIX?.includes("com.termux") ||
    fs.existsSync("/data/data/com.termux")
  );
}

export function getDownloadDirectory() {
  if (isTermux()) {
    // Termux storage paths (accessible by Android media scanner and music apps)
    const termuxMusic = path.join(os.homedir(), "storage", "shared", "Music");
    if (fs.existsSync(termuxMusic)) return termuxMusic;

    const termuxDownloads = path.join(os.homedir(), "storage", "shared", "Download");
    if (fs.existsSync(termuxDownloads)) return termuxDownloads;

    const localMusic = path.join(os.homedir(), "music");
    try {
      if (!fs.existsSync(localMusic)) fs.mkdirSync(localMusic, { recursive: true });
      return localMusic;
    } catch {}

    return process.cwd();
  }

  // Windows, macOS, Linux desktop paths
  const userMusic = path.join(os.homedir(), "Music");
  if (fs.existsSync(userMusic)) return userMusic;

  const userDownloads = path.join(os.homedir(), "Downloads");
  if (fs.existsSync(userDownloads)) return userDownloads;

  return process.cwd();
}

export function sanitizeFilename(str) {
  if (!str) return "Track";
  return str
    .replace(/[/\\?%*:|"<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sendToPhonePlayer(target) {
  if (!isTermux()) return false;
  try {
    if (target.startsWith("http://") || target.startsWith("https://")) {
      execSync(`termux-open-url "${target}"`, { stdio: "ignore" });
    } else {
      execSync(`termux-open "${target}"`, { stdio: "ignore" });
    }
    return true;
  } catch {
    return false;
  }
}

export async function downloadSong(queryOrTrack, options = {}) {
  let stream = null;

  if (typeof queryOrTrack === "string") {
    console.log(`\n${O}🔍 Searching for high-quality audio stream:${R} \x1b[1m${queryOrTrack}\x1b[0m...`);
    stream = await resolveStream(queryOrTrack);
  } else if (queryOrTrack && typeof queryOrTrack === "object") {
    if (queryOrTrack.url) {
      stream = queryOrTrack;
    } else {
      console.log(`\n${O}🔍 Resolving stream for:${R} \x1b[1m${queryOrTrack.title || queryOrTrack.query}\x1b[0m...`);
      stream = await resolveStream(queryOrTrack.id || queryOrTrack.query, queryOrTrack.title);
    }
  }

  if (!stream?.url) {
    throw new Error(`Could not resolve audio stream for "${typeof queryOrTrack === 'string' ? queryOrTrack : queryOrTrack?.title || 'requested song'}"`);
  }

  const title = stream.title || "Unknown Title";
  const artist = stream.author || "Unknown Artist";
  const kbps = stream.kbps || 320;

  console.log(`${O}▶ Found Master Quality stream:${R} \x1b[1m${title}\x1b[0m by \x1b[37m${artist}\x1b[0m • ${kbps} kbps AAC`);

  const downloadDir = getDownloadDirectory();
  const safeTitle = sanitizeFilename(title);
  const safeArtist = sanitizeFilename(artist);
  const baseName = `${safeTitle} - ${safeArtist}.mp4`;
  const targetPath = path.join(downloadDir, baseName);

  console.log(`${O}⬇ Starting download to:${R} \x1b[90m${targetPath}\x1b[0m`);

  const res = await fetch(stream.url);
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status} failed while fetching audio stream.`);
  }

  const totalBytes = parseInt(res.headers.get("content-length") || "0", 10);
  const fileStream = fs.createWriteStream(targetPath);
  const reader = res.body.getReader();

  let downloadedBytes = 0;
  const barWidth = 24;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    fileStream.write(value);
    downloadedBytes += value.length;

    if (totalBytes > 0) {
      const pct = Math.min(1, downloadedBytes / totalBytes);
      const filled = Math.round(barWidth * pct);
      const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
      const mbCurr = (downloadedBytes / (1024 * 1024)).toFixed(1);
      const mbTot = (totalBytes / (1024 * 1024)).toFixed(1);
      const pctStr = `${Math.round(pct * 100)}%`.padStart(4);
      process.stdout.write(`\r  ${O}⬇ [${bar}] ${pctStr}${R} \x1b[90m(${mbCurr} MB / ${mbTot} MB)\x1b[0m`);
    } else {
      const mbCurr = (downloadedBytes / (1024 * 1024)).toFixed(1);
      process.stdout.write(`\r  ${O}⬇ Downloading...${R} \x1b[90m(${mbCurr} MB)\x1b[0m`);
    }
  }

  fileStream.end();
  process.stdout.write("\n");

  const finalMb = (downloadedBytes / (1024 * 1024)).toFixed(2);

  // On Termux / Android: send directly to phone media player
  let sentToPhone = false;
  if (isTermux()) {
    sentToPhone = sendToPhonePlayer(targetPath);
  }

  return {
    ok: true,
    title,
    artist,
    kbps,
    path: targetPath,
    filename: baseName,
    sizeMb: finalMb,
    sentToPhone,
    isTermux: isTermux(),
  };
}
