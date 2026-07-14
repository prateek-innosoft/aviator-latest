/**
 * roundEconomy.test.ts — controlled RTP crash selection invariants.
 * Run: npx tsx src/roundEconomy.test.ts
 */

import {
  generateWeightedCrash,
  generateRtpCrash,
  computeSafetyCeiling,
  selectCrashForRound,
  simulatePayoutAtCrash,
  computeMaxPayout,
  DEFAULT_CRASH_TIERS,
  PROTECT_MODE_TIERS,
  FAIR_TIGHT_TIERS,
  FAIR_NORMAL_TIERS,
  FAIR_BONUS_TIERS,
  FAIR_RESERVE_TIGHT_CEILING,
  FAIR_RESERVE_BONUS_FLOOR,
  selectFairSubMode,
  fairTiersFor,
} from "./roundEconomy.js";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

// ── Weighted table sums to 100 ───────────────────────────────────────────────
const totalWeight = DEFAULT_CRASH_TIERS.reduce((s, t) => s + t.weight, 0);
assert(totalWeight === 100, `tier weights sum to 100 (got ${totalWeight})`);

// ── Generated crashes land in tier bounds ────────────────────────────────────
{
  let ok = true;
  for (let i = 0; i < 500; i++) {
    const c = generateWeightedCrash();
    if (c < 1.0 || c > 100) { ok = false; break; }
  }
  assert(ok, "500 weighted crashes in [1.0, 100]");
}

// ── maxPayout = stake × RTP (nominal share, informational) ───────────────────
assert(computeMaxPayout(3500, 0.70) === 2450, "3500 stake × 70% RTP = 2450 max payout");

// ── generateRtpCrash: P(crash >= m) = RTP / m, so any fixed cashout target
//    has the same expected return — this is what guarantees RTP, not budget
//    fitting. Monte Carlo check: average payout for players who always cash
//    out at a fixed target m should converge close to RTP × stake. ─────────
{
  const RTP = 0.70;
  const target = 2.0;
  const trials = 200000;
  let stake = 0;
  let payout = 0;
  for (let i = 0; i < trials; i++) {
    const crash = generateRtpCrash(RTP, Math.random);
    stake += 1;
    if (crash >= target) payout += target;
  }
  const realizedRtp = payout / stake;
  assert(
    Math.abs(realizedRtp - RTP) < 0.03,
    `fixed-target(${target}x) realized RTP ≈ ${RTP} over ${trials} trials (got ${realizedRtp.toFixed(4)})`,
  );
}
{
  // Same guarantee holds for a totally different target — proves RTP isn't tied to a specific m.
  const RTP = 0.70;
  const target = 10.0;
  const trials = 200000;
  let wins = 0;
  for (let i = 0; i < trials; i++) {
    const crash = generateRtpCrash(RTP, Math.random);
    if (crash >= target) wins++;
  }
  const realizedRtp = (wins * target) / trials;
  assert(
    Math.abs(realizedRtp - RTP) < 0.05,
    `fixed-target(${target}x) realized RTP ≈ ${RTP} over ${trials} trials (got ${realizedRtp.toFixed(4)})`,
  );
}
{
  const c = generateRtpCrash(0.70, () => 0);
  assert(c === 1.0, `r=0 → crash floors at 1.0 (got ${c})`);
}
{
  const c = generateRtpCrash(0.70, () => 0.999999);
  assert(c === 130, `r→1 clamps at HARD_CAP_MULTIPLIER=130 (got ${c})`);
}

// ── computeSafetyCeiling: generous circuit breaker, not a tight budget ──────
{
  const ceiling = computeSafetyCeiling(3500, 0.70, 0);
  assert(ceiling > 3500 * 0.70, `safety ceiling (${ceiling}) is well above nominal share alone`);
  assert(
    computeSafetyCeiling(3500, 0.70, 1000) === computeSafetyCeiling(3500, 0.70, 0) + 1000,
    "bankroll adds directly onto the safety ceiling",
  );
}

// ── selectCrashForRound with real stake uses the RTP formula ───────────────
{
  const bets = [
    { amount: 1000, simCashoutTarget: 1.5 },
    { amount: 500, simCashoutTarget: 1.8 },
    { amount: 2000, simCashoutTarget: 2.0 },
  ];
  const picked = selectCrashForRound({
    totalStake: 3500,
    bets,
    config: { maxRtpPct: 0.70 },
    rand: () => 0.42,
  });
  assert(picked.economyActive, "economy active with real stake");
  assert(picked.nominalPayout === 2450, `nominalPayout = 2450 (got ${picked.nominalPayout})`);
  assert(picked.maxPayout > picked.nominalPayout, "safety ceiling exceeds nominal share (circuit breaker, not tight budget)");
  assert(picked.crash >= 1.0, `crash ${picked.crash} >= 1.0`);
}

// ── No stake → free weighted crash ───────────────────────────────────────────
{
  const picked = selectCrashForRound({ totalStake: 0, bets: [] });
  assert(!picked.economyActive, "no economy when stake is 0");
  assert(picked.crash >= 1.0, "still generates valid crash");
}

// ── simulatePayoutAtCrash ───────────────────────────────────────────────────
{
  const paid = simulatePayoutAtCrash(1.8, [
    { amount: 1000, simCashoutTarget: 1.5 },
    { amount: 500, simCashoutTarget: 2.0 }, // target > crash → no payout
  ]);
  assert(paid === 1500, `sim payout at 1.8x = 1500 (got ${paid})`);
}

// ── Protect Mode tier table ──────────────────────────────────────────────────
{
  const totalW = PROTECT_MODE_TIERS.reduce((s, t) => s + t.weight, 0);
  assert(totalW === 100, `protect mode tier weights sum to 100 (got ${totalW})`);

  const counts = { low: 0, mid: 0, high: 0 };
  const trials = 100000;
  for (let i = 0; i < trials; i++) {
    const c = generateWeightedCrash(Math.random, PROTECT_MODE_TIERS);
    if (c < 1.0 || c > 2.5) { counts.low = -1; break; } // sentinel for out-of-range
    if (c < 1.30) counts.low++;
    else if (c < 2.00) counts.mid++;
    else counts.high++;
  }
  assert(counts.low !== -1, "all protect-mode crashes land within [1.00, 2.50]");
  const lowPct = (counts.low / trials) * 100;
  const midPct = (counts.mid / trials) * 100;
  const highPct = (counts.high / trials) * 100;
  assert(
    Math.abs(lowPct - 70) < 1.5,
    `~70% of protect-mode crashes in [1.00, 1.30) (got ${lowPct.toFixed(2)}%)`,
  );
  assert(
    Math.abs(midPct - 28) < 1.5,
    `~28% of protect-mode crashes in [1.30, 2.00) (got ${midPct.toFixed(2)}%)`,
  );
  assert(
    Math.abs(highPct - 2) < 1,
    `~2% of protect-mode crashes in [2.00, 2.50) (got ${highPct.toFixed(2)}%)`,
  );
}

// ── Fair Mode sub-mode tier tables ──────────────────────────────────────────
{
  const tables: [string, typeof FAIR_TIGHT_TIERS, number, number][] = [
    ["tight", FAIR_TIGHT_TIERS, 1.0, 5.0],
    ["normal", FAIR_NORMAL_TIERS, 1.0, 10.0],
    ["bonus", FAIR_BONUS_TIERS, 1.0, 20.0],
  ];
  for (const [name, tiers, lo, hi] of tables) {
    const w = tiers.reduce((s, t) => s + t.weight, 0);
    assert(w === 100, `fair:${name} tier weights sum to 100 (got ${w})`);
    let inRange = true;
    for (let i = 0; i < 5000; i++) {
      const c = generateWeightedCrash(Math.random, tiers);
      if (c < lo || c > hi) { inRange = false; break; }
    }
    assert(inRange, `fair:${name} 5000 crashes land within [${lo}, ${hi}]`);
  }
}

// ── selectFairSubMode: reserve thresholds ───────────────────────────────────
{
  assert(
    selectFairSubMode(0) === "tight",
    "reserve 0 -> tight",
  );
  assert(
    selectFairSubMode(FAIR_RESERVE_TIGHT_CEILING - 1) === "tight",
    "reserve just under 3,00,000 -> tight",
  );
  assert(
    selectFairSubMode(FAIR_RESERVE_TIGHT_CEILING) === "normal",
    "reserve exactly 3,00,000 -> normal",
  );
  assert(
    selectFairSubMode(FAIR_RESERVE_BONUS_FLOOR - 1) === "normal",
    "reserve just under 7,00,000 -> normal",
  );

  // At/above the bonus floor: ~70% normal / ~30% bonus, never tight.
  let normalCount = 0, bonusCount = 0, tightCount = 0;
  const trials = 50000;
  for (let i = 0; i < trials; i++) {
    const mode = selectFairSubMode(FAIR_RESERVE_BONUS_FLOOR, Math.random);
    if (mode === "normal") normalCount++;
    else if (mode === "bonus") bonusCount++;
    else tightCount++;
  }
  assert(tightCount === 0, "reserve >= 7,00,000 never picks tight");
  const normalPct = (normalCount / trials) * 100;
  const bonusPct = (bonusCount / trials) * 100;
  assert(
    Math.abs(normalPct - 70) < 1.5,
    `reserve >= 7,00,000: ~70% normal (got ${normalPct.toFixed(2)}%)`,
  );
  assert(
    Math.abs(bonusPct - 30) < 1.5,
    `reserve >= 7,00,000: ~30% bonus (got ${bonusPct.toFixed(2)}%)`,
  );
}

// ── fairTiersFor maps mode -> correct table ─────────────────────────────────
assert(fairTiersFor("tight") === FAIR_TIGHT_TIERS, "fairTiersFor(tight) returns FAIR_TIGHT_TIERS");
assert(fairTiersFor("normal") === FAIR_NORMAL_TIERS, "fairTiersFor(normal) returns FAIR_NORMAL_TIERS");
assert(fairTiersFor("bonus") === FAIR_BONUS_TIERS, "fairTiersFor(bonus) returns FAIR_BONUS_TIERS");

console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`} (${passed} checks)\n`);
process.exit(failed === 0 ? 0 : 1);
