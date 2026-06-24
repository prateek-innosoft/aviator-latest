# Aviator Game — Complete Knowledge Transfer Document

> **What this is:** A self-contained guide that lets any developer walk in cold and understand every piece of this project — what it does, how it works, where everything lives, and why it's built this way.

---

## Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [Tech Stack at a Glance](#2-tech-stack-at-a-glance)
3. [Project Structure (Clean)](#3-project-structure-clean)
4. [Quick Start Guide](#4-quick-start-guide)
5. [Architecture Overview](#5-architecture-overview)
6. [The Game Loop — How a Round Works](#6-the-game-loop--how-a-round-works)
7. [Backend: File-by-File Breakdown](#7-backend-file-by-file-breakdown)
8. [Frontend: File-by-File Breakdown](#8-frontend-file-by-file-breakdown)
9. [Database Schema & RPC Functions](#9-database-schema--rpc-functions)
10. [Socket.IO Events — Complete Reference](#10-socketio-events--complete-reference)
11. [REST API — Complete Reference](#11-rest-api--complete-reference)
12. [Admin Panel — How It Works](#12-admin-panel--how-it-works)
13. [Authentication System](#13-authentication-system)
14. [Crash Point Math — How Winners Are Determined](#14-crash-point-math--how-winners-are-determined)
15. [Bot System — Fake Players](#15-bot-system--fake-players)
16. [Provably Fair System](#16-provably-fair-system)
17. [Wallet & Balance System](#17-wallet--balance-system)
18. [Frontend State Management](#18-frontend-state-management)
19. [Bet Panel — Every State & Transition](#19-bet-panel--every-state--transition)
20. [Game Canvas — Visual Engine](#20-game-canvas--visual-engine)
21. [Environment Variables](#21-environment-variables)
22. [Building & Deploying](#22-building--deploying)
23. [Known Issues & Pre-Production Checklist](#23-known-issues--pre-production-checklist)
24. [Glossary](#24-glossary)

---

## 1. What Is This Project?

This is an **Aviator crash game** — the same style as Spribe's popular Aviator game.

**The concept is simple:**
1. A plane takes off and a multiplier starts climbing from **1.00x**
2. Players place bets *before* the round starts
3. During flight, players try to **cash out** before the plane crashes
4. If they cash out at 2.50x with a 100 ZAR bet → they win **250 ZAR**
5. If the plane crashes first → they **lose** their bet
6. The multiplier can crash at any moment — 1.00x, 1.23x, 5.67x, or up to 130.00x

**Who is this for?**
- The game is designed for a South African audience (currency: ZAR)
- Currently runs in **demo mode** (fake money) for all players
- Has admin controls to rig the game (win/loss mode, forced crash points)
- Database layer is ready for real-wallet integration but not yet active

---

## 2. Tech Stack at a Glance

| Piece | Technology | Why |
|-------|-----------|-----|
| **Frontend** | React 18 + TypeScript | Component-based UI with type safety |
| **Build tool** | Vite 5 | Fast HMR, optimized production builds |
| **Styling** | TailwindCSS v4 | Utility-first, no separate CSS files |
| **State management** | Zustand | Lightweight, no boilerplate, perfect for game state |
| **Animations** | GSAP | Smooth plane flight, button pulses, crash effects |
| **Real-time** | Socket.IO Client | WebSocket connection to backend |
| **Backend** | Node.js + Express + TypeScript | REST API + WebSocket server |
| **Real-time server** | Socket.IO Server | Bidirectional communication with all clients |
| **Validation** | Zod | Runtime schema validation for API inputs |
| **Database** | Supabase (PostgreSQL) | Managed Postgres with RPC functions |
| **Icons** | Lucide React | Clean, consistent icon set |

---

## 3. Project Structure (Clean)

```
avitor/
├── backend/                          # ── GAME SERVER ──
│   ├── src/
│   │   ├── index.ts                  # Entry point: Express + Socket.IO + game loop wiring
│   │   ├── gameEngine.ts             # Core game logic: rounds, crash points, bots, bets
│   │   ├── authRouter.ts             # REST API: login, logout, admin controls
│   │   ├── supabaseClient.ts         # Supabase connection (service_role key)
│   │   ├── provablyFair.ts           # SHA-256 seed → crash point (provably fair)
│   │   ├── fakeBets.ts               # Bot generator: names, avatars, bet amounts, targets
│   │   ├── types.ts                  # Shared TypeScript types
│   │   ├── globals.d.ts             # Global type declarations
│   │   └── engine.test.ts           # Basic unit test
│   ├── supabase/migrations/
│   │   ├── 000001_initial_schema.sql     # Tables, indexes, RLS, seed data
│   │   └── 000002_game_rpc_functions.sql # PostgreSQL functions for wallet ops
│   ├── .env.example                  # Environment variable template
│   └── package.json
│
├── frontend/                         # ── REACT SPA ──
│   ├── src/
│   │   ├── App.tsx                   # Root: routes between game (/) and admin (/admin)
│   │   ├── main.tsx                  # React DOM entry point
│   │   ├── index.css                 # Tailwind + global styles
│   │   ├── types.ts                  # Shared types (GamePhase, PanelState, LiveBet)
│   │   ├── store/
│   │   │   └── gameStore.ts          # Zustand store: ALL game state + socket handlers
│   │   ├── lib/
│   │   │   ├── socket.ts             # Socket.IO client (auto-connect, websocket only)
│   │   │   ├── authContext.tsx       # Auth provider (login/logout/session in localStorage)
│   │   │   └── format.ts             # fmt() number formatter + multTier() color tiers
│   │   ├── components/
│   │   │   ├── GameCanvas.tsx        # Canvas: plane, flight curve, multiplier, crash animation
│   │   │   ├── BetPanel.tsx          # One bet panel: amount input, bet/cashout button, auto mode
│   │   │   ├── BetPanels.tsx         # Container: shows 1 or 2 BetPanels side by side
│   │   │   ├── HistoryBar.tsx        # Top bar: scrollable crash history pills (color-coded)
│   │   │   ├── LiveBets.tsx          # Sidebar: all active bets (bots + players), real-time
│   │   │   ├── Header.tsx            # Top: logo + balance display
│   │   │   ├── BetErrorToast.tsx     # Toast: "Minimum bet is 1 ZAR" etc.
│   │   │   ├── LoadingScreen.tsx     # Overlay: shown until game connects
│   │   │   ├── Avatar.tsx            # Avatar image (numbered 0-71)
│   │   │   ├── DemoBar.tsx           # Demo mode info bar
│   │   │   └── Footer.tsx            # Footer
│   │   ├── admin/
│   │   │   ├── AdminPanel.tsx        # Route guard: shows login or RateControlPanel
│   │   │   ├── RateControlPanel.tsx  # Admin dashboard: win/loss, bet limits, crash overrides
│   │   │   └── api.ts               # Typed fetch wrapper for admin REST API
│   │   └── assets/
│   │       └── plane.ts             # SVG plane component
│   ├── vite.config.ts               # Dev proxy: /api + /socket.io → backend
│   └── package.json
│
├── docs/
│   └── PROJECT_DOCUMENTATION.md      # This file
├── .vscode/tasks.json                # VS Code build tasks
├── package.json                      # Root workspace: dev + build scripts
├── .gitignore
└── README.md
```

---

## 4. Quick Start Guide

### Prerequisites
- **Node.js 18+**
- A **Supabase project** (free tier works) — you need the URL and service_role key

### Step 1: Backend
```bash
cd backend
cp .env.example .env
# Open .env and fill in:
#   SUPABASE_URL=https://yourproject.supabase.co
#   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
npm install
npm run dev
# → Backend starts on http://localhost:4000
# → You should see: "Aviator backend listening on http://localhost:4000"
# → And: "[GameEngine] Loaded 40 rounds from DB history."
```

### Step 2: Frontend
```bash
cd frontend
npm install
npm run dev
# → Frontend starts on http://localhost:5173
# → Open this URL in your browser
```

### Step 3: Play
- The game loads automatically — no login required (demo mode)
- You start with 50,000 ZAR (or whatever `STARTING_BALANCE` is set to)
- Place a bet during the 5-second betting phase
- Cash out before the plane crashes!

### Step 4: Admin Panel
- Go to `http://localhost:5173/admin`
- Login: `admin@aviator.com` / `admin123`
- Control win/loss mode, bet limits, forced crash points

---

## 5. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                           BROWSER (SPA)                              │
│                                                                      │
│   ┌──────────┐    ┌──────────────┐    ┌─────────────────────────┐    │
│   │ React UI │◄──►│ Zustand      │◄──►│ Socket.IO Client        │    │
│   │ Components│   │ gameStore    │    │ (lib/socket.ts)         │    │
│   └──────────┘    └──────────────┘    └───────────┬─────────────┘    │
│                                                  │                   │
│   ┌──────────┐                                   │                   │
│   │ Admin    │─── fetch() ──→ /api/auth/*         │                   │
│   │ Panel    │─── fetch() ──→ /api/admin/*        │                   │
│   └──────────┘                                   │                   │
└──────────────────────────────────────────────────┼───────────────────┘
                                                   │ WebSocket
                                                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js)                             │
│                                                                      │
│   ┌───────────────┐   ┌───────────────┐   ┌─────────────────────┐   │
│   │ Express REST  │   │ Socket.IO     │   │ GameEngine          │   │
│   │ (authRouter)  │   │ Server        │   │ (extends            │   │
│   │               │   │               │   │  EventEmitter)      │   │
│   │ /api/auth/*   │   │ io.on(connect)│   │                     │   │
│   │ /api/admin/*  │   │ bet:place     │◄─►│  Game Loop:         │   │
│   │ /api/health   │   │ bet:cashout   │   │  betting → flying   │   │
│   │ /api/state    │   │ bet:cancel    │   │  → crash → repeat   │   │
│   │ /api/wallet   │   │ auth:identify │   │                     │   │
│   └───────┬───────┘   └───────┬───────┘   └──────────┬──────────┘   │
│           │                   │                      │               │
│           │    ┌──────────────┘                      │               │
│           │    │  Engine events broadcast to all:    │               │
│           │    │  round:betting, tick:countdown      │               │
│           │    │  round:flying, tick:multiplier      │               │
│           │    │  round:crashed                      │               │
│           │    └──────────────────────────────────────┘               │
│           ▼                                                           │
│   ┌───────────────────┐                                               │
│   │ Supabase Client   │◄──── All DB operations (service_role)        │
│   │ (supabaseClient)  │        - create_round, start_round           │
│   │                   │        - resolve_round                        │
│   │                   │        - place_bet, cancel_bet, cashout_bet   │
│   └───────────────────┘                                               │
└──────────────────────────────────────────────────────────────────────┘
```

### Three Key Design Decisions

**1. GameEngine is an EventEmitter — not coupled to Socket.IO**

The `GameEngine` runs the game loop and emits events. The `index.ts` file listens to those events and broadcasts them via Socket.IO. This means the engine doesn't know about WebSockets — it just runs the game.

**2. No optimistic balance updates on the frontend**

The frontend NEVER changes the balance locally when you bet, cancel, or cash out. It waits for the server to echo the authoritative balance back. This prevents desync and flicker.

**3. Dual paths: demo vs authenticated**

Every socket event handler in `index.ts` has two branches:
- **If `userId` is present** → use Supabase RPC for real wallet operations
- **If no `userId`** → use in-memory `demoBalances` map

Currently, all players are demo (the auth:identify path is broken — see Known Issues).

---

## 6. The Game Loop — How a Round Works

The game runs a continuous loop with three phases:

```
┌─────────────────────────────────────────────────────────────────┐
│                        GAME LOOP                                │
│                                                                 │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │   BETTING    │────►│   FLYING     │────►│   CRASHED    │    │
│  │   (5 sec)    │     │ (variable)   │     │   (3 sec)    │    │
│  │              │     │              │     │              │    │
│  │ Place bets   │     │ Multiplier   │     │ Show result  │    │
│  │ Cancel bets  │     │ climbs from  │     │ Sync balance │    │
│  │ Countdown    │     │ 1.00x upward │     │ to all       │    │
│  │              │     │ Cash out!    │     │ players      │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         ▲                                            │          │
│         └────────────────────────────────────────────┘          │
│                       (loop repeats)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Phase 1: BETTING (5 seconds)

**What happens:**
1. `GameEngine.beginBetting()` is called
2. A new seed is generated: `generateSeed()` → 32 random bytes → SHA-256 hash
3. The crash point is computed: `computeCrashPoint()` (kept secret until crash)
4. A round is created in Supabase: `create_round(hashedSeed)` — commits to the seed
5. 60–180 bots are generated with random bets and cashout targets
6. `emit("round:betting")` broadcasts to all clients → countdown starts
7. Players place bets via `socket.emit("bet:place", { panel, amount })`
8. Players can cancel bets during this phase
9. Countdown ticks every 100ms via `emit("tick:countdown")`
10. When countdown hits 0 → `beginFlying()`

### Phase 2: FLYING (variable duration)

**What happens:**
1. `GameEngine.beginFlying()` is called
2. Round transitions to `flying` in Supabase: `start_round(roundId)`
3. `emit("round:flying")` broadcasts to all clients
4. Multiplier grows exponentially: `multiplier = e^(0.16 × t)` where t is seconds
5. Every 50ms: `emit("tick:multiplier", { multiplier, bets })` broadcasts
6. Bots auto-cash-out when multiplier passes their target (and target < crashPoint)
7. Players cash out via `socket.emit("bet:cashout", { panel })`
8. When multiplier reaches crashPoint → `beginCrash()`

**Growth formula:** `multiplier = Math.exp(0.16 × seconds_elapsed)`
- At 1 second: ~1.17x
- At 5 seconds: ~2.24x
- At 10 seconds: ~5.00x
- At 20 seconds: ~25.0x
- At 30 seconds: ~125x (near the 130x cap)

### Phase 3: CRASHED (3 second pause)

**What happens:**
1. `GameEngine.beginCrash()` is called
2. Round is resolved in Supabase: `resolve_round(roundId, crashPoint, seed)`
   - Round status → `crashed`
   - Seed is revealed (for provably fair verification)
   - All remaining `locked` bets → `lost`
   - Audit row written to `audit_rounds`
3. `emit("round:crashed", { multiplier, seed, hashedSeed, history })` broadcasts
4. Server syncs every player's balance:
   - Authenticated: fetch real wallet from DB → `socket.emit("balance:sync")`
   - Demo: send in-memory balance → `socket.emit("balance:sync")`
5. After 3 seconds → `beginBetting()` → loop repeats

---

## 7. Backend: File-by-File Breakdown

### `index.ts` — The Server Entry Point

**What it does:**
- Creates Express app with security headers, CORS, rate limiting
- Creates HTTP server and Socket.IO server
- Instantiates `GameEngine` and exposes it globally for `authRouter`
- Wires engine events → Socket.IO broadcasts
- Handles all socket connections and bet events
- Manages demo balances (per-socket in-memory map)

**Key globals:**
- `globalThis.__gameEngine` — the engine instance (used by authRouter to push admin overrides)
- `globalThis.__io` — the Socket.IO server (used by authRouter to broadcast bet limit changes)

**Socket connection flow:**
1. New socket connects → demo balance set to `STARTING_BALANCE`
2. `socket.emit("init", { state, balance, currency, betLimits })` — sends full game state
3. Socket can `auth:identify` to switch to real wallet mode
4. Socket handles `bet:place`, `bet:cancel`, `bet:cancelWithAmount`, `bet:cashout`
5. On disconnect: clean up demo balance and auth mapping

**Bet handling — two paths:**
```
socket.on("bet:place", (payload) => {
  if (userId && engine.supabaseRoundId) {
    // ── AUTHENTICATED PATH ──
    // 1. Call Supabase place_bet() RPC
    // 2. If ok → engine.placeBet() + emit("bet:accepted")
    // 3. If error → emit("bet:rejected")
  } else {
    // ── DEMO PATH ──
    // 1. Check bet limits + balance
    // 2. engine.placeBet()
    // 3. Deduct in-memory balance
    // 4. emit("bet:accepted")
  }
});
```

### `gameEngine.ts` — The Heart of the Game

**What it does:**
- Extends `EventEmitter` — emits events that `index.ts` broadcasts
- Runs the game loop: `beginBetting() → beginFlying() → beginCrash() → repeat`
- Computes crash points with admin override support
- Manages player bets (place, cancel, cashout)
- Manages bot bets (auto-cashout at target multiplier)
- Loads history and admin controls from DB on startup

**Key constants:**
| Constant | Value | Meaning |
|----------|-------|---------|
| `BETTING_MS` | 5000 | Betting phase duration (5 seconds) |
| `TICK_MS` | 50 | Multiplier update interval (20 fps) |
| `CRASH_PAUSE_MS` | 3000 | Pause between crash and next round |
| `GROWTH` | 0.16 | Exponential growth rate for multiplier |
| `HARD_CAP_MULTIPLIER` | 130 | Absolute maximum multiplier (never exceeded) |
| `HISTORY_LIMIT` | 40 | Number of past rounds shown in history bar |

**Admin override methods:**
- `setNextCrashOverride(v)` — one-shot: next round crashes at v, then clears
- `setWinMode(m)` — sets global win/loss/normal mode
- `setForcedCrash(v)` — every round crashes at v until cleared (set to null to stop)
- `setBetLimits(min, max)` — updates min/max bet limits

**Bet methods:**
- `placeBet(socketId, panel, amount, userId?)` — adds a player bet (betting phase only)
- `cancelBet(socketId, panel)` — removes a player bet (betting phase only)
- `cashOut(socketId, panel)` — marks a bet as cashed out at current multiplier (flying phase only)

### `authRouter.ts` — REST API for Auth & Admin

**What it does:**
- Custom HMAC-SHA256 token system (not JWT, not Supabase Auth)
- Admin login with hardcoded credentials
- Token sign/verify with 24-hour expiry
- `requireAuth` and `requireAdmin` middleware
- GET/PATCH admin controls (win mode, bet limits, crash overrides)
- GET admin stats (user count, total balance, round history)

**Token format:** `base64url(payload).base64url(hmac_signature)`
- Payload: `{ id, email, role, exp }`
- Signature: HMAC-SHA256 of payload using `ADMIN_TOKEN_SECRET`
- Verification: recompute HMAC, compare, check expiry

**Admin controls PATCH flow:**
1. Validate input with Zod schema
2. Update `config` table in Supabase (min_bet, max_bet)
3. Push overrides to `globalThis.__gameEngine` (immediate effect)
4. If bet limits changed → broadcast `betLimits:update` to all clients via `globalThis.__io`

### `provablyFair.ts` — Provably Fair System

**What it does:**
- `generateSeed()` — creates 32 random bytes (seed) + SHA-256 hash (commitment)
- `crashPointFromSeed(seed)` — deterministically derives a crash point from the seed
- The hash is published before the round; the seed is revealed after
- Anyone can verify: `SHA-256(seed) === publishedHash` and `crashPointFromSeed(seed) === result`

**Distribution:**
- 3% chance of instant bust (1.00x)
- Otherwise: inverse distribution with 1% house edge, capped at 130x
- Formula: `crash = (1 - 0.01) / (1 - r)` where r is from the first 52 bits of the hash

**Important note:** This system exists but is currently used only for **history fallback** (when DB is unreachable). The live game uses `computeCrashPoint()` which supports admin overrides.

### `fakeBets.ts` — Bot Generator

**What it does:**
- Generates 60–180 fake players per round
- Each bot gets: random masked name (e.g. `j***5`), random avatar (0–71), random bet amount, target cashout multiplier

**Bot cashout target distribution:**
| Probability | Target Range | Behavior |
|-------------|-------------|----------|
| 55% | 1.1x – 2.0x | Cautious — bail early |
| 30% | 2.0x – 5.0x | Moderate |
| 12% | 5.0x – 15.0x | Risky |
| 3% | 15.0x – 100.0x | Greedy |

**Bet amount tiers:** 2, 4, 5, 10, 20, 25, 40, 50, 75, 100, 150, 200, 250, 300, 500, 750, 1000, 1500, 1642.01, 1670.73

### `supabaseClient.ts` — Database Connection

- Creates Supabase client with `service_role` key (bypasses RLS)
- Throws on startup if `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is missing
- `persistSession: false` — server doesn't need session management
- **Never expose this key to the frontend**

---

## 8. Frontend: File-by-File Breakdown

### `App.tsx` — Root Component

**What it does:**
- Wraps everything in `<AuthProvider>`
- If URL starts with `/admin` → shows `<AdminPanel>`
- Otherwise → shows `<GameApp>` (the game)

**GameApp:**
- Calls `init()` from gameStore (sets up all Socket.IO listeners)
- If user has auth session → emits `auth:identify` to backend
- Shows `<LoadingScreen>` until connected + roundId is set
- Layout: Header → (Sidebar + Main) → (Mobile sidebar below)

### `gameStore.ts` — Zustand Store (The Brain)

This is the **single source of truth** for all game state on the client.

**State:**
| Field | Type | Purpose |
|-------|------|---------|
| `connected` | boolean | Socket.IO connected? |
| `phase` | `"betting" \| "flying" \| "crashed"` | Current game phase |
| `roundId` | string | Current round ID |
| `multiplier` | number | Current multiplier (1.0 during betting) |
| `countdown` | number | ms remaining in betting phase |
| `history` | `RoundHistoryItem[]` | Past crash multipliers (max 40) |
| `bets` | `LiveBet[]` | All visible bets (bots only — player bets are in panels) |
| `balance` | number | Player's current balance |
| `panels` | `[PanelState, PanelState]` | Two bet panels |
| `userId` | `string \| null` | Auth user ID (null = demo) |
| `betLimits` | `{ minBet, maxBet }` | Admin-controlled limits |
| `betErrorToast` | `{ msg, at } \| null` | Error toast for bet rejections |
| `lastWinToast` | `{ panel, mult, win, at } \| null` | Win celebration toast |
| `crashFlash` | `{ multiplier, at } \| null` | Triggers crash flash animation |

**Actions:**
| Action | What it does |
|--------|-------------|
| `init()` | Sets up all Socket.IO event listeners (called once on mount) |
| `placeBet(panel)` | Validates limits → emits `bet:place` → marks panel active |
| `cancelBet(panel)` | Emits `bet:cancelWithAmount` → clears panel |
| `cashOut(panel)` | Emits `bet:cashout` (no optimistic update) |
| `setPanel(panel, patch)` | Updates a panel's state (amount, autoBet, etc.) |
| `setAuth({ userId, accessToken })` | Sets auth state from authContext |

**Critical pattern — NO optimistic balance updates:**
```
// When player places a bet:
socket.emit("bet:place", { panel, amount });
// DO NOT deduct balance here — wait for server response
// Server responds with:
socket.on("bet:accepted", ({ balance }) => set({ balance }));
```

**Auto-bet flow:**
1. Player enables `autoBet` on a panel
2. When `round:betting` event arrives, store checks `wantsBet` for each panel
3. If `autoBet` is on → automatically calls `placeBet(panel)`

**Auto-cash-out flow:**
1. Player enables `autoCashOut` with a target value (e.g. 2.00x)
2. On every `tick:multiplier` event, store checks each active panel
3. If `multiplier >= autoCashOutValue` → automatically calls `cashOut(panel)`

### `BetPanel.tsx` — The Betting Interface

**Each panel has:**
- **Mode tabs**: "bet" (manual) or "auto" (automated)
- **Amount input**: +/- buttons, quick-chip buttons (10, 20, 50, 100), manual keyboard entry
- **Action button**: Context-sensitive (see Bet Panel States below)
- **Auto controls** (auto mode only): Auto bet toggle, auto cash-out toggle + value

**Amount input — draft-commit pattern:**
The amount input uses a local "draft" string state so users can type freely:
1. On focus: copy current amount to draft string (e.g. "2.00")
2. On change: update draft string (sanitized to digits + single decimal point)
3. On blur or Enter: parse draft → clamp to limits → commit to store → clear draft
4. This allows typing "10", "1.", "0.50" etc. without the value snapping back

### `GameCanvas.tsx` — The Visual Engine

**What it renders:**
- HTML5 Canvas with GSAP animations
- An exponential growth curve (the flight path) from bottom-left to top-right
- A plane SVG that follows the curve tip
- Large multiplier text in the center
- Red flash + crash animation when the plane crashes
- Smoke particles and a fading trail behind the plane

**Rendering loop:**
- During betting: shows "Waiting for next round..." with countdown
- During flying: draws the curve up to the current multiplier, plane at the tip
- During crashed: red flash, plane flies off, shows the final multiplier

### `LiveBets.tsx` — The Betting Sidebar

**What it shows:**
- Header: total bets count + total win amount
- Scrollable list of all bets (bots), sorted by bet amount descending
- Each row: avatar, masked name, bet amount, cashout multiplier (if cashed out), win amount
- Real-time updates as bots cash out (green highlight) or lose (greyed out)
- Tabs: "All Bets" and "Top" (filtered view)

### `authContext.tsx` — Authentication Provider

**What it does:**
- React Context that provides `session`, `profile`, `login()`, `logout()`
- Session stored in `localStorage` as `aviator_admin_session`
- On mount: checks localStorage for existing session, validates expiry
- `login()` → POST `/api/auth/login` → stores session → fetches profile
- `logout()` → POST `/api/auth/logout` → clears localStorage
- Used by admin panel only (game works without auth)

### `RateControlPanel.tsx` — Admin Dashboard

**What it shows:**
- Login screen (if not authenticated)
- Admin controls panel (if authenticated):
  - Win Mode selector: Normal / Win / Loss
  - Min Bet / Max Bet inputs
  - Next Crash Point input (one-shot override)
  - Forced Crash input (persistent override)
  - Live game state display (current phase, multiplier, round ID)
  - Recent rounds table

### `HistoryBar.tsx` — Crash History

- Horizontal scrollable bar at the top of the game
- Shows last 40 crash multipliers as color-coded pills
- Colors: blue (< 2x), purple (2x–10x), green (> 10x)
- Click clock icon → popup with full history grid

### `format.ts` — Utilities

- `fmt(n)` → formats number with 2 decimal places + thousands separators (e.g. "1,234.56")
- `multTier(n)` → returns `"low"` (< 2x), `"mid"` (2x–10x), or `"high"` (> 10x) for color coding

---

## 9. Database Schema & RPC Functions

### Tables

```
┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   config     │     │    users      │     │    wallets        │
│ (key-value)  │     │ (profiles)    │     │ (balance + ver)  │
└─────────────┘     └──────┬───────┘     └────────┬─────────┘
                           │ 1:1                   │ 1:1
                           ▼                       ▼
                    ┌──────────────┐     ┌──────────────────┐
                    │    bets       │     │  wallet_ledger   │
                    │ (per round)   │     │ (audit trail)    │
                    └──────┬───────┘     └──────────────────┘
                           │ 1:1
                           ▼
                    ┌──────────────┐
                    │   cashouts    │
                    └──────────────┘

┌─────────────┐     ┌──────────────┐     ┌──────────────────┐
│   rounds     │     │ audit_rounds  │     │  user_limits     │
│ (game rounds)│     │ (audit trail) │     │ (betting caps)   │
└─────────────┘     └──────────────┘     └──────────────────┘
```

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `config` | Key-value store for settings | `key` (PK), `value` (jsonb) |
| `users` | User profiles | `id` (→ auth.users), `email`, `role`, `kyc_status` |
| `wallets` | User balances | `user_id` (PK), `balance`, `version` (optimistic concurrency) |
| `wallet_ledger` | Transaction audit trail | `user_id`, `type`, `amount`, `running_balance`, `round_id`, `bet_id` |
| `rounds` | Game rounds | `id` (UUID), `hashed_seed`, `seed`, `crash_point`, `status` |
| `bets` | Individual bets | `user_id`, `round_id`, `panel`, `amount`, `status`, `cashout_multiplier`, `win_amount` |
| `cashouts` | Cashout records | `bet_id`, `round_id`, `multiplier`, `win_amount` |
| `audit_rounds` | Round lifecycle audit | `round_id`, `hashed_seed`, `seed`, `crash_point`, `status`, `server_instance_id` |
| `user_limits` | Per-user betting caps | `user_id`, `daily_bet`, `weekly_bet`, `max_bet`, `min_bet` |

### Bet Status Values
| Status | Meaning |
|--------|---------|
| `locked` | Bet is active (money deducted, waiting for cashout or crash) |
| `cashed_out` | Player cashed out — winnings credited |
| `lost` | Round crashed before cashout — bet lost |
| `cancelled` | Player cancelled during betting — money refunded |

### RPC Functions

All wallet operations use **`FOR UPDATE` row locking** + **optimistic concurrency** via the `version` field. If a concurrent modification is detected, the function returns `{ ok: false, reason: "concurrent" }`.

| Function | Parameters | What it does |
|----------|-----------|-------------|
| `create_round` | `hashed_seed`, `server_instance_id` | Creates round in `betting` status, writes audit row |
| `start_round` | `round_id` | Transitions round to `flying`, updates audit |
| `resolve_round` | `round_id`, `crash_point`, `seed`, `server_instance_id` | Marks round `crashed`, reveals seed, marks lost bets, writes audit |
| `place_bet` | `user_id`, `round_id`, `panel`, `amount`, `reference` | Validates limits → deducts wallet → creates bet → writes ledger |
| `cancel_bet` | `user_id`, `round_id`, `panel`, `reference` | Refunds wallet → marks bet `cancelled` → writes ledger |
| `cashout_bet` | `user_id`, `round_id`, `panel`, `multiplier`, `reference` | Credits winnings → marks bet `cashed_out` → writes cashout + ledger |

### RLS (Row Level Security) Policies

- **Users** can read their own: profile, wallet, ledger, bets, cashouts, limits
- **Admins** can manage all records (users, wallets, ledger, bets, cashouts, limits)
- Backend uses `service_role` key which **bypasses RLS entirely**

---

## 10. Socket.IO Events — Complete Reference

### Server → Client Events

| Event | Payload | When | Frontend Handler |
|-------|---------|------|-----------------|
| `init` | `{ state, balance, currency, betLimits }` | Socket connects | Sets all initial state |
| `round:betting` | `PublicRoundState` | New betting phase starts | Resets panels, places queued/auto bets |
| `tick:countdown` | `{ countdown: number }` | Every 100ms during betting | Updates countdown display |
| `round:flying` | `PublicRoundState` | Plane takes off | Sets phase, starts animation |
| `tick:multiplier` | `{ multiplier, bets }` | Every 50ms during flying | Updates multiplier, checks auto-cashout |
| `round:crashed` | `{ multiplier, seed, hashedSeed, history }` | Plane crashes | Shows crash, syncs balance |
| `bet:accepted` | `{ panel, amount, balance }` | Server accepts a bet | Syncs authoritative balance |
| `bet:rejected` | `{ panel, reason, minBet?, maxBet? }` | Server rejects a bet | Shows error toast (except silent reasons) |
| `bet:cancelled` | `{ panel, balance? }` | Bet cancelled + refunded | Syncs balance, clears panel |
| `bet:cancel_failed` | `{ panel, reason }` | Cancel attempt failed | (Currently no handler — logged only) |
| `bet:cashedout` | `{ panel, multiplier, win, balance }` | Player cashed out | Syncs balance, shows win toast |
| `balance:sync` | `{ balance }` | After crash, on reconnect | Sets authoritative balance |
| `betLimits:update` | `{ minBet, maxBet }` | Admin changed limits | Updates limits, clamps panel amounts |

### Client → Server Events

| Event | Payload | Purpose |
|-------|---------|---------|
| `auth:identify` | `{ userId, token }` | Switch from demo to real wallet mode |
| `bet:place` | `{ panel, amount, userId? }` | Place a bet (userId only if authenticated) |
| `bet:cancel` | `{ panel }` | Cancel a bet (legacy handler) |
| `bet:cancelWithAmount` | `{ panel, amount, userId? }` | Cancel a bet (preferred handler with amount) |
| `bet:cashout` | `{ panel, userId? }` | Cash out an active bet |

### Bet Rejection Reasons

| Reason | Meaning | Toast shown? |
|--------|---------|-------------|
| `phase` | Not in betting phase | No (silent — expected during normal play) |
| `duplicate` | Already bet on this panel | No (silent) |
| `below_min` | Amount < min bet | Yes: "Minimum bet is X ZAR" |
| `above_max` | Amount > max bet | Yes: "Maximum bet is X ZAR" |
| `insufficient` | Not enough balance | Yes: "Insufficient balance" |
| `server_error` | RPC failed | Yes: "Server error — please try again" |
| `invalid_amount` | Amount ≤ 0 or invalid | Yes: "Invalid bet amount" |
| `no_wallet` | No wallet found (auth path) | Yes: "No wallet found — please log in" |

---

## 11. REST API — Complete Reference

### Auth Endpoints

#### POST `/api/auth/login`
```json
// Request
{ "email": "admin@aviator.com", "password": "admin123" }

// Response (200)
{
  "ok": true,
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_at": 1719123456,
  "user": {
    "id": "admin-0000-0000-0000-000000000001",
    "email": "admin@aviator.com",
    "username": "admin",
    "display_name": "Admin",
    "role": "admin",
    "kyc_status": "verified",
    "balance": 0,
    "currency": "ZAR"
  }
}
```

#### POST `/api/auth/refresh`
```json
// Request
{ "refresh_token": "eyJ..." }
// Response: same as login (new tokens)
```

#### POST `/api/auth/logout`
```json
// Headers: Authorization: Bearer <token>
// Response: { "ok": true }
```

#### GET `/api/auth/me`
```json
// Headers: Authorization: Bearer <token>
// Response: { "ok": true, "user": { ... } }
```

### Admin Endpoints

#### GET `/api/admin/controls`
```json
// Headers: Authorization: Bearer <admin_token>
// Response
{
  "ok": true,
  "controls": {
    "id": 1,
    "min_bet": 1,
    "max_bet": 50000,
    "next_crash_point": null,
    "win_mode": "normal",
    "forced_crash": null,
    "updated_at": "2026-06-24T13:30:00.000Z"
  }
}
```

#### PATCH `/api/admin/controls`
```json
// Headers: Authorization: Bearer <admin_token>
// Request (all fields optional)
{
  "min_bet": 10,
  "max_bet": 100000,
  "next_crash_point": 2.50,
  "win_mode": "win",
  "forced_crash": null
}
// Response: { "ok": true }
```

#### GET `/api/admin/stats`
```json
// Response
{
  "ok": true,
  "stats": {
    "total_users": 5,
    "total_balance": 250000,
    "rounds_today": 120,
    "avg_crash": 3.45,
    "recent_rounds": [...]
  }
}
```

### Public Endpoints

| Method | Path | Auth | Response |
|--------|------|------|----------|
| GET | `/api/health` | None | `{ status: "ok", phase: "betting", ts: 1719... }` |
| GET | `/api/state` | None | Full `PublicRoundState` |
| GET | `/api/wallet` | Bearer token | `{ ok: true, balance: 5000, currency: "ZAR" }` |

### Rate Limiting

| Limiter | Scope | Limit | Notes |
|---------|-------|-------|-------|
| `globalLimiter` | All `/api/*` | 120 req/min per IP | — |
| `loginLimiter` | `/api/auth/login` | 50 attempts / 15 min per IP | Skips successful requests |
| `adminLimiter` | `/api/admin/*` | 120 req/min per IP | — |

---

## 12. Admin Panel — How It Works

### Access
- URL: `http://localhost:5173/admin`
- Credentials: `admin@aviator.com` / `admin123`
- Token stored in `localStorage` as `aviator_admin_session`

### Controls

| Control | Type | Effect |
|---------|------|--------|
| **Win Mode** | `normal` / `win` / `loss` | Controls crash point distribution for all rounds |
| **Min Bet** | Number (0.01 – 1,000,000) | Minimum bet amount players can place |
| **Max Bet** | Number (1 – 10,000,000) | Maximum bet amount players can place |
| **Next Crash Point** | Number (1.01 – 130) or null | One-shot: next round crashes at this value, then clears |
| **Forced Crash** | Number (1.01 – 130) or null | Persistent: every round crashes at this value until cleared |

### Win Mode Effects on Crash Point

| Mode | Crash Range | Typical Use |
|------|------------|-------------|
| `normal` | 1.00x – 10.00x (random) | Fair gameplay |
| `win` | 100.00x – 130.00x (random) | Let players win big |
| `loss` | 1.00x – 2.00x (random) | House wins — most players lose |

### Override Priority

```
1. forcedCrash (highest — overrides everything)
2. nextCrashPoint (one-shot — consumed after one round)
3. winMode (lowest — normal random generation)
4. HARD_CAP = 130x (absolute maximum, nothing can exceed this)
```

### Change Flow

```
Admin UI → PATCH /api/admin/controls
    │
    ├── Zod validation
    ├── Update config table in Supabase (min_bet, max_bet)
    ├── Push to globalThis.__gameEngine:
    │   ├── setNextCrashOverride()
    │   ├── setWinMode()
    │   ├── setForcedCrash()
    │   └── setBetLimits()
    └── If bet limits changed → io.emit("betLimits:update") to all clients
            └── Frontend clamps panel amounts to new limits
```

---

## 13. Authentication System

### Current State

The project uses a **custom HMAC-SHA256 token system** — not JWT, not Supabase Auth.

```
Login Flow:
┌──────────┐     POST /api/auth/login      ┌──────────────┐
│  Admin   │ ──────────────────────────►   │  authRouter  │
│  Browser │    { email, password }        │              │
│          │                               │  Verify      │
│          │ ◄──────────────────────────   │  hardcoded   │
│          │    { access_token, user }     │  credentials │
└──────────┘                               └──────────────┘
     │
     │ Store token in localStorage
     │ as "aviator_admin_session"
     ▼
┌──────────┐     GET /api/auth/me          ┌──────────────┐
│  Admin   │ ──────────────────────────►   │  authRouter  │
│  Panel   │    Bearer <token>             │              │
│          │ ◄──────────────────────────   │  verifyToken │
│          │    { user profile }           │  (HMAC check)│
└──────────┘                               └──────────────┘
```

### Token Structure

```
token = base64url(payload) + "." + base64url(hmac_signature)

payload = {
  id:    "admin-0000-0000-0000-000000000001",
  email: "admin@aviator.com",
  role:  "admin",
  exp:   Date.now() + 24h  // 24-hour expiry
}

hmac_signature = HMAC-SHA256(payload, ADMIN_TOKEN_SECRET)
```

### Auth Paths in the Game

| Path | Trigger | Balance Source | Currently Working? |
|------|---------|---------------|-------------------|
| Demo | No `userId` in socket events | In-memory `demoBalances` map | Yes |
| Authenticated | `userId` present in socket events | Supabase `wallets` table via RPC | No (see C1 in Known Issues) |

---

## 14. Crash Point Math — How Winners Are Determined

### The Formula

During the flying phase, the multiplier grows exponentially:

```
multiplier = e^(0.16 × t)
```

Where `t` is seconds since the flying phase started.

| Time | Multiplier |
|------|-----------|
| 0s | 1.00x |
| 1s | 1.17x |
| 5s | 2.24x |
| 10s | 5.00x |
| 15s | 11.20x |
| 20s | 25.03x |
| 25s | 55.12x |
| 30s | 122.77x |

### How the Crash Point Is Chosen

```typescript
computeCrashPoint():
  1. If forcedCrash is set → return forcedCrash (admin override)
  2. If nextCrashPoint is set → return it, then clear it (one-shot)
  3. Based on winMode:
     - "win":  random 100.00x – 130.00x
     - "loss": random 1.00x – 2.00x
     - "normal": random 1.00x – 10.00x
  4. Always: min(result, 130) → floor to 2 decimals
```

### Win Calculation

When a player cashes out at multiplier M with bet amount A:
```
win = A × M
```
Example: Bet 100 ZAR, cash out at 2.50x → win 250 ZAR

---

## 15. Bot System — Fake Players

### Why Bots?

A real crash game has hundreds of players online. Bots simulate this to make the game feel alive. The "All Bets" sidebar shows bot bets alongside real player bets.

### Bot Generation (`fakeBets.ts`)

```typescript
generateBots(60 + random(0, 120))  // 60–180 bots per round
```

Each bot gets:
- **Name**: Random masked name like `j***5` or `k***3`
- **Avatar**: Random number 0–71
- **Bet amount**: Random from tiers [2, 4, 5, 10, 20, 25, 40, 50, 75, 100, 150, 200, 250, 300, 500, 750, 1000, 1500, 1642.01, 1670.73]
- **Target cashout**: Weighted random (see distribution below)

### Bot Cashout Target Distribution

| Probability | Range | Type |
|-------------|-------|------|
| 55% | 1.1x – 2.0x | Cautious (bail early) |
| 30% | 2.0x – 5.0x | Moderate |
| 12% | 5.0x – 15.0x | Risky |
| 3% | 15.0x – 100.0x | Greedy |

### Bot Resolution

During the flying phase, `resolveBots()` is called every tick (50ms):
- If `bot.target <= multiplier` AND `bot.target < crashPoint` → bot cashes out
- If the round is ending (multiplier hit crashPoint) → remaining bots lose

---

## 16. Provably Fair System

### What "Provably Fair" Means

The server commits to a random seed *before* the round starts by publishing its hash. After the round, the seed is revealed. Anyone can verify:
1. `SHA-256(seed) === publishedHash` (seed wasn't changed)
2. `crashPointFromSeed(seed) === result` (crash point wasn't changed)

### Implementation (`provablyFair.ts`)

```typescript
generateSeed():
  seed = 32 random bytes → hex string
  hashedSeed = SHA-256(seed) → hex string
  return { seed, hashedSeed }

crashPointFromSeed(seed):
  hash = SHA-256(seed) → hex string
  r = first 52 bits of hash / 2^52   // uniform [0, 1)
  if r < 0.03: return 1.0             // 3% instant bust
  crash = (1 - 0.01) / (1 - r)        // inverse distribution, 1% house edge
  return min(crash, 130)              // hard cap
```

### Current Status

The provably fair system exists and works, but the **live game does not use it**. Instead, `computeCrashPoint()` generates random crash points with admin override support. The provably fair system is used only for **history fallback** when the DB is unreachable.

To make the game truly provably fair, `computeCrashPoint()` would need to use `crashPointFromSeed()` instead of `Math.random()`.

---

## 17. Wallet & Balance System

### Two Balance Systems

| System | Who | Storage | Transaction Safety |
|--------|-----|---------|-------------------|
| Demo | Unauthenticated players | In-memory `Map<socketId, number>` | None (resets on disconnect) |
| Real | Authenticated players | Supabase `wallets` table | PostgreSQL `FOR UPDATE` + optimistic concurrency |

### Demo Balance Flow

```
Socket connects → demoBalances.set(socketId, STARTING_BALANCE)
    │
    ├── Place bet → balance -= amount → emit("bet:accepted", { balance })
    ├── Cancel bet → balance += amount → emit("bet:cancelled", { balance })
    ├── Cash out → balance += win → emit("bet:cashedout", { balance })
    └── Disconnect → demoBalances.delete(socketId)  ← balance gone
```

### Real Wallet Flow (Authenticated)

```
Place bet:
  Supabase RPC place_bet()
    ├── SELECT balance FROM wallets FOR UPDATE
    ├── Check balance >= amount
    ├── UPDATE wallets SET balance = balance - amount, version = version + 1
    ├── INSERT INTO wallet_ledger (type='bet_lock', amount, running_balance)
    └── INSERT INTO bets (status='locked')

Cancel bet:
  Supabase RPC cancel_bet()
    ├── SELECT balance FROM wallets FOR UPDATE
    ├── UPDATE wallets SET balance = balance + amount, version = version + 1
    ├── INSERT INTO wallet_ledger (type='bet_refund', amount, running_balance)
    └── UPDATE bets SET status='cancelled'

Cash out:
  Supabase RPC cashout_bet()
    ├── SELECT bet FROM bets WHERE status='locked' FOR UPDATE
    ├── win = bet.amount × multiplier
    ├── SELECT balance FROM wallets FOR UPDATE
    ├── UPDATE wallets SET balance = balance + win, version = version + 1
    ├── INSERT INTO wallet_ledger (type='win', amount=win, running_balance)
    ├── UPDATE bets SET status='cashed_out', cashout_multiplier, win_amount
    └── INSERT INTO cashouts (bet_id, multiplier, win_amount)
```

### Optimistic Concurrency

The `wallets` table has a `version` column. Every update checks the current version and increments it:

```sql
UPDATE wallets
  SET balance = balance + win,
      version = version + 1
  WHERE user_id = p_user_id AND version = v_wallet_version
  RETURNING balance;
```

If two requests try to update the same wallet simultaneously, only one succeeds. The other gets `null` back and returns `{ ok: false, reason: "concurrent" }`.

---

## 18. Frontend State Management

### Why Zustand?

Zustand is a minimal state manager — no boilerplate, no context providers, no action creators. Just a `create()` function that returns a hook.

### Store Structure

```
gameStore
├── Connection state: connected, roundId
├── Game state: phase, multiplier, countdown, history, bets, crashFlash
├── Player state: balance, currency, userId, accessToken
├── Bet limits: minBet, maxBet
├── Panels: [PanelState, PanelState]
├── Toasts: betErrorToast, lastWinToast
└── Actions: init(), placeBet(), cancelBet(), cashOut(), setPanel(), setAuth()
```

### How Socket Events Update State

Every socket event handler in `init()` calls `set()` or `get().setPanel()` to update state. React components subscribe to slices of state via `useGame((s) => s.field)` and re-render only when that slice changes.

### No Optimistic Updates — Why?

Previous versions had optimistic balance updates (deduct on bet, refund on cancel). This caused:
- **Balance flicker** — optimistic value differed from server value
- **Desync** — if server rejected a bet, the client had already deducted
- **Race conditions** — rapid bets/cancels could corrupt local state

The fix: **never touch balance locally**. Wait for the server's authoritative response.

---

## 19. Bet Panel — Every State & Transition

### Panel States

```
                    placeBet() during betting
    [idle] ──────────────────────────────► [active]
       ▲                                       │
       │                                       │ cancelBet() during betting
       │◄──────────────────────────────────────┤
       │                                       │ cashOut() during flying
       │                                       ▼
       │                                  [cashedOut]
       │                                       │
       │◄──────────────────────────────────────┘ (round ends → reset)
       │
       │  placeBet() during flying/crashed
       │────────────────────────────────► [queued]
       │                                       │
       │  cancelBet() (just clears locally)    │ round:betting event
       │◄──────────────────────────────────────┤ → placeBet() → [active]
       │                                       │
       │                                  round:crashed
       │◄──────────────────────────────────────┘ (reset)
```

### Action Button States

| Button Text | Condition | Color | Action |
|-------------|-----------|-------|--------|
| **Bet** + amount | Phase=betting, no active bet, not queued | Green gradient | Places bet |
| **Cancel** + amount | Phase=betting, has active bet | Red gradient | Cancels bet (refund) |
| **Cancel** + "Waiting for next round" | Has queued bet | Red gradient | Cancels queued bet (local only) |
| **Cash Out** + potential win | Phase=flying, has active bet, not cashed out | Orange gradient | Cashes out at current multiplier |
| **Cashed out at X.XXx** | Already cashed out this round | Dark green | No action (display only) |
| **Waiting...** | Round ended, waiting for next | Grey | No action |

### Auto Mode

When `mode` is set to `"auto"`:
- **Auto Bet** toggle: Automatically places a bet at the start of each betting phase
- **Auto Cash Out** toggle + value: Automatically cashes out when multiplier reaches the target
- Manual button is locked when auto-bet is on (prevents double bets)

---

## 20. Game Canvas — Visual Engine

### What It Draws

The `GameCanvas` component uses HTML5 Canvas + GSAP for animations:

**During Betting:**
- Shows "Waiting for next round..." text
- Countdown timer
- Previous round's curve fades out

**During Flying:**
- Exponential growth curve from bottom-left to top-right
- Plane SVG follows the curve tip
- Multiplier text in large font, centered
- Trail effect behind the plane
- Curve color: blue/gradient

**During Crashed:**
- Red flash overlay
- Plane flies off-screen
- Final multiplier displayed prominently
- Curve turns red

### Rendering Details

- Canvas resizes to container dimensions
- Uses `requestAnimationFrame` for smooth 60fps rendering
- GSAP handles the plane animation and button pulses
- Curve points calculated using exponential easing function
- Smoke particles rendered as semi-transparent circles

---

## 21. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | **Yes** | — | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | — | Service role key from Supabase dashboard. **Never expose to frontend.** |
| `PORT` | No | `4000` | Backend server port |
| `HOST` | No | `0.0.0.0` | Backend bind address |
| `STARTING_BALANCE` | No | `1000` | Demo balance for unauthenticated players (ZAR) |
| `SERVER_INSTANCE_ID` | No | `aviator-server-1` | Unique ID for audit logs |
| `ADMIN_TOKEN_SECRET` | No | `aviator-admin-secret-key` | HMAC-SHA256 secret for admin tokens |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origins (comma-separated) |

### Frontend

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_DEV_BACKEND` | No | `http://127.0.0.1:4000` | Backend URL for dev proxy |
| `VITE_SERVER_URL` | No | `window.location.origin` | Socket.IO server URL |

---

## 22. Building & Deploying

### Development

```bash
# From root directory — runs both backend and frontend concurrently
npm run dev

# Or separately:
npm run dev:backend    # Backend on :4000
npm run dev:frontend   # Frontend on :5173
```

### Production Build

```bash
# Backend
cd backend
npm run build    # tsc → dist/
npm start        # node dist/index.js

# Frontend
cd frontend
npm run build    # tsc -b && vite build → dist/
# Serve dist/ with nginx, Netlify, Vercel, or any static host
```

### Production Architecture

```
Internet → nginx/CDN → frontend dist/ (static files)
                │
                ├── /api/*         → proxy to backend:4000
                └── /socket.io/*   → proxy to backend:4000 (WebSocket upgrade)
```

### Vite Dev Proxy

In development, Vite proxies API and WebSocket requests to the backend:

```typescript
// vite.config.ts
proxy: {
  "/api": { target: backend, changeOrigin: true },
  "/socket.io": { target: backend, ws: true, changeOrigin: true },
}
```

This means the frontend and backend appear to be on the same origin (`localhost:5173`), avoiding CORS issues during development.

---

## 23. Known Issues & Pre-Production Checklist

These issues do NOT affect current demo-mode gameplay. They matter when going to production with real users.

| # | Severity | Issue | Impact | Fix |
|---|----------|-------|--------|-----|
| C1 | Critical | `auth:identify` uses `supabase.auth.getUser()` but frontend sends custom HMAC token | Authenticated users can't use real wallets via Socket.IO — silently falls back to demo | Replace with custom `verifyToken()` from authRouter |
| C2 | Critical | `loadAdminControls()` reads from `admin_controls` table that doesn't exist in schema | Admin settings reset to defaults on every server restart | Read from `config` table or create `admin_controls` table |
| C3 | Critical | `place_bet` RPC reads bet limits from `config where key='bet_limits'` but admin writes `min_bet`/`max_bet` as separate keys | Bet limits don't work for authenticated users via RPC | Update RPC to read separate keys |
| C4 | Critical | Hardcoded admin credentials (`admin@aviator.com` / `admin123`) | Security risk — anyone with source access has admin login | Move to environment variables |
| C5 | Critical | Socket.IO CORS is `origin: "*"` | Any website can connect to the backend WebSocket | Use `CORS_ORIGIN` env var |

### What's Already Clean
- No unused dependencies (removed `@supabase/supabase-js` from frontend, `jsonwebtoken` from backend)
- No dead code (removed per-user win controls, client tokens, Supabase auth client)
- No TODO/FIXME comments
- TypeScript compiles clean on both frontend and backend
- Security headers set (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, Referrer-Policy)
- Rate limiting on all API routes
- Wallet operations use PostgreSQL row locking + optimistic concurrency
- No hardcoded secrets in `.env.example`
- Root codebase is clean and organized

---

## 24. Glossary

| Term | Meaning |
|------|---------|
| **Crash point** | The multiplier at which the plane "crashes" — the round ends |
| **Cash out** | Player exits the round at the current multiplier, winning `bet × multiplier` |
| **Betting phase** | The 5-second window before each round where players place bets |
| **Flying phase** | The period where the multiplier climbs from 1.00x until it crashes |
| **Crashed phase** | The 3-second pause after the crash before the next round starts |
| **Panel** | One of two bet slots each player has (can bet on both simultaneously) |
| **Queued bet** | A bet placed during flying/crashed phase — executed at the start of the next betting phase |
| **Auto-bet** | Automatically places a bet at the start of every betting phase |
| **Auto cash-out** | Automatically cashes out when the multiplier reaches a preset target |
| **Win mode** | Admin setting that biases crash points: `normal` (fair), `win` (high multipliers), `loss` (low multipliers) |
| **Forced crash** | Admin setting that forces every round to crash at a specific multiplier |
| **Next crash point** | Admin setting for a one-shot crash point override (consumed after one round) |
| **Hard cap** | The absolute maximum multiplier: 130x. No override can exceed this. |
| **Provably fair** | A system where the server commits to a seed before the round, then reveals it after so players can verify the crash point wasn't manipulated |
| **Demo mode** | Playing without authentication — balance is in-memory, resets on page refresh |
| **Bot** | A fake player generated by `fakeBets.ts` — has a name, avatar, bet amount, and target cashout |
| **ZAR** | South African Rand — the currency used in the game |
| **HMAC-SHA256** | Hash-based Message Authentication Code — used to sign/verify admin tokens |
| **RLS** | Row Level Security — PostgreSQL feature that restricts which rows users can access |
| **RPC** | Remote Procedure Call — PostgreSQL functions called from the backend via Supabase client |
| **Optimistic concurrency** | A pattern where updates check a version field to detect concurrent modifications |
| **Zustand** | A minimal React state management library — used for all game state on the frontend |
| **GSAP** | GreenSock Animation Platform — used for plane animations and button effects |

---

*This document is the complete knowledge transfer for the Aviator project. It was written to be self-contained — a developer should be able to understand and work on this project using only this document and the source code.*
