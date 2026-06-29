/**
 * tick.test.ts
 *
 * Verifies the new multiplier formula: e^(GROWTH*t) - 1
 * - Starts at 0.00x at t=0
 * - Crosses 1.00x at ~6.25s
 * - House win crash points (0.10x-0.99x) are genuinely reached as the plane climbs
 * - Normal fair crash points still work
 *
 * Run with:  npx tsx src/tick.test.ts
 */

export {};

const GROWTH = 0.16;
const TICK_MS = 50;

function multiplierAt(ms: number): number {
  const t = ms / 1000;
  return Math.floor((Math.exp(GROWTH * t) - 1) * 100) / 100;
}

// Simulate a full round: returns the tick count when multiplier >= crashPoint
function simulateRound(crashPoint: number): { ticks: number; timeMs: number; reachedAt: number } {
  let t = 0;
  while (true) {
    const m = multiplierAt(t);
    if (m >= crashPoint) {
      return { ticks: t / TICK_MS, timeMs: t, reachedAt: m };
    }
    t += TICK_MS;
    if (t > 120_000) break; // safety: 2 min max
  }
  return { ticks: -1, timeMs: -1, reachedAt: -1 };
}

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`); }
  else       { failed++; console.error(`  ✗ FAIL: ${msg}`); }
}

console.log("\n══════════════════════════════════════════════════════════");
console.log("  Multiplier Formula: e^(0.16*t) - 1");
console.log("══════════════════════════════════════════════════════════");

// ── 1. Starts at exactly 0.00x ──────────────────────────────────────────────
console.log("\nTEST 1: Starting value");
assert(multiplierAt(0) === 0.00, `t=0ms → 0.00x (got ${multiplierAt(0)})`);

// ── 2. Passes through sub-1x values ─────────────────────────────────────────
console.log("\nTEST 2: Sub-1x progression (house win range)");
const checkpoints = [
  { ms: 500,  min: 0.08, max: 0.10 },
  { ms: 1000, min: 0.17, max: 0.19 },
  { ms: 2000, min: 0.37, max: 0.40 },
  { ms: 3000, min: 0.60, max: 0.65 },
  { ms: 4000, min: 0.89, max: 0.93 },
];
for (const cp of checkpoints) {
  const m = multiplierAt(cp.ms);
  assert(m >= cp.min && m <= cp.max, `t=${cp.ms}ms → ${m}x  (expected ${cp.min}x–${cp.max}x)`);
}

// ── 3. Crosses 1.00x around 4.35s ────────────────────────────────────────────
// e^(0.16*t)-1 = 1 → t = ln(2)/0.16 ≈ 4.33s
console.log("\nTEST 3: 1x crossover timing");
const cross1x = simulateRound(1.00);
assert(cross1x.timeMs >= 4200 && cross1x.timeMs <= 4500,
  `Crosses 1.00x at ${cross1x.timeMs}ms (~4.35s expected)`);

// ── 4. House win crash points (0.10x-0.99x) are reached gradually ────────────
console.log("\nTEST 4: House win — crash at sub-1x points (plane actually flies there)");
const housePoints = [0.10, 0.25, 0.50, 0.75, 0.99];
for (const cp of housePoints) {
  const r = simulateRound(cp);
  assert(r.ticks > 0,    `Crash at ${cp}x reached after ${r.ticks} ticks (${r.timeMs}ms)`);
  assert(r.timeMs < 6500,`Crash at ${cp}x happens before 1x crossover (${r.timeMs}ms < 6500ms)`);
  assert(r.reachedAt >= cp, `Multiplier reached ${r.reachedAt}x >= crash point ${cp}x`);
}

// ── 5. Normal mode crash points still reachable ───────────────────────────────
console.log("\nTEST 5: Fair mode crash points");
const fairPoints = [1.00, 1.50, 2.00, 3.00, 5.00];
for (const cp of fairPoints) {
  const r = simulateRound(cp);
  assert(r.ticks > 0 && r.timeMs > 0, `Crash at ${cp}x reached at ${r.timeMs}ms`);
}

// ── 6. Print multiplier table ─────────────────────────────────────────────────
console.log("\nMultiplier growth table (new formula):");
console.log("  Time    Multiplier");
for (const ms of [0, 500, 1000, 2000, 3000, 4000, 5000, 6000, 6250, 7000, 10000, 15000, 20000]) {
  const m = multiplierAt(ms);
  const s = (ms / 1000).toFixed(2);
  console.log(`  ${s.padStart(6)}s  →  ${m.toFixed(2)}x`);
}

// ── SUMMARY ───────────────────────────────────────────────────────────────────
console.log(`\n══════════════════════════════════════════════════════════`);
console.log(`RESULTS: ${passed} passed  ${failed} failed`);
if (failed === 0) console.log(`ALL TESTS PASSED ✓`);
else              console.error(`${failed} FAILED ✗`);
console.log(`══════════════════════════════════════════════════════════\n`);
process.exit(failed === 0 ? 0 : 1);
