# Aviator Game — Client Guide

> **Everything you need to know about how the game actually works today, how to operate the admin panel, and what to watch out for.**
>
> This guide was rewritten from scratch on 2026-07-13 against the live running code — the previous version described an older build (different currency, different mode system, a database that no longer exists) and should be disregarded.

---

## Table of Contents

1. [How a Round Works](#1-how-a-round-works)
2. [How to Bet & Cash Out](#2-how-to-bet--cash-out)
3. [Auto-Bet & Auto-Cashout](#3-auto-bet--auto-cashout)
4. [Real Money vs. Demo Play](#4-real-money-vs-demo-play)
5. [Understanding the Economy (read this before touching Admin)](#5-understanding-the-economy-read-this-before-touching-admin)
6. [Admin Panel Guide](#6-admin-panel-guide)
7. [Where the Data Lives (important — read before your first deploy)](#7-where-the-data-lives-important)
8. [Known Limitations](#8-known-limitations)
9. [Common Questions](#9-common-questions)

---

## 1. How a Round Works

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   BETTING    │────►│    FLYING    │────►│   CRASHED    │
│   (5 sec)    │     │  (variable)  │     │   (3 sec)    │
└──────────────┘     └──────────────┘     └──────────────┘
```

- **Betting (5 seconds):** place your bet on one or both panels before the countdown ends.
- **Flying:** the multiplier starts at 1.00x and climbs continuously (it compounds — the same percentage every fraction of a second, so it looks slow at first and accelerates). Cash out any time before the plane crashes to lock in `bet × multiplier`.
- **Crashed (3 seconds):** the plane crashes at a point that was secretly decided the instant flying began. Anyone who didn't cash out in time loses the full bet. A new round starts automatically.

The crash point is genuinely unknown to everyone — including the admin — until the plane actually reaches it. Nothing about the round-locking mechanism looks at who is betting or how much before deciding the crash point.

---

## 2. How to Bet & Cash Out

1. Type an amount or use a quick preset (10 / 20 / 50 / 100).
2. Click **Bet** during the betting countdown. Your balance is debited immediately and the button becomes **Cancel**.
3. If you click Bet while a round is already flying, your bet is **queued** for the next round instead — no money moves until the next betting window actually opens.
4. Once flying starts, the button becomes **Cash Out** showing your live potential win. Click it any time before the crash.
5. If the plane crashes before you cash out, the bet is lost — no partial refund.

**Cancel:** during the betting window (before flight starts) you can click Cancel to get a full, immediate refund. Once flying starts, a bet can only be resolved by cashing out or losing to the crash.

---

## 3. Auto-Bet & Auto-Cashout

- **Auto Bet** — switch a panel to the "auto" tab and enable it: the same amount is placed automatically every betting window, with no manual click needed.
- **Auto Cash Out** — set a target multiplier and enable it: the panel cashes out by itself the instant the live multiplier reaches your target.
- **Minimum auto-cashout target is 1.10x** — you cannot set a lower target than that.
- The two combine naturally: auto-bet + auto-cashout runs the panel completely hands-off.

---

## 4. Real Money vs. Demo Play

- **Not logged in:** you're on a single **shared demo wallet** (starts at ₹50,000, shared by everyone who isn't logged in). It's real gameplay against the real round engine, just with play money.
- **Logged in:** your bets debit and credit your own real wallet. Five test accounts are seeded for trying this out:

  | Email | Password | Starting balance |
  |---|---|---|
  | tester1@aviator.local | Test@1234 | ₹10,00,000 |
  | tester2@aviator.local | Test@1234 | ₹10,00,000 |
  | tester3@aviator.local | Test@1234 | ₹10,00,000 |
  | tester4@aviator.local | Test@1234 | ₹10,00,000 |
  | tester5@aviator.local | Test@1234 | ₹10,00,000 |

Both paths run through the exact same round engine and the exact same crash logic — demo play isn't rigged any differently than real-money play, it's just a shared balance instead of a personal one.

---

## 5. Understanding the Economy (read this before touching Admin)

The **Global Win Rate** setting has three modes. This is the single most important admin control — read this section fully before changing it on a live/real-money deployment.

### Fair mode (default)
Fair mode has **three sub-modes** that the server picks automatically, based on the company's current reserve — never based on who's betting or how much:

| Reserve | Sub-mode used | Crash distribution |
|---|---|---|
| below ₹3,00,000 | **Tight** | 55% 1.00–1.10x · 25% 1.10–1.50x · 15% 1.50–2.00x · 4% 2.00–3.00x · 1% 3.00–5.00x |
| ₹3,00,000 – ₹6,99,999 | **Normal** | 40% 1.00–1.30x · 39% 1.30–2.00x · 15% 2.00–4.00x · 4% 4.00–6.00x · 2% 6.00–10.00x |
| ₹7,00,000 and above | **70% Normal / 30% Bonus** per round | Bonus: 30% 1.00–1.30x · 40% 1.30–2.50x · 15% 2.50–5.00x · 10% 5.00–10.00x · 5% 10.00–20.00x |

The currently-active sub-mode and live reserve figure are shown in the admin panel's Round Economy card whenever there's real money in play.

**Important — this is not a guaranteed "70% payout" formula.** These are fixed tables, not the mathematical RTP formula older documentation described. That means the *actual* percentage paid back to players over time depends on what multiplier targets your real players tend to pick — it is not locked to 70% the way a formula-based system would be. In a large simulated run with a realistic mixed population of players (see the Test & Simulation Report), the *realized* house take came out around **60–65%** of everything wagered — noticeably higher than a "30% house edge" framing would suggest. **Recalibrate the tier weights if you specifically need the take rate to land near a target percentage** — don't assume the current tables automatically produce it.

### Protect mode
A single, fixed, more conservative table, intended for a thin-reserve launch window: **70% 1.00–1.30x · 28% 1.30–2.00x · 2% 2.00–2.50x.** Still a genuine, disclosed random draw — it does not look at bet amounts either.

### Custom mode
Every round crashes at the exact multiplier you type in, no randomness at all. Use only for demos/testing — running real money on Custom mode means the outcome is 100% predetermined and identical for every player, every round.

### The "Reserve" number is not the company's real profit total
The reserve figure shown in the admin panel and used to pick Fair mode's sub-mode is a **deliberately bounded circuit-breaker sizing number** — capped at roughly 20× the average recent stake per round — not a running total of accumulated profit. In our large simulation, actual house profit reached crores of rupees while the displayed "reserve" stayed in the low lakhs the entire time, because it's capped by design. **Do not read the reserve number as "how much money has the house made" — it isn't that.** If you need a true lifetime profit/loss figure, that needs to be tracked separately (not built yet).

One practical consequence: under realistic, moderate betting traffic, the reserve capping keeps it well under ₹7,00,000 almost permanently — **Bonus mode is very rarely reached in practice** unless bet sizes are consistently large. If you want Bonus mode to actually appear under normal traffic, lower the ₹7,00,000 threshold or change how the reserve is capped.

---

## 6. Admin Panel Guide

Go to `/admin` and sign in.

**Login:** `admin@aviator.com` / `admin123` (hardcoded — see §7 on changing this before a real deployment).

**What you can control, live, with immediate effect on the very next round:**
- **Global Win Rate** — Fair / Protect / Custom (see §5).
- **Round Economy** — enable/disable the economy engine, House Hold % / Max RTP % (these size the safety-ceiling circuit breaker, they no longer directly set the crash formula the way older docs described).
- **Bet Limits** — min/max bet, enforced both in the UI and on the server (verified: a bet outside the range is rejected server-side even if someone bypasses the browser).

All changes save automatically ~600ms after you stop typing/clicking, and apply starting the very next round — confirmed live via direct testing, no restart needed.

---

## 7. Where the Data Lives (important)

**All game state — wallets, bets, round history, admin settings — lives in the server's memory only.** There is no database anymore (Supabase was fully removed). This means:

- **Restarting the backend resets everything** — every wallet balance, the reserve, round history, all snap back to their seeded starting values.
- This is intentional for running the game standalone/in development. The code is deliberately organized so this is a one-file swap: **`backend/src/store.ts`** is the single seam — every wallet, login, and round operation in the entire codebase goes through this one module. To merge into a real production site with its own accounts and durable wallets, replace the function bodies in `store.ts` with calls to the host site's own user/wallet/ledger services. Nothing else in the codebase needs to change.
- Until that swap happens, **do not run this as-is for real users with real money that needs to survive a restart** — a crash or redeploy will wipe every balance back to the seed values.

---

## 8. Known Limitations

- **Reconnecting mid-round:** if a logged-in player's connection drops and reconnects while they have a bet in flight, they cannot cash out or cancel that specific bet from the new connection (verified directly). This is **not a money-safety issue** — the stake was already debited exactly once and the round resolves normally (the bet just can't be acted on, so it rides to the crash and is lost if not already won). The player's other future bets are unaffected. Worth fixing before a real launch if disconnects are common on your player base's networks.
- **Demo wallet is shared** across every logged-out visitor — it is not per-browser or per-device. This is by design for testing, not appropriate for production as-is.
- **Duplicate-panel-click safety:** clicking Cash Out twice in a row (or a flaky connection resending the click) is handled cleanly — the second attempt is rejected without affecting the round or double-paying. Verified directly.

---

## 9. Common Questions

**Is the crash point rigged per player or per bet size?**
No — verified directly in code and by testing. The crash point is drawn before anyone's individual cash-out behavior is known, and none of the three modes look at bet amounts to pick or adjust the outcome. Fair mode's sub-mode selection uses only the reserve total, never who's betting.

**What happens if the server restarts mid-round?**
The round in progress is lost along with all in-memory state (see §7). This is a real operational gap for anything beyond testing.

**Can I verify a bet actually credited?**
Yes — every wallet operation (bet, cancel, cashout) goes through `store.ts`'s atomic in-memory functions and was directly tested for exact debit/credit correctness, including that duplicate operations are rejected without double-spending or double-crediting.

**What's the real house take right now?**
See the accompanying Test & Simulation Report — short version: very profitable, but not calibrated to a clean "70/30" split the way the underlying formula-based system used to be. Recalibrate the Fair-mode tier tables if you need a specific target percentage.

---

## Need Help?

Check `docs/PROJECT_DOCUMENTATION.md` for the fuller technical writeup, or the accompanying Test & Simulation Report for exactly what was verified and how.
