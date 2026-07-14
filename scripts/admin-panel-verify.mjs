/**
 * End-to-end verification of EVERY admin panel feature against the live backend.
 * Backend must be running on http://127.0.0.1:4000.
 *
 * Run: node scripts/admin-panel-verify.mjs
 */

import { io } from "../backend/node_modules/socket.io-client/build/esm/index.js";

const BASE = process.env.API_BASE ?? "http://127.0.0.1:4000";
const ADMIN_EMAIL = "admin@aviator.com";
const ADMIN_PASSWORD = "admin123";

let pass = 0;
let fail = 0;
const failures = [];
function check(cond, msg) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else { fail++; failures.push(msg); console.log(`  ✗ ${msg}`); }
}
function section(t) { console.log(`\n── ${t} ${"─".repeat(Math.max(0, 56 - t.length))}`); }

async function api(path, method = "GET", token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* no body */ }
  return { status: res.status, json };
}

/**
 * Collect crash multipliers. Resolves when `predicate(m)` is satisfied (if
 * given) or when `count` crashes are collected. On timeout it resolves with
 * whatever was collected (so callers can assert on partial data) unless none.
 */
function waitForCrashes(token, count, { timeoutMs = 90_000, predicate = null } = {}) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { transports: ["websocket"], reconnection: false });
    const crashes = [];
    const timer = setTimeout(() => {
      socket.close();
      if (crashes.length) resolve(crashes);
      else reject(new Error(`timeout: no crashes observed`));
    }, timeoutMs);
    socket.on("round:crashed", (p) => {
      if (typeof p?.multiplier !== "number") return;
      crashes.push(p.multiplier);
      const done = predicate ? predicate(p.multiplier) : crashes.length >= count;
      if (done) {
        clearTimeout(timer);
        socket.close();
        resolve(crashes);
      }
    });
    socket.on("connect_error", (e) => { clearTimeout(timer); socket.close(); reject(e); });
  });
}

function betOnce(token, amount, userId) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { transports: ["websocket"], reconnection: false });
    const timer = setTimeout(() => { socket.close(); reject(new Error("bet timeout")); }, 60_000);
    let placed = false;
    socket.on("init", () => {});
    socket.on("round:betting", () => {
      if (placed) return;
      placed = true;
      socket.emit("bet:place", { panel: 0, amount, ...(userId ? { userId } : {}) });
    });
    socket.on("bet:accepted", (p) => { clearTimeout(timer); socket.close(); resolve({ ok: true, p }); });
    socket.on("bet:rejected", (p) => { clearTimeout(timer); socket.close(); resolve({ ok: false, p }); });
    socket.on("connect_error", (e) => { clearTimeout(timer); socket.close(); reject(e); });
  });
}

async function main() {
  console.log("═".repeat(62));
  console.log("  ADMIN PANEL — FULL FEATURE VERIFICATION");
  console.log("═".repeat(62));

  // ── 1. Auth ────────────────────────────────────────────────────────
  section("1. Authentication");
  const badLogin = await api("/api/auth/login", "POST", null, { email: ADMIN_EMAIL, password: "wrongpass" });
  check(badLogin.status === 401, "wrong password rejected (401)");

  const login = await api("/api/auth/login", "POST", null, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  check(login.status === 200 && login.json?.ok === true, "correct credentials accepted");
  const token = login.json?.access_token;
  check(!!token, "access_token returned");
  check(login.json?.user?.role === "admin", "user role is admin");

  const me = await api("/api/auth/me", "GET", token);
  check(me.status === 200 && me.json?.user?.role === "admin", "/auth/me returns admin profile");

  const noToken = await api("/api/admin/controls", "GET", null);
  check(noToken.status === 401, "controls blocked without token (401)");

  const badToken = await api("/api/admin/controls", "GET", "garbage.token");
  check(badToken.status === 401, "controls blocked with invalid token (401)");

  // ── 2. Read controls ───────────────────────────────────────────────
  section("2. GET controls");
  const c0 = await api("/api/admin/controls", "GET", token);
  check(c0.status === 200 && c0.json?.ok, "controls load");
  const ctrl = c0.json?.controls ?? {};
  check(typeof ctrl.min_bet === "number", "min_bet present");
  check(typeof ctrl.max_bet === "number", "max_bet present");
  check(["normal", "win"].includes(ctrl.win_mode), "win_mode present");

  // Ensure normal mode first so betting windows arrive quickly for demo-bet checks.
  await api("/api/admin/controls", "PATCH", token, { win_mode: "normal" });

  // ── 3. Bet limits save + persist + validate ────────────────────────
  section("3. Bet Limits");
  const setLimits = await api("/api/admin/controls", "PATCH", token, { min_bet: 25, max_bet: 7500 });
  check(setLimits.status === 200 && setLimits.json?.controls?.min_bet === 25, "min_bet saved = 25");
  check(setLimits.json?.controls?.max_bet === 7500, "max_bet saved = 7500");

  const reread = await api("/api/admin/controls", "GET", token);
  check(reread.json?.controls?.min_bet === 25 && reread.json?.controls?.max_bet === 7500, "bet limits persist on reload");

  const badLimits = await api("/api/admin/controls", "PATCH", token, { min_bet: 9000, max_bet: 100 });
  check(badLimits.status === 400, "min>max rejected (400)");

  // engine application: bet below min must be rejected
  const lowBet = await betOnce(token, 5); // below min 25
  check(lowBet.ok === false && (lowBet.p?.reason === "below_min"), `demo bet below min rejected (${lowBet.p?.reason})`);
  const okBet = await betOnce(token, 100); // within range
  check(okBet.ok === true, "demo bet within range accepted");

  // ── 4. Win mode → engine crash points ──────────────────────────────
  section("4. Global Win Rate (engine application)");
  await api("/api/admin/controls", "PATCH", token, { win_mode: "normal" });
  console.log("    waiting for 5 rounds in NORMAL mode...");
  const normalCrashes = await waitForCrashes(token, 5, { timeoutMs: 120_000 });
  // Normal rounds crash within 1.00x–1.10x, never 100x.
  check(!normalCrashes.some((m) => m >= 100), `normal mode never ≥100x [${normalCrashes.map(x=>x.toFixed(2)).join(", ")}]`);
  check(normalCrashes.every((m) => m <= 1.10), "normal mode stays within 1.00x–1.10x");

  await api("/api/admin/controls", "PATCH", token, { win_mode: "win" });
  console.log("    waiting for a ≥100x crash in WIN mode (may take ~30s/round)...");
  // A round's crash point is fixed at round start, so we wait until win mode
  // actually produces a 100x+ crash — proof the control drives the engine.
  const winCrashes = await waitForCrashes(token, 5, { timeoutMs: 150_000, predicate: (m) => m >= 100 });
  check(winCrashes.some((m) => m >= 100), `win mode produces ≥100x crashes [${winCrashes.map(x=>x.toFixed(2)).join(", ")}]`);

  await api("/api/admin/controls", "PATCH", token, { win_mode: "normal" });
  const normReread = await api("/api/admin/controls", "GET", token);
  check(normReread.json?.controls?.win_mode === "normal", "win_mode=normal restored");

  // ── 5. Invalid input rejection ─────────────────────────────────────
  section("5. Validation");
  const badMode = await api("/api/admin/controls", "PATCH", token, { win_mode: "loss" });
  check(badMode.status === 400, "removed win_mode=loss rejected (400)");

  // ── 6. Stats endpoint ──────────────────────────────────────────────
  section("6. GET admin stats");
  const stats = await api("/api/admin/stats", "GET", token);
  check(stats.status === 200 && stats.json?.ok, "stats endpoint responds (no user_profiles error)");
  check(typeof stats.json?.stats?.total_users === "number", "total_users present");
  check(typeof stats.json?.stats?.total_balance === "number", "total_balance present");
  check(Array.isArray(stats.json?.stats?.recent_rounds), "recent_rounds present");

  // ── 7. Logout ──────────────────────────────────────────────────────
  section("7. Logout");
  const logout = await api("/api/auth/logout", "POST", token);
  check(logout.status === 200 && logout.json?.ok, "logout succeeds");

  // restore sane defaults for the running instance
  await api("/api/admin/controls", "PATCH", token, {
    win_mode: "normal", min_bet: 1, max_bet: 50000,
  });

  console.log("\n" + "═".repeat(62));
  console.log(`  RESULT: ${pass} passed, ${fail} failed`);
  if (fail) console.log("  FAILURES:\n   - " + failures.join("\n   - "));
  console.log("═".repeat(62));
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(2); });
