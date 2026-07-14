/**
 * Controlled virtual-coin economy for each round.
 *
 * Real-money rounds use a mathematically-guaranteed-RTP crash formula
 * (see generateRtpCrash): crash = RTP / (1 - r) for random r in [0,1). This
 * gives P(crash >= m) = RTP/m for every multiplier m, so a player cashing
 * out at ANY target m has expected return m * RTP/m = RTP — constant,
 * regardless of stake size, player count, or cashout behavior. RTP is
 * guaranteed by the distribution itself, not by trying to pre-flight-fit a
 * simulated payout to a per-round budget (that approach was tried and
 * abandoned: it depends on guessing individual cashout behavior, which has
 * no real bearing on what a player actually does, so it systematically
 * mispriced payouts once real behavior diverged from the guess).
 *
 * A generous "circuit breaker" ceiling still exists as a backstop against
 * implausible mass-simultaneous-jackpot scenarios (see computeSafetyCeiling)
 * — it is not the RTP mechanism, it should essentially never trigger under
 * normal play.
 */

export interface CrashTier {
  lo: number;
  hi: number;
  weight: number;
}

/** Default weighted multiplier distribution (sums to 100). */
export const DEFAULT_CRASH_TIERS: CrashTier[] = [
  { lo: 1.00, hi: 1.20, weight: 55 },
  { lo: 1.21, hi: 2.00, weight: 35 },
  { lo: 2.01, hi: 5.00, weight: 5 },
  { lo: 5.01, hi: 20.0, weight: 4 },
  { lo: 20.01, hi: 100.0, weight: 1 },
];

/**
 * Used only for rounds with zero real stakes (no payout risk to the
 * house), to make the game look enticing to anyone watching before they
 * place a bet. Deliberately covers the full range — including plain
 * 1x-2x crashes — so it reads as a real, varied distribution rather than
 * an obviously-scripted "always huge" pattern; the fat tail toward
 * 20x-100x is what actually pulls the long-run average far above normal
 * mode. Sums to 100.
 */
export const NO_BET_LURE_TIERS: CrashTier[] = [
  { lo: 1.00, hi: 1.99, weight: 20 },
  { lo: 2.00, hi: 2.99, weight: 20 },
  { lo: 3.00, hi: 4.99, weight: 20 },
  { lo: 5.00, hi: 9.99, weight: 15 },
  { lo: 10.00, hi: 19.99, weight: 10 },
  { lo: 20.00, hi: 49.99, weight: 10 },
  { lo: 50.00, hi: 100.00, weight: 5 },
];

/**
 * Admin-selectable "Protect Mode" — a deliberately conservative weighted
 * table (not the RTP formula) for use when the house wants a much smaller,
 * disclosed, uniformly-applied edge than normal mode, e.g. during a
 * thin-reserve launch window. Every round still draws from the same public
 * distribution regardless of who's betting or how much — it does not look
 * at bet amounts, so it stays a genuine random draw, just a more
 * house-favorable one than DEFAULT_CRASH_TIERS. Sums to 100.
 */
export const PROTECT_MODE_TIERS: CrashTier[] = [
  { lo: 1.00, hi: 1.30, weight: 70 },
  { lo: 1.30, hi: 2.00, weight: 28 },
  { lo: 2.00, hi: 2.50, weight: 2 },
];

/**
 * Fair Mode's three reserve-dependent sub-modes. Unlike generateRtpCrash,
 * these are disclosed weighted tables (not a per-target RTP guarantee) —
 * which sub-mode is active depends only on the company's current reserve
 * (bankroll), never on individual bets, so it stays a uniform, non-targeted
 * random draw for everyone in a round. Each table sums to 100.
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

export interface SimBet {
  amount: number;
  /** Server-side estimate of where this player would cash out (assigned at bet time). */
  simCashoutTarget: number;
}

export interface RoundEconomyConfig {
  maxRtpPct: number;
  tiers: CrashTier[];
  maxAttempts: number;
}

export const DEFAULT_ECONOMY_CONFIG: RoundEconomyConfig = {
  maxRtpPct: 0.70,
  tiers: DEFAULT_CRASH_TIERS,
  maxAttempts: 200,
};

/** Hard ceiling on any single crash multiplier, admin overrides included. */
export const HARD_CAP_MULTIPLIER = 130;

/**
 * How generous the circuit-breaker ceiling is relative to a round's own
 * nominal RTP share. The crash FORMULA already guarantees RTP mathematically
 * — this only needs to catch implausible mass-simultaneous-jackpot cases,
 * not ordinary legitimate wins (which routinely exceed a single round's own
 * nominal share, e.g. any win at all on a lone bettor's stake).
 */
export const SAFETY_CEILING_MULTIPLE = 25;

/**
 * Generous backstop ceiling for a round's total payout — not the RTP
 * mechanism (the crash formula is), just protection against an implausible
 * pile-up of simultaneous big wins in one round.
 */
export function computeSafetyCeiling(
  totalStake: number,
  maxRtpPct: number,
  bankroll: number,
  hardCap: number = HARD_CAP_MULTIPLIER,
): number {
  const nominal = round2(totalStake * maxRtpPct);
  return round2(Math.max(nominal * SAFETY_CEILING_MULTIPLE, totalStake * hardCap * 0.5) + bankroll);
}

function round2(n: number): number {
  return Math.floor(n * 100) / 100;
}

function randBetween(lo: number, hi: number, rand: () => number): number {
  return round2(lo + rand() * (hi - lo));
}

/** Pick a crash multiplier from the weighted tier table. */
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

/**
 * Mathematically-guaranteed-RTP crash point: crash = RTP / (1 - r) for a
 * uniform random r in [0, 1). This gives P(crash >= m) = RTP / m for every
 * multiplier m >= 1, so a player cashing out at ANY target m has expected
 * return m * (RTP / m) = RTP — a constant, independent of stake size,
 * player count, or timing. This is what real crash games use to guarantee
 * RTP by construction rather than by predicting behavior.
 */
export function generateRtpCrash(
  maxRtpPct: number,
  rand: () => number = Math.random,
  hardCap: number = HARD_CAP_MULTIPLIER,
): number {
  const r = rand();
  const raw = maxRtpPct / (1 - r);
  return Math.min(Math.max(1.0, round2(raw)), hardCap);
}

/**
 * Estimate total payout if the round crashes at `crash`.
 * Each bet pays `amount × simCashoutTarget` when target ≤ crash.
 */
export function simulatePayoutAtCrash(crash: number, bets: SimBet[]): number {
  let paid = 0;
  for (const b of bets) {
    if (b.simCashoutTarget <= crash + 0.0001) {
      paid += b.amount * b.simCashoutTarget;
    }
  }
  return round2(paid);
}

/** Assign a server-side cashout target used only for pre-flight exposure estimates. */
export function assignSimCashoutTarget(rand: () => number = Math.random): number {
  const r = rand();
  if (r < 0.55) return round2(1.1 + rand() * 0.1);    // 1.10–1.20
  if (r < 0.90) return round2(1.21 + rand() * 0.79);   // 1.21–2.00
  if (r < 0.95) return round2(2.01 + rand() * 2.99);   // 2.01–5.00
  if (r < 0.99) return round2(5.01 + rand() * 14.99);  // 5.01–20.00
  return round2(20 + rand() * 30);                      // 20–50
}

export interface SelectCrashInput {
  totalStake: number;
  bets: SimBet[];
  config?: Partial<RoundEconomyConfig>;
  rand?: () => number;
  /** Admin override — skip economy loop. */
  forcedCrash?: number | null;
  /**
   * Unspent budget carried over from previous rounds (rounds that paid out
   * less than their nominal RTP share). Widens this round's payout ceiling
   * so realized RTP tracks the target over many rounds — including rounds
   * with too few bets for a single payout to ever fit under the nominal
   * per-round share alone (e.g. one bettor, whose win is either 0 or >=
   * their own full stake, can never land inside a nominal-only budget).
   */
  bankroll?: number;
}

export interface SelectCrashResult {
  crash: number;
  /** Nominal share for this round alone (totalStake × RTP), before bankroll. */
  nominalPayout: number;
  /** Effective ceiling actually used for selection (nominal + bankroll). */
  maxPayout: number;
  simulatedPayout: number;
  attempts: number;
  economyActive: boolean;
}

/**
 * Pick this round's crash point.
 * When there are no real bets, returns a weighted-random crash (no budget cap;
 * see NO_BET_LURE_TIERS, chosen by the caller).
 * When there are real bets, uses generateRtpCrash — RTP is guaranteed by the
 * formula itself. maxPayout returned here is a generous circuit-breaker
 * ceiling (see computeSafetyCeiling), not the RTP mechanism.
 */
export function selectCrashForRound(input: SelectCrashInput): SelectCrashResult {
  const cfg: RoundEconomyConfig = { ...DEFAULT_ECONOMY_CONFIG, ...input.config };
  const rand = input.rand ?? Math.random;
  const nominalPayout = round2(input.totalStake * cfg.maxRtpPct);

  if (input.forcedCrash != null) {
    const crash = round2(Math.min(input.forcedCrash, HARD_CAP_MULTIPLIER));
    return {
      crash,
      nominalPayout,
      maxPayout: nominalPayout,
      simulatedPayout: simulatePayoutAtCrash(crash, input.bets),
      attempts: 0,
      economyActive: input.totalStake > 0,
    };
  }

  if (input.totalStake <= 0) {
    const crash = generateWeightedCrash(rand, cfg.tiers);
    return { crash, nominalPayout: 0, maxPayout: 0, simulatedPayout: 0, attempts: 1, economyActive: false };
  }

  const crash = generateRtpCrash(cfg.maxRtpPct, rand);
  const maxPayout = computeSafetyCeiling(input.totalStake, cfg.maxRtpPct, input.bankroll ?? 0);

  return {
    crash,
    nominalPayout,
    maxPayout,
    simulatedPayout: simulatePayoutAtCrash(crash, input.bets),
    attempts: 1,
    economyActive: true,
  };
}

export function computeMaxPayout(totalStake: number, maxRtpPct: number): number {
  return round2(totalStake * maxRtpPct);
}
