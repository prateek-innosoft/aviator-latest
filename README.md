# Aviator — Crash Game (UI + Backend Replica)

A faithful, fully-working replica of the Aviator-style crash game, split into two
independent apps:

```
avitor/
├── backend/    Node + TypeScript + Express + Socket.io game engine
└── frontend/   Vite + React + TypeScript + Tailwind v4 + GSAP + Zustand
```

The frontend talks to the backend over WebSockets in real time. Balances are
**demo / play-money only** and live in memory per connection.

## Features

- Real-time round loop: betting countdown → flight (rising multiplier) → crash.
- **Provably fair** crash points (SHA-256 committed seed, revealed after each round).
- GSAP-driven flight: red curve, climbing plane with spinning propeller, fly-away
  crash animation, rotating sunburst background.
- Two independent bet panels with **Bet** and **Auto** modes, Auto Bet and
  Auto Cash Out.
- Live "All Bets" sidebar populated by simulated players (cash-outs resolve live).
- Round history bar with tiered colours (blue / purple / pink).
- Pixel-faithful, fully responsive layout for **desktop and mobile**.

## Run it

Open two terminals.

### 1. Backend (port 4000)

```bash
cd backend
npm install
npm run dev
```

### 2. Frontend (port 5173)

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173.

> Vite proxies `/socket.io` and `/api` through port 5173, so only the frontend URL is needed.
> Override the backend URL with `VITE_SERVER_URL` for custom production deploys.


## Production build

```bash
cd frontend && npm run build      # type-checks + bundles to dist/
cd backend  && npm run build      # compiles to dist/, run with npm start
```

## Tech choices

| Concern              | Choice                                  |
| -------------------- | --------------------------------------- |
| State management     | Zustand                                 |
| Animation            | GSAP + Canvas 2D (curve) + CSS          |
| Styling              | Tailwind CSS v4 (`@tailwindcss/vite`)   |
| Realtime transport   | Socket.io                               |
| Fairness             | Committed SHA-256 seed per round         |
