// language: JavaScript, file: lib/player.mjs, target: Node.js (Windows/macOS/Linux/Android Termux)
import { spawn, execSync } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";

function isTermux() {
  return Boolean(
    process.env.TERMUX_VERSION ||
    process.env.PREFIX?.includes("com.termux") ||
    fs.existsSync("/data/data/com.termux")
  );
}

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
    this.timer = null;
  }

  _startTimer() {
    this._stopTimer();
    this.timer = setInterval(() => {
      if (this.state === "playing") {
        this.position += 1;
        this.emit("timeupdate", { position: this.position, duration: this.duration });
        if (this.duration > 0 && this.position >= this.duration) {
          this._stopTimer();
          this.stop();
          this.emit("ended");
        }
      }
    }, 1000);
  }

  _stopTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
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
    this.position = Math.max(0, startSeconds);
    this.state = "playing";

    // Launch independent internal timer (doesn't rely on pipe scraping)
    this._startTimer();

    if (this.platform === "win32") {
      const args = ["-nodisp", "-autoexit", "-v", "0", "-volume", String(this.volume)];
      if (this.position > 0) {
        args.push("-ss", String(this.position));
      }
      args.push(url);

      try {
        const proc = spawn("ffplay", args, {
          stdio: ["ignore", "ignore", "ignore"],
        });
        this.process = proc;

        proc.on("error", (err) => {
          if (this.process !== proc) return;
          console.warn("\x1b[33m[Audio Engine]\x1b[0m ffplay error, trying PowerShell fallback...", err?.message);
          this.playPowerShell(url, this.position);
        });

        proc.on("close", (code) => {
          if (this.process !== proc) return;
          this.process = null;
          if (this.state === "playing" && !this.manuallyKilled) {
            this._stopTimer();
            this.state = "stopped";
            this.emit("ended");
          }
        });

        this.emit("playing");
      } catch (err) {
        this.playPowerShell(url, this.position);
      }
    } else if (this.platform === "darwin") {
      const proc = spawn("afplay", [url], { stdio: "ignore" });
      this.process = proc;
      this.emit("playing");
      proc.on("close", () => {
        if (this.process !== proc) return;
        this.process = null;
        if (this.state === "playing" && !this.manuallyKilled) {
          this._stopTimer();
          this.state = "stopped";
          this.emit("ended");
        }
      });
    } else {
      // Linux & Android Termux
      const args = ["-nodisp", "-autoexit", "-v", "0", "-volume", String(this.volume)];
      if (this.position > 0) {
        args.push("-ss", String(this.position));
      }
      args.push(url);

      try {
        const proc = spawn("ffplay", args, { stdio: ["ignore", "ignore", "ignore"] });
        this.process = proc;
        this.emit("playing");

        proc.on("error", (err) => {
          if (this.process !== proc) return;
          if (isTermux()) {
            this.playTermux(url);
          }
        });

        proc.on("close", () => {
          if (this.process !== proc) return;
          this.process = null;
          if (this.state === "playing" && !this.manuallyKilled) {
            this._stopTimer();
            this.state = "stopped";
            this.emit("ended");
          }
        });
      } catch (err) {
        if (isTermux()) {
          this.playTermux(url);
        }
      }
    }
  }

  playTermux(url) {
    try {
      const proc = spawn("termux-media-player", ["play", url], { stdio: "ignore" });
      this.process = proc;
      this.emit("playing");

      proc.on("error", () => {
        // Fallback: send directly to phone player via termux-open-url
        try {
          spawn("termux-open-url", [url], { stdio: "ignore" });
        } catch {}
      });
    } catch {
      try {
        spawn("termux-open-url", [url], { stdio: "ignore" });
      } catch {}
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
  Start-Sleep -Milliseconds 1000
  if ($p.NaturalDuration.HasTimeSpan) {
    $dur = $p.NaturalDuration.TimeSpan.TotalSeconds
    $pos = $p.Position.TotalSeconds
    if ($pos -ge $dur - 1 -and $dur -gt 5) { break }
  }
}
`;
    const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", ps], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    this.process = proc;
    proc.on("close", () => {
      if (this.process !== proc) return;
      this.process = null;
      if (this.state === "playing" && !this.manuallyKilled) {
        this._stopTimer();
        this.state = "stopped";
        this.emit("ended");
      }
    });
  }

  pause() {
    if (this.state === "playing") {
      this.state = "paused";
      this._stopTimer(); // Timer stops when paused
      this.manuallyKilled = true;
      if (isTermux()) {
        try { execSync("termux-media-player pause", { stdio: "ignore" }); } catch {}
      }
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
      if (isTermux()) {
        try { execSync("termux-media-player play", { stdio: "ignore" }); } catch {}
      }
      this.play(this.currentUrl, this.position);
    }
  }

  stop() {
    this.state = "stopped";
    this._stopTimer(); // Timer stops and resets
    this.manuallyKilled = true;
    if (isTermux()) {
      try { execSync("termux-media-player stop", { stdio: "ignore" }); } catch {}
    }
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
    this.position = Math.max(0, seconds);
    if (this.currentUrl && this.state === "playing") {
      this.play(this.currentUrl, this.position);
    }
  }

  destroy() {
    this.stop();
    this.removeAllListeners();
  }
}
