import { GameEngine } from "./gameEngine.js";

/**
 * Lightweight assertions for the core bet/cashout math and phase guards.
 * Run with: npx tsx src/engine.test.ts
 */
let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) {
    failures++;
    console.error("FAIL:", msg);
  } else {
    console.log("ok  :", msg);
  }
}

const e = new GameEngine();

// Force a controlled round state without starting the timers.
(e as any).phase = "betting";
(e as any).crashPoint = 5.0;

// Bets only accepted during betting.
assert(e.placeBet("sock-1", 0, 100) === true, "bet accepted during betting");
assert(e.placeBet("sock-1", 0, 100) === false, "duplicate bet on same panel rejected");
assert(e.placeBet("sock-1", 1, 50) === true, "second panel bet accepted");

// Cashout not allowed before flight.
assert(e.cashOut("sock-1", 0) === null, "cashout rejected while not flying");

// Enter flight. cashOut derives its own authoritative multiplier from
// elapsed real time (Date.now() - roundStart) — not a directly-settable
// field — so tests backdate roundStart to simulate a specific amount of
// flight time having passed.
(e as any).phase = "flying";
(e as any).roundStart = Date.now() - 1000; // ~1s elapsed -> raw = e^(0.16*1) ~= 1.1735 -> floors to 1.17

const r0 = e.cashOut("sock-1", 0);
assert(r0 !== null, "cashout succeeds in flight");
assert(r0?.win === 117, `win = bet*liveMultiplier (100*1.17=117), got ${r0?.win}`);

// Cannot cash out twice.
assert(e.cashOut("sock-1", 0) === null, "double cashout rejected");

// Panel 1 still open; simulate more elapsed flight time for a higher multiplier.
(e as any).roundStart = Date.now() - 2000; // ~2s elapsed -> raw = e^(0.32) ~= 1.3771 -> floors to 1.37
const r1 = e.cashOut("sock-1", 1);
assert(r1?.win === 68.5, `panel1 win 50*1.37=68.5, got ${r1?.win}`);

// Bet during betting cannot be placed mid-flight.
assert(e.placeBet("sock-2", 0, 10) === false, "bet rejected during flight");

// ── Live-multiplier crash guard (fixes the "1.00x crash should mean 100%
//    loss" gap): a cashout attempt after elapsed real time has already
//    reached the round's crash point must be rejected, even though the
//    tick loop hasn't formally transitioned the phase to "crashed" yet. ──
{
  const e2 = new GameEngine();
  (e2 as any).phase = "betting";
  (e2 as any).crashPoint = 1.0; // the ~30%-of-rounds case: crashes immediately
  e2.placeBet("sock-9", 0, 500);
  (e2 as any).phase = "flying";
  (e2 as any).roundStart = Date.now() - 500; // 0.5s has already elapsed -> raw > 1.00 already
  const late = e2.cashOut("sock-9", 0);
  assert(late === null, "cashout rejected once elapsed time has already reached a 1.00x crash point — full loss enforced");
}
{
  // Even at the very instant flight starts (t≈0), if crashPoint is exactly
  // 1.00, raw multiplier (e^0 = 1.0) already equals it — must reject, not
  // pay out a break-even 1.00x.
  const e3 = new GameEngine();
  (e3 as any).phase = "betting";
  (e3 as any).crashPoint = 1.0;
  e3.placeBet("sock-8", 0, 250);
  (e3 as any).phase = "flying";
  (e3 as any).roundStart = Date.now(); // t=0
  const instant = e3.cashOut("sock-8", 0);
  assert(instant === null, "cashout at the exact instant flight starts on a 1.00x-crash round is rejected, not paid at break-even");
}

// ── Protect Mode: admin override picks the conservative tier table,
//    independent of the normal RTP formula, whenever there's real stake. ──
{
  const e4 = new GameEngine();
  e4.overrides.winMode = "protect";
  let allInRange = true;
  let sawSubHardCeiling = false;
  for (let i = 0; i < 200; i++) {
    (e4 as any).phase = "betting";
    (e4 as any).playerBets = [];
    e4.placeBet(`sock-protect-${i}`, 0, 100);
    (e4 as any).lockRoundAndSelectCrash();
    const cp = (e4 as any).crashPoint as number;
    if (cp < 1.0 || cp > 2.5) allInRange = false;
    if ((e4 as any).economyActiveForRound === true) sawSubHardCeiling = true;
  }
  assert(allInRange, "protect mode: 200 rounds with real stake all crash within [1.00, 2.50]");
  assert(sawSubHardCeiling, "protect mode: economyActiveForRound is true when real stake exists");
}
{
  // Protect mode must not override the no-real-stake lure branch — with
  // nobody betting, it should still fly the enticing lure table, not force
  // a 1.00-2.50x ceiling on a round nobody has money in.
  const e5 = new GameEngine();
  e5.overrides.winMode = "protect";
  (e5 as any).phase = "betting";
  (e5 as any).playerBets = [];
  (e5 as any).lockRoundAndSelectCrash();
  assert(
    (e5 as any).economyActiveForRound === false,
    "protect mode: a round with zero real stake still falls through to lure mode, not the protect ceiling",
  );
}

// ── Fair Mode: sub-mode is picked from the engine's current reserve
//    (bankroll), independent of bet amounts, whenever there's real stake. ──
{
  const cases: [number, "tight" | "normal"][] = [
    [100_000, "tight"],   // reserve < 3,00,000
    [299_999, "tight"],
    [300_000, "normal"],  // 3,00,000 <= reserve < 7,00,000
    [699_999, "normal"],
  ];
  for (const [reserve, expected] of cases) {
    const e = new GameEngine();
    e.overrides.winMode = "normal";
    (e as any).bankroll = reserve;
    (e as any).phase = "betting";
    (e as any).playerBets = [];
    e.placeBet("sock-fair", 0, 100);
    (e as any).lockRoundAndSelectCrash();
    const mode = (e as any).fairSubMode;
    assert(mode === expected, `fair mode: reserve=${reserve} -> ${expected} (got ${mode})`);
  }
}
{
  // At/above the bonus floor, sub-mode should vary between normal and bonus
  // across rounds (never tight) — run enough rounds to see both appear.
  const e = new GameEngine();
  e.overrides.winMode = "normal";
  (e as any).bankroll = 1_000_000;
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) {
    (e as any).phase = "betting";
    (e as any).playerBets = [];
    e.placeBet(`sock-fair-high-${i}`, 0, 100);
    (e as any).lockRoundAndSelectCrash();
    seen.add((e as any).fairSubMode);
  }
  assert(!seen.has("tight"), "fair mode: reserve=10,00,000 never picks tight");
  assert(seen.has("normal") && seen.has("bonus"), `fair mode: reserve=10,00,000 sees both normal and bonus across 100 rounds (saw: ${[...seen].join(",")})`);
}
{
  // Fair mode's crash values must actually land within the selected
  // sub-mode's declared range, end to end through lockRoundAndSelectCrash.
  const e = new GameEngine();
  e.overrides.winMode = "normal";
  (e as any).bankroll = 100_000; // forces tight mode: max range is [1.0, 5.0]
  let allInRange = true;
  for (let i = 0; i < 300; i++) {
    (e as any).phase = "betting";
    (e as any).playerBets = [];
    e.placeBet(`sock-fair-tight-${i}`, 0, 100);
    (e as any).lockRoundAndSelectCrash();
    const cp = (e as any).crashPoint as number;
    if (cp < 1.0 || cp > 5.0) allInRange = false;
  }
  assert(allInRange, "fair mode (tight, forced by low reserve): 300 rounds all crash within [1.00, 5.00]");
}

// ── Regression: a small first real-money round must NOT collapse the
//    starting reserve. This previously happened because avgRealStakeEma
//    cold-started at exactly the first round's own stake (e.g. ₹10), which
//    fed a cap of just 10*20=₹200 — instantly clipping the real ₹2,00,000
//    starting bankroll down to ₹200 in a single settleBankroll() call. ──
{
  const e6 = new GameEngine();
  const startingBankroll = (e6 as any).bankroll as number; // 2,00,000
  (e6 as any).economyActiveForRound = true;
  (e6 as any).roundRealStake = 10;
  (e6 as any).roundNominalBudget = 7; // 10 * 0.70
  (e6 as any).roundPaidOut = 0; // nobody cashed out -> full surplus banked
  (e6 as any).settleBankroll();
  const after = (e6 as any).bankroll as number;
  assert(
    after > startingBankroll * 0.9,
    `a single ₹10 first bet must not collapse the ₹${startingBankroll} reserve (got ${after} after settleBankroll)`,
  );
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
