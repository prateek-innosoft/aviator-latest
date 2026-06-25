/**
 * Public tunnel for sharing the Vite dev app worldwide.
 * Waits for :5173, then opens tunnelmole (primary) or cloudflared (fallback).
 * Prints a clean share link for VS Code tasks + copies to clipboard on Windows.
 */

import { spawn, exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LINK_FILE = path.join(ROOT, "share-link.url");

const PORT = process.env.SHARE_PORT ?? "5173";
const TARGET = `http://127.0.0.1:${PORT}`;
const WAIT_MS = 90_000;
const PROVIDER_TIMEOUT_MS = 75_000;

const URL_RE =
  /https:\/\/[a-z0-9.-]+\.(trycloudflare\.com|tunnelmole\.net)/i;

async function waitForDevServer() {
  const deadline = Date.now() + WAIT_MS;
  process.stdout.write(`Waiting for frontend on :${PORT}`);
  while (Date.now() < deadline) {
    try {
      const r = await fetch(TARGET, { signal: AbortSignal.timeout(2000) });
      if (r.ok || r.status === 404) {
        console.log(" — ready\n");
        return;
      }
    } catch {
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw new Error(
    `Frontend not running on :${PORT}. Run "Aviator: Start App" or start the frontend task first.`,
  );
}

function printShareLink(url) {
  fs.writeFileSync(LINK_FILE, `${url}\n`, "utf8");

  if (process.stdout.isTTY) {
    process.stdout.write("\x1b[2J\x1b[H");
  }

  const line = "━".repeat(62);

  console.log("");
  console.log(line);
  console.log("");
  console.log("  SHARE LINK  (send to friends anywhere)");
  console.log("");
  console.log(`  ${url}`);
  console.log("");
  console.log(line);
  console.log("");
  console.log("  Copied to clipboard · keep this terminal open");
  console.log("");

  // Machine-readable line for VS Code task matcher
  console.log(`AVIATOR_SHARE_URL=${url}`);

  if (process.platform === "win32") {
    exec(
      `powershell -NoProfile -Command "Set-Clipboard -Value '${url}'"`,
    );
  }
}

function spawnTunnel(command) {
  return spawn(command, {
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runProvider(name, command) {
  return new Promise((resolve) => {
    console.log(`Starting ${name}…`);

    const child = spawnTunnel(command);
    let buffer = "";
    let settled = false;
    const deadline = Date.now() + PROVIDER_TIMEOUT_MS;

    const finish = (url) => {
      if (settled) return;
      settled = true;
      clearInterval(timer);
      if (url) {
        resolve({ url, child });
      } else {
        child.kill();
        resolve(null);
      }
    };

    const tryPublish = () => {
      const m = buffer.match(URL_RE);
      if (m) finish(m[0]);
    };

    const onChunk = (buf) => {
      buffer += buf.toString();
      if (buffer.length > 12_000) buffer = buffer.slice(-6000);
      tryPublish();
    };

    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);
    child.on("exit", () => finish(null));

    const timer = setInterval(() => {
      tryPublish();
      if (Date.now() > deadline) {
        console.log(`${name} timed out, trying next provider…\n`);
        finish(null);
      }
    }, 500);
  });
}

function providerList() {
  const pref = (process.env.TUNNEL_PROVIDER ?? "auto").toLowerCase();
  if (pref === "cloudflared") return ["cloudflared"];
  if (pref === "tunnelmole") return ["tunnelmole"];
  return ["tunnelmole", "cloudflared"];
}

const COMMANDS = {
  tunnelmole: `npx -y tunnelmole ${PORT}`,
  cloudflared: `npx -y cloudflared tunnel --url ${TARGET}`,
};

async function startTunnel() {
  for (const name of providerList()) {
    const result = await runProvider(name, COMMANDS[name]);
    if (result) {
      printShareLink(result.url);
      const { child } = result;
      child.on("exit", (code) => process.exit(code ?? 0));
      process.on("SIGINT", () => child.kill("SIGINT"));
      process.on("SIGTERM", () => child.kill("SIGTERM"));
      return;
    }
  }

  console.error(
    "\nCould not create a public link. Check your network or set TUNNEL_PROVIDER=cloudflared|tunnelmole\n",
  );
  process.exit(1);
}

await waitForDevServer();
await startTunnel();
