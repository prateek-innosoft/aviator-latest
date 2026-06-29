/**
 * simulation.test.ts
 *
 * Simulates 1000 individual users each playing one full round.
 * Mimics real gameplay: each user places a bet, the crash point is
 * computed, and they either cash out (if auto-cashout < crash) or lose.
 *
 * Run with:  npx tsx src/simulation.test.ts
 */

// ─── Inline crash logic (no server needed) ───────────────────────────────────

const HARD_CAP = 130;
type WinMode = "normal" | "win" | "loss";

interface Overrides {
  winMode: WinMode;
  forcedCrash: number | null;
  nextCrashPoint: number | null;
}

function computeCrashPoint(ov: Overrides): number {
  let result: number;
  if (ov.forcedCrash !== null) {
    result = ov.forcedCrash;
  } else if (ov.nextCrashPoint !== null) {
    result = ov.nextCrashPoint;
    ov.nextCrashPoint = null;
  } else if (ov.winMode === "win") {
    result = Math.round((100 + Math.random() * 30) * 100) / 100;
  } else if (ov.winMode === "loss") {
    result = Math.round((0.10 + Math.random() * 0.89) * 100) / 100;
  } else {
    const r = Math.random();
    if (r < 0.70) result = 1.00;
    else if (r < 0.90) result = Math.round((1.01 + Math.random() * 1.99) * 100) / 100;
    else result = Math.round((3.01 + Math.random() * 1.99) * 100) / 100;
  }
  return Math.floor(Math.min(result, HARD_CAP) * 100) / 100;
}

// ─── User simulation ─────────────────────────────────────────────────────────

interface UserResult {
  userId: number;
  mode: WinMode;
  betAmount: number;
  crashPoint: number;
  autoCashoutAt: number;
  cashedOut: boolean;
  win: number;
  net: number; // win - bet
}

const BET_TIERS = [10, 20, 25, 50, 75, 100, 150, 200, 250, 300, 500];

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Each user picks a random auto-cashout target between 1.10x and 4.00x
function randomCashoutTarget(): number {
  return Math.round((1.10 + Math.random() * 2.90) * 100) / 100;
}

function simulateUser(userId: number, mode: WinMode): UserResult {
  const betAmount = randomFrom(BET_TIERS);
  const crashPoint = computeCrashPoint({ winMode: mode, forcedCrash: null, nextCrashPoint: null });
  const autoCashoutAt = randomCashoutTarget();

  const cashedOut = autoCashoutAt <= crashPoint && crashPoint > 1.00;
  const win = cashedOut ? Math.round(betAmount * autoCashoutAt * 100) / 100 : 0;
  const net = Math.round((win - betAmount) * 100) / 100;

  return { userId, mode, betAmount, crashPoint, autoCashoutAt, cashedOut, win, net };
}

// ─── Run 1000 users per mode ─────────────────────────────────────────────────

const USERS = 1000;
const MODES: WinMode[] = ["normal", "loss", "win"];

function runSimulation(mode: WinMode): UserResult[] {
  return Array.from({ length: USERS }, (_, i) => simulateUser(i + 1, mode));
}

function printStats(mode: WinMode, results: UserResult[]) {
  const winners    = results.filter(r => r.cashedOut);
  const losers     = results.filter(r => !r.cashedOut);
  const totalBet   = results.reduce((s, r) => s + r.betAmount, 0);
  const totalWin   = results.reduce((s, r) => s + r.win, 0);
  const houseProfit = totalBet - totalWin;
  const rtp        = (totalWin / totalBet) * 100;
  const avgCrash   = results.reduce((s, r) => s + r.crashPoint, 0) / USERS;
  const minCrash   = Math.min(...results.map(r => r.crashPoint));
  const maxCrash   = Math.max(...results.map(r => r.crashPoint));
  const avgBet     = totalBet / USERS;
  const avgWin     = winners.length ? winners.reduce((s, r) => s + r.win, 0) / winners.length : 0;

  // Crash distribution buckets
  const below1   = results.filter(r => r.crashPoint < 1.00).length;
  const at1      = results.filter(r => r.crashPoint === 1.00).length;
  const to3      = results.filter(r => r.crashPoint > 1.00 && r.crashPoint <= 3.00).length;
  const to5      = results.filter(r => r.crashPoint > 3.00 && r.crashPoint <= 5.00).length;
  const above5   = results.filter(r => r.crashPoint > 5.00).length;

  const label = mode === "normal" ? "FAIR (Normal)" : mode === "loss" ? "HOUSE WIN (Loss)" : "PLAYER WIN (Win)";

  console.log(`\n${"═".repeat(62)}`);
  console.log(` MODE: ${label}  |  ${USERS} users`);
  console.log(`${"═".repeat(62)}`);
  console.log(` Outcome`);
  console.log(`   Winners (cashed out)  : ${winners.length.toString().padStart(4)}  (${(winners.length/USERS*100).toFixed(1)}%)`);
  console.log(`   Losers  (crashed out) : ${losers.length.toString().padStart(4)}  (${(losers.length/USERS*100).toFixed(1)}%)`);
  console.log(``);
  console.log(` Money`);
  console.log(`   Total wagered         : R ${totalBet.toLocaleString()}`);
  console.log(`   Total paid out        : R ${totalWin.toLocaleString()}`);
  console.log(`   House profit          : R ${houseProfit.toLocaleString()}`);
  console.log(`   RTP (return to player): ${rtp.toFixed(2)}%`);
  console.log(`   Avg bet per user      : R ${avgBet.toFixed(2)}`);
  console.log(`   Avg win (winners only): R ${avgWin.toFixed(2)}`);
  console.log(``);
  console.log(` Crash Distribution`);
  console.log(`   < 1.00x (sub-1 bust)  : ${below1.toString().padStart(4)}  (${(below1/USERS*100).toFixed(1)}%)`);
  console.log(`   = 1.00x (instant bust): ${at1.toString().padStart(4)}  (${(at1/USERS*100).toFixed(1)}%)`);
  console.log(`   1.01x – 3.00x         : ${to3.toString().padStart(4)}  (${(to3/USERS*100).toFixed(1)}%)`);
  console.log(`   3.01x – 5.00x         : ${to5.toString().padStart(4)}  (${(to5/USERS*100).toFixed(1)}%)`);
  console.log(`   > 5.00x               : ${above5.toString().padStart(4)}  (${(above5/USERS*100).toFixed(1)}%)`);
  console.log(`   Min crash             : ${minCrash.toFixed(2)}x`);
  console.log(`   Max crash             : ${maxCrash.toFixed(2)}x`);
  console.log(`   Avg crash             : ${avgCrash.toFixed(4)}x`);

  // Validation checks
  const checks: Array<[boolean, string]> = [];
  if (mode === "loss") {
    checks.push([below1 === USERS,  `All ${USERS} crash points below 1.00x`]);
    checks.push([minCrash >= 0.10,  `Min crash >= 0.10x (got ${minCrash})`]);
    checks.push([maxCrash <= 0.99,  `Max crash <= 0.99x (got ${maxCrash})`]);
    checks.push([winners.length === 0, `Zero winners in house-win mode`]);
  } else if (mode === "normal") {
    const t1pct = at1 / USERS;
    const t2pct = to3 / USERS;
    const t3pct = to5 / USERS;
    checks.push([t1pct >= 0.62 && t1pct <= 0.78, `Tier1 ~70%: got ${(t1pct*100).toFixed(1)}%`]);
    checks.push([t2pct >= 0.14 && t2pct <= 0.26, `Tier2 ~20%: got ${(t2pct*100).toFixed(1)}%`]);
    checks.push([t3pct >= 0.05 && t3pct <= 0.15, `Tier3 ~10%: got ${(t3pct*100).toFixed(1)}%`]);
    checks.push([above5 === 0,  `No crashes above 5.00x in normal mode`]);
  } else if (mode === "win") {
    checks.push([above5 === USERS,  `All ${USERS} crash points > 5.00x`]);
    checks.push([minCrash >= 100,   `Min crash >= 100x (got ${minCrash})`]);
    checks.push([maxCrash <= 130,   `Max crash <= 130x (got ${maxCrash})`]);
    checks.push([winners.length > USERS * 0.85, `>85% winners in player-win mode (got ${winners.length})`]);
  }

  console.log(``);
  console.log(` Validation`);
  let modePass = true;
  for (const [ok, msg] of checks) {
    console.log(`   ${ok ? "✓" : "✗"} ${msg}`);
    if (!ok) modePass = false;
  }
  console.log(`\n   ${modePass ? "✅ ALL CHECKS PASSED" : "❌ SOME CHECKS FAILED"}`);

  return;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\nAviator — 1000-User Simulation`);
console.log(`Each user: random bet (R10–R500) + random auto-cashout target (1.10x–4.00x)`);
console.log(`Testing all 3 modes with ${USERS} users each = ${USERS * 3} total simulated rounds`);

const start = Date.now();

let allPass = true;
for (const mode of MODES) {
  const results = runSimulation(mode);
  printStats(mode, results);
}

const elapsed = Date.now() - start;

console.log(`\n${"═".repeat(62)}`);
console.log(` SIMULATION COMPLETE — ${USERS * MODES.length} rounds in ${elapsed}ms`);
console.log(`${"═".repeat(62)}\n`);

process.exit(0);
