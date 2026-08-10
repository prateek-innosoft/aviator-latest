# Developer Integration Guide

This documents how `avitor/backend` (the new crash-game engine) is wired into
the platform's NestJS backend (`igaming-nestjs-template`). It replaces the
old `aviator/backend` engine, which this integration is a direct port of.

**Read this alongside `igaming-nestjs-template/docs/AVIATOR.md`** — that
document covers the platform side (session tokens, wallet transactions,
`CasinoTransaction` bookkeeping, why no new Prisma tables) in detail. This
one covers only the engine side: what calls what, what's still local, and
what's still missing.

---

## 1. Architecture

```
Player launch (platform):
  Player app → POST /casino/create-session/:id (JwtAuthGuard)
    → CasinoService.createCasinoSession()
    → mints a game-session token (role: 'player')
    → returns { url: AVIATOR_GAME_URL + '?token=...' }

Player browser:
  avitor/frontend (its own origin)
    → connects Socket.IO to avitor/backend (this engine, its own process)
    → socket 'auth:identify' hands the engine { userId, token }

avitor/backend (this engine) — for every bet/cancel/cash-out a player's
socket sends, proxies to the platform backend, forwarding the same token:
    → GET  /aviator/wallet          (AviatorSessionGuard, forwarded token)
    → POST /aviator/bet/place       (forwarded token)
    → POST /aviator/bet/cancel      (forwarded token)
    → POST /aviator/bet/cashout     (forwarded token)

Engine's own privileged config polling (once per round-relevant admin
change, no player context):
    → GET/PUT /aviator/admin/config (AviatorAdminSessionGuard,
                                      AVIATOR_ENGINE_SESSION_TOKEN)

Local admin panel (avitor/frontend/src/admin/RateControlPanel.tsx):
    → this engine's own /api/admin/controls, /api/admin/reserve,
      /api/admin/stats — authenticated with a token this engine signs
      itself (hardcoded admin@aviator.com / admin123). See §4.
```

The engine is **the HTTP caller, not the player's browser** — the player's
browser only ever talks to `avitor/backend` over Socket.IO. `avitor/backend`
is the thing that must call the platform's wallet endpoints on the player's
behalf, once per bet/cancel/cash-out, using whatever token the player's
socket identified itself with.

## 2. What lives where

| Concern | Lives in | Notes |
|---|---|---|
| Crash curve, round timing, provably fair, Fair/Protect economy tables | `gameEngine.ts`, `roundEconomy.ts`, `provablyFair.ts` | Untouched by this integration — pure game logic, no I/O |
| Real wallet balance, bet place/cancel/cashout | Platform backend, via `nestClient.ts` | Source of truth is Postgres (`CasinoTransaction`/`CasinoRoundHistory`), not this process |
| `winMode` / `forcedCrash` (privileged, must never be player-visible) | Platform backend (`Provider.settings` JSON), via `nestClient.ts` | Admin sets these through the platform; engine polls them |
| Reserve / bankroll ledger | `reserveStore.ts` — local JSON file (`backend/reserve.json`) | **No platform equivalent.** Drives Fair Mode's Tight/Normal/Bonus sub-mode selection. Stays engine-local — see §6 |
| `custom_revert_to` (auto-revert bookkeeping after a one-shot Custom round) | `adminControls.ts` — module-local variable | **No platform equivalent.** Purely this process's memory, not persisted anywhere |
| Demo wallet (unauthenticated sockets) | `store.ts` — shared in-memory balance | Never touches the platform; not real money |
| Round history (for the in-game UI) | `store.ts` — last 500 rounds in memory | Never touches the platform; UI-only, not an audit trail |
| Local admin panel bet limits / win mode / forced crash | Round-trips through `adminControls.ts` to the platform (§1) | The panel itself is local; the values it edits are not |

## 3. File map

```
avitor/backend/src/
  nestClient.ts         Thin fetch wrapper: NEST_API_URL + x-game-session-token
  store.ts               Demo wallet + round history + stats (NOT real money — see §2)
  authRouter.ts           Local admin-panel login/routes only (no player login — see §4)
  adminControls.ts         min/max bet + winMode + forcedCrash synced via nestClient;
                            custom_revert_to kept local-only
  reserveStore.ts          Local JSON-persisted bankroll ledger (untouched)
  gameEngine.ts            Game logic + PlayerBet.betId (added for the Nest round-trip)
  roundEconomy.ts          Fair/Protect crash tables (untouched)
  provablyFair.ts          Seed/hash logic (untouched)
  index.ts                 Express + Socket.IO server; wallet/bet socket handlers
                            call nestClient instead of store.ts
```

## 4. Authentication — three separate mechanisms, don't mix them up

**Players never log into this engine.** They arrive already authenticated:
the platform mints a game-session token and hands it to the frontend via
`?token=...` in the launch URL (see AVIATOR.md in the platform repo). The
frontend passes that token to the engine on `auth:identify`, and the engine
forwards it as-is on every wallet call (`x-game-session-token` header) — it
is never verified locally, only by the platform (`AviatorSessionGuard`). A
failed `/aviator/wallet` lookup on `auth:identify` is the only signal that a
token is missing/invalid/expired; that socket is marked failed and never
falls back to the demo wallet (`authFailedSockets` in `index.ts`).

**The engine itself has one privileged, non-player credential**:
`AVIATOR_ENGINE_SESSION_TOKEN`, a long-lived admin-role token minted once via
`SpinforgeGameSessionService.issue(systemAdminId, gameId, 'admin')` on the
platform. This is what lets `adminControls.ts` read/write
`winMode`/`forcedCrash` without any per-player context. Treat it like a
secret — anyone holding it can control the crash outcome.

**The local admin panel** (bet limits, reserve, Custom mode) still signs its
own HMAC-SHA256 tokens against hardcoded `admin@aviator.com` / `admin123`
credentials (`authRouter.ts`) — this is an interim measure until the
platform has its own hosted Aviator admin frontend (tracked as a known gap
in AVIATOR.md). It is **not** connected to the platform's real admin auth in
any way. Don't reuse this token for anything platform-facing, and change the
hardcoded credentials (or replace this mechanism) before any real production
exposure.

## 5. Environment variables

```bash
# avitor/backend/.env

PORT=4000
SERVER_INSTANCE_ID=aviator-server-1

# Base URL of the platform NestJS backend
NEST_API_URL=http://localhost:3000

# Long-lived admin-role game-session token — mint once on the platform,
# see §4. Required for winMode/forcedCrash sync; adminControls.ts falls
# back to hardcoded defaults (logged as a warning) if this is missing or
# the platform call fails.
AVIATOR_ENGINE_SESSION_TOKEN=

# Local admin-panel token secret (see §4) — change in production
ADMIN_TOKEN_SECRET=change-me-to-a-random-secret

CORS_ORIGIN=*
```

```bash
# igaming-nestjs-template/.env — already documented in AVIATOR.md, repeated
# here for convenience since this engine depends on them

SPINFORGE_GAME_SESSION_SECRET=      # falls back to JWT_SECRET if unset
SPINFORGE_GAME_SESSION_EXPIRY=15m
AVIATOR_GAME_URL=http://localhost:5173
AVIATOR_ADMIN_URL=http://localhost:5173/admin
```

## 6. API contract with the platform

All calls go through `nestClient.ts` (`nestGet`/`nestPost`/`nestPut`),
authenticated with `x-game-session-token`.

| Call | Method | Token used | Called from |
|---|---|---|---|
| `/aviator/wallet` | GET | player token | `getRealWalletBalance()` — on `auth:identify`, `/api/wallet`, and every `round:crashed` broadcast |
| `/aviator/bet/place` | POST | player token | `bet:place` (authenticated path) |
| `/aviator/bet/cancel` | POST | player token | `bet:cancel`, `bet:cancelWithAmount`, and the rollback path in `bet:place` |
| `/aviator/bet/cashout` | POST | player token | `bet:cashout` (authenticated path) |
| `/aviator/admin/config` | GET/PUT | `AVIATOR_ENGINE_SESSION_TOKEN` | `adminControls.ts` `loadAdminControls`/`saveAdminControls` |

`roundId` sent to the platform is always `engine.roundRecordId` (a UUID
`store.ts` mints per round) — it's opaque to the platform, just used for
`CasinoTransaction.providerRoundId` bookkeeping. `betId` in cancel/cashout
calls is the `CasinoTransaction` id the platform returned from `bet/place`;
the engine now carries it on `PlayerBet.betId` for the lifetime of that bet.

**Money-path invariant to preserve if you touch `index.ts`:** every real-money
debit/credit is the platform's HTTP call succeeding — the engine's local
`playerBets` state is only ever updated *after* that call returns `ok`, and
is rolled back (a compensating cancel/`undoCashOut`) if a later local step
fails. Don't reorder these into "update engine state, then call platform" —
that reintroduces exactly the race class documented in `race_audit_results.txt`.

## 7. What's still local-only (by design)

- **Reserve/bankroll** (`reserveStore.ts`) — drives which Fair-mode sub-table
  (Tight/Normal/Bonus) gets used; there's no reserve concept on the platform.
  If you eventually want the reserve to live in the platform DB instead of a
  JSON file, that's a new Nest endpoint + schema field, not a client-side
  change here.
- **`custom_revert_to`** (`adminControls.ts`) — remembers which mode to
  revert to after a one-shot Custom round; purely this process's bookkeeping,
  resets on restart. Not sent to the platform because there's no field for it
  in `AviatorState`.
- **Demo wallet + round history + `/api/admin/stats`** (`store.ts`) — never
  touch real money or the platform; safe to keep in-memory.

## 8. Known gap: the frontend doesn't read the launch token yet

`avitor/frontend/src/lib/authContext.tsx` still only implements a local
email/password login form (`POST /api/auth/login`) — but that route now only
accepts the hardcoded admin credentials (see §4); real players have no
password to log in with. The frontend needs to:

1. Read `?token=` (and ideally `?userId=`, or decode it from the token) off
   the launch URL the platform hands it.
2. Skip the login screen entirely when a launch token is present — go
   straight to `socket.emit('auth:identify', { userId, token })`.
3. Keep the existing login form only as a demo-mode fallback, if that's
   still wanted for local dev without a running platform backend.

Until this is done, real-money play only works if you hand-craft the
`auth:identify` call (e.g. from the browser console) with a token minted by
the platform — useful for backend testing, not for real players yet.

## 9. Testing

```bash
cd avitor/backend
npm install         # if node_modules was copied from another OS, esbuild's
                     # native binary won't match — reinstall on this machine
npm run build        # tsc --noEmit equivalent; catches type errors across
                      # the Nest round-trip (betId, WinMode, etc.)
npx tsx src/store.test.ts   # demo wallet + round bookkeeping invariants
                             # (real wallet/bet logic is now tested on the
                             # platform side, not here)
```

Manual end-to-end smoke test before any cutover:
1. Start `igaming-nestjs-template` locally, seed Aviator
   (`npx ts-node prisma/seed.ts --seed-only aviator`), mint a player
   game-session token and an admin engine token.
2. Start `avitor/backend` with `NEST_API_URL` pointed at it and
   `AVIATOR_ENGINE_SESSION_TOKEN` set.
3. From a browser console (or a small script), connect a socket and send
   `auth:identify` with the minted player token; confirm `balance:sync`
   fires with the real wallet balance, not a `no_wallet` failure.
4. Place a bet, confirm a `CasinoTransaction` row appears on the platform
   side; cash out or let it crash; confirm the wallet balance actually moved.
5. Toggle `winMode`/`forcedCrash` via `PUT /admin/aviator/:gameId/config`
   on the platform and confirm the very next round reflects it (the engine
   re-polls `adminControls.ts` once per relevant admin action, not
   continuously — check `applyControlsToEngine` call sites in `index.ts`/
   `authRouter.ts` if a change isn't showing up).

## 10. Deployment checklist

- [ ] `NEST_API_URL` points at the real platform backend for the target environment
- [ ] `AVIATOR_ENGINE_SESSION_TOKEN` minted and set (treat as a secret)
- [ ] `ADMIN_TOKEN_SECRET` changed from the default, and/or the local admin
      panel's hardcoded credentials replaced before any real exposure
- [ ] `AVIATOR_GAME_URL` / `AVIATOR_ADMIN_URL` on the platform point at where
      `avitor/frontend` is actually hosted
- [ ] Frontend launch-token flow (§8) implemented — otherwise real players
      can't reach the authenticated path at all
- [ ] Old `aviator/` (root-level, previous engine) process decommissioned
- [ ] Smoke test (§9) run against the target environment's platform backend

## 11. Troubleshooting

**Bets rejected with `no_wallet`** — `auth:identify`'s wallet lookup failed;
check the token is a valid, unexpired player game-session token and that
`NEST_API_URL` is reachable from the engine process.

**`winMode`/`forcedCrash` changes on the platform don't show up in-game** —
confirm `AVIATOR_ENGINE_SESSION_TOKEN` is set and valid (check engine logs
for `[adminControls] failed to load config from Nest backend:` warnings,
which mean it silently fell back to defaults).

**Balance looks right in-game but wrong on the platform (or vice versa)** —
check for a network failure between an engine-side debit/credit call and the
socket emit — every `nestPost` call site should be the one place balance
changes originate; the engine never computes a balance locally for
authenticated players.

**Local admin panel won't log in** — it never talks to the platform; check
`ADMIN_TOKEN_SECRET` and the hardcoded `admin@aviator.com`/`admin123`
credentials in `authRouter.ts` are what you're using (see §4 for why this is
separate from platform auth).

## Support

- **Platform-side architecture**: `igaming-nestjs-template/docs/AVIATOR.md`
- **Game logic** (crash tables, provably fair): `docs/CLIENT_GUIDE.md`
- **Race conditions**: `race_audit_results.txt` (project root)
- **Original (pre-integration) project structure**: `docs/PROJECT_DOCUMENTATION.md`
