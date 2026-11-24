// language: JavaScript, file: lib/resolver.mjs, target: Node.js
import { decryptDesEcbBase64 } from "./des.mjs";

export const streamRegistry = new Map();

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
  } catch (err) {
    // Silent fallback
  }
  return null;
}

export async function resolveJioSaavnByQuery(query) {
  try {
    const cleanQuery = query.replace(/^["']|["']$/g, "").trim();

    // 1. Direct search.getResults (returns direct duration, media url, and full metadata)
    const directRes = await fetch(
      `https://www.jiosaavn.com/api.php?__call=search.getResults&q=${encodeURIComponent(cleanQuery)}&_format=json&_marker=0&ctx=android`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (directRes.ok) {
      const directData = await directRes.json();
      const s = directData?.results?.[0];
      if (s?.id && s?.encrypted_media_url) {
        let dec = decryptDesEcbBase64(s.encrypted_media_url, "38346591");
        if (dec) {
          dec = dec.replace(/_(?:48|96|160)\.mp4/i, "_320.mp4");
          return {
            ok: true,
            id: `jiosaavn:${s.id}`,
            client: "JIOSAAVN",
            url: dec,
            title: s.song ? s.song.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&") : cleanQuery,
            author: s.primary_artists ? s.primary_artists.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&") : "Unknown Artist",
            duration: parseInt(s.duration, 10) || 0,
            mime: "audio/mp4",
            kbps: 320,
          };
        }
      }
    }

    // 2. Fallback to autocomplete.get
    const searchRes = await fetch(
      `https://www.jiosaavn.com/api.php?__call=autocomplete.get&query=${encodeURIComponent(cleanQuery)}&_format=json&_marker=0&ctx=android`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const hit = searchData?.songs?.data?.[0];
      if (hit?.id) {
        const resolved = await resolveJioSaavnById(hit.id);
        if (resolved) {
          if (!resolved.title && hit.title) {
            resolved.title = hit.title.replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&");
          }
          if (!resolved.author) {
            resolved.author = (hit.more_info?.primary_artists || hit.description || "Unknown Artist").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, "&");
          }
          return resolved;
        }
      }
    }
  } catch (err) {
    // Fallback
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

  // 1. Check if ID is JioSaavn directly
  if (idOrQuery.startsWith("jiosaavn:")) {
    const pid = idOrQuery.replace(/^jiosaavn:/, "");
    const jio = await resolveJioSaavnById(pid);
    if (jio?.url) return jio;
  }

  // 2. Try JioSaavn by title / query (320kbps Lossless AAC, instant CDN playback)
  const searchQuery = hintTitle || idOrQuery;
  const jioDirect = await resolveJioSaavnByQuery(searchQuery);
  if (jioDirect?.url) {
    return jioDirect;
  }

  // 3. Fallback: YouTube Innertube
  const cleanId = idOrQuery.replace(/^yt:/, "");
  try {
    const yt = await getServerInnertube();
    if (yt) {
      // If cleanId is an 11-char YouTube video ID
      if (/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
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
              title: info.basic_info?.title || searchQuery,
              author: info.basic_info?.author || "Unknown",
              duration: info.basic_info?.duration || 0,
              mime: "audio/mp4",
              kbps: 160,
            };
          }
        }
      } else {
        // Query search on YouTube
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
                author: video.author?.name || "Unknown",
                duration: video.duration?.seconds || 0,
                mime: "audio/mp4",
                kbps: 160,
              };
            }
          }
        }
      }
    }
  } catch (err) {}

  // 4. Fallback: Public audio mirrors
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanId)) {
    const tryMirror = async (mirrorUrl, extractFn) => {
      const r = await fetch(mirrorUrl, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Recoterminal/1.0" },
        signal: AbortSignal.timeout(3500),
      });
      if (!r.ok) throw new Error("Mirror failed");
      const data = await r.json();
      const audioUrl = extractFn(data);
      if (!audioUrl) throw new Error("No audio url");
      return {
        ok: true,
        id: cleanId,
        client: "MIRROR",
        url: audioUrl,
        title: searchQuery,
        author: "Unknown",
        duration: 0,
        mime: "audio/mp4",
        kbps: 128,
      };
    };

    try {
      return await Promise.any([
        tryMirror(`https://api.piped.private.coffee/streams/${cleanId}`, (d) => (d.audioStreams || []).find((x) => x.url)?.url),
        tryMirror(`https://inv.tux.pizza/api/v1/videos/${cleanId}`, (d) => (d.adaptiveFormats || []).find((x) => x.url && x.type?.startsWith("audio/"))?.url),
      ]);
    } catch {}
  }

  return null;
}
