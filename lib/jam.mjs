// language: JavaScript, file: lib/jam.mjs, target: Node.js 18+ (Node.js 21+ native WebSocket)
import EventEmitter from "node:events";

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
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
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

  getWsUrl(code) {
    return `wss://ntfy.sh/${this.getChannelName(code)}/ws`;
  }

  createJam() {
    this.leaveJam();
    this.code = generateJamCode();
    this.role = "host";
    this.connectWs();
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
    this.connectWs();
    return this.code;
  }

  connectWs() {
    if (!this.code) return;

    try {
      const url = this.getWsUrl(this.code);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.emit("connected", { code: this.code, role: this.role });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "message" && data.message) {
            const parsed = JSON.parse(data.message);
            this.emit("event", parsed);
          }
        } catch {}
      };

      this.ws.onerror = () => {
        this.isConnected = false;
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        if (this.isActive()) {
          this.reconnectTimer = setTimeout(() => this.connectWs(), 2000);
        }
      };
    } catch {
      if (this.isActive()) {
        this.reconnectTimer = setTimeout(() => this.connectWs(), 2000);
      }
    }
  }

  async broadcast(eventData) {
    if (!this.isActive() || !this.isHost()) return;

    try {
      const url = this.getPostUrl(this.code);
      const payload = {
        ...eventData,
        hostTimestamp: Date.now(),
      };

      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload),
      });
    } catch {}
  }

  leaveJam() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.code = null;
    this.role = null;
    this.isConnected = false;
  }
}

export const jam = new JamManager();
