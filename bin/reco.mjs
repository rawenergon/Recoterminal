#!/usr/bin/env node
// language: JavaScript, file: bin/reco.mjs, target: Node.js CLI
import { TerminalPlayer } from "../lib/terminal-player.mjs";

async function main() {
  const rawArgs = process.argv.slice(2);
  const argsString = rawArgs.join(" ").trim();

  // 1. One-off arguments passed directly on the command line
  // Examples:
  // reco /play "starboy"
  // reco play "starboy"
  // reco /auto
  // reco /volume 80
  // reco /update
  // reco /help
  if (rawArgs.length > 0) {
    const player = new TerminalPlayer();
    await player.executeCommand(argsString);

    // If music started playing or radio is active, stay interactive so user can control it
    if (player.player.state === "playing" || player.autoPlay || player.queue.length > 0) {
      player.startInteractive(false);
    } else {
      process.exit(0);
    }
    return;
  }

  // 2. No arguments provided: launch interactive console
  const player = new TerminalPlayer();
  player.startInteractive(true);
}

main().catch((err) => {
  console.error("\x1b[31m[Recoterminal Fatal Error]\x1b[0m", err?.message || err);
  process.exit(1);
});
