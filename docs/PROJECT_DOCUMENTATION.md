# Aviator Game — Autonomous Knowledge Transfer

> **You are a developer who just inherited this project. The previous developer is gone. This document is all you have. It was written so you never need to ask them a question.**

---

## Table of Contents

1. [What Is This Project?](#1-what-is-this-project)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Quick Start](#4-quick-start)
5. [Architecture — How Everything Connects](#5-architecture--how-everything-connects)
6. [The Game Loop](#6-the-game-loop)
7. [Backend Source Code — Annotated](#7-backend-source-code--annotated)
8. [Frontend Source Code — Annotated](#8-frontend-source-code--annotated)
9. [Database — Full Schema & SQL](#9-database--full-schema--sql)
10. [Socket.IO Events](#10-socketio-events)
11. [REST API](#11-rest-api)
12. [Admin Panel](#12-admin-panel)
13. [Authentication](#13-authentication)
14. [Crash Point Math](#14-crash-point-math)
15. [Bot System](#15-bot-system)
16. [Provably Fair System](#16-provably-fair-system)
17. [Wallet System](#17-wallet-system)
18. [State Management](#18-state-management)
19. [Bet Panel — States, Code & Transitions](#19-bet-panel--states-code--transitions)
20. [Game Canvas](#20-game-canvas)
21. [Environment Variables](#21-environment-variables)
22. [Building & Deploying](#22-building--deploying)
23. [Known Issues & Fixes](#23-known-issues--fixes)
24. [Glossary](#24-glossary)

---

## 1. What Is This Project?

An **Aviator crash game** — a multiplayer betting game where a plane flies and a multiplier climbs from 1.00x. Players bet before the round, then cash out before the plane crashes. Cash out at 2.50x with 100 ZAR → win 250 ZAR. If the plane crashes first → lose the bet.

**Current state:**
- Runs in **demo mode** (fake money, 50,000 ZAR starting balance) for all players
- Admin panel at `/admin` to control win/loss mode, bet limits, crash overrides
- Supabase database layer is ready for real wallets but not yet active (see Known Issues)
- Currency: ZAR (South African Rand)

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 5, TailwindCSS v4, Zustand, GSAP, Socket.IO Client |
| Backend | Node.js, Express 4, TypeScript, Socket.IO, Zod 4 |
| Database | Supabase (PostgreSQL) with RPC functions |
| Real-time | Socket.IO (WebSocket) |

---

## 3. Project Structure

```
avitor/
├── backend/
│   ├── src/
│   │   ├── index.ts              # Server entry: Express + Socket.IO + game loop
│   │   ├── gameEngine.ts         # Core game logic (EventEmitter)
│   │   ├── authRouter.ts         # REST API: login, admin controls
│   │   ├── supabaseClient.ts     # Supabase connection (service_role)
│   │   ├── provablyFair.ts       # SHA-256 seed → crash point
│   │   ├── fakeBets.ts           # Bot generator
│   │   ├── types.ts              # Shared types
│   │   └── globals.d.ts          # Global type for __gameEngine
│   ├── supabase/migrations/
│   │   ├── 000001_initial_schema.sql
│   │   └── 000002_game_rpc_functions.sql
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Root: routes game vs admin
│   │   ├── main.tsx              # React entry
│   │   ├── types.ts              # Shared types
│   │   ├── store/gameStore.ts    # Zustand store (ALL game state)
│   │   ├── lib/
│   │   │   ├── socket.ts         # Socket.IO client
│   │   │   ├── authContext.tsx   # Auth provider
│   │   │   └── format.ts         # fmt() + multTier()
│   │   ├── components/
│   │   │   ├── GameCanvas.tsx    # Canvas: plane, curve, multiplier
│   │   │   ├── BetPanel.tsx      # Bet panel: amount, button, auto mode
│   │   │   ├── BetPanels.tsx     # Container: 1 or 2 panels
│   │   │   ├── HistoryBar.tsx    # Crash history pills
│   │   │   ├── LiveBets.tsx      # Sidebar: all bets (bots)
│   │   │   ├── Header.tsx        # Logo + balance
│   │   │   ├── BetErrorToast.tsx # Error toast
│   │   │   ├── LoadingScreen.tsx # Loading overlay
│   │   │   ├── Avatar.tsx        # Avatar image
│   │   │   ├── DemoBar.tsx       # Demo info bar
│   │   │   └── Footer.tsx        # Footer
│   │   ├── admin/
│   │   │   ├── AdminPanel.tsx        # Route guard
│   │   │   ├── RateControlPanel.tsx  # Admin dashboard
│   │   │   └── api.ts               # Admin API wrapper
│   │   └── assets/plane.ts       # SVG plane
│   ├── vite.config.ts            # Dev proxy to backend
│   └── package.json
├── docs/PROJECT_DOCUMENTATION.md # This file
└── README.md
```

---

## 4. Quick Start

```bash
# 1. Backend
cd backend
cp .env.example .env
# Edit .env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
npm install
npm run dev          # → http://localhost:4000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev          # → http://localhost:5173

# 3. Play
# Open http://localhost:5173 — game starts automatically (demo mode)

# 4. Admin
# Go to http://localhost:5173/admin
# Login: admin@aviator.com / admin123
```

---

## 5. Architecture — How Everything Connects

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
│   │ (authRouter)  │   │ Server        │   │ (EventEmitter)      │   │
│   └───────┬───────┘   └───────┬───────┘   └──────────┬──────────┘   │
│           │                   │                      │               │
│           │    Engine events → Socket.IO broadcasts:  │               │
│           │    round:betting, tick:countdown          │               │
│           │    round:flying, tick:multiplier          │               │
│           │    round:crashed                          │               │
│           ▼                                           │               │
│   ┌───────────────────┐                               │               │
│   │ Supabase Client   │◄──── All DB operations        │               │
│   │ (service_role)    │        RPC: create_round,     │               │
│   │                   │        start_round,            │               │
│   │                   │        resolve_round,          │               │
│   │                   │        place_bet,              │               │
│   │                   │        cancel_bet,             │               │
│   │                   │        cashout_bet             │               │
│   └───────────────────┘                               │               │
└──────────────────────────────────────────────────────────────────────┘
```

**Three design decisions you must understand:**

**1. GameEngine is an EventEmitter — decoupled from Socket.IO**
The engine runs the game loop and emits events. `index.ts` listens and broadcasts via Socket.IO. The engine doesn't know about WebSockets.

**2. No optimistic balance updates**
The frontend NEVER changes balance locally. It waits for the server's authoritative response. This prevents desync and flicker.

**3. Dual paths: demo vs authenticated**
Every socket handler has two branches: `if (userId)` → Supabase RPC, else → in-memory demo balance. Currently all players are demo.

---

## 6. The Game Loop

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   BETTING    │────►│   FLYING     │────►│   CRASHED    │
│   (5 sec)    │     │ (variable)   │     │   (3 sec)    │
│              │     │              │     │              │
│ Place bets   │     │ Multiplier   │     │ Show result  │
│ Cancel bets  │     │ climbs from  │     │ Sync balance │
│ Countdown    │     │ 1.00x upward │     │ to all       │
│              │     │ Cash out!    │     │ players      │
└──────────────┘     └──────────────┘     └──────────────┘
       ▲                                            │
       └────────────────────────────────────────────┘
```

### Phase 1: BETTING (5 seconds)

1. `beginBetting()` generates seed + crash point (secret), creates round in DB, generates 60–180 bots
2. Emits `round:betting` → all clients show countdown
3. Players `socket.emit("bet:place", { panel, amount })`
4. Countdown ticks every 100ms → `tick:countdown`
5. At 0 → `beginFlying()`

### Phase 2: FLYING (variable)

1. `beginFlying()` transitions round to `flying` in DB
2. Multiplier grows: `multiplier = e^(0.16 × seconds)`
3. Every 50ms → `tick:multiplier` with current multiplier + all bets
4. Bots auto-cash-out when multiplier passes their target
5. Players `socket.emit("bet:cashout", { panel })`
6. When multiplier ≥ crashPoint → `beginCrash()`

### Phase 3: CRASHED (3 seconds)

1. `beginCrash()` calls `resolve_round()` in DB — reveals seed, marks lost bets
2. Emits `round:crashed` with seed + history
3. Syncs every player's balance via `balance:sync`
4. After 3s → `beginBetting()` → loop repeats

### Multiplier Growth Table

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

---

## 7. Backend Source Code — Annotated

### `gameEngine.ts` — The Heart

```typescript
// Key constants
const BETTING_MS = 5000;          // 5-second betting window
const TICK_MS = 50;               // multiplier updates every 50ms (20fps)
const CRASH_PAUSE_MS = 3000;      // 3s pause after crash
const GROWTH = 0.16;              // exponential growth rate
const HARD_CAP_MULTIPLIER = 130;  // absolute max — nothing can exceed this
const HISTORY_LIMIT = 40;         // past rounds shown in history bar

// Admin overrides (pushed from authRouter via globalThis.__gameEngine)
export interface AdminOverrides {
  nextCrashPoint: number | null;  // one-shot override
  winMode: "normal" | "win" | "loss";
  forcedCrash: number | null;     // persistent override
  minBet: number;
  maxBet: number;
}

// Crash point calculation — the most important function in the game
private computeCrashPoint(): number {
  let result: number;

  if (this.overrides.forcedCrash !== null) {
    result = this.overrides.forcedCrash;           // admin forces crash
  } else if (this.overrides.nextCrashPoint !== null) {
    result = this.overrides.nextCrashPoint;        // one-shot override
    this.overrides.nextCrashPoint = null;          // consume it
  } else {
    if (this.overrides.winMode === "win") {
      result = 100 + Math.random() * 30;           // 100x–130x (players win big)
    } else if (this.overrides.winMode === "loss") {
      result = 1.0 + Math.random() * 1.0;          // 1x–2x (house wins)
    } else {
      result = 1.0 + Math.random() * 9.0;          // 1x–10x (fair)
    }
  }

  return Math.floor(Math.min(result, 130) * 100) / 100;  // hard cap + 2 decimals
}

// Multiplier growth during flying phase
this.multiplier = Math.floor(Math.exp(GROWTH * t) * 100) / 100;
// where t = seconds since flying started

// Bet methods
placeBet(socketId, panel, amount, userId?)  // betting phase only
cancelBet(socketId, panel)                  // betting phase only
cashOut(socketId, panel)                    // flying phase only → returns win
```

### `index.ts` — Server Entry Point

```typescript
// Setup
const app = express();
app.use(securityHeaders);     // X-Content-Type-Options, X-Frame-Options, etc.
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: "16kb" }));
app.use("/api", globalLimiter);  // 120 req/min per IP

const io = new Server(server, { cors: { origin: "*" } });

// Create engine and expose globally for authRouter
const engine = new GameEngine();
globalThis.__gameEngine = engine;
globalThis.__io = io;

// Wire engine events → Socket.IO broadcasts
engine.on("round:betting",  (state) => io.emit("round:betting", state));
engine.on("round:flying",   (state) => io.emit("round:flying", state));
engine.on("tick:countdown", (p) => io.emit("tick:countdown", p));
engine.on("tick:multiplier",(p) => io.emit("tick:multiplier", p));
engine.on("round:crashed",  async (p) => {
  io.emit("round:crashed", p);
  // Sync every player's balance after crash
  for (const [sid, socket] of io.sockets.sockets) {
    const userId = authedSockets.get(sid);
    if (userId) {
      const bal = await getWalletBalance(userId);  // real wallet from DB
      socket.emit("balance:sync", { balance: bal });
    } else {
      const bal = demoBalances.get(sid);            // in-memory demo balance
      if (bal != null) socket.emit("balance:sync", { balance: bal });
    }
  }
});

// Socket connection handler
io.on("connection", (socket) => {
  demoBalances.set(socket.id, STARTING_BALANCE);  // give demo money

  socket.emit("init", {
    state: engine.publicState(),
    balance: STARTING_BALANCE,
    currency: "ZAR",
    betLimits: { minBet: engine.overrides.minBet, maxBet: engine.overrides.maxBet },
  });

  // ── bet:place handler (two paths) ──
  socket.on("bet:place", async (payload) => {
    if (userId && engine.supabaseRoundId) {
      // AUTHENTICATED: Supabase RPC place_bet()
      const { data, error } = await supabase.rpc("place_bet", { ... });
      if (result.ok) {
        engine.placeBet(socket.id, panel, amount, userId);
        socket.emit("bet:accepted", { panel, amount, balance: result.balance });
      } else {
        socket.emit("bet:rejected", { panel, reason: result.reason });
      }
    } else {
      // DEMO: in-memory balance
      if (amount > balance) return socket.emit("bet:rejected", { panel, reason: "insufficient" });
      engine.placeBet(socket.id, panel, amount);
      const newBalance = balance - amount;
      demoBalances.set(socket.id, newBalance);
      socket.emit("bet:accepted", { panel, amount, balance: newBalance });
    }
  });

  // ── bet:cashout handler (two paths) ──
  socket.on("bet:cashout", async (payload) => {
    if (userId) {
      // AUTHENTICATED: Supabase RPC cashout_bet()
      const { data } = await supabase.rpc("cashout_bet", {
        p_user_id: userId, p_round_id: engine.supabaseRoundId,
        p_panel: panel, p_multiplier: engine.multiplier,
      });
      engine.cashOut(socket.id, panel);
      socket.emit("bet:cashedout", { panel, multiplier, win, balance });
    } else {
      // DEMO: in-memory
      const result = engine.cashOut(socket.id, panel);
      const newBalance = balance + result.win;
      demoBalances.set(socket.id, newBalance);
      socket.emit("bet:cashedout", { panel, multiplier, win, balance: newBalance });
    }
  });
});
```

### `authRouter.ts` — Auth & Admin API

```typescript
// Custom HMAC-SHA256 token (not JWT, not Supabase Auth)
const ADMIN_EMAIL = "admin@aviator.com";
const ADMIN_PASSWORD = "admin123";
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET ?? "aviator-admin-secret-key";

function signToken(payload: AdminToken): string {
  const body = crypto.createHmac("sha256", TOKEN_SECRET)
    .update(Buffer.from(JSON.stringify(payload)).toString("base64url"))
    .digest("base64url");
  return `${base64url(payload)}.${body}`;
}

// POST /api/auth/login
if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
  const token = signToken({ id: ADMIN_ID, email, role: "admin", exp: Date.now() + 24h });
  res.json({ ok: true, access_token: token, user: { ... } });
}

// PATCH /api/admin/controls — pushes overrides to engine
if (parse.data.win_mode !== undefined) {
  globalThis.__gameEngine.setWinMode(parse.data.win_mode);
}
if (parse.data.forced_crash !== undefined) {
  globalThis.__gameEngine.setForcedCrash(parse.data.forced_crash);
}
if (parse.data.min_bet !== undefined || parse.data.max_bet !== undefined) {
  globalThis.__gameEngine.setBetLimits(min, max);
  globalThis.__io.emit("betLimits:update", { minBet, maxBet });  // broadcast to all
}
```

### `provablyFair.ts`

```typescript
const HOUSE_EDGE = 0.01;  // 1%
const MAX_MULTIPLIER = 130;

export function generateSeed(): RoundSeed {
  const seed = crypto.randomBytes(32).toString("hex");
  const hashedSeed = crypto.createHash("sha256").update(seed).digest("hex");
  return { seed, hashedSeed };
}

export function crashPointFromSeed(seed: string): number {
  const hash = crypto.createHash("sha256").update(seed).digest("hex");
  const h = parseInt(hash.slice(0, 13), 16);  // first 52 bits
  const r = h / Math.pow(2, 52);               // uniform [0, 1)

  if (r < 0.03) return 1.0;                    // 3% instant bust
  const raw = (1 - HOUSE_EDGE) / (1 - r);      // inverse distribution
  return Math.floor(Math.min(raw, MAX_MULTIPLIER) * 100) / 100;
}
```

### `fakeBets.ts`

```typescript
// Generates 60–180 bots per round
export function generateBots(count: number): Array<LiveBet & { target: number }> {
  for (let i = 0; i < count; i++) {
    const r = Math.random();
    let target: number;
    if (r < 0.55) target = 1.1 + Math.random() * 0.9;    // 55%: 1.1x–2.0x (cautious)
    else if (r < 0.85) target = 2 + Math.random() * 3;   // 30%: 2x–5x (moderate)
    else if (r < 0.97) target = 5 + Math.random() * 10;  // 12%: 5x–15x (risky)
    else target = 15 + Math.random() * 85;               // 3%: 15x–100x (greedy)

    bots.push({
      id: crypto.randomUUID(),
      name: maskedName(),           // e.g. "j***5"
      avatar: Math.floor(Math.random() * 72),
      bet: randomBet(),             // from tiers: 2, 4, 5, 10, 20, 25, 40, 50, ...
      target: Math.round(target * 100) / 100,
      cashedOut: false,
      cashedOutAt: null,
      win: null,
    });
  }
  bots.sort((a, b) => b.bet - a.bet);  // sort by bet descending
}
```

### `supabaseClient.ts`

```typescript
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
// Uses service_role key — bypasses RLS. NEVER expose to frontend.
```

---

## 8. Frontend Source Code — Annotated

### `App.tsx` — Root Component

```tsx
function GameApp() {
  const init = useGame((s) => s.init);
  const { session, profile } = useAuth();

  // If logged in, identify to backend for real wallet
  useEffect(() => {
    if (profile && session) {
      setAuth({ userId: profile.id, accessToken: session.access_token });
      socket.emit("auth:identify", { userId: profile.id, token: session.access_token });
    } else {
      setAuth({ userId: null, accessToken: null });  // demo mode
    }
  }, [profile, session]);

  useEffect(() => { init(); }, [init]);  // setup socket listeners

  // Layout: Header → Sidebar + Main → Mobile sidebar
  return (
    <div>
      <LoadingScreen done={ready} />
      <Header />
      <aside><LiveBets /></aside>      {/* desktop sidebar */}
      <main>
        <HistoryBar />
        <GameCanvas />
        <BetPanels />
      </main>
      <aside><LiveBets /></aside>      {/* mobile sidebar */}
    </div>
  );
}

export default function App() {
  const isAdminPath = window.location.pathname.startsWith("/admin");
  return (
    <AuthProvider>
      {isAdminPath ? <AdminPanel /> : <GameApp />}
    </AuthProvider>
  );
}
```

### `gameStore.ts` — Zustand Store (The Brain)

```typescript
interface GameState {
  connected: boolean;
  phase: "betting" | "flying" | "crashed";
  roundId: string;
  multiplier: number;
  countdown: number;
  history: RoundHistoryItem[];
  bets: LiveBet[];
  balance: number;
  panels: [PanelState, PanelState];
  userId: string | null;
  betLimits: { minBet: number; maxBet: number };
  // ... toasts, crashFlash, etc.

  placeBet: (panel: 0 | 1) => void;
  cancelBet: (panel: 0 | 1) => void;
  cashOut: (panel: 0 | 1) => void;
  init: () => void;
}

// ── placeBet: NO optimistic balance update ──
placeBet: (panel) => {
  const s = get();
  const p = s.panels[panel];
  if (p.active || p.queued) return;
  if (p.amount < s.betLimits.minBet) { /* show error toast */ return; }
  if (p.amount > s.betLimits.maxBet) { /* show error toast */ return; }
  if (p.amount > s.balance) return;

  if (s.phase === "betting") {
    // Send to server — balance updated when server responds
    socket.emit("bet:place", { panel, amount: p.amount, ...(userId ? { userId } : {}) });
    get().setPanel(panel, { active: true });
  } else {
    // Queue for next round — no money deducted yet
    get().setPanel(panel, { queued: true });
  }
},

// ── cashOut: NO optimistic balance update ──
cashOut: (panel) => {
  const p = get().panels[panel];
  if (!p.active || p.cashedOut) return;
  socket.emit("bet:cashout", { panel, ...(userId ? { userId } : {}) });
  // Balance updated when server responds with "bet:cashedout"
},

// ── init: all socket listeners ──
init: () => {
  socket.on("init", (data) => {
    set({ phase: data.state.phase, balance: data.balance, /* ... */ });
  });

  socket.on("round:betting", (st) => {
    // Reset panels, then place queued/auto bets
    const wantsBet = prev.map(p => p.queued || p.autoBet);
    // ... reset panel state ...
    wantsBet.forEach((want, i) => {
      if (want) get().placeBet(i);  // auto-place queued or auto bets
    });
  });

  socket.on("tick:multiplier", (p) => {
    set({ multiplier: p.multiplier, bets: p.bets });
    // Check auto cash-out
    s.panels.forEach((panel, i) => {
      if (panel.active && !panel.cashedOut && panel.autoCashOut
          && p.multiplier >= panel.autoCashOutValue) {
        get().cashOut(i);  // auto cash-out!
      }
    });
  });

  socket.on("bet:accepted", (p) => {
    if (p.balance != null) set({ balance: p.balance });  // sync authoritative balance
  });

  socket.on("bet:cashedout", (p) => {
    set({ balance: p.balance });
    get().setPanel(p.panel, { cashedOut: true, cashedOutAt: p.multiplier, win: p.win });
    set({ lastWinToast: { panel: p.panel, mult: p.multiplier, win: p.win, at: Date.now() } });
  });

  socket.on("bet:rejected", (p) => {
    get().setPanel(p.panel, { active: false, queued: false });
    // Show toast for actionable reasons only (not "phase" or "duplicate")
    if (!["phase", "duplicate"].includes(p.reason)) {
      set({ betErrorToast: { msg: reasonMessages[p.reason], at: Date.now() } });
    }
  });

  socket.on("balance:sync", (p) => set({ balance: p.balance }));
  socket.on("betLimits:update", (p) => {
    set({ betLimits: p });
    // Clamp panel amounts to new limits
  });
},
```

### `BetPanel.tsx` — The Betting Interface

```tsx
// Action button logic — context-sensitive
type ActionKind = "bet" | "cancel" | "cancelQueued" | "cashout" | "waiting";
let action: ActionKind = "bet";
if (panel.active && phase === "flying" && !panel.cashedOut) action = "cashout";
else if (panel.active && phase === "betting") action = "cancel";
else if (panel.queued) action = "cancelQueued";
else if (panel.cashedOut) action = "waiting";

// Amount input — draft-commit pattern for smooth typing
const [amountDraft, setAmountDraft] = useState<string | null>(null);

<input
  value={amountDraft ?? panel.amount.toFixed(2)}
  onFocus={() => setAmountDraft(panel.amount.toFixed(2))}
  onChange={(e) => setAmountDraft(sanitizeDecimal(e.target.value))}
  onBlur={commitAmount}   // parse → clamp → commit → clear draft
  onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
  inputMode="decimal"
/>

// GSAP pulse on cash-out button as multiplier climbs
useEffect(() => {
  if (panel.active && phase === "flying" && !panel.cashedOut && btnRef.current) {
    gsap.fromTo(btnRef.current, { scale: 1 }, { scale: 1.015, yoyo: true, repeat: 1 });
  }
}, [Math.floor(multiplier * 10)]);
```

### `socket.ts` — Socket.IO Client

```typescript
const URL = import.meta.env.VITE_SERVER_URL ?? window.location.origin;
export const socket: Socket = io(URL, {
  autoConnect: true,
  transports: ["websocket"],
});
```

### `authContext.tsx` — Auth Provider

```tsx
// Session stored in localStorage as "aviator_admin_session"
const login = async (email, password) => {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (json.ok) {
    localStorage.setItem("aviator_admin_session", JSON.stringify({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: json.expires_at,
    }));
  }
};
```

### `vite.config.ts` — Dev Proxy

```typescript
const backend = process.env.VITE_DEV_BACKEND ?? "http://127.0.0.1:4000";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173, host: true, strictPort: true,
    proxy: {
      "/api": { target: backend, changeOrigin: true },
      "/socket.io": { target: backend, ws: true, changeOrigin: true },
    },
  },
});
```

---

## 9. Database — Full Schema & SQL

### `000001_initial_schema.sql` — All Tables

```sql
-- Config: key-value store for game settings
create table config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

-- Users: linked to Supabase auth.users
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  kyc_status text default 'pending',
  role text default 'user',
  created_at timestamptz default now()
);

-- Wallets: balance with optimistic concurrency (version field)
create table wallets (
  user_id uuid primary key references users(id) on delete cascade,
  currency text default 'ZAR',
  balance numeric(19,2) default 0 not null,
  version int default 1 not null,          -- ← optimistic concurrency
  updated_at timestamptz default now()
);

-- Wallet ledger: full audit trail
create table wallet_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  type text check (type in ('bet_lock','bet_refund','win','deposit','withdrawal','fee')),
  amount numeric(19,2) not null,
  running_balance numeric(19,2) not null,
  round_id uuid, bet_id uuid, reference text,
  created_at timestamptz default now()
);

-- Rounds: game rounds with provably-fair seed
create table rounds (
  id uuid primary key default uuid_generate_v4(),
  hashed_seed text not null,       -- published before round
  seed text,                       -- revealed after crash
  crash_point numeric(19,2),
  status text check (status in ('betting','flying','crashed')),
  started_at timestamptz default now(),
  ended_at timestamptz
);

-- Bets: individual player bets
create table bets (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id),
  round_id uuid not null references rounds(id),
  panel smallint check (panel in (0,1)),    -- two panels: 0 or 1
  amount numeric(19,2) not null,
  status text check (status in ('locked','cashed_out','lost','cancelled')),
  cashout_multiplier numeric(19,2),
  win_amount numeric(19,2),
  locked_at timestamptz default now(),
  resolved_at timestamptz
);

-- Unique constraint: one active bet per user/round/panel
create unique index idx_bets_unique_active
  on bets(user_id, round_id, panel) where status <> 'cancelled';

-- Cashouts: record of each cashout
create table cashouts (
  id uuid primary key default uuid_generate_v4(),
  bet_id uuid not null references bets(id),
  round_id uuid not null references rounds(id),
  user_id uuid not null references users(id),
  multiplier numeric(19,2) not null,
  win_amount numeric(19,2) not null,
  created_at timestamptz default now()
);

-- Audit rounds: full lifecycle audit
create table audit_rounds (
  id uuid primary key default uuid_generate_v4(),
  round_id uuid not null references rounds(id),
  hashed_seed text, seed text, crash_point numeric(19,2),
  status text, server_instance_id text,
  started_at timestamptz, ended_at timestamptz
);

-- User limits: per-user betting caps
create table user_limits (
  user_id uuid primary key references users(id),
  daily_bet numeric(19,2) default 0,
  weekly_bet numeric(19,2) default 0,
  max_bet numeric(19,2) default 10000,
  min_bet numeric(19,2) default 1
);

-- RLS: users read own data, admins manage all
create policy "Users can read own profile" on users for select using (auth.uid() = id);
create policy "Admins can manage all users" on users for all
  using ((select role from users where id = auth.uid()) = 'admin');
-- ... similar for wallets, ledger, bets, cashouts, limits

-- Seed data
insert into config (key, value) values
  ('bet_limits', '{"min_bet":1,"max_bet":10000,"currency":"ZAR"}'::jsonb),
  ('game', '{"starting_balance":50000,"house_edge":0.01,"max_multiplier":1000}'::jsonb);
```

### `000002_game_rpc_functions.sql` — Wallet Operations

```sql
-- place_bet: deduct wallet, create bet, write ledger
create or replace function place_bet(
  p_user_id uuid, p_round_id uuid, p_panel smallint,
  p_amount numeric, p_reference text default null
) returns jsonb as $$
declare
  v_balance numeric; v_wallet_version int; v_bet_id uuid;
  v_min_bet numeric; v_max_bet numeric;
begin
  -- Read bet limits from config
  select coalesce((value->>'min_bet')::numeric, 1),
         coalesce((value->>'max_bet')::numeric, 10000)
  into v_min_bet, v_max_bet from config where key = 'bet_limits';

  if p_amount <= 0 or p_amount < v_min_bet or p_amount > v_max_bet then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  -- Lock wallet row
  select balance, version into v_balance, v_wallet_version
  from wallets where user_id = p_user_id for update;

  if v_balance is null then return jsonb_build_object('ok', false, 'reason', 'no_wallet'); end if;
  if v_balance < p_amount then return jsonb_build_object('ok', false, 'reason', 'insufficient'); end if;

  -- Create bet (unique constraint prevents duplicates)
  insert into bets (user_id, round_id, panel, amount, status)
  values (p_user_id, p_round_id, p_panel, p_amount, 'locked')
  on conflict (user_id, round_id, panel) where status <> 'cancelled' do nothing
  returning id into v_bet_id;

  if v_bet_id is null then return jsonb_build_object('ok', false, 'reason', 'duplicate'); end if;

  -- Deduct wallet with optimistic concurrency
  update wallets set balance = balance - p_amount, version = version + 1
  where user_id = p_user_id and version = v_wallet_version
  returning balance into v_balance;

  if v_balance is null then
    delete from bets where id = v_bet_id;  -- rollback
    return jsonb_build_object('ok', false, 'reason', 'concurrent');
  end if;

  -- Write ledger
  insert into wallet_ledger (user_id, type, amount, running_balance, round_id, bet_id, reference)
  values (p_user_id, 'bet_lock', -p_amount, v_balance, p_round_id, v_bet_id, p_reference);

  return jsonb_build_object('ok', true, 'balance', v_balance, 'bet_id', v_bet_id);
end; $$ language plpgsql;

-- cashout_bet: credit winnings, mark bet, write ledger + cashout record
create or replace function cashout_bet(
  p_user_id uuid, p_round_id uuid, p_panel smallint,
  p_multiplier numeric, p_reference text default null
) returns jsonb as $$
declare
  v_bet_id uuid; v_amount numeric; v_win numeric;
  v_balance numeric; v_wallet_version int;
begin
  -- Round must be flying
  select status into v_round_status from rounds where id = p_round_id;
  if v_round_status <> 'flying' then return jsonb_build_object('ok', false, 'reason', 'not_flying'); end if;

  -- Find locked bet
  select id, amount into v_bet_id, v_amount from bets
  where user_id = p_user_id and round_id = p_round_id and panel = p_panel and status = 'locked'
  for update;

  if v_bet_id is null then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;

  v_win := round(v_amount * p_multiplier, 2);

  -- Credit wallet
  update wallets set balance = balance + v_win, version = version + 1
  where user_id = p_user_id and version = v_wallet_version
  returning balance into v_balance;

  -- Mark bet as cashed out
  update bets set status = 'cashed_out', cashout_multiplier = p_multiplier,
    win_amount = v_win, resolved_at = now() where id = v_bet_id;

  -- Write cashout + ledger
  insert into cashouts (bet_id, round_id, user_id, multiplier, win_amount)
  values (v_bet_id, p_round_id, p_user_id, p_multiplier, v_win);
  insert into wallet_ledger (user_id, type, amount, running_balance, round_id, bet_id, reference)
  values (p_user_id, 'win', v_win, v_balance, p_round_id, v_bet_id, p_reference);

  return jsonb_build_object('ok', true, 'balance', v_balance, 'win', v_win);
end; $$ language plpgsql;

-- resolve_round: mark round crashed, reveal seed, mark lost bets
create or replace function resolve_round(
  p_round_id uuid, p_crash_point numeric, p_seed text,
  p_server_instance_id text default null
) returns jsonb as $$
begin
  update rounds set status = 'crashed', crash_point = p_crash_point,
    seed = p_seed, ended_at = now()
  where id = p_round_id and status = 'flying';

  -- Mark all remaining locked bets as lost
  for v_bet in select id, user_id, amount from bets
    where round_id = p_round_id and status = 'locked' for update
  loop
    update bets set status = 'lost', resolved_at = now() where id = v_bet.id;
  end loop;

  return jsonb_build_object('ok', true);
end; $$ language plpgsql;
```

### Bet Status Lifecycle

```
place_bet()     → 'locked'      (money deducted)
cashout_bet()   → 'cashed_out'  (winnings credited)
resolve_round() → 'lost'        (crash before cashout)
cancel_bet()    → 'cancelled'   (refund during betting)
```

---

## 10. Socket.IO Events

### Server → Client

| Event | Payload | When |
|-------|---------|------|
| `init` | `{ state, balance, currency, betLimits }` | Socket connects |
| `round:betting` | `PublicRoundState` | Betting phase starts |
| `tick:countdown` | `{ countdown }` | Every 100ms during betting |
| `round:flying` | `PublicRoundState` | Flying phase starts |
| `tick:multiplier` | `{ multiplier, bets }` | Every 50ms during flying |
| `round:crashed` | `{ multiplier, seed, hashedSeed, history }` | Plane crashes |
| `bet:accepted` | `{ panel, amount, balance }` | Bet accepted |
| `bet:rejected` | `{ panel, reason, minBet?, maxBet? }` | Bet rejected |
| `bet:cancelled` | `{ panel, balance? }` | Bet cancelled + refunded |
| `bet:cashedout` | `{ panel, multiplier, win, balance }` | Cashout successful |
| `balance:sync` | `{ balance }` | Authoritative balance push |
| `betLimits:update` | `{ minBet, maxBet }` | Admin changed limits |

### Client → Server

| Event | Payload | Purpose |
|-------|---------|---------|
| `auth:identify` | `{ userId, token }` | Switch to real wallet mode |
| `bet:place` | `{ panel, amount, userId? }` | Place a bet |
| `bet:cancelWithAmount` | `{ panel, amount, userId? }` | Cancel a bet |
| `bet:cashout` | `{ panel, userId? }` | Cash out |

### Rejection Reasons

| Reason | Toast? | Message |
|--------|--------|---------|
| `phase` | No | (expected during normal play) |
| `duplicate` | No | (already bet on this panel) |
| `below_min` | Yes | "Minimum bet is X ZAR" |
| `above_max` | Yes | "Maximum bet is X ZAR" |
| `insufficient` | Yes | "Insufficient balance" |
| `server_error` | Yes | "Server error — please try again" |

---

## 11. REST API

### Auth

| Method | Path | Auth | Body/Response |
|--------|------|------|---------------|
| POST | `/api/auth/login` | None | `{ email, password }` → `{ access_token, user }` |
| POST | `/api/auth/refresh` | None | `{ refresh_token }` → new tokens |
| POST | `/api/auth/logout` | Bearer | → `{ ok: true }` |
| GET | `/api/auth/me` | Bearer | → `{ user: { id, email, role, ... } }` |

### Admin

| Method | Path | Auth | Body/Response |
|--------|------|------|---------------|
| GET | `/api/admin/controls` | Admin | → `{ controls: { min_bet, max_bet, win_mode, ... } }` |
| PATCH | `/api/admin/controls` | Admin | `{ min_bet?, max_bet?, win_mode?, forced_crash?, next_crash_point? }` |
| GET | `/api/admin/stats` | Admin | → `{ stats: { total_users, total_balance, rounds_today, ... } }` |

### Public

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | `{ status: "ok", phase, ts }` |
| GET | `/api/state` | Full `PublicRoundState` |
| GET | `/api/wallet` | `{ balance, currency }` (requires auth) |

### Rate Limiting

| Limiter | Scope | Limit |
|---------|-------|-------|
| `globalLimiter` | `/api/*` | 120 req/min per IP |
| `loginLimiter` | `/api/auth/login` | 50 attempts / 15 min (skips successful) |
| `adminLimiter` | `/api/admin/*` | 120 req/min per IP |

---

## 12. Admin Panel

**Access:** `http://localhost:5173/admin` → Login: `admin@aviator.com` / `admin123`

### Controls

| Control | Values | Effect |
|---------|--------|--------|
| Win Mode | `normal` / `win` / `loss` | Crash point distribution bias |
| Min Bet | 0.01 – 1,000,000 | Minimum bet amount |
| Max Bet | 1 – 10,000,000 | Maximum bet amount |
| Next Crash Point | 1.01 – 130 or null | One-shot override (consumed after 1 round) |
| Forced Crash | 1.01 – 130 or null | Every round crashes here until cleared |

### Override Priority

```
1. forcedCrash        (highest — overrides everything)
2. nextCrashPoint     (one-shot — consumed after one round)
3. winMode            (normal random generation)
4. HARD_CAP = 130x    (absolute maximum, nothing exceeds this)
```

### Change Flow

```
Admin UI → PATCH /api/admin/controls
  → Zod validation
  → Update config table in Supabase (min_bet, max_bet)
  → Push to globalThis.__gameEngine (immediate effect)
  → If bet limits changed → io.emit("betLimits:update") to all clients
  → Frontend clamps panel amounts
```

---

## 13. Authentication

Custom HMAC-SHA256 token system (not JWT, not Supabase Auth).

```
Token = base64url(payload) + "." + base64url(HMAC-SHA256(payload, secret))

payload = { id, email, role, exp }
secret  = ADMIN_TOKEN_SECRET env var
expiry  = 24 hours
```

**Login flow:**
1. POST `/api/auth/login` with hardcoded credentials
2. Server signs token → returns `access_token` + `refresh_token`
3. Frontend stores in `localStorage` as `aviator_admin_session`
4. All admin API calls send `Authorization: Bearer <token>`

**Game auth paths:**

| Path | Trigger | Balance Source | Working? |
|------|---------|---------------|----------|
| Demo | No `userId` | In-memory `Map<socketId, number>` | Yes |
| Authenticated | `userId` present | Supabase `wallets` via RPC | No (C1 bug) |

---

## 14. Crash Point Math

### Growth Formula

```
multiplier = e^(0.16 × t)    where t = seconds since flying started
```

### Crash Point Selection

```
1. forcedCrash set?     → use it (admin override, persistent)
2. nextCrashPoint set?  → use it once, then clear (one-shot)
3. winMode = "win"      → random 100.00x – 130.00x
   winMode = "loss"     → random 1.00x – 2.00x
   winMode = "normal"   → random 1.00x – 10.00x
4. Always: min(result, 130) → floor to 2 decimals
```

### Win Calculation

```
win = bet_amount × cashout_multiplier
Example: 100 ZAR × 2.50x = 250 ZAR
```

---

## 15. Bot System

60–180 bots per round. Each bot has:
- **Name**: masked (e.g. `j***5`)
- **Avatar**: 0–71
- **Bet**: from tiers [2, 4, 5, 10, 20, 25, 40, 50, 75, 100, 150, 200, 250, 300, 500, 750, 1000, 1500, 1642.01, 1670.73]
- **Target cashout**: weighted random

| Probability | Range | Type |
|-------------|-------|------|
| 55% | 1.1x – 2.0x | Cautious |
| 30% | 2.0x – 5.0x | Moderate |
| 12% | 5.0x – 15.0x | Risky |
| 3% | 15.0x – 100.0x | Greedy |

Bots auto-cash-out when `multiplier >= bot.target` and `bot.target < crashPoint`.

---

## 16. Provably Fair System

The server commits to a seed before the round (publishes hash), reveals it after. Anyone can verify:

```
1. SHA-256(seed) === publishedHash     (seed wasn't changed)
2. crashPointFromSeed(seed) === result (crash point wasn't changed)
```

**Formula:** `crash = (1 - 0.01) / (1 - r)` where `r` = first 52 bits of SHA-256 hash / 2^52. 3% instant bust chance. 1% house edge. Capped at 130x.

**Current status:** Exists and works, but the live game uses `computeCrashPoint()` (random with admin overrides) instead. Provably fair is used only for history fallback when DB is unreachable.

---

## 17. Wallet System

### Demo (current)

```
Connect → demoBalances.set(socketId, STARTING_BALANCE)
Place bet → balance -= amount → emit("bet:accepted", { balance })
Cash out → balance += win → emit("bet:cashedout", { balance })
Disconnect → demoBalances.delete(socketId)  ← balance gone
```

### Real Wallet (authenticated, via Supabase RPC)

All operations use `FOR UPDATE` row locking + optimistic concurrency via `version` field:

```sql
UPDATE wallets
  SET balance = balance + win, version = version + 1
  WHERE user_id = p_user_id AND version = v_wallet_version
  RETURNING balance;
-- If version mismatch → returns null → { ok: false, reason: "concurrent" }
```

Every transaction writes to `wallet_ledger` with `running_balance` for full audit trail.

---

## 18. State Management

**Zustand** — minimal, no boilerplate. One store holds ALL game state.

```
gameStore
├── Connection: connected, roundId
├── Game: phase, multiplier, countdown, history, bets
├── Player: balance, currency, userId
├── Limits: minBet, maxBet
├── Panels: [PanelState, PanelState]
├── Toasts: betErrorToast, lastWinToast
└── Actions: init(), placeBet(), cancelBet(), cashOut(), setPanel()
```

**Why no optimistic updates?** Previous versions deducted balance locally on bet. This caused:
- Balance flicker (optimistic ≠ server value)
- Desync (server rejects but client already deducted)
- Race conditions (rapid bets corrupt local state)

Fix: **never touch balance locally**. Wait for server's authoritative response.

---

## 19. Bet Panel — States, Code & Transitions

### State Machine

```
    [idle] ──placeBet(betting)──► [active] ──cashOut(flying)──► [cashedOut]
       ▲                              │                              │
       │                              │ cancelBet(betting)            │ round ends
       │◄─────────────────────────────┤                              │
       │                                                             │
       │◄─────────────────────────────────────────────────────────────┘
       │
       │──placeBet(flying/crashed)──► [queued] ──round:betting──► [active]
       │                                  │
       │◄──cancelBet()────────────────────┘
```

### Button States

| Text | Condition | Color |
|------|-----------|-------|
| Bet + amount | Betting, no active bet | Green |
| Cancel + amount | Betting, has active bet | Red |
| Cancel + "Waiting" | Has queued bet | Red |
| Cash Out + win | Flying, has active bet | Orange |
| Cashed out at X.XXx | Already cashed out | Dark green |
| Waiting... | Round ended | Grey |

### Auto Mode

- **Auto Bet**: Places bet automatically at start of each betting phase
- **Auto Cash Out**: Cash out automatically when multiplier ≥ target
- Manual button locked when auto-bet is on

---

## 20. Game Canvas

HTML5 Canvas + GSAP:
- **Betting**: "Waiting for next round..." + countdown
- **Flying**: Exponential curve from bottom-left to top-right, plane SVG at tip, multiplier text centered
- **Crashed**: Red flash, plane flies off, final multiplier shown

Uses `requestAnimationFrame` for 60fps. Canvas auto-resizes to container.

---

## 21. Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | **Yes** | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** | — | Service role key (server only!) |
| `PORT` | No | `4000` | Backend port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `STARTING_BALANCE` | No | `1000` | Demo balance (ZAR) |
| `SERVER_INSTANCE_ID` | No | `aviator-server-1` | Audit log ID |
| `ADMIN_TOKEN_SECRET` | No | `aviator-admin-secret-key` | HMAC signing secret |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origins |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_DEV_BACKEND` | `http://127.0.0.1:4000` | Backend URL for dev proxy |
| `VITE_SERVER_URL` | `window.location.origin` | Socket.IO server URL |

---

## 22. Building & Deploying

```bash
# Development — two terminals
cd backend && npm run dev      # → http://localhost:4000
cd frontend && npm run dev     # → http://localhost:5173

# Production
cd backend && npm run build    # tsc → dist/
cd backend && npm start        # node dist/index.js
cd frontend && npm run build   # tsc -b && vite build → dist/
# Serve frontend dist/ with nginx/Netlify/Vercel
```

### Production Architecture

```
Internet → nginx/CDN → frontend dist/ (static)
              ├── /api/*       → proxy to backend:4000
              └── /socket.io/* → proxy to backend:4000 (WebSocket upgrade)
```

---

## 23. Known Issues & Fixes

| # | Issue | Impact | How to Fix |
|---|-------|--------|-----------|
| C1 | `auth:identify` uses `supabase.auth.getUser()` but frontend sends HMAC token | Auth users can't use real wallets | Replace with `verifyToken()` from authRouter |
| C2 | `loadAdminControls()` reads from `admin_controls` table (doesn't exist) | Admin settings reset on restart | Read from `config` table or create `admin_controls` |
| C3 | `place_bet` RPC reads limits from `config where key='bet_limits'` but admin writes `min_bet`/`max_bet` separately | Bet limits don't work for auth users | Update RPC to read separate keys |
| C4 | Hardcoded admin credentials | Security risk | Move to environment variables |
| C5 | Socket.IO CORS is `origin: "*"` | Any site can connect | Use `CORS_ORIGIN` env var |

**What's already clean:**
- No unused dependencies (removed `@supabase/supabase-js` frontend, `jsonwebtoken` backend)
- No dead code, no TODOs
- TypeScript compiles clean
- Security headers, rate limiting, wallet row locking all in place
- Root codebase organized (test/archive files moved to `_archive/`)

---

## 24. Glossary

| Term | Meaning |
|------|---------|
| Crash point | Multiplier at which the plane crashes |
| Cash out | Exit round at current multiplier → win `bet × multiplier` |
| Betting phase | 5-second window to place bets |
| Flying phase | Multiplier climbs from 1.00x until crash |
| Crashed phase | 3-second pause before next round |
| Panel | One of two bet slots (can bet on both) |
| Queued bet | Bet placed during flying/crashed — executes next round |
| Auto-bet | Auto-places bet each round |
| Auto cash-out | Auto-cashes out at target multiplier |
| Win mode | Admin bias: normal/win/loss |
| Forced crash | Admin forces every round to crash at specific point |
| Hard cap | 130x — absolute maximum, nothing exceeds |
| Provably fair | Server commits to seed (hash), reveals after — verifiable |
| Demo mode | No auth — in-memory balance, resets on refresh |
| Bot | Fake player with name, avatar, bet, target cashout |
| ZAR | South African Rand (currency) |
| HMAC-SHA256 | Token signing method |
| RLS | Row Level Security (PostgreSQL) |
| RPC | PostgreSQL functions called via Supabase |
| Optimistic concurrency | Version-checked updates to prevent race conditions |
| Zustand | Minimal React state manager |
| GSAP | Animation library (plane, buttons) |

---

*This document is self-contained. A developer should understand and work on this project using only this document and the source code. No questions to the previous developer should be needed.*
