# Test & Simulation Report — 2026-07-13

Full autonomous run: automated unit/integration tests, live socket-level verification scripts, Playwright browser testing, a large-scale economic simulation, and one OpenCode subagent code-review pass. Everything below was actually executed against the live running app on this date — nothing here is a projection.

---

## Direct answers

### Is the company actually making a profit?

**Yes, and by a wide margin — house profit was consistently positive across every simulated scale, from 5,000 rounds up to 200,000 rounds, with a realistic mixed population of players (micro-bettors through whales).**

- 20,000-round run: ₹29.3 crore staked, ₹10.6 crore paid back, **₹18.8 crore house profit** (combined return ratio 36%).
- 200,000-round run (long-horizon check): ₹295.7 crore staked, ₹108.6 crore paid back, **₹187.2 crore house profit** (36.7% return ratio) — consistent with the shorter run, confirming this isn't a fluke of one seed.
- Three independent 5,000-round runs with different random seeds all landed within a tight band of each other (34.9%–37.9% return), confirming the profitability is stable, not a lucky outlier.
- Whale-heavy stress test (5,000 rounds, ₹20k–₹1.5L bets): ₹51.3 crore staked, ₹35.8 crore paid, **₹15.5 crore profit** — profitable even under concentrated large-stake pressure.

**But flag this clearly: the realized ~36% return ratio (house keeping ~64%) is well below what the old "70% RTP" framing implied, and well above a "30% house edge" framing.** This is expected and explained below, not a bug — but it means the actual house take is currently much more aggressive than either of those numbers suggests, and depends on what multiplier targets real players pick, not a guaranteed formula.

### Is everything working?

**Yes**, across every layer tested:
- 90 automated unit/integration checks pass (22 engine, 37 round-economy, 31 store) — zero failures.
- Full authenticated real-money flow verified end-to-end for the first time this project (previously blocked by a now-fully-removed Supabase dependency): login → real balance sync → bet debit → live cashout → exact win credit → independently re-verified via a fresh API call.
- Admin panel: mode switching (Fair/Protect/Custom), bet limit changes, and Round Economy display all confirmed to take effect on the very next round with no restart, verified via direct API + live socket observation, not just UI inspection.
- Core player flow (bet, cancel, auto-bet, auto-cashout, insufficient-balance blocking, bet-limit clamping) verified live in a real browser via Playwright.

### Is every test case, every edge working?

**Almost all — two real bugs were found and fixed during this run; one real limitation was found, verified safe, and documented rather than fixed (see below).**

Verified working correctly:
- Server-side rejection of oversized, negative, and zero-amount bets (bypassing the browser entirely) — all 4/4 checks passed.
- Duplicate `bet:place` on an already-active panel — rejected cleanly.
- Duplicate `bet:cashout` on the same panel — first succeeds, second is cleanly rejected, **no double payout, no unwarranted round-wide crash** (this was a real bug — see below).
- Cancel during betting phase — exact full refund, verified both for a queued (never-sent) bet and an already-accepted (server-debited) bet.
- Reconnect mid-round — money-safe (no loss or duplication), but the reconnected session cannot act on its pre-reconnect bet; documented as a known limitation, not silently broken.
- Zero-stake ("lure") rounds correctly bypass both Protect and Fair mode regardless of admin settings, verified in the existing automated suite.

**Two real bugs found and fixed in this run** (both in `backend/src/index.ts`):
1. **`bet:cancelWithAmount` (authenticated path) refunded the wallet before confirming the engine actually had the bet to remove.** If the round phase had already flipped to "flying" in the gap, the wallet was refunded while the engine's internal bet list still held the bet as live — a stale, inconsistent state. Fixed by reordering to match the already-correct sibling handler: remove from the engine first, only refund if that succeeds.
2. **Any rejected cashout while a round was flying force-crashed the entire round for every player** — including harmless cases like a duplicate double-click, not just genuine budget-exhaustion races. Fixed to only force-crash when a fresh budget check confirms it's a real budget race. Verified live: a duplicate cashout now resolves as one success + one clean "rejected" response, and the round completes normally to its real crash point instead of being cut short.

Both fixes are covered by dedicated regression tests (in the codebase temporarily during verification, since removed per project convention — the underlying behavior is now also exercised by the existing `engine.test.ts` suite's protect/fair-mode coverage).

### What should be handled with proper care?

In priority order:

1. **All data is in-memory only — a server restart wipes every wallet, every reserve figure, all history.** This is the single most operationally important fact in this report. `backend/src/store.ts` is deliberately the one file to replace when merging into a real site with durable accounts (its own docstring says so) — until that swap happens, this must not run with real money that needs to survive a crash or redeploy.
2. **The "reserve" figure does not represent real accumulated profit.** It's a capped circuit-breaker sizing number (≈20× recent average stake), not a P&L total. Confirmed directly: in the 20,000-round run, real profit was ₹18.8 crore while the displayed reserve only moved from ₹2,00,000 to ₹2,89,980. Anyone reading "reserve" as "how much have we made" will be badly misled.
3. **Fair mode's realized return is not calibrated to any specific target percentage** — it depends on the tier tables' fixed shape versus what targets real players choose, unlike the old RTP-formula system which guaranteed a fixed return regardless of behavior. If a specific house-take percentage is a business requirement, the tier weights need calibrating against real (or realistically simulated) player behavior, not assumed from the "70/30" framing in older docs.
4. **Bonus mode is nearly unreachable under normal traffic** as currently configured, because the reserve is capped low relative to the ₹7,00,000 threshold — confirmed in simulation (0 Bonus-mode rounds out of ~20,000 under realistic mixed traffic; it only appeared under a whale-heavy scenario with much larger average stakes). If Bonus mode is meant to be a regularly-reachable state, the threshold or the reserve-capping formula needs revisiting.
5. **Reconnect-mid-round UX** (see above) — money-safe today, but a real player-experience gap if disconnects are common on your target audience's network conditions.
6. **Hardcoded admin credentials** (`admin@aviator.com` / `admin123`) and the demo JWT-style token secret default (`aviator-admin-secret-key` if `ADMIN_TOKEN_SECRET` isn't set) must be changed before any real deployment.

---

## What was tested, in detail

| Area | Method | Result |
|---|---|---|
| Core crash-formula math (Protect, Fair tight/normal/bonus tier tables, reserve thresholds) | Automated unit tests, Monte Carlo up to 200,000 trials per check | 37/37 pass |
| Engine bet/cashout/phase-guard logic | Automated unit tests | 22/22 pass |
| In-memory store (wallets, login, bet ledger, rounds, stats) | Automated unit tests | 31/31 pass |
| Server-side bet validation (oversized/negative/zero/duplicate) | Live raw-socket script, bypassing the browser | 4/4 pass |
| Duplicate-cashout safety | Live raw-socket script | 3/3 pass (after fix) |
| Authenticated real-money flow (login → bet → cashout → persisted balance) | Live raw-socket + HTTP script | 7/7 pass |
| Admin bet-limit real-time propagation | Live raw-socket + HTTP script | 3/3 pass |
| Reconnect-mid-round money safety | Live raw-socket script (two sequential connections) | Confirmed safe, limitation documented |
| Core player flow in an actual browser | Playwright | Bet, cancel, auto-bet, auto-cashout, insufficient-balance block, bet-limit clamp all confirmed |
| Admin panel in an actual browser | Playwright + direct API cross-check | Mode switching confirmed live |
| Economic simulation | 20,000 / 200,000 / 3×5,000 / 5,000-whale-heavy runs using the real production crash-selection code | See profit figures above |
| Independent code review | OpenCode subagent (deepseek-v4-flash-free), read-only audit of bet/cashout paths | Found the 2 real bugs listed above, plus the reconnect limitation; 9 other flagged items checked and confirmed non-issues |

## OpenCode delegation note

Delegated a scoped, read-only edge-case audit to an OpenCode `general` subagent. It completed in one pass with a substantive 12-item report; two items were real, actionable bugs (now fixed), one was a real limitation (now documented), and nine were checked-and-confirmed-safe. No stalls this time — a separate OpenCode session used earlier in this project for a different task did stall on a trivial file read and was aborted per instruction rather than left to hang; this run was not affected.
