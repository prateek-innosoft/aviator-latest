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

// ── Protect Mode: two-tier conservative table (72% 1.00-1.30, 28% 1.30-2.00)
//    whenever there's real stake — nothing above 2.00x. ──
{
  const e4 = new GameEngine();
  e4.overrides.winMode = "protect";
  let allInRange = true;
  let sawEconomyActive = false;
  for (let i = 0; i < 200; i++) {
    (e4 as any).phase = "betting";
    (e4 as any).playerBets = [];
    e4.placeBet(`sock-protect-${i}`, 0, 100);
    (e4 as any).lockRoundAndSelectCrash();
    const cp = (e4 as any).crashPoint as number;
    if (cp < 1.0 || cp > 2.0) allInRange = false;
    if ((e4 as any).economyActiveForRound === true) sawEconomyActive = true;
  }
  assert(allInRange, "protect mode: 200 rounds with real stake all crash within [1.00, 2.00]");
  assert(sawEconomyActive, "protect mode: economyActiveForRound is true when real stake exists");
}
{
  // Lure takes precedence over every admin mode: with nobody betting, even
  // Protect mode flies the enticing lure table, not the protect ceiling.
  const e5 = new GameEngine();
  e5.overrides.winMode = "protect";
  (e5 as any).phase = "betting";
  (e5 as any).playerBets = [];
  (e5 as any).lockRoundAndSelectCrash();
  assert(
    (e5 as any).economyActiveForRound === false,
    "no-stake round falls through to lure mode regardless of admin mode",
  );
}
{
  // Custom mode also defers to lure when nobody has bet (lure-first precedence).
  const eCustomNoBet = new GameEngine();
  eCustomNoBet.overrides.forcedCrash = 2.0;
  (eCustomNoBet as any).phase = "betting";
  (eCustomNoBet as any).playerBets = [];
  (eCustomNoBet as any).lockRoundAndSelectCrash();
  assert(
    (eCustomNoBet as any).economyActiveForRound === false,
    "custom mode with no bets flies lure (lure-first precedence), not the forced crash",
  );
  // …but with a real bet, custom honors the exact forced crash.
  const eCustom = new GameEngine();
  eCustom.overrides.forcedCrash = 2.0;
  (eCustom as any).phase = "betting";
  (eCustom as any).playerBets = [];
  eCustom.placeBet("sock-custom", 0, 100);
  (eCustom as any).lockRoundAndSelectCrash();
  assert(
    (eCustom as any).crashPoint === 2.0 && (eCustom as any).economyActiveForRound === true,
    `custom mode with a real bet crashes at exactly the forced value (got ${(eCustom as any).crashPoint})`,
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

// ── Reserve is a real ledger: after each economy-active round it moves by
//    (stake collected − paid out). ──
{
  // Players lost (paidOut 0) → house keeps the whole stake → reserve up.
  const e6 = new GameEngine();
  const start = (e6 as any).bankroll as number; // 2,00,000
  (e6 as any).economyActiveForRound = true;
  (e6 as any).roundRealStake = 1000;
  (e6 as any).roundPaidOut = 0;
  (e6 as any).settleBankroll();
  assert((e6 as any).bankroll === start + 1000, `all-lose round adds full stake to reserve (got ${(e6 as any).bankroll})`);
}
{
  // Mixed: staked 1000, paid 600 → net +400.
  const e7 = new GameEngine();
  const start = (e7 as any).bankroll as number;
  (e7 as any).economyActiveForRound = true;
  (e7 as any).roundRealStake = 1000;
  (e7 as any).roundPaidOut = 600;
  (e7 as any).settleBankroll();
  assert((e7 as any).bankroll === start + 400, `reserve += stake − paidOut (expected ${start + 400}, got ${(e7 as any).bankroll})`);
}
{
  // Big win: staked 100, paid 500 → net −400, reserve drops.
  const e8 = new GameEngine();
  const start = (e8 as any).bankroll as number;
  (e8 as any).economyActiveForRound = true;
  (e8 as any).roundRealStake = 100;
  (e8 as any).roundPaidOut = 500;
  (e8 as any).settleBankroll();
  assert((e8 as any).bankroll === start - 400, `a net-loss round shrinks the reserve (expected ${start - 400}, got ${(e8 as any).bankroll})`);
}
{
  // Floor: reserve can never go below 0 even if net would push it negative.
  const e9 = new GameEngine();
  (e9 as any).bankroll = 100;
  (e9 as any).economyActiveForRound = true;
  (e9 as any).roundRealStake = 50;
  (e9 as any).roundPaidOut = 500; // net −450 → 100 − 450 < 0 → floored to 0
  (e9 as any).settleBankroll();
  assert((e9 as any).bankroll === 0, `reserve floors at 0 (got ${(e9 as any).bankroll})`);
}
{
  // Lure rounds (no economy) never touch the reserve.
  const e10 = new GameEngine();
  const start = (e10 as any).bankroll as number;
  (e10 as any).economyActiveForRound = false;
  (e10 as any).roundRealStake = 0;
  (e10 as any).roundPaidOut = 0;
  (e10 as any).settleBankroll();
  assert((e10 as any).bankroll === start, "lure (no-economy) round leaves the reserve unchanged");
}

// ── Solvency invariant: per-round payout ceiling = reserve + stake. ──
{
  const e11 = new GameEngine();
  (e11 as any).bankroll = 200000;
  (e11 as any).phase = "betting";
  (e11 as any).playerBets = [];
  e11.placeBet("sock-ceiling", 0, 5000);
  (e11 as any).lockRoundAndSelectCrash();
  assert(
    (e11 as any).roundMaxPayout === 205000,
    `roundMaxPayout = reserve + stake = 205000 (got ${(e11 as any).roundMaxPayout})`,
  );
}

console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
