// language: JavaScript, file: lib/resolver.mjs, target: Node.js
import { decryptDesEcbBase64 } from "./des.mjs";

export const streamRegistry = new Map();

function cleanTokens(str) {
  if (!str) return [];
  return str.toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !["by", "ft", "feat", "song", "audio", "video", "full", "official", "the", "in", "of", "and"].includes(t));
}

function isRemixOrMashup(title, originalQuery) {
  const qLower = (originalQuery || "").toLowerCase();
  const tLower = (title || "").toLowerCase();
  if (!qLower.includes("mashup") && tLower.includes("mashup")) return true;
  if (!qLower.includes("remix") && (tLower.includes("remix") || tLower.includes("dj "))) return true;
  return false;
}

export function scoreCandidate(userQuery, candidateTitle, candidateArtist) {
  if (isRemixOrMashup(candidateTitle, userQuery)) return 0;

  let titlePart = userQuery;
  let artistPart = "";
  if (/\s+by\s+/i.test(userQuery)) {
    const parts = userQuery.split(/\s+by\s+/i);
    titlePart = parts[0];
    artistPart = parts.slice(1).join(" ");
  }

  // Synonym normalization
  titlePart = titlePart.replace(/\bbarish\b/gi, "barsaat");

  const qTitleTokens = cleanTokens(titlePart);
  const qArtistTokens = cleanTokens(artistPart);
  const candTitleTokens = cleanTokens(candidateTitle);
  const candArtistTokens = cleanTokens(candidateArtist);

  let titleMatches = 0;
  for (const q of qTitleTokens) {
    if (candTitleTokens.some((t) => t === q || (q.length > 3 && t.startsWith(q)) || (t.length > 3 && q.startsWith(t)))) {
      titleMatches++;
    }
  }

  // Critical rule: Must match at least one requested title word to avoid random artist mashups
  if (qTitleTokens.length > 0 && titleMatches === 0) {
    return 0;
  }

  let artistMatches = 0;
  for (const q of qArtistTokens) {
    if (candArtistTokens.some((a) => a === q || (q.length > 3 && a.startsWith(q)) || (a.length > 3 && q.startsWith(a)))) {
      artistMatches++;
    }
  }

  const titleScore = qTitleTokens.length > 0 ? (titleMatches / qTitleTokens.length) : 0;
  const artistScore = qArtistTokens.length > 0 ? (artistMatches / qArtistTokens.length) : 0;

  return titleScore * 0.7 + artistScore * 0.3;
}

export async function smartSearch(rawQuery) {
  if (!rawQuery) return null;
  const clean = rawQuery.replace(/^["']|["']$/g, "").trim();

  const variants = [];
  const syn = clean.replace(/\bbarish\b/gi, "barsaat");
  variants.push(syn);
  if (syn !== clean) variants.push(clean);

  // Google spellcheck & entity autocorrect
  try {
    const res = await fetch("https://suggestqueries.google.com/complete/search?client=chrome&q=" + encodeURIComponent(clean), {
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data[1]) && data[1].length > 0) {
        variants.push(data[1][0]);
      }
    }
  } catch {}

  // Strip 'by <artist>'
  if (/\s+by\s+/i.test(clean)) {
    const [tPart] = clean.split(/\s+by\s+/i);
    if (tPart) {
      variants.push(tPart.trim());
      variants.push(tPart.trim().replace(/\bbarish\b/gi, "barsaat"));
    }
  }

  const seenIds = new Set();
  const allCandidates = [];

  for (const v of variants) {
    try {
      const res = await fetch(
        `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${encodeURIComponent(v)}&_format=json&_marker=0&ctx=android`,
        { signal: AbortSignal.timeout(3500) }
      );
      if (res.ok) {
        const data = await res.json();
        for (const item of (data?.results || [])) {
          if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            const score = scoreCandidate(clean, item.song, item.primary_artists);
            if (score > 0) {
              allCandidates.push({
                id: item.id,
                title: item.song ? item.song.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&") : clean,
                author: item.primary_artists ? item.primary_artists.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&") : "Unknown Artist",
                duration: parseInt(item.duration, 10) || 0,
                score,
              });
            }
          }
        }
      }
    } catch {}
  }

  if (allCandidates.length > 0) {
    allCandidates.sort((a, b) => b.score - a.score);
    return allCandidates[0];
  }

  return null;
}

export async function resolveJioSaavnById(pid) {
  try {
    const detailRes = await fetch(
      `https://www.jiosaavn.com/api.php?__call=song.getDetails&pids=${encodeURIComponent(pid)}&_format=json&_marker=0&ctx=android`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!detailRes.ok) return null;
    const detailData = await detailRes.json();
    const song = detailData[pid];
    const enc = song?.encrypted_media_url;
    if (enc) {
      let dec = decryptDesEcbBase64(enc, "38346591");
      if (dec) {
        dec = dec.replace(/_(?:48|96|160)\.mp4/i, "_320.mp4");
        return {
          ok: true,
          id: `jiosaavn:${pid}`,
          client: "JIOSAAVN",
          url: dec,
          title: song.song ? song.song.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&") : "",
          author: song.primary_artists ? song.primary_artists.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&") : "",
          duration: parseInt(song.duration, 10) || 0,
          mime: "audio/mp4",
          kbps: 320,
        };
      }
    }
  } catch (err) {}
  return null;
}

export async function resolveJioSaavnByQuery(query) {
  const hit = await smartSearch(query);
  if (hit?.id) {
    const resolved = await resolveJioSaavnById(hit.id);
    if (resolved) {
      if (!resolved.title && hit.title) resolved.title = hit.title;
      if (!resolved.author && hit.author) resolved.author = hit.author;
      if (!resolved.duration && hit.duration) resolved.duration = hit.duration;
      return resolved;
    }
  }
  return null;
}

let serverInnertube = null;
export async function getServerInnertube() {
  if (!serverInnertube) {
    let Innertube, Platform;
    try {
      const mod = await import("youtubei.js");
      Innertube = mod.Innertube;
      Platform = mod.Platform;
    } catch {
      try {
        const { createRequire } = await import("node:module");
        const { pathToFileURL } = await import("node:url");
        const require = createRequire(import.meta.url);
        const resolvedPath = require.resolve("youtubei.js");
        const mod = await import(pathToFileURL(resolvedPath).href);
        Innertube = mod.Innertube;
        Platform = mod.Platform;
      } catch (err) {
        return null;
      }
    }
    if (Platform?.shim) {
      Platform.shim.eval = (data, env) => {
        const fn = new Function(...Object.keys(env), data.output);
        return fn(...Object.values(env));
      };
    }
    if (Innertube) {
      serverInnertube = await Innertube.create({ retrieve_player: true });
    }
  }
  return serverInnertube;
}

export async function resolveStream(idOrQuery, hintTitle = "") {
  if (!idOrQuery) return null;

  // 1. If explicit JioSaavn ID
  if (idOrQuery.startsWith("jiosaavn:")) {
    const pid = idOrQuery.replace(/^jiosaavn:/, "");
    const jio = await resolveJioSaavnById(pid);
    if (jio?.url) return jio;
  }

  // 2. If explicit 11-char YouTube ID (resolve directly, do NOT hijack with query search)
  const cleanId = idOrQuery.replace(/^yt:/, "");
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    try {
      const yt = await getServerInnertube();
      if (yt) {
        const info = await yt.getInfo(cleanId);
        const format = info.chooseFormat({ type: "audio", quality: "best" });
        if (format?.decipher) {
          const url = await format.decipher(yt.session.player);
          if (url) {
            return {
              ok: true,
              id: cleanId,
              client: "YOUTUBE",
              url,
              title: info.basic_info?.title || hintTitle || cleanId,
              author: info.basic_info?.author || "YouTube",
              duration: info.basic_info?.duration || 0,
              mime: "audio/mp4",
              kbps: 160,
            };
          }
        }
      }
    } catch {}
  }

  // 3. Smart Search query against JioSaavn (320 kbps Lossless AAC)
  const searchQuery = hintTitle || idOrQuery;
  const jioDirect = await resolveJioSaavnByQuery(searchQuery);
  if (jioDirect?.url) {
    return jioDirect;
  }

  // 4. YouTube fallback search
  try {
    const yt = await getServerInnertube();
    if (yt) {
      const search = await yt.search(searchQuery, { type: "video" });
      const video = search?.videos?.[0];
      if (video?.id) {
        const info = await yt.getInfo(video.id);
        const format = info.chooseFormat({ type: "audio", quality: "best" });
        if (format?.decipher) {
          const url = await format.decipher(yt.session.player);
          if (url) {
            return {
              ok: true,
              id: video.id,
              client: "YOUTUBE",
              url,
              title: video.title?.text || searchQuery,
              author: video.author?.name || "YouTube",
              duration: video.duration?.seconds || 0,
              mime: "audio/mp4",
              kbps: 160,
            };
          }
        }
      }
    }
  } catch {}

  return null;
}
