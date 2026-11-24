// language: JavaScript, file: lib/player.mjs, target: Node.js (Windows/macOS/Linux)
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";

export class CliAudioPlayer extends EventEmitter {
  constructor() {
    super();
    this.platform = process.platform;
    this.process = null;
    this.state = "stopped"; // "playing" | "paused" | "stopped"
    this.duration = 0;
    this.position = 0;
    this.currentUrl = null;
    this.volume = 90;
    this.manuallyKilled = false;
  }

  play(url, startSeconds = 0) {
    // Safely detach and kill previous process without emitting phantom 'ended' events
    if (this.process) {
      const oldProc = this.process;
      this.process = null;
      try {
        oldProc.removeAllListeners("close");
        oldProc.removeAllListeners("error");
        oldProc.kill();
      } catch {}
    }

    this.manuallyKilled = false;
    this.currentUrl = url;
    this.position = startSeconds;
    this.state = "playing";

    if (this.platform === "win32") {
      // Use ffplay with -stats and -v 0 to stream real-time playback timestamps on stderr
      const args = ["-nodisp", "-autoexit", "-stats", "-v", "0", "-volume", String(this.volume)];
      if (startSeconds > 0) {
        args.push("-ss", String(startSeconds));
      }
      args.push(url);

      try {
        const proc = spawn("ffplay", args, {
          stdio: ["ignore", "ignore", "pipe"],
        });
        this.process = proc;

        proc.on("error", (err) => {
          if (this.process !== proc) return;
          console.warn("\x1b[33m[Audio Engine]\x1b[0m ffplay error, trying PowerShell fallback...", err?.message);
          this.playPowerShell(url, startSeconds);
        });

        let lastEmit = 0;
        proc.stderr.on("data", (data) => {
          if (this.process !== proc) return;
          const text = data.toString();
          // Match ffplay progress lines: "   1.95 M-A:  0.000 fd=   0" or "  12.34 A-V:"
          const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s+[MA]-/);
          if (match) {
            const pos = parseFloat(match[1]);
            if (!isNaN(pos) && pos >= 0) {
              this.position = Math.round(pos * 10) / 10;
              const now = Date.now();
              if (now - lastEmit >= 400) {
                lastEmit = now;
                this.emit("timeupdate", { position: this.position, duration: this.duration });
              }
            }
          }
        });

        proc.on("close", (code) => {
          if (this.process !== proc) return;
          this.process = null;
          if (this.state === "playing" && !this.manuallyKilled) {
            this.state = "stopped";
            this.emit("ended");
          }
        });

        this.emit("playing");
      } catch (err) {
        this.playPowerShell(url, startSeconds);
      }
    } else if (this.platform === "darwin") {
      const proc = spawn("afplay", [url], { stdio: "ignore" });
      this.process = proc;
      this.emit("playing");
      proc.on("close", () => {
        if (this.process !== proc) return;
        this.process = null;
        if (this.state === "playing" && !this.manuallyKilled) {
          this.state = "stopped";
          this.emit("ended");
        }
      });
    } else {
      // Linux
      const args = ["-nodisp", "-autoexit", "-stats", "-v", "0", "-volume", String(this.volume), url];
      const proc = spawn("ffplay", args, { stdio: ["ignore", "ignore", "pipe"] });
      this.process = proc;
      this.emit("playing");
      let lastEmit = 0;
      proc.stderr.on("data", (data) => {
        if (this.process !== proc) return;
        const text = data.toString();
        const match = text.match(/([0-9]+(?:\.[0-9]+)?)\s+[MA]-/);
        if (match) {
          const pos = parseFloat(match[1]);
          if (!isNaN(pos) && pos >= 0) {
            this.position = Math.round(pos * 10) / 10;
            const now = Date.now();
            if (now - lastEmit >= 400) {
              lastEmit = now;
              this.emit("timeupdate", { position: this.position, duration: this.duration });
            }
          }
        }
      });
      proc.on("close", () => {
        if (this.process !== proc) return;
        this.process = null;
        if (this.state === "playing" && !this.manuallyKilled) {
          this.state = "stopped";
          this.emit("ended");
        }
      });
    }
  }

  playPowerShell(url, startSeconds = 0) {
    const ps = `
Add-Type -AssemblyName PresentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$p.Volume = ${this.volume / 100}
$p.Open([Uri]'${url}')
$p.Play()
if (${startSeconds} -gt 0) {
  $p.Position = [TimeSpan]::FromSeconds(${startSeconds})
}
while ($true) {
  Start-Sleep -Milliseconds 500
  if ($p.NaturalDuration.HasTimeSpan) {
    $dur = $p.NaturalDuration.TimeSpan.TotalSeconds
    $pos = $p.Position.TotalSeconds
    [Console]::Out.WriteLine("POS:" + $pos + ":" + $dur)
    if ($pos -ge $dur - 1 -and $dur -gt 5) { break }
  }
}
`;
    const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    this.process = proc;
    proc.stdout.on("data", (data) => {
      if (this.process !== proc) return;
      const line = data.toString().trim();
      if (line.startsWith("POS:")) {
        const [, pos, dur] = line.split(":");
        this.position = parseFloat(pos) || this.position;
        this.duration = parseFloat(dur) || this.duration;
        this.emit("timeupdate", { position: this.position, duration: this.duration });
      }
    });
    proc.on("close", () => {
      if (this.process !== proc) return;
      this.process = null;
      if (this.state === "playing" && !this.manuallyKilled) {
        this.state = "stopped";
        this.emit("ended");
      }
    });
  }

  pause() {
    if (this.state === "playing") {
      this.state = "paused";
      this.manuallyKilled = true;
      if (this.process) {
        const oldProc = this.process;
        this.process = null;
        try {
          oldProc.removeAllListeners("close");
          oldProc.removeAllListeners("error");
          oldProc.kill();
        } catch {}
      }
      this.emit("paused");
    }
  }

  resume() {
    if (this.state === "paused" && this.currentUrl) {
      this.play(this.currentUrl, this.position);
    }
  }

  stop() {
    this.state = "stopped";
    this.manuallyKilled = true;
    if (this.process) {
      const oldProc = this.process;
      this.process = null;
      try {
        oldProc.removeAllListeners("close");
        oldProc.removeAllListeners("error");
        oldProc.kill();
      } catch {}
    }
    this.position = 0;
    this.emit("stopped");
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, vol));
    if (this.state === "playing" && this.currentUrl) {
      this.play(this.currentUrl, this.position);
    }
  }

  seek(seconds) {
    if (this.currentUrl) {
      this.play(this.currentUrl, seconds);
    }
  }

  destroy() {
    this.stop();
    this.removeAllListeners();
  }
}
