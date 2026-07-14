/**
 * store.test.ts — in-memory data store invariants (the seam that replaced
 * Supabase). Focuses on the money-critical atomic wallet operations.
 * Run: npx tsx src/store.test.ts
 */
import * as store from "./store.js";

let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log(`  ✓ ${msg}`);
  else { failed++; console.error(`  ✗ ${msg}`); }
}

const USER = "tester1-0000-0000-0000-000000000001"; // seeded, ₹1,000,000
const ROUND = "round-A";

// ── Login + profile ─────────────────────────────────────────────────────────
assert(store.verifyLogin("tester1@aviator.local", "Test@1234") !== null, "correct credentials verify");
assert(store.verifyLogin("tester1@aviator.local", "wrong") === null, "wrong password rejected");
assert(store.verifyLogin("nobody@aviator.local", "Test@1234") === null, "unknown email rejected");
assert(store.verifyLogin("TESTER1@AVIATOR.LOCAL", "Test@1234") !== null, "email match is case-insensitive");
const prof = store.verifyLogin("tester1@aviator.local", "Test@1234");
assert(prof !== null && !("password" in (prof as object)), "returned profile never includes password");

// ── Wallet starting balance ─────────────────────────────────────────────────
assert(store.getWalletBalance(USER) === 1_000_000, "seeded wallet starts at 1,000,000");
assert(store.getWalletBalance("no-such-user") === null, "missing wallet returns null");

// ── place_bet: atomic debit ─────────────────────────────────────────────────
const p1 = store.placeBet(USER, ROUND, 0, 1000, "ref1");
assert(p1.ok && p1.balance === 999_000, `place_bet debits exactly (bal ${p1.balance})`);
assert(!!p1.bet_id, "place_bet returns a bet_id");

// duplicate bet on same (round,user,panel) rejected — no double debit
const p1dup = store.placeBet(USER, ROUND, 0, 1000, "ref1b");
assert(!p1dup.ok && p1dup.reason === "duplicate", "duplicate bet rejected");
assert(store.getWalletBalance(USER) === 999_000, "duplicate did not debit again");

// second panel is a distinct bet
const p2 = store.placeBet(USER, ROUND, 1, 500, "ref2");
assert(p2.ok && p2.balance === 998_500, `second panel debits (bal ${p2.balance})`);

// ── insufficient-balance guard ──────────────────────────────────────────────
const broke = store.placeBet(USER, ROUND + "-x", 0, 10_000_000, "ref-broke");
assert(!broke.ok && broke.reason === "insufficient", "over-balance bet rejected as insufficient");
assert(store.getWalletBalance(USER) === 998_500, "rejected bet did not change balance");

// ── cancel_bet: exact refund, no double-refund ──────────────────────────────
const c1 = store.cancelBet(USER, ROUND, 1, "ref2");
assert(c1.ok && c1.balance === 999_000, `cancel refunds exactly (bal ${c1.balance})`);
const c1again = store.cancelBet(USER, ROUND, 1, "ref2");
assert(!c1again.ok && c1again.reason === "not_found", "cancel twice is rejected (no double refund)");
assert(store.getWalletBalance(USER) === 999_000, "double-cancel did not refund again");

// ── cashout_bet: credit = amount * multiplier ───────────────────────────────
const co = store.cashoutBet(USER, ROUND, 0, 2.5, "ref1");
// bet was 1000 @ 2.5x => win 2500; balance was 999000 => 1001500
assert(co.ok && co.win === 2500, `cashout win = amount*multiplier (win ${co.win})`);
assert(co.balance === 1_001_500, `cashout credits win (bal ${co.balance})`);
const coAgain = store.cashoutBet(USER, ROUND, 0, 2.5, "ref1");
assert(!coAgain.ok && coAgain.reason === "not_found", "cashout twice rejected (no double credit)");
assert(store.getWalletBalance(USER) === 1_001_500, "double-cashout did not credit again");

// a cancelled bet cannot be cashed out
const p3 = store.placeBet(USER, "round-B", 0, 100, "r3");
store.cancelBet(USER, "round-B", 0, "r3");
const coCancelled = store.cashoutBet(USER, "round-B", 0, 5, "r3");
assert(p3.ok && !coCancelled.ok, "cannot cash out a cancelled bet");

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
assert(stats.total_users === 5, `getStats reports 5 seeded users (got ${stats.total_users})`);
assert(typeof stats.total_balance === "number", "getStats returns a numeric total balance");
assert(Array.isArray(stats.recent_rounds), "getStats returns recent_rounds array");

console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`}\n`);
process.exit(failed === 0 ? 0 : 1);
