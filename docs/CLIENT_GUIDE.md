# Aviator Game — Client Guide

> **Everything you need to know about how the game actually works today, how to operate the admin panel, and what to watch out for.**
>
> This guide was last updated on 2026-07-16 against the live running code — it reflects the current four-mode crash system (Lure/Custom/Protect/Fair), the real-ledger Company Reserve, server-authoritative Auto Cash Out, and Custom mode's one-round auto-revert with explicit Set/Armed confirmation.

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
4. Once flying starts, the button becomes **Cash Out** showing your live potential win. Click it any time before the crash. While your click is in flight it shows **"Cashing Out…"** and disables — clicking again during that window is a no-op, not a second request.
5. If the plane crashes before you cash out, the bet is lost — no partial refund.
6. Crash points near 1.00x can resolve in well under a second (see §8) — if you click a moment too late, you'll see "Missed it — the round ended before your cash out went through." That's the server correctly rejecting a request that arrived after the round was already over, not a bug.

**Cancel:** during the betting window (before flight starts) you can click Cancel to get a full, immediate refund. Once flying starts, a bet can only be resolved by cashing out or losing to the crash.

---

## 3. Auto-Bet & Auto-Cashout

- **Auto Bet** — switch a panel to the "auto" tab and enable it: the same amount is placed automatically every betting window, with no manual click needed.
- **Auto Cash Out** — set a target multiplier and enable it: the server itself cashes the bet out the instant its own authoritative multiplier reaches your target, inside its own tick loop — the same mechanism used to resolve the simulated crowd's cashout targets. There's no client round-trip involved in the decision, so it lands at your exact target (not a fraction over it from network latency) and can't miss a narrow window between the target and the crash the way a client-driven request can.
- **Minimum auto-cashout target is 1.10x** — you cannot set a lower target than that.
- The two combine naturally: auto-bet + auto-cashout runs the panel completely hands-off.

---

## 4. Real Money vs. Demo Play

There are no player accounts. Every visitor to the game page plays through a single **shared demo wallet** (`backend/src/store.ts`: `getDemoBalance`/`adjustDemoBalance`), starting at ₹50,000. It persists across reconnects and is only reset by a backend restart. This is real gameplay against the real round engine and the real crash logic — just with shared play money instead of a personal balance.

The admin panel (`/admin`) has its own separate login (`admin@aviator.com` / `admin123`, hardcoded) — unrelated to the player wallet.

> The codebase still contains an older per-user authenticated wallet path (`store.ts`: `placeBet`/`cancelBet`/`cashoutBet`, plus seeded `tester1-5@aviator.local` accounts), but it is currently unreachable — the player page no longer has a login flow that triggers it. It's left in place as the intended hook point: a host site integration would wire its own login into this path and swap `store.ts`'s function bodies for real DB/wallet calls (see §7).

---

## 5. Understanding the Economy (read this before touching Admin)

The game has four crash-selection modes, checked in this order every round:

1. **Lure** — if nobody placed a real bet this round, the crash is drawn from a wide "exciting" table regardless of admin mode. No real money is at risk, so this always wins over every other mode.
2. **Custom** — the admin types an exact crash multiplier (1.00x-130.00x) and clicks **Set**; the next real-money round crashes there exactly. **One-shot**: the moment a round with real stake actually uses it, the server immediately clears it and reverts to whichever mode (Fair or Protect) was active right before Custom was chosen — automatically, no admin action needed. A round with zero real stake doesn't consume it (see Lure, above).
3. **Protect** — a fixed, conservative table: 72% of rounds crash 1.00x-1.30x, 28% crash 1.30x-2.00x. A genuine random draw that never looks at bet amounts.
4. **Fair** (default) — the sub-mode is picked purely from the current Company Reserve, never from who's betting or how much:

| Reserve | Sub-mode |
|---|---|
| below ₹3,00,000 | Tight |
| ₹3,00,000 – ₹6,99,999 | Normal |
| ₹7,00,000 and above | 70% Normal / 30% Bonus per round |

There is no RTP formula anywhere in the code — these are the only four modes, and none of them ever inspect individual bet amounts.

### Company Reserve is a real ledger, not a capped number
Every round with real money in play: `reserve += (real stake collected − amount paid out to winners)`, floored at 0. It also sets that round's payout ceiling: `maxPayout = reserve + this round's stake` — so a round can never mathematically pay out more than the house can cover. Admins can view the live value and set it directly (e.g. to withdraw profit or top it up) in the Company Reserve card — both the read-only live figure *and* the editable input field update automatically every round while the page is open; you don't need to refresh to see the current number, and the input won't let you accidentally overwrite recent growth with a stale value (it only stops tracking live updates while you're actively mid-edit).

---

## 6. Admin Panel Guide

Go to `/admin` and sign in with `admin@aviator.com` / `admin123` (hardcoded — see §7 on changing this before a real deployment).

Three cards:

- **Game Mode** — Fair / Protect / Custom (see §5).
  - Fair and Protect apply automatically ~600ms after you click them — no separate "enable economy" toggle exists, Fair mode is simply the default.
  - **Custom is different on purpose**: selecting the "Custom" tab only switches the view (shown **indigo**) — it does *not* arm anything by itself. Type the crash multiplier, then click **Set Custom Crash** to actually apply it. This was changed from an auto-save-as-you-type field specifically so a half-typed number (e.g. typing "9" on the way to "90") can never get committed and consumed by a round before you've finished — Custom mode is one-shot, so an accidental premature value would burn its one round on the wrong number.
  - Once you click Set, you get **two explicit confirmations** — a toast ("Custom crash set to X× — applies to the next round with real bets, one time only") and the Custom button itself turns **amber with a pulsing "Armed" badge**, so it's unmistakable at a glance whether a value is just typed vs. genuinely live. The card's status line below also spells it out in words either way ("nothing is armed yet" vs. "Custom mode is ACTIVE: ... will crash at exactly X×").
  - The whole panel updates itself live: once Custom's one round is consumed and the server reverts to Fair/Protect, the button color, the Armed badge, the status line, and the mode selector itself all snap back on their own — you'll see it without needing to refresh, even if you'd already edited something else on the page in the meantime.
- **Company Reserve** — shows the live value, plus an input to set it directly (withdraw profit by lowering it, top it up by raising it). Both track live updates automatically (see §5).
- **Round History** — shows the current in-progress round live (phase badge + live multiplier), not just rounds that have already finished, plus a scrollback of recent finished rounds.

There's also a **Bet Limits** card (min/max bet, still auto-saves ~600ms after the last edit), enforced both in the UI and on the server — a bet outside the range is rejected server-side even if the browser is bypassed.

---

## 7. Where the Data Lives (important)

**All game state — wallets, bets, round history, admin settings — lives in the server's memory only.** There is no database anymore (Supabase was fully removed). This means:

- **Restarting the backend resets everything** — every wallet balance, the reserve, round history, all snap back to their seeded starting values.
- This is intentional for running the game standalone/in development. The code is deliberately organized so this is a one-file swap: **`backend/src/store.ts`** is the single seam — every wallet, login, and round operation in the entire codebase goes through this one module. To merge into a real production site with its own accounts and durable wallets, replace the function bodies in `store.ts` with calls to the host site's own user/wallet/ledger services. Nothing else in the codebase needs to change.
- Until that swap happens, **do not run this as-is for real users with real money that needs to survive a restart** — a crash or redeploy will wipe every balance back to the seed values.

---

## 8. Known Limitations

- **Sub-second rounds:** crash points near 1.00x-1.10x (common under Protect and Fair-Tight) resolve in well under a second — the flying phase lasts `ln(crash) / 0.16` seconds, so a 1.05x crash gives you roughly 300ms. That can be shorter than human reaction time plus network latency, and is the #1 cause of a manual (non-auto) Cash Out click landing just late enough to get rejected. This is an inherent characteristic of the current growth curve, not a bug — a minimum flying-duration floor would be the fix if it needs addressing. Auto Cash Out (§3) isn't affected by this — it's resolved server-side, not by a client click.
- **Network delay still exists, but the UI compensates for it:** the displayed multiplier is synchronized to the backend's clock instead of replaying delayed socket ticks. Each browser tab also keeps a stable player identity across Socket.IO reconnects, so a brief transport drop no longer makes that tab's live bet unreachable for cancel or cash-out.
- **Demo wallet is shared** across every visitor — not per-browser or per-device. By design for testing, not appropriate for production as-is.
- **Dev-only WebSocket proxy hiccups:** in local dev, both the admin page and the player page tunnel through Vite's dev-server WebSocket proxy before reaching the backend — closing or refreshing one tab can occasionally knock the other's connection loose (visible as `ws proxy error: ECONNRESET` in the dev server log). The client reconnects fast enough (~250ms) that this shouldn't be visible in normal use, but it's a dev-environment artifact either way — a real deployment serves the frontend as static files with the socket connecting directly to the backend, no proxy in the path.

---

## 9. Common Questions

**Is the crash point rigged per player or per bet size?**
No — verified directly in code and by testing. The crash point is drawn before anyone's individual cash-out behavior is known, and none of the four modes look at bet amounts to pick or adjust the outcome. Fair mode's sub-mode selection uses only the reserve total, never who's betting.

**What happens if the server restarts mid-round?**
The round in progress is lost along with all in-memory state (see §7). This is a real operational gap for anything beyond testing.

**Can I verify a bet actually credited?**
Yes — every wallet operation (bet, cancel, cashout) goes through `store.ts`'s atomic in-memory functions, verified directly for exact debit/credit correctness including rejection of duplicate operations.

**Is there still an RTP formula or house-edge percentage setting?**
No — it was fully removed. The four modes in §5 (Lure/Custom/Protect/Fair) are the entire crash-selection system now; there's no separate return-to-player calculation layered on top.

**I set Custom mode and it's gone the next time I check the admin panel — is that a bug?**
No, that's the intended one-shot behavior (§5/§6). Once a round with real money actually uses your Custom crash value, it auto-reverts — the button drops its amber "Armed" look and the selector highlights whichever of Fair/Protect was active before, automatically. If it reverted before you expected, check whether real bets were already active when you clicked Set — with continuous real betting traffic, the very next round can lock (and consume it) within a second or two of you setting it.

**Why doesn't the Custom crash field save as I type anymore?**
That was changed deliberately: typing now only edits a local draft — nothing is sent to the server until you click **Set Custom Crash**. This prevents a half-typed number from being committed and burning Custom mode's one round on the wrong value.

**How do I tell whether Custom mode is actually armed, versus just being looked at?**
Color and a badge, not just text: indigo with no badge means the tab is open but nothing is set; **amber with a pulsing "Armed" badge** means a value is genuinely live and will be used on the next real-money round. The status line under the mode buttons also states it explicitly either way.

---

## Need Help?

Check `docs/PROJECT_DOCUMENTATION.md` for the fuller technical writeup, or the accompanying Test & Simulation Report for exactly what was verified and how.
