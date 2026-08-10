/**
 * store.test.ts — in-memory data store invariants for what's left in
 * store.ts after the platform-wallet swap (demo wallet + round bookkeeping).
 * Real-money wallet/bet logic now lives on the platform NestJS backend and
 * is covered there, not here.
 * Run: npx tsx src/store.test.ts
 */
import * as store from "./store.js";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.error(`  ✗ ${msg}`); }
}

// ── demo wallet: atomic debit-or-fail ───────────────────────────────────────
const startDemo = store.getDemoBalance();
assert(startDemo === 50_000, `demo wallet starts at 50,000 (got ${startDemo})`);
assert(store.adjustDemoBalance(-100) === 49_900, "demo debit works");
assert(store.adjustDemoBalance(-10_000_000, 0) === null, "demo debit below min fails (returns null)");
assert(store.getDemoBalance() === 49_900, "failed demo debit left balance unchanged");
assert(store.adjustDemoBalance(100) === 50_000, "demo credit restores");

// ── rounds ──────────────────────────────────────────────────────────────────
const rid = store.createRound("hashed-seed-xyz", "srv-1");
assert(typeof rid === "string" && rid.length > 0, "createRound returns an id");
store.startRound(rid);
store.resolveRound(rid, 3.14, "seed-xyz");
const recent = store.getRecentRounds(5);
const rec = recent.find((r) => r.id === rid);
assert(!!rec && rec.status === "crashed" && rec.crash_point === 3.14, "resolveRound records crash point + status");

// ── stats ────────────────────────────────────────────────────────────────────
const stats = store.getStats();
assert(typeof stats.avg_crash === "number", "getStats returns a numeric avg_crash");
assert(Array.isArray(stats.recent_rounds), "getStats returns recent_rounds array");

console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}\n`);
process.exit(failed === 0 ? 0 : 1);
