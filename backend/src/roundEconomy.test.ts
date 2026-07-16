/**
 * roundEconomy.test.ts — crash-table distribution invariants (no RTP system).
 * Run: npx tsx src/roundEconomy.test.ts
 */

import {
  generateWeightedCrash,
  DEFAULT_CRASH_TIERS,
  NO_BET_LURE_TIERS,
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

// ── Every published table sums to 100 ────────────────────────────────────────
for (const [name, tiers] of [
  ["default", DEFAULT_CRASH_TIERS],
  ["lure", NO_BET_LURE_TIERS],
  ["protect", PROTECT_MODE_TIERS],
  ["fair:tight", FAIR_TIGHT_TIERS],
  ["fair:normal", FAIR_NORMAL_TIERS],
  ["fair:bonus", FAIR_BONUS_TIERS],
] as const) {
  const w = tiers.reduce((s, t) => s + t.weight, 0);
  assert(w === 100, `${name} tier weights sum to 100 (got ${w})`);
}

// ── Generated crashes land in tier bounds ────────────────────────────────────
{
  let ok = true;
  for (let i = 0; i < 500; i++) {
    const c = generateWeightedCrash();
    if (c < 1.0 || c > 100) { ok = false; break; }
  }
  assert(ok, "500 default weighted crashes in [1.0, 100]");
}

// ── Protect Mode: 72% 1.00–1.30x, 28% 1.30–2.00x, nothing above 2.00 ────────
{
  const counts = { low: 0, mid: 0 };
  let outOfRange = false;
  const trials = 100000;
  for (let i = 0; i < trials; i++) {
    const c = generateWeightedCrash(Math.random, PROTECT_MODE_TIERS);
    if (c < 1.0 || c > 2.0) { outOfRange = true; break; }
    if (c < 1.30) counts.low++;
    else counts.mid++;
  }
  assert(!outOfRange, "all protect-mode crashes land within [1.00, 2.00]");
  const lowPct = (counts.low / trials) * 100;
  const midPct = (counts.mid / trials) * 100;
  assert(Math.abs(lowPct - 72) < 1.5, `~72% of protect-mode crashes in [1.00, 1.30) (got ${lowPct.toFixed(2)}%)`);
  assert(Math.abs(midPct - 28) < 1.5, `~28% of protect-mode crashes in [1.30, 2.00] (got ${midPct.toFixed(2)}%)`);
}

// ── Fair Mode sub-mode tier tables stay in their declared ranges ────────────
{
  const tables: [string, typeof FAIR_TIGHT_TIERS, number, number][] = [
    ["tight", FAIR_TIGHT_TIERS, 1.0, 5.0],
    ["normal", FAIR_NORMAL_TIERS, 1.0, 10.0],
    ["bonus", FAIR_BONUS_TIERS, 1.0, 20.0],
  ];
  for (const [name, tiers, lo, hi] of tables) {
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
  assert(selectFairSubMode(0) === "tight", "reserve 0 -> tight");
  assert(selectFairSubMode(FAIR_RESERVE_TIGHT_CEILING - 1) === "tight", "reserve just under 3,00,000 -> tight");
  assert(selectFairSubMode(FAIR_RESERVE_TIGHT_CEILING) === "normal", "reserve exactly 3,00,000 -> normal");
  assert(selectFairSubMode(FAIR_RESERVE_BONUS_FLOOR - 1) === "normal", "reserve just under 7,00,000 -> normal");

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
  assert(Math.abs(normalPct - 70) < 1.5, `reserve >= 7,00,000: ~70% normal (got ${normalPct.toFixed(2)}%)`);
  assert(Math.abs(bonusPct - 30) < 1.5, `reserve >= 7,00,000: ~30% bonus (got ${bonusPct.toFixed(2)}%)`);
}

// ── fairTiersFor maps mode -> correct table ─────────────────────────────────
assert(fairTiersFor("tight") === FAIR_TIGHT_TIERS, "fairTiersFor(tight) returns FAIR_TIGHT_TIERS");
assert(fairTiersFor("normal") === FAIR_NORMAL_TIERS, "fairTiersFor(normal) returns FAIR_NORMAL_TIERS");
assert(fairTiersFor("bonus") === FAIR_BONUS_TIERS, "fairTiersFor(bonus) returns FAIR_BONUS_TIERS");

console.log(`\n${failed === 0 ? "ALL PASSED" : `${failed} FAILED`} (${passed} checks)\n`);
process.exit(failed === 0 ? 0 : 1);
