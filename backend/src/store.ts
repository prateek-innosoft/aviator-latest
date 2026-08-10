/**
 * In-memory data store for everything that ISN'T real money.
 *
 * Real-money operations (wallet balance, bet place/cancel/cashout) go through
 * `nestClient.ts` to the platform NestJS backend instead — see index.ts's
 * socket handlers. This module only keeps: the shared demo wallet, round
 * bookkeeping for UI history, and admin stats aggregation.
 *
 * Everything here is process-memory only: it resets on restart.
 *
 * Concurrency: Node runs this single-threaded and every mutation below is
 * fully synchronous (no `await` between a balance read and its write), so
 * debit/credit operations are atomic by construction.
 */

import crypto from "node:crypto";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

// ── Rounds (for admin stats/history) ─────────────────────────────────────────

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
  // Trim old rounds to bound memory.
  while (roundOrder.length > MAX_ROUND_HISTORY) {
    const stale = roundOrder.pop()!;
    rounds.delete(stale);
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
//
// Real user/wallet totals now live on the platform backend (not this
// process), so this only reports what the engine actually knows about:
// round/crash history. Use the platform's own admin dashboard for
// user/balance aggregates.

export function getStats() {
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
