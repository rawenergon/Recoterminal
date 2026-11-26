// language: JavaScript, file: lib/jam.mjs, target: Node.js 18+ (All platforms & Android Termux)
import EventEmitter from "node:events";
import dns from "node:dns";

// Prefer IPv4 first to prevent 10s connect timeouts on dual-stack/mobile networks
try {
  dns.setDefaultResultOrder("ipv4first");
} catch {}

const CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 32 unambiguous chars

export function generateJamCode() {
  let code = "";
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(Math.random() * CODE_CHARS.length);
    code += CODE_CHARS[idx];
  }
  return code;
}

export function cleanJamCode(input) {
  if (!input || typeof input !== "string") return "";
  let clean = input.trim().toUpperCase();
  clean = clean.replace(/[^A-Z0-9]/g, "");
  return clean.slice(0, 4);
}

export class JamManager extends EventEmitter {
  constructor() {
    super();
    this.code = null;
    this.role = null; // 'host' | 'listener' | null
    this.isConnected = false;
    this.abortController = null;
    this.reconnectTimer = null;
    this.lastProcessedId = null;
  }

  isHost() {
    return this.role === "host";
  }

  isListener() {
    return this.role === "listener";
  }

  isActive() {
    return Boolean(this.code && this.role);
  }

  getChannelName(code) {
    const c = (code || this.code || "").toUpperCase();
    return `recoterminal-jam-${c}`;
  }

  getPostUrl(code) {
    return `https://ntfy.sh/${this.getChannelName(code)}`;
  }

  getStreamUrl(code) {
    return `https://ntfy.sh/${this.getChannelName(code)}/json`;
  }

  getPollUrl(code) {
    return `https://ntfy.sh/${this.getChannelName(code)}/json?poll=1`;
  }

  createJam() {
    this.leaveJam();
    this.code = generateJamCode();
    this.role = "host";
    this.startListenerStream();
    return this.code;
  }

  async joinJam(code) {
    this.leaveJam();
    const clean = cleanJamCode(code);
    if (!clean || clean.length !== 4) {
      throw new Error(`Invalid Jam code "${code}". Must be a 4-character code (e.g. X9K2).`);
    }

    this.code = clean;
    this.role = "listener";

    // 1. Immediately poll latest cached state to catch whatever host is currently playing
    await this.syncLatestCachedState();

    // 2. Start live streaming SSE loop
    this.startListenerStream();

    // 3. Request live sync from host
    this.broadcast({ type: "sync_request" });

    return this.code;
  }

  async syncLatestCachedState() {
    if (!this.code) return;
    try {
      const res = await fetch(this.getPollUrl(this.code), {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) return;

      const text = await res.text();
      const lines = text.trim().split("\n").filter(Boolean);

      let latestMessage = null;
      for (const line of lines) {
        try {
          const d = JSON.parse(line);
          if (d.event === "message" && d.message) {
            this.lastProcessedId = d.id;
            latestMessage = JSON.parse(d.message);
          }
        } catch {}
      }

      if (latestMessage && this.isListener()) {
        this.emit("event", latestMessage);
      }
    } catch {}
  }

  startListenerStream() {
    if (!this.code) return;

    if (this.abortController) {
      try { this.abortController.abort(); } catch {}
    }
    this.abortController = new AbortController();

    (async () => {
      while (this.isActive()) {
        try {
          const url = this.getStreamUrl(this.code);
          const res = await fetch(url, {
            signal: this.abortController.signal,
          });

          if (!res.ok || !res.body) {
            throw new Error(`Stream HTTP ${res.status}`);
          }

          this.isConnected = true;
          this.emit("connected", { code: this.code, role: this.role });

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (this.isActive()) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop(); // keep remainder

            for (const line of lines) {
              const clean = line.trim();
              if (!clean) continue;
              try {
                const data = JSON.parse(clean);
                if (data.event === "message" && data.message) {
                  if (data.id && data.id === this.lastProcessedId) {
                    continue; // Skip already processed cached message
                  }
                  this.lastProcessedId = data.id;
                  const parsed = JSON.parse(data.message);
                  this.emit("event", parsed);
                }
              } catch {}
            }
          }
        } catch (err) {
          if (err.name === "AbortError" || !this.isActive()) {
            break;
          }
          this.isConnected = false;
          // Wait 1.5 seconds before reconnecting
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    })();
  }

  async broadcast(eventData) {
    if (!this.isActive()) return;

    try {
      const url = this.getPostUrl(this.code);
      const payload = {
        ...eventData,
        senderRole: this.role,
        hostTimestamp: Date.now(),
      };

      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
    } catch {}
  }

  leaveJam() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {}
      this.abortController = null;
    }
    this.code = null;
    this.role = null;
    this.isConnected = false;
    this.lastProcessedId = null;
  }
}

export const jam = new JamManager();
