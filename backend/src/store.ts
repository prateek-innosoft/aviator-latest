/**
 * In-memory data store — the single seam that used to be Supabase.
 *
 * ─── HOST INTEGRATION NOTE ───────────────────────────────────────────────
 * When this crash-game module is merged into the main site, replace the
 * bodies of the exported functions below with calls to the host's own
 * services:
 *   • users / login  → the host's account + session system
 *   • wallet ops      → the host's wallet/ledger service (must stay atomic:
 *                        debit-or-fail, credit, no double-spend)
 *   • rounds          → the host's round/audit persistence (optional)
 *   • admin controls  → the host's config store
 * Nothing else in the codebase touches persistence directly — every call
 * site goes through this module, so the swap is localized here.
 *
 * Everything here is process-memory only: it resets on restart. That's
 * intentional for a standalone/dev build; the host provides durability.
 *
 * Concurrency: Node runs this single-threaded and every mutation below is
 * fully synchronous (no `await` between a balance read and its write), so
 * debit/credit operations are atomic by construction — there is no window
 * for a double-spend the way there would be with an async read-then-write.
 * ─────────────────────────────────────────────────────────────────────────
 */

import crypto from "node:crypto";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Users & wallets ─────────────────────────────────────────────────────────

export interface StoreUser {
  id: string;
  email: string;
  /** Plain-text only for the standalone dev seed — the host owns real auth. */
  password: string;
  role: "user" | "admin" | "superadmin";
  kyc_status: string;
}

interface Wallet {
  balance: number;
  currency: string;
}

/**
 * Rough standalone test accounts (previously seeded into Supabase Auth by
 * scripts/create-test-users.mjs). Kept so the multi-user real-money flow is
 * runnable and testable without any external service. The host replaces
 * these with its own users.
 */
const SEED_USERS: Array<StoreUser & { balance: number }> = [
  { id: "tester1-0000-0000-0000-000000000001", email: "tester1@aviator.local", password: "Test@1234", role: "user", kyc_status: "verified", balance: 1_000_000 },
  { id: "tester2-0000-0000-0000-000000000002", email: "tester2@aviator.local", password: "Test@1234", role: "user", kyc_status: "verified", balance: 1_000_000 },
  { id: "tester3-0000-0000-0000-000000000003", email: "tester3@aviator.local", password: "Test@1234", role: "user", kyc_status: "verified", balance: 1_000_000 },
  { id: "tester4-0000-0000-0000-000000000004", email: "tester4@aviator.local", password: "Test@1234", role: "user", kyc_status: "verified", balance: 1_000_000 },
  { id: "tester5-0000-0000-0000-000000000005", email: "tester5@aviator.local", password: "Test@1234", role: "user", kyc_status: "verified", balance: 1_000_000 },
];

const usersByEmail = new Map<string, StoreUser>();
const usersById = new Map<string, StoreUser>();
const wallets = new Map<string, Wallet>();

for (const u of SEED_USERS) {
  const { balance, ...user } = u;
  usersByEmail.set(user.email.toLowerCase(), user);
  usersById.set(user.id, user);
  wallets.set(user.id, { balance, currency: "INR" });
}

/** Verify email + password. Returns the user (without password) or null. */
export function verifyLogin(email: string, password: string): Omit<StoreUser, "password"> | null {
  const u = usersByEmail.get(email.toLowerCase());
  if (!u || u.password !== password) return null;
  const { password: _pw, ...safe } = u;
  return safe;
}

export function getUserProfile(userId: string): Omit<StoreUser, "password"> | null {
  const u = usersById.get(userId);
  if (!u) return null;
  const { password: _pw, ...safe } = u;
  return safe;
}

export function getWalletBalance(userId: string): number | null {
  const w = wallets.get(userId);
  return w ? w.balance : null;
}

export function getWallet(userId: string): { balance: number; currency: string } | null {
  const w = wallets.get(userId);
  return w ? { balance: w.balance, currency: w.currency } : null;
}

// ── Real-user bet ledger (atomic wallet operations) ─────────────────────────
//
// Mirrors the semantics of the old Supabase place_bet / cancel_bet /
// cashout_bet Postgres functions, including the insufficient-balance guard
// and one-bet-per-(round,user,panel) idempotency.

interface BetRecord {
  id: string;
  userId: string;
  roundId: string;
  panel: number;
  amount: number;
  reference: string;
  status: "placed" | "cancelled" | "cashed_out";
  multiplier: number | null;
  win: number | null;
}

const bets = new Map<string, BetRecord>(); // key = `${roundId}::${userId}::${panel}`

function betKey(roundId: string, userId: string, panel: number): string {
  return `${roundId}::${userId}::${panel}`;
}

export interface BetResult {
  ok: boolean;
  reason?: string;
  balance?: number;
  win?: number;
  multiplier?: number;
  bet_id?: string;
}

export function placeBet(
  userId: string,
  roundId: string,
  panel: number,
  amount: number,
  reference: string,
): BetResult {
  const wallet = wallets.get(userId);
  if (!wallet) return { ok: false, reason: "no_wallet" };
  if (!(amount > 0)) return { ok: false, reason: "invalid_amount" };

  const key = betKey(roundId, userId, panel);
  const existing = bets.get(key);
  if (existing && existing.status === "placed") return { ok: false, reason: "duplicate" };

  if (wallet.balance < amount) return { ok: false, reason: "insufficient" };

  // Atomic (synchronous) debit.
  wallet.balance = round2(wallet.balance - amount);
  const bet: BetRecord = {
    id: crypto.randomUUID(),
    userId,
    roundId,
    panel,
    amount,
    reference,
    status: "placed",
    multiplier: null,
    win: null,
  };
  bets.set(key, bet);
  return { ok: true, balance: wallet.balance, bet_id: bet.id };
}

export function cancelBet(
  userId: string,
  roundId: string,
  panel: number,
  _reference: string,
): BetResult {
  const wallet = wallets.get(userId);
  if (!wallet) return { ok: false, reason: "no_wallet" };
  const key = betKey(roundId, userId, panel);
  const bet = bets.get(key);
  if (!bet || bet.status !== "placed") return { ok: false, reason: "not_found" };

  // Refund.
  wallet.balance = round2(wallet.balance + bet.amount);
  bet.status = "cancelled";
  return { ok: true, balance: wallet.balance };
}

export function cashoutBet(
  userId: string,
  roundId: string,
  panel: number,
  multiplier: number,
  _reference: string,
): BetResult {
  const wallet = wallets.get(userId);
  if (!wallet) return { ok: false, reason: "no_wallet" };
  const key = betKey(roundId, userId, panel);
  const bet = bets.get(key);
  if (!bet || bet.status !== "placed") return { ok: false, reason: "not_found" };

  const win = round2(bet.amount * multiplier);
  wallet.balance = round2(wallet.balance + win);
  bet.status = "cashed_out";
  bet.multiplier = multiplier;
  bet.win = win;
  return { ok: true, balance: wallet.balance, win, multiplier, bet_id: bet.id };
}

// ── Shared demo wallet (single persistent-for-the-session balance) ──────────

const DEMO_WALLET_STARTING_BALANCE = 50_000;
let demoBalance = DEMO_WALLET_STARTING_BALANCE;

export function getDemoBalance(): number {
  return demoBalance;
}

/** Atomically adjust the shared demo wallet. Returns new balance, or null if it would drop below minBalance. */
export function adjustDemoBalance(delta: number, minBalance = 0): number | null {
  const next = round2(demoBalance + delta);
  if (next < minBalance) return null;
  demoBalance = next;
  return demoBalance;
}

// ── Rounds (for the authenticated bet gating + admin stats/history) ─────────

export interface RoundRecord {
  id: string;
  hashed_seed: string;
  seed: string | null;
  crash_point: number | null;
  status: "betting" | "flying" | "crashed";
  server_instance_id: string;
  started_at: number | null;
  ended_at: number | null;
}

const rounds = new Map<string, RoundRecord>();
const roundOrder: string[] = []; // most-recent-first
const MAX_ROUND_HISTORY = 500;

export function createRound(hashedSeed: string, serverInstanceId: string): string {
  const id = crypto.randomUUID();
  rounds.set(id, {
    id,
    hashed_seed: hashedSeed,
    seed: null,
    crash_point: null,
    status: "betting",
    server_instance_id: serverInstanceId,
    started_at: null,
    ended_at: null,
  });
  roundOrder.unshift(id);
  // Trim old rounds (and their bets) to bound memory.
  while (roundOrder.length > MAX_ROUND_HISTORY) {
    const stale = roundOrder.pop()!;
    rounds.delete(stale);
    for (const k of [...bets.keys()]) {
      if (k.startsWith(`${stale}::`)) bets.delete(k);
    }
  }
  return id;
}

export function startRound(roundId: string): void {
  const r = rounds.get(roundId);
  if (r) {
    r.status = "flying";
    r.started_at = Date.now();
  }
}

export function resolveRound(roundId: string, crashPoint: number, seed: string): void {
  const r = rounds.get(roundId);
  if (r) {
    r.status = "crashed";
    r.crash_point = crashPoint;
    r.seed = seed;
    r.ended_at = Date.now();
  }
}

export function getRecentRounds(limit: number): RoundRecord[] {
  return roundOrder.slice(0, limit).map((id) => rounds.get(id)!).filter(Boolean);
}

// ── Admin stats aggregation ─────────────────────────────────────────────────

export function getStats() {
  const allWallets = [...wallets.values()];
  const totalBalance = allWallets.reduce((s, w) => s + w.balance, 0);
  const recent = getRecentRounds(100).filter((r) => r.status === "crashed" && r.crash_point != null);
  const avgCrash = recent.length
    ? recent.reduce((s, r) => s + (r.crash_point ?? 0), 0) / recent.length
    : 0;
  const now = new Date();
  const roundsToday = recent.filter((r) => {
    if (!r.ended_at) return false;
    return new Date(r.ended_at).toDateString() === now.toDateString();
  }).length;
  return {
    total_users: usersById.size,
    total_balance: round2(totalBalance),
    rounds_today: roundsToday,
    avg_crash: round2(avgCrash),
    recent_rounds: recent.slice(0, 20).map((r) => ({
      id: r.id,
      crash_point: r.crash_point,
      status: r.status,
      ended_at: r.ended_at ? new Date(r.ended_at).toISOString() : null,
    })),
  };
}
