/**
 * Crash-point selection tables for each round.
 *
 * Every mode here is a DISCLOSED weighted table — the crash multiplier is a
 * genuine random draw from a fixed distribution, and nothing ever looks at
 * individual bet amounts. There is no RTP formula and no per-target return
 * guarantee (that whole system was removed). The four modes:
 *   - lure    (no real stake)  → wide, exciting table; no money is at risk
 *   - protect (admin-selected) → conservative two-tier table for thin reserves
 *   - fair    (admin-selected) → reserve-driven Tight / Normal / Bonus tables
 *   - custom  (admin-selected) → a fixed crash the admin types in (see engine)
 *
 * The company reserve (bankroll) is a real running ledger — it grows by the
 * net of each round (stake collected − paid out) — and also serves as the
 * per-round payout ceiling. See GameEngine.settleBankroll / lockRoundAndSelectCrash.
 */

export interface CrashTier {
  lo: number;
  hi: number;
  weight: number;
}

/** Generic fallback weighted distribution (weights sum to 100). */
export const DEFAULT_CRASH_TIERS: CrashTier[] = [
  { lo: 1.00, hi: 1.20, weight: 55 },
  { lo: 1.21, hi: 2.00, weight: 35 },
  { lo: 2.01, hi: 5.00, weight: 5 },
  { lo: 5.01, hi: 20.0, weight: 4 },
  { lo: 20.01, hi: 100.0, weight: 1 },
];

/**
 * Used only for rounds with zero real stakes (no payout risk to the house),
 * to make the game look enticing to anyone watching before they place a bet.
 * Deliberately covers the full range — including plain 1x-2x crashes — so it
 * reads as a real, varied distribution; the fat tail toward 20x-100x is what
 * pulls the long-run average far above the real modes. Sums to 100.
 */
export const NO_BET_LURE_TIERS: CrashTier[] = [
  { lo: 1.00, hi: 1.99, weight: 30 },
  { lo: 2.00, hi: 2.99, weight: 30 },
  { lo: 3.00, hi: 4.99, weight: 10 },
  { lo: 5.00, hi: 9.99, weight: 10 },
  { lo: 10.00, hi: 19.99, weight: 5 },
  { lo: 20.00, hi: 49.99, weight: 5 },
  { lo: 50.00, hi: 100.00, weight: 10 },
];

/**
 * Admin-selectable "Protect Mode" — a deliberately conservative two-tier
 * table for a thin-reserve launch window: 72% crash 1.00–1.30x, 28% crash
 * 1.30–2.00x. A genuine random draw with no knowledge of bet amounts; just a
 * tighter, more house-favorable shape than Fair mode. Sums to 100.
 */
export const PROTECT_MODE_TIERS: CrashTier[] = [
  { lo: 1.00, hi: 1.30, weight: 72 },
  { lo: 1.30, hi: 2.00, weight: 28 },
];

/**
 * Fair Mode's three reserve-dependent sub-modes. Which sub-mode is active
 * depends only on the company's current reserve (bankroll), never on
 * individual bets, so it stays a uniform, non-targeted random draw for
 * everyone in a round. Each table sums to 100.
 */
export const FAIR_TIGHT_TIERS: CrashTier[] = [
  { lo: 1.00, hi: 1.10, weight: 55 },
  { lo: 1.10, hi: 1.50, weight: 25 },
  { lo: 1.50, hi: 2.00, weight: 15 },
  { lo: 2.00, hi: 3.00, weight: 4 },
  { lo: 3.00, hi: 5.00, weight: 1 },
];

export const FAIR_NORMAL_TIERS: CrashTier[] = [
  { lo: 1.00, hi: 1.30, weight: 40 },
  { lo: 1.30, hi: 2.00, weight: 39 },
  { lo: 2.00, hi: 4.00, weight: 15 },
  { lo: 4.00, hi: 6.00, weight: 4 },
  { lo: 6.00, hi: 10.00, weight: 2 },
];

export const FAIR_BONUS_TIERS: CrashTier[] = [
  { lo: 1.00, hi: 1.30, weight: 30 },
  { lo: 1.30, hi: 2.50, weight: 40 },
  { lo: 2.50, hi: 5.00, weight: 15 },
  { lo: 5.00, hi: 10.00, weight: 10 },
  { lo: 10.00, hi: 20.00, weight: 5 },
];

export type FairSubMode = "tight" | "normal" | "bonus";

/** Reserve thresholds that pick Fair Mode's sub-mode (see selectFairSubMode). */
export const FAIR_RESERVE_TIGHT_CEILING = 300_000;
export const FAIR_RESERVE_BONUS_FLOOR = 700_000;
/** Chance of Bonus (vs. Normal) once reserve reaches FAIR_RESERVE_BONUS_FLOOR. */
export const FAIR_BONUS_CHANCE_AT_HIGH_RESERVE = 0.30;

/**
 * Picks Fair Mode's sub-mode from the current reserve alone — never from bet
 * amounts — so the choice is disclosed and uniform for every player in the
 * round:
 *   reserve <  3,00,000            -> Tight, always
 *   3,00,000 <= reserve < 7,00,000 -> Normal, always
 *   reserve >= 7,00,000            -> Normal 70% / Bonus 30% per round
 */
export function selectFairSubMode(
  reserve: number,
  rand: () => number = Math.random,
): FairSubMode {
  if (reserve < FAIR_RESERVE_TIGHT_CEILING) return "tight";
  if (reserve < FAIR_RESERVE_BONUS_FLOOR) return "normal";
  return rand() < FAIR_BONUS_CHANCE_AT_HIGH_RESERVE ? "bonus" : "normal";
}

export function fairTiersFor(mode: FairSubMode): CrashTier[] {
  if (mode === "tight") return FAIR_TIGHT_TIERS;
  if (mode === "bonus") return FAIR_BONUS_TIERS;
  return FAIR_NORMAL_TIERS;
}

/** Hard ceiling on any single crash multiplier, admin overrides included. */
export const HARD_CAP_MULTIPLIER = 130;

function round2(n: number): number {
  return Math.floor(n * 100) / 100;
}

function randBetween(lo: number, hi: number, rand: () => number): number {
  return round2(lo + rand() * (hi - lo));
}

/** Pick a crash multiplier from a weighted tier table. */
export function generateWeightedCrash(
  rand: () => number = Math.random,
  tiers: CrashTier[] = DEFAULT_CRASH_TIERS,
): number {
  const r = rand() * 100;
  let acc = 0;
  for (const tier of tiers) {
    acc += tier.weight;
    if (r < acc) return randBetween(tier.lo, tier.hi, rand);
  }
  const last = tiers[tiers.length - 1];
  return randBetween(last.lo, last.hi, rand);
}
