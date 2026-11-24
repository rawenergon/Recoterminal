// language: JavaScript, file: lib/lastfm.mjs, target: Node.js 18+
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE_URL = "https://ws.audioscrobbler.com/2.0/";
const AUTH_URL = "https://www.last.fm/api/auth/";
export const DEFAULT_LASTFM_API_KEY = "9fdc4b5f03629cd7200b22602aa573c3";

function getStoragePath() {
  const dir = path.join(os.homedir(), ".recoterminal");
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, "credentials.json");
}

function loadStoredCredentials() {
  try {
    const file = getStoragePath();
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8");
      const data = JSON.parse(raw);
      return data.lastfm || {};
    }
  } catch {}
  return {};
}

function saveStoredCredentials(lastfmData) {
  try {
    const file = getStoragePath();
    let current = {};
    if (fs.existsSync(file)) {
      try {
        current = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {}
    }
    current.lastfm = lastfmData;
    fs.writeFileSync(file, JSON.stringify(current, null, 2), "utf8");
  } catch {}
}

export class LastFmClient {
  constructor() {
    const stored = loadStoredCredentials();
    this.apiKey = process.env.LASTFM_API_KEY || stored.apiKey || DEFAULT_LASTFM_API_KEY;
    this.apiSecret = process.env.LASTFM_API_SECRET || stored.apiSecret || "";
    this.sessionKey = stored.sessionKey || "";
    this.username = stored.username || "";
    this.scrobbleCount = 0;
  }

  setApiKey(key) {
    this.apiKey = (key || "").trim();
    saveStoredCredentials({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      sessionKey: this.sessionKey,
      username: this.username,
    });
  }

  setApiSecret(secret) {
    this.apiSecret = (secret || "").trim();
    saveStoredCredentials({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      sessionKey: this.sessionKey,
      username: this.username,
    });
  }

  setCredentials(apiKey, apiSecret) {
    if (apiKey) this.apiKey = apiKey.trim();
    if (apiSecret) this.apiSecret = apiSecret.trim();
    saveStoredCredentials({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      sessionKey: this.sessionKey,
      username: this.username,
    });
  }

  isConnected() {
    return Boolean(this.sessionKey && this.username);
  }

  getStatus() {
    return {
      connected: this.isConnected(),
      username: this.username || null,
      apiKey: this.apiKey ? `${this.apiKey.slice(0, 6)}...` : null,
      scrobblesThisSession: this.scrobbleCount,
    };
  }

  sign(params, secret) {
    const keys = Object.keys(params)
      .filter((k) => k !== "format" && k !== "callback" && k !== "api_sig")
      .sort();
    let s = "";
    for (const k of keys) {
      s += k + params[k];
    }
    s += secret || this.apiSecret;
    return crypto.createHash("md5").update(s, "utf8").digest("hex");
  }

  async call(method, params = {}, requireAuth = false) {
    const apiKey = params.api_key || this.apiKey;
    const apiSecret = params.api_secret || this.apiSecret;

    if (!apiKey) {
      throw new Error("Last.fm API key is not configured.");
    }

    const payload = {
      method,
      api_key: apiKey,
      ...params,
    };
    delete payload.api_secret;

    if (requireAuth) {
      if (!this.sessionKey) {
        throw new Error("No active Last.fm session. Run /connect lastfm first.");
      }
      payload.sk = this.sessionKey;
    }

    if (apiSecret) {
      payload.api_sig = this.sign(payload, apiSecret);
    }
    payload.format = "json";

    const formBody = new URLSearchParams();
    for (const [k, v] of Object.entries(payload)) {
      if (v !== undefined && v !== null) {
        formBody.append(k, String(v));
      }
    }

    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Recoterminal/1.0.4",
      },
      body: formBody.toString(),
    });

    const data = await res.json();
    if (data.error) {
      throw new Error(`Last.fm Error [${data.error}]: ${data.message}`);
    }
    return data;
  }

  async getAuthToken(customApiKey, customApiSecret) {
    const key = customApiKey || this.apiKey;
    const secret = customApiSecret || this.apiSecret;

    if (!key) {
      throw new Error("API Key is required to request auth token.");
    }

    const data = await this.call("auth.getToken", {
      api_key: key,
      api_secret: secret,
    });

    const token = data?.token;
    if (!token) throw new Error("Failed to obtain auth token from Last.fm.");

    const url = `${AUTH_URL}?api_key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
    return { token, url, apiKey: key, apiSecret: secret };
  }

  async completeSession(token, apiKey, apiSecret) {
    const key = apiKey || this.apiKey;
    const secret = apiSecret || this.apiSecret;

    const data = await this.call("auth.getSession", {
      token,
      api_key: key,
      api_secret: secret,
    });

    const session = data?.session;
    if (!session?.key || !session?.name) {
      throw new Error("Invalid session response received from Last.fm.");
    }

    this.apiKey = key;
    this.apiSecret = secret;
    this.sessionKey = session.key;
    this.username = session.name;

    saveStoredCredentials({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      sessionKey: this.sessionKey,
      username: this.username,
    });

    return {
      username: this.username,
      sessionKey: this.sessionKey,
    };
  }

  setManualSession(sessionKey, username, apiKey = "", apiSecret = "") {
    this.sessionKey = sessionKey.trim();
    this.username = (username || "User").trim();
    if (apiKey) this.apiKey = apiKey.trim();
    if (apiSecret) this.apiSecret = apiSecret.trim();

    saveStoredCredentials({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      sessionKey: this.sessionKey,
      username: this.username,
    });

    return { username: this.username, sessionKey: this.sessionKey };
  }

  disconnect() {
    this.sessionKey = "";
    this.username = "";
    saveStoredCredentials({
      apiKey: this.apiKey,
      apiSecret: this.apiSecret,
      sessionKey: "",
      username: "",
    });
  }

  async updateNowPlaying(track) {
    if (!this.isConnected() || !track?.title) return;

    try {
      const artist = track.author || "Unknown Artist";
      const title = track.title;
      const duration = track.duration && track.duration > 0 ? Math.floor(track.duration) : undefined;

      const params = {
        artist,
        track: title,
      };
      if (duration) params.duration = duration;

      await this.call("track.updateNowPlaying", params, true);
    } catch {}
  }

  async scrobble(track, startedAtEpochSeconds) {
    if (!this.isConnected() || !track?.title) return;

    try {
      const artist = track.author || "Unknown Artist";
      const title = track.title;
      const timestamp = startedAtEpochSeconds || Math.floor(Date.now() / 1000);
      const duration = track.duration && track.duration > 0 ? Math.floor(track.duration) : undefined;

      const params = {
        artist,
        track: title,
        timestamp,
      };
      if (duration) params.duration = duration;

      await this.call("track.scrobble", params, true);
      this.scrobbleCount += 1;
    } catch {}
  }
}

export const lastfm = new LastFmClient();
