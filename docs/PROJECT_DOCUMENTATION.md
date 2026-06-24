# Aviator Game — Complete Project Documentation

A full-stack crash betting game (Aviator-style) with real-time multiplayer, provably-fair crash points, admin controls, and Supabase wallet integration.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Getting Started](#4-getting-started)
5. [Architecture — How It All Fits](#5-architecture--how-it-all-fits)
6. [Backend Deep Dive](#6-backend-deep-dive)
7. [Frontend Deep Dive](#7-frontend-deep-dive)
8. [Database Schema](#8-database-schema)
9. [Socket.IO Events Reference](#9-socketio-events-reference)
10. [REST API Reference](#10-rest-api-reference)
11. [Admin Panel](#11-admin-panel)
12. [Game Flow — Step by Step](#12-game-flow--step-by-step)
13. [Authentication](#13-authentication)
14. [Known Issues & Pre-Production Notes](#14-known-issues--pre-production-notes)

---

## 1. Project Overview

This is an **Aviator crash game** — a multiplayer betting game where a plane flies and a multiplier climbs from 1.00x upward. Players place bets before the round starts, then cash out before the plane "crashes." If they cash out in time, they win `bet × multiplier`. If the plane crashes first, they lose their bet.

**Key features:**
- Real-time WebSocket-based gameplay (Socket.IO)
- Two simultaneous bet panels per player
- Auto-bet and auto-cash-out modes
- Fake bot players to simulate a live betting table
- Admin panel to control win/loss mode, bet limits, forced crash points
- Supabase backend for real wallet transactions (authenticated users)
- Demo mode for unauthenticated players (in-memory balance)
- Provably-fair crash point generation with hashed seed commitment

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, TailwindCSS v4, Zustand (state), GSAP (animations), Socket.IO Client |
| Backend | Node.js, Express, TypeScript, Socket.IO, Zod (validation) |
| Database | Supabase (PostgreSQL), with RPC functions for wallet operations |
| Real-time | Socket.IO (WebSocket) |

---

## 3. Project Structure

```
avitor/
├── frontend/                 # React SPA
│   ├── src/
│   │   ├── App.tsx           # Root component — routes between game and admin
│   │   ├── main.tsx          # React entry point
│   │   ├── index.css         # Global styles + Tailwind
│   │   ├── types.ts          # Shared TypeScript types (GamePhase, PanelState, etc.)
│   │   ├── store/
│   │   │   └── gameStore.ts  # Zustand store — all game state + Socket.IO event handlers
│   │   ├── lib/
│   │   │   ├── socket.ts     # Socket.IO client initialization
│   │   │   ├── authContext.tsx # Auth provider (login, logout, session in localStorage)
│   │   │   └── format.ts     # Number formatting utilities (fmt, multTier)
│   │   ├── components/
│   │   │   ├── GameCanvas.tsx    # The flying plane + multiplier graph (canvas + GSAP)
│   │   │   ├── BetPanel.tsx      # Single bet panel (amount input, bet/cashout button, auto mode)
│   │   │   ├── BetPanels.tsx     # Container — shows 1 or 2 BetPanel components
│   │   │   ├── HistoryBar.tsx    # Horizontal scrollable crash history pills
│   │   │   ├── LiveBets.tsx      # Sidebar list of all active bets (bots + real players)
│   │   │   ├── Header.tsx        # Top bar with logo + balance display
│   │   │   ├── BetErrorToast.tsx # Toast notification for bet rejections
│   │   │   ├── LoadingScreen.tsx # Overlay shown until game connects
│   │   │   ├── Avatar.tsx        # Avatar image component
│   │   │   ├── DemoBar.tsx       # Demo mode info bar
│   │   │   └── Footer.tsx        # Footer
│   │   ├── admin/
│   │   │   ├── AdminPanel.tsx       # Admin route guard — shows login or RateControlPanel
│   │   │   ├── RateControlPanel.tsx # Admin dashboard — win/loss mode, bet limits, forced crash
│   │   │   └── api.ts              # Typed fetch wrapper for admin REST API
│   │   └── assets/
│   │       └── plane.ts        # SVG plane component
│   ├── vite.config.ts          # Vite config with /api and /socket.io proxy to backend
│   ├── package.json
│   └── tailwind.config (via @tailwindcss/vite plugin)
│
├── backend/                   # Node.js + Express + Socket.IO server
│   ├── src/
│   │   ├── index.ts           # Main server — Express app, Socket.IO handlers, game loop
│   │   ├── gameEngine.ts      # Core game logic — rounds, crash points, bots, betting
│   │   ├── authRouter.ts      # Express router — login, logout, refresh, admin controls
│   │   ├── supabaseClient.ts  # Supabase client (service_role key — server only!)
│   │   ├── provablyFair.ts    # Seed generation + crash point from seed (SHA-256 based)
│   │   ├── fakeBets.ts        # Bot generation — random names, avatars, bet amounts, targets
│   │   ├── types.ts           # Shared TypeScript types (payloads, game state)
│   │   ├── globals.d.ts       # Global type for __gameEngine
│   │   └── engine.test.ts     # Basic engine unit test
│   ├── supabase/
│   │   └── migrations/
│   │       ├── 000001_initial_schema.sql    # Tables, indexes, RLS policies, seed data
│   │       └── 000002_game_rpc_functions.sql # PostgreSQL RPC functions for wallet ops
│   ├── .env.example           # Environment variable template
│   └── package.json
│
├── e2e/                       # End-to-end tests (Playwright)
├── ui-tests/                  # UI screenshot comparison tests
├── scripts/                   # Build/deploy helper scripts
└── README.md
```

---

## 4. Getting Started

### Prerequisites
- Node.js 18+
- A Supabase project (for database + wallet)

### Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env — fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev    # Starts on http://localhost:4000 (tsx watch mode)
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev    # Starts on http://localhost:5173 (Vite dev server)
```

### Environment Variables (backend/.env)
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Supabase service role key (server only, never expose) |
| `PORT` | No | `4000` | Backend server port |
| `HOST` | No | `0.0.0.0` | Backend bind address |
| `STARTING_BALANCE` | No | `1000` | Demo balance for unauthenticated players |
| `SERVER_INSTANCE_ID` | No | `aviator-server-1` | Unique server ID for audit logs |
| `ADMIN_TOKEN_SECRET` | No | `aviator-admin-secret-key` | HMAC-SHA256 secret for admin tokens |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origins |

### Building for Production
```bash
# Backend
cd backend
npm run build    # tsc → dist/
npm start        # node dist/index.js

# Frontend
cd frontend
npm run build    # tsc -b && vite build → dist/
# Serve dist/ with any static host (nginx, Netlify, Vercel, etc.)
```

---

## 5. Architecture — How It All Fits

```
┌─────────────────────────────────────────────────────────────┐
│                        BROWSER (SPA)                         │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  React UI   │  │  Zustand     │  │  Socket.IO Client  │  │
│  │  Components │←→│  gameStore   │←→│  (lib/socket.ts)   │  │
│  └─────────────┘  └──────────────┘  └─────────┬──────────┘  │
│                                                │             │
│  ┌─────────────┐                               │             │
│  │  Admin Panel│──→ fetch() ──→ /api/admin/*   │             │
│  └─────────────┘                               │             │
└────────────────────────────────────────────────┼─────────────┘
                                                 │ WebSocket
                                                 ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (Node.js)                         │
│                                                              │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐  │
│  │  Express     │  │  Socket.IO    │  │  GameEngine      │  │
│  │  REST API    │  │  Server       │  │  (EventEmitter)  │  │
│  │  (authRouter)│  │  (io.on)      │←→│                  │  │
│  └──────┬───────┘  └───────┬───────┘  └────────┬─────────┘  │
│         │                  │                    │            │
│         │                  │                    ▼            │
│         │                  │           ┌────────────────┐    │
│         │                  └──────────→│  Game Loop     │    │
│         │                              │  betting→fly   │    │
│         │                              │  →crash→repeat │    │
│         │                              └────────────────┘    │
│         ▼                                                    │
│  ┌──────────────────┐                                       │
│  │  Supabase Client │ ←── All DB operations (service_role)  │
│  │  (supabaseClient)│                                       │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

**Key design decisions:**
- **GameEngine** is a singleton `EventEmitter` that runs the game loop independently. It emits events (`round:betting`, `round:flying`, `tick:multiplier`, `round:crashed`) that `index.ts` broadcasts to all Socket.IO clients.
- **No optimistic updates** — the frontend never mutates balance locally. The server is the source of truth and echoes authoritative balance back via `bet:accepted`, `bet:cancelled`, `bet:cashedout`, and `balance:sync` events.
- **Dual auth paths** — Authenticated users (with `userId`) go through Supabase RPC for wallet operations. Demo users use in-memory balances stored per-socket.
- **Admin controls** are applied via `globalThis.__gameEngine` — the Express router pushes overrides directly into the engine's in-memory state.

---

## 6. Backend Deep Dive

### `gameEngine.ts` — The Heart of the Game

The `GameEngine` class extends `EventEmitter` and runs a continuous loop:

```
betting (5s countdown) → flying (multiplier climbs) → crashed (3s pause) → betting → ...
```

**Key properties:**
- `phase`: Current game phase (`"betting"`, `"flying"`, `"crashed"`)
- `multiplier`: Current multiplier (starts at 1.00, grows exponentially during flying)
- `crashPoint`: The multiplier at which the plane crashes (computed at round start, kept secret)
- `overrides`: Admin-controlled settings (win mode, bet limits, forced crash, next crash override)
- `playerBets`: Array of real player bets placed this round
- `bots`: Array of fake bot bets with pre-assigned cashout targets

**Crash point calculation** (`computeCrashPoint()`):
1. If `forcedCrash` is set → use it (admin forces every round to crash at this point)
2. If `nextCrashPoint` is set → use it once, then clear it (one-shot override)
3. Otherwise, based on `winMode`:
   - `"win"` → random 100x–130x (player wins big)
   - `"loss"` → random 1.00x–2.00x (house wins)
   - `"normal"` → random 1.00x–10.00x (fair mode)
4. Hard cap at 130x (cannot be exceeded by any method)

**Bot behavior** (`fakeBets.ts`):
- 60–180 bots generated per round
- Each bot has a target cashout multiplier (skewed toward low: 55% bail at 1.1–2.0x)
- Bots auto-cash-out when the multiplier passes their target (if it hasn't crashed yet)

### `index.ts` — Server Entry Point

Sets up:
- Express with CORS, rate limiting, security headers
- Socket.IO server
- REST endpoints: `/api/health`, `/api/state`, `/api/wallet`
- Socket.IO event handlers for: `auth:identify`, `bet:place`, `bet:cancel`, `bet:cancelWithAmount`, `bet:cashout`, `disconnect`
- Connects `GameEngine` events to Socket.IO broadcasts
- Manages demo balances (per-socket in-memory map)
- Manages authenticated socket mapping (`authedSockets` map)

### `authRouter.ts` — Authentication & Admin API

- **Custom HMAC-SHA256 token system** (not JWT, not Supabase Auth)
- Hardcoded admin credentials (see Known Issues)
- `signToken()` / `verifyToken()` — HMAC-based token creation/verification
- `requireAuth` middleware — validates Bearer token
- `requireAdmin` middleware — validates token + checks admin role
- REST endpoints: `POST /login`, `POST /refresh`, `POST /logout`, `GET /me`, `GET /admin/controls`, `PATCH /admin/controls`

### `provablyFair.ts` — Provably Fair System

- Server generates a random 32-byte seed, publishes its SHA-256 hash before the round
- After crash, the raw seed is revealed so players can verify the crash point wasn't changed
- `crashPointFromSeed()` uses the first 52 bits of the hash to generate a crash multiplier
- **Note:** Currently used only for history fallback. The live game uses random generation (see `computeCrashPoint`)

### `supabaseClient.ts`

- Creates a Supabase client with the **service_role key** (bypasses RLS)
- Used for all database operations: rounds, bets, wallets, config
- **Never expose this key to the frontend**

---

## 7. Frontend Deep Dive

### `gameStore.ts` — Zustand Store (The Brain)

This is the single source of truth for all game state on the client. It:

1. **Initializes Socket.IO listeners** in `init()` — handles all server events
2. **Manages game state**: phase, multiplier, countdown, history, balance, bets
3. **Manages bet panels**: two `PanelState` objects (amount, active, queued, cashedOut, auto settings)
4. **Provides actions**: `placeBet()`, `cancelBet()`, `cashOut()`, `setPanel()`

**Critical pattern — no optimistic balance updates:**
The store NEVER mutates `balance` on bet/cancel/cashout. It waits for the server to echo the authoritative balance back. This prevents desync and flicker.

**Auto-bet flow:**
When `autoBet` is enabled and a new `round:betting` event arrives, the store automatically calls `placeBet()` for that panel.

**Auto-cash-out flow:**
On every `tick:multiplier` event, the store checks if any active panel has auto-cash-out enabled and the multiplier has reached the target — if so, it calls `cashOut()`.

### `BetPanel.tsx` — The Betting Interface

Each panel has:
- **Mode tabs**: "bet" (manual) or "auto" (automated)
- **Amount input**: With +/- buttons and quick-chip buttons (10, 20, 50, 100). Uses a draft-commit pattern for smooth keyboard typing.
- **Action button**: Context-sensitive — shows "Bet", "Cancel", "Cash Out", or "Waiting" depending on game phase and panel state
- **Auto controls** (when in auto mode): Auto bet toggle, auto cash-out toggle + value input

**Button states:**
| State | Condition | Color |
|-------|-----------|-------|
| Bet | Phase=betting, no active bet | Green |
| Cancel | Phase=betting, has active bet | Red |
| Cash Out | Phase=flying, has active bet, not cashed out | Orange |
| Waiting | Already cashed out or round ended | Grey |

### `GameCanvas.tsx` — The Visual Game

- HTML5 Canvas rendering with GSAP animations
- Draws an exponential growth curve (the flight path)
- Plane SVG follows the curve tip
- Multiplier text displayed prominently
- Red flash + crash animation when the plane crashes
- Smoke particles and trail effects

### `LiveBets.tsx` — The Betting Sidebar

- Shows all active bets (bots + real players) sorted by bet amount
- Each row: avatar, masked name, bet amount, cashout multiplier (if cashed out), win amount
- Real-time updates as bots cash out and new bets are placed
- Shows total bets count and total win amount

### `authContext.tsx` — Authentication

- Simple token-based auth stored in `localStorage` under `aviator_admin_session`
- `login()` → POST to `/api/auth/login` → stores session
- `logout()` → POST to `/api/auth/logout` → clears localStorage
- `refreshProfile()` → GET `/api/auth/me` → updates profile
- Used by admin panel only (game works in demo mode without auth)

---

## 8. Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `config` | Key-value store for game settings (bet_limits, game config) |
| `users` | User profiles (linked to Supabase auth.users) |
| `wallets` | User wallet balances with optimistic concurrency (version field) |
| `wallet_ledger` | Audit trail of all wallet transactions |
| `rounds` | Game rounds (hashed seed, crash point, status) |
| `bets` | Individual bets (user, round, panel, amount, status) |
| `cashouts` | Cashout records (bet, round, multiplier, win amount) |
| `audit_rounds` | Full audit trail of round lifecycle |
| `user_limits` | Per-user betting limits (daily/weekly caps) |

### RPC Functions (in `000002_game_rpc_functions.sql`)

| Function | Purpose |
|----------|---------|
| `create_round(hashed_seed, server_instance_id)` | Creates a new round in `betting` status |
| `start_round(round_id)` | Transitions round to `flying` status |
| `resolve_round(round_id, crash_point, seed, server_instance_id)` | Marks round as `crashed`, reveals seed, marks lost bets, writes audit row |
| `place_bet(user_id, round_id, panel, amount, reference)` | Deducts wallet, creates bet record, writes ledger entry |
| `cancel_bet(user_id, round_id, panel, reference)` | Refunds wallet, marks bet as cancelled, writes ledger entry |
| `cashout_bet(user_id, round_id, panel, multiplier, reference)` | Credits winnings, marks bet as cashed_out, writes cashout + ledger records |

**All wallet operations use `FOR UPDATE` row locking** with a `version` field for optimistic concurrency. If a concurrent modification is detected, the transaction fails and returns `{ ok: false, reason: "concurrent" }`.

### RLS Policies
- Users can read their own profile, wallet, ledger, bets, cashouts, and limits
- Admins can manage all records
- The backend uses the service_role key which bypasses RLS entirely

---

## 9. Socket.IO Events Reference

### Server → Client Events

| Event | Payload | When |
|-------|---------|------|
| `init` | `{ state: PublicRoundState, balance, currency, betLimits }` | On socket connection |
| `round:betting` | `PublicRoundState` | New betting phase starts (5s countdown) |
| `tick:countdown` | `{ countdown: number }` | Every 100ms during betting |
| `round:flying` | `PublicRoundState` | Plane takes off |
| `tick:multiplier` | `{ multiplier, bets }` | Every 50ms during flying |
| `round:crashed` | `{ multiplier, seed, hashedSeed, history }` | Plane crashes |
| `bet:accepted` | `{ panel, amount, balance }` | Server accepted a bet |
| `bet:rejected` | `{ panel, reason, minBet?, maxBet? }` | Server rejected a bet |
| `bet:cancelled` | `{ panel, balance? }` | Bet was cancelled and refunded |
| `bet:cancel_failed` | `{ panel, reason }` | Cancel attempt failed |
| `bet:cashedout` | `{ panel, multiplier, win, balance }` | Player cashed out successfully |
| `balance:sync` | `{ balance }` | Authoritative balance push (after crash, on reconnect) |
| `betLimits:update` | `{ minBet, maxBet }` | Admin changed bet limits |

### Client → Server Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `auth:identify` | `{ userId, token }` | Identify as authenticated user (for real wallet) |
| `bet:place` | `{ panel, amount, userId? }` | Place a bet |
| `bet:cancel` | `{ panel }` | Cancel a bet (old handler) |
| `bet:cancelWithAmount` | `{ panel, amount, userId? }` | Cancel a bet (newer handler with amount) |
| `bet:cashout` | `{ panel, userId? }` | Cash out an active bet |

---

## 10. REST API Reference

### Auth Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | None | Login with email/password → returns HMAC token |
| POST | `/api/auth/refresh` | None (needs refresh_token in body) | Refresh expired token |
| POST | `/api/auth/logout` | Bearer token | Logout (stateless — just discard token) |
| GET | `/api/auth/me` | Bearer token | Get current user profile |

### Admin Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/admin/controls` | Admin token | Get current admin controls (win mode, bet limits, etc.) |
| PATCH | `/api/admin/controls` | Admin token | Update admin controls |

### Public Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Health check (returns status + current phase) |
| GET | `/api/state` | Current game state (phase, multiplier, bets, history) |
| GET | `/api/wallet` | Get authenticated user's wallet balance |

### Rate Limiting

| Limiter | Scope | Limit |
|---------|-------|-------|
| `globalLimiter` | All `/api/*` routes | 120 requests/min per IP |
| `loginLimiter` | `/api/auth/login` | 50 attempts per 15 min per IP (skips successful) |
| `adminLimiter` | `/api/admin/*` | 120 requests/min per IP |

---

## 11. Admin Panel

Accessed at `/admin` path. Shows login screen if not authenticated.

**Admin credentials (hardcoded):**
- Email: `admin@aviator.com`
- Password: `admin123`

**Controls available:**
- **Win Mode**: Normal / Win / Loss — controls global crash point bias
  - Normal: random 1.00x–10.00x
  - Win: random 100x–130x (players win big)
  - Loss: random 1.00x–2.00x (house wins)
- **Min Bet / Max Bet**: Bet amount limits
- **Next Crash Point**: One-shot override for the next round's crash point
- **Forced Crash**: Every round crashes at this multiplier until cleared

**How admin changes flow to the game:**
1. Admin PATCHes `/api/admin/controls` with new values
2. `authRouter.ts` updates the `config` table in Supabase (for persistence)
3. `authRouter.ts` calls setters on `globalThis.__gameEngine` (for immediate effect)
4. For bet limit changes, Socket.IO broadcasts `betLimits:update` to all clients
5. Frontend clamps panel amounts to new limits

---

## 12. Game Flow — Step by Step

### A Full Round Lifecycle

```
1. BETTING PHASE (5 seconds)
   ├── GameEngine.generateSeed() → creates seed + hashedSeed
   ├── GameEngine.computeCrashPoint() → determines crash multiplier (kept secret)
   ├── Supabase create_round() → persists round to DB
   ├── Bots generated (60-180 fake players)
   ├── emit("round:betting") → broadcast to all clients
   ├── Countdown ticks every 100ms → emit("tick:countdown")
   ├── Players place bets via socket.emit("bet:place")
   │   ├── Authenticated: Supabase place_bet() RPC → deducts wallet
   │   └── Demo: in-memory balance deduction
   ├── Players can cancel bets → refund
   └── Countdown reaches 0 → beginFlying()

2. FLYING PHASE
   ├── Supabase start_round() → transitions round to 'flying'
   ├── emit("round:flying") → broadcast
   ├── Multiplier grows exponentially: multiplier = e^(0.16 × t)
   ├── Every 50ms: emit("tick:multiplier") with current multiplier + all bets
   ├── Bots auto-cash-out when multiplier passes their target
   ├── Players cash out via socket.emit("bet:cashout")
   │   ├── Authenticated: Supabase cashout_bet() RPC → credits wallet
   │   └── Demo: in-memory balance addition
   └── Multiplier reaches crashPoint → beginCrash()

3. CRASHED PHASE (3 second pause)
   ├── Supabase resolve_round() → marks round as crashed, reveals seed
   │   └── All remaining 'locked' bets marked as 'lost'
   ├── emit("round:crashed") with seed + crash multiplier + history
   ├── Server syncs all balances:
   │   ├── Authenticated: fetch real wallet from DB
   │   └── Demo: send in-memory balance
   └── After 3s → beginBetting() → loop back to step 1
```

### Bet States

```
                    placeBet()
    [no bet] ──────────────────→ [active]
        ↑                           │
        │                           │ cancelBet()
        │←──────────────────────────┤
        │                           │ cashOut()
        │                           ↓
        │                        [cashedOut]
        │                           │
        │←──────────────────────────┘ (round ends)
        │
    [queued] ──placeBet()──→ [active]
    (during flying/crashed)     │
        ↑                       │
        │←──cancelBet()─────────┘
```

---

## 13. Authentication

### Current System

The project uses a **custom HMAC-SHA256 token system** (not Supabase Auth, not JWT):

1. **Admin login**: POST `/api/auth/login` with hardcoded credentials
2. **Token creation**: `signToken()` creates `base64url(payload).base64url(hmac_sig)`
3. **Token verification**: `verifyToken()` checks HMAC signature + expiry
4. **Token storage**: Frontend stores in `localStorage` as `aviator_admin_session`
5. **Token refresh**: POST `/api/auth/refresh` with refresh_token → new token

### Auth Paths in the Game

| Path | Trigger | Balance Source |
|------|---------|---------------|
| Demo (no auth) | No `userId` in socket events | In-memory `demoBalances` map (per socket) |
| Authenticated | `userId` present in socket events | Supabase `wallets` table via RPC |

**Note:** The `auth:identify` socket event currently uses `supabase.auth.getUser()` which expects a Supabase JWT, but the frontend sends a custom HMAC token. This means the authenticated path via Socket.IO is effectively broken (see Known Issues). The game works in demo mode for all users.

---

## 14. Known Issues & Pre-Production Notes

These are documented issues that were identified during a pre-production audit. They do not affect the current demo-mode gameplay but should be addressed before production with real users.

| # | Severity | Issue | Impact |
|---|----------|-------|--------|
| C1 | Critical | `auth:identify` uses `supabase.auth.getUser()` but frontend sends custom HMAC token | Authenticated users can't use real wallets via Socket.IO |
| C2 | Critical | `loadAdminControls()` reads from `admin_controls` table that doesn't exist in schema | Admin settings reset to defaults on server restart |
| C3 | Critical | `place_bet` RPC reads bet limits from wrong config key format | Bet limits don't work for authenticated users via RPC |
| C4 | Critical | Hardcoded admin credentials (`admin@aviator.com` / `admin123`) | Security risk — anyone with source access has admin login |
| C5 | Critical | Socket.IO CORS is `origin: "*"` | Any website can connect to the backend WebSocket |

**These do NOT affect current gameplay** — the game works perfectly in demo mode. They matter when:
- Adding real user authentication (C1)
- Persisting admin settings across restarts (C2)
- Enforcing bet limits for real-wallet users (C3)
- Going to production with public access (C4, C5)

---

*This documentation was generated as a knowledge transfer document for the Aviator project. Last updated after dead code cleanup and dependency removal.*
