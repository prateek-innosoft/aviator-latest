import "dotenv/config";
import http from "node:http";
import os from "node:os";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Server, type Socket } from "socket.io";
import { GameEngine } from "./gameEngine.js";
import * as store from "./store.js";
import { authRouter } from "./authRouter.js";
import { nestGet, nestPost } from "./nestClient.js";
import type { NestResult } from "./nestClient.js";
import { saveAdminControls } from "./adminControls.js";
import type { WinMode } from "./gameEngine.js";
import type { CancelBetPayload, CashOutPayload, PlaceBetPayload } from "./types.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";

function lanIpv4(): string[] {
  const out: string[] = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets ?? []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

const app = express();

// Behind a reverse proxy (nginx, pm2 + nginx, cloudflare tunnel, etc.) in
// staging/prod, Express must be told to trust X-Forwarded-For or
// express-rate-limit can't safely derive a per-client key and throws
// ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request. TRUST_PROXY sets the
// hop count (how many proxies sit in front of this process); defaults to 0
// (untrusted) for local dev where there's no proxy.
const trustProxy = Number(process.env.TRUST_PROXY ?? 0);
if (trustProxy > 0) app.set("trust proxy", trustProxy);

// Security headers
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

app.use(cors({
  origin: process.env.CORS_ORIGIN ?? "*",
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "16kb" }));

// Global API rate limiter
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, reason: "too_many_requests" },
});
app.use("/api", globalLimiter);

// Auth routes (local admin-panel login only — real players never log into
// this engine, see authRouter.ts)
app.use("/api/auth", authRouter);
app.use("/api", authRouter); // also mounts /api/admin/controls + /api/admin/stats + /api/admin/reserve

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

const engine = new GameEngine();

// Expose engine globally so authRouter can push overrides into it
(globalThis as Record<string, unknown>).__gameEngine = engine;
(globalThis as Record<string, unknown>).__io = io;

// Shared demo wallet — a single balance for all unauthenticated sockets,
// backed by the in-memory store (persists for the server session). Thin
// wrappers keep the async-looking call sites below unchanged.
function getDemoBalance(): number {
  return store.getDemoBalance();
}

/** Atomically adjust the shared demo wallet. Returns new balance, or null if it would drop below minBalance. */
function adjustDemoBalance(delta: number, minBalance = 0): number | null {
  return store.adjustDemoBalance(delta, minBalance);
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", phase: engine.phase, ts: Date.now() });
});

app.get("/api/state", (_req, res) => {
  res.json(engine.publicState());
});

/** Fetch a user's real wallet balance from the platform backend, using their game-session token. */
async function getRealWalletBalance(token: string): Promise<number | null> {
  const result = await nestGet<{ success: boolean; data: { balance: number } }>(
    "/aviator/wallet",
    token,
  );
  if (!result.ok || !result.data?.data) return null;
  return result.data.data.balance;
}

/** Authenticated wallet balance endpoint — proxies the platform backend. */
app.get("/api/wallet", async (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, reason: "missing_token" });
    return;
  }
  const balance = await getRealWalletBalance(header.slice(7));
  if (balance === null) {
    res.status(404).json({ ok: false, reason: "wallet_not_found" });
    return;
  }
  res.json({ ok: true, balance, currency: "INR" });
});

// Map from socket.id → authenticated { userId, token } (for authenticated sockets).
// The token is the platform's own game-session token, forwarded as-is on
// every wallet call — it is never verified locally, only by the platform.
const authedSockets = new Map<string, { userId: string; token: string }>();
// Sockets that presented a player token but whose wallet lookup failed — these
// must NOT fall through to the demo wallet, or a real-money player would
// silently end up playing with fake balance and no platform transaction.
const authFailedSockets = new Set<string>();

// The platform's game-session JWT is short-lived (SPINFORGE_GAME_SESSION_EXPIRY).
// A long-running authenticated action — most commonly Auto Bet / Auto Cash Out,
// which is designed to keep firing unattended — can outlive it mid-session.
// AviatorSessionGuard rejects the stale token with 401 "Invalid or expired game
// session" on every subsequent platform call, which otherwise just leaked
// through as the raw NestJS error text on whatever action happened to hit it
// next (a confusing message for a session problem, not a bet problem). Detect
// it at the root — any 401 from an authenticated platform call — deauth the
// socket immediately so it falls back to demo mode instead of repeatedly
// retrying with a token that will never become valid again.
function isSessionExpired(result: NestResult<unknown>): boolean {
  return result.status === 401;
}

function deauthOnSessionExpiry(socket: Socket, result: NestResult<unknown>) {
  console.error(`[session] game session token expired/invalid for socket=${socket.id}: ${result.reason}`);
  authedSockets.delete(socket.id);
  authFailedSockets.add(socket.id);
  socket.emit("auth:failed", { reason: "session_expired" });
}

function broadcast(event: string, payload: unknown) {
  io.emit(event, payload);
}

function validClientId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9-]{8,128}$/.test(value);
}

function playerRoom(clientId: string): string {
  return `player:${clientId}`;
}

// Server-resolved auto cash-out (see gameEngine.ts emitAutoCashouts()) — the
// tick loop already marked the bet cashed out and recorded the payout; this
// just credits the wallet and notifies the one socket that placed it. Only
// the demo (unauthenticated) path is live traffic today — the authenticated
// branch is a no-op here, matching that path being unreachable elsewhere.
engine.on("playerBet:autoCashedOut", async (bet: {
  socketId: string; userId: string | null; panel: 0 | 1;
  cashedOutAt: number | null; win: number | null;
}) => {
  if (bet.userId || bet.win == null) return;
  const newBalance = await adjustDemoBalance(bet.win);
  // Stable player rooms survive a Socket.IO reconnect. Also target the raw
  // id for backwards compatibility with clients that predate clientId.
  io.to(playerRoom(bet.socketId)).to(bet.socketId).emit("bet:cashedout", {
    panel: bet.panel,
    multiplier: bet.cashedOutAt,
    win: bet.win,
    balance: newBalance ?? undefined,
  });
});

// Custom mode is one-shot (see gameEngine.ts lockRoundAndSelectCrash()) — the
// engine already reverted its own live overrides the instant it consumed the
// custom crash for that round; this just makes the reversion durable (so a
// GET /admin/controls or a page refresh reflects it too) and pushes it to any
// open admin panel so the Game Mode selector snaps back on its own.
engine.on("admin:customModeConsumed", async ({ winMode }: { winMode: WinMode }) => {
  const saved = await saveAdminControls({ win_mode: winMode, forced_crash: null });
  if (saved.ok) {
    broadcast("admin:controls", {
      win_mode: saved.controls.win_mode,
      forced_crash: saved.controls.forced_crash,
    });
  }
});

engine.on("round:betting", (state) => broadcast("round:betting", state));
engine.on("round:flying", (state) => broadcast("round:flying", state));
engine.on("tick:countdown", (p) => broadcast("tick:countdown", p));
engine.on("tick:multiplier", (p) => broadcast("tick:multiplier", p));
engine.on("admin:roundEconomy", (p) => broadcast("admin:roundEconomy", p));
engine.on("round:crashed", async (p) => {
  // Broadcast the crash to all clients first.
  broadcast("round:crashed", p);
  // Sync authoritative balance to every connected socket. The demo wallet
  // is shared across all unauthenticated sockets, so fetch it once.
  const sharedDemoBalance = await getDemoBalance();
  for (const [sid, socket] of io.sockets.sockets) {
    const authed = authedSockets.get(sid);
    if (authed) {
      // Authenticated user — fetch real wallet balance from the platform
      // backend. This is an await, so the socket could re-identify as a
      // DIFFERENT user (logout + login again) while it's in flight —
      // re-check identity before emitting so a stale fetch for the OLD
      // user can't land after and overwrite the new user's balance.
      const realBalance = await getRealWalletBalance(authed.token);
      if (realBalance !== null && authedSockets.get(sid)?.userId === authed.userId) {
        socket.emit("balance:sync", { balance: realBalance });
      }
    } else if (!authFailedSockets.has(sid)) {
      socket.emit("balance:sync", { balance: sharedDemoBalance });
    }
  }
});

io.on("connection", async (socket) => {
  const playerKey = (clientId: unknown): string => {
    if (!validClientId(clientId)) return socket.id;
    void socket.join(playerRoom(clientId));
    return clientId;
  };

  socket.on("player:identify", (payload: { clientId?: string }) => {
    playerKey(payload?.clientId);
  });

  socket.on("time:sync", (ack: unknown) => {
    if (typeof ack === "function") ack({ serverTime: Date.now() });
  });

  // Demo balance is a single shared persistent wallet — it survives
  // reconnects instead of resetting to a fresh default every time a socket
  // connects.
  socket.emit("init", {
    state: engine.publicState(),
    balance: await getDemoBalance(),
    currency: "INR",
    betLimits: { minBet: engine.overrides.minBet, maxBet: engine.overrides.maxBet },
  });

  // Authenticated client identifies itself so we can push real wallet
  // balance. The token itself is verified by the platform backend on every
  // call we forward it with — a failed /aviator/wallet lookup here is the
  // signal that it's missing/invalid/expired, so we never mark the socket
  // authed (and never let it silently fall back to the demo wallet).
  socket.on("auth:identify", async (payload: { userId: string; token: string }) => {
    if (!payload?.userId || !payload?.token) return;
    const realBalance = await getRealWalletBalance(payload.token);
    if (realBalance === null) {
      console.error(
        `[auth:identify] wallet lookup failed for userId=${payload.userId} socket=${socket.id} — refusing to fall back to demo wallet`,
      );
      authFailedSockets.add(socket.id);
      socket.emit("auth:failed", { reason: "no_wallet" });
      return;
    }
    authFailedSockets.delete(socket.id);
    authedSockets.set(socket.id, { userId: payload.userId, token: payload.token });
    socket.emit("balance:sync", { balance: realBalance });
  });

  // Client logged out — forget this socket's auth association so it stops
  // receiving the old user's real wallet balance on future round:crashed
  // broadcasts (it's back to demo mode client-side; the server needs to
  // know that too, or a stale balance:sync would silently overwrite the
  // demo balance the next time a round ends).
  socket.on("auth:clear", () => {
    authedSockets.delete(socket.id);
    authFailedSockets.delete(socket.id);
  });

  socket.on("bet:place", async (payload: PlaceBetPayload) => {
    const { panel, amount, autoCashOutTarget, clientId } = payload;
    const ownerId = playerKey(clientId);
    const authed = authedSockets.get(socket.id);
    if (!authed && authFailedSockets.has(socket.id)) {
      socket.emit("bet:rejected", { panel, reason: "no_wallet" });
      return;
    }
    try {
      if (authed) {
        if (!engine.roundRecordId || engine.phase !== "betting") {
          socket.emit("bet:rejected", { panel, reason: "round_not_ready" });
          return;
        }
        // Authenticated path: debit against the real platform wallet.
        const result = await nestPost<{ success: boolean; data: { betId: string; balance: number } }>(
          "/aviator/bet/place",
          authed.token,
          { roundId: engine.roundRecordId, panel, amount },
        );
        if (!result.ok || !result.data?.data) {
          if (isSessionExpired(result)) {
            deauthOnSessionExpiry(socket, result);
            socket.emit("bet:rejected", { panel, reason: "session_expired" });
            return;
          }
          socket.emit("bet:rejected", { panel, reason: result.reason ?? "rejected" });
          return;
        }
        const { betId, balance } = result.data.data;
        const placed = engine.placeBet(ownerId, panel, amount, authed.userId, autoCashOutTarget, betId);
        if (!placed) {
          // Engine rejected (e.g. phase moved on) — roll back the debit.
          await nestPost("/aviator/bet/cancel", authed.token, { roundId: engine.roundRecordId, panel, betId });
          socket.emit("bet:rejected", { panel, reason: "phase" });
          return;
        }
        socket.emit("bet:accepted", { panel, amount, balance, betId });
      } else {
        // Demo / unauthenticated path: shared persistent wallet.
        if (amount < engine.overrides.minBet) {
          socket.emit("bet:rejected", { panel, reason: "below_min", minBet: engine.overrides.minBet });
          return;
        }
        if (amount > engine.overrides.maxBet) {
          socket.emit("bet:rejected", { panel, reason: "above_max", maxBet: engine.overrides.maxBet });
          return;
        }
        // Debit first (atomic — fails cleanly if insufficient), then register
        // with the engine; roll back the debit if that registration fails
        // (e.g. phase moved on in the gap), mirroring the authenticated flow.
        const debited = await adjustDemoBalance(-amount, 0);
        if (debited === null) {
          socket.emit("bet:rejected", { panel, reason: "insufficient" });
          return;
        }
        const ok = engine.placeBet(ownerId, panel, amount, undefined, autoCashOutTarget);
        if (ok) {
          socket.emit("bet:accepted", { panel, amount, balance: debited });
        } else {
          const refunded = await adjustDemoBalance(amount);
          socket.emit("bet:rejected", { panel, reason: "phase", balance: refunded ?? debited });
        }
      }
    } catch (err) {
      console.error("[bet:place] unexpected error:", err);
      socket.emit("bet:rejected", { panel, reason: "server_error" });
    }
  });

  socket.on("bet:cancel", async (payload: CancelBetPayload) => {
    const { panel, clientId } = payload;
    const ownerId = playerKey(clientId);
    const authed = authedSockets.get(socket.id);
    if (!authed && authFailedSockets.has(socket.id)) {
      socket.emit("bet:rejected", { panel, reason: "no_wallet" });
      return;
    }
    const bet = engine.getPlayerBet(ownerId, panel);
    if (authed && bet?.betId && engine.roundRecordId) {
      if (!engine.cancelBet(ownerId, panel)) {
        socket.emit("bet:cancel_failed", { panel, reason: "not_betting" });
        return;
      }
      const result = await nestPost<{ success: boolean; data: { balance: number } }>(
        "/aviator/bet/cancel",
        authed.token,
        { roundId: engine.roundRecordId, panel, betId: bet.betId },
      );
      if (result.ok && result.data?.data) {
        socket.emit("bet:cancelled", { panel, balance: result.data.data.balance });
      } else if (isSessionExpired(result)) {
        deauthOnSessionExpiry(socket, result);
        socket.emit("bet:cancel_failed", { panel, reason: "session_expired" });
      } else {
        socket.emit("bet:cancel_failed", { panel, reason: "server_error" });
      }
    } else {
      const ok = engine.cancelBet(ownerId, panel);
      if (ok && bet) {
        const newBalance = await adjustDemoBalance(bet.amount);
        socket.emit("bet:cancelled", { panel, balance: newBalance ?? undefined });
      } else if (ok) {
        socket.emit("bet:cancelled", { panel });
      }
    }
  });

  socket.on("bet:cancelWithAmount", async (payload: CancelBetPayload) => {
    const { panel, clientId } = payload;
    const ownerId = playerKey(clientId);
    const authed = authedSockets.get(socket.id);
    if (!authed && authFailedSockets.has(socket.id)) {
      socket.emit("bet:cancel_failed", { panel, reason: "no_wallet" });
      return;
    }

    if (authed && engine.roundRecordId) {
      // Remove from the engine FIRST (cheap, synchronous, no money moved) —
      // only refund via the platform if the engine actually had this bet.
      // Doing this in the other order let a bet get refunded remotely while
      // engine.cancelBet() then failed (phase already flying) and silently
      // left the bet sitting in engine.playerBets — refunded in the wallet,
      // yet still exposed to the round's economics as if live.
      const bet = engine.getPlayerBet(ownerId, panel);
      if (!bet?.betId) {
        socket.emit("bet:cancel_failed", { panel, reason: "not_betting" });
        return;
      }
      if (!engine.cancelBet(ownerId, panel)) {
        socket.emit("bet:cancel_failed", { panel, reason: "not_betting" });
        return;
      }
      const result = await nestPost<{ success: boolean; data: { balance: number } }>(
        "/aviator/bet/cancel",
        authed.token,
        { roundId: engine.roundRecordId, panel, betId: bet.betId },
      );
      if (!result.ok || !result.data?.data) {
        if (isSessionExpired(result)) {
          deauthOnSessionExpiry(socket, result);
          socket.emit("bet:cancel_failed", { panel, reason: "session_expired" });
          return;
        }
        socket.emit("bet:cancel_failed", { panel, reason: result.reason ?? "server_error" });
        return;
      }
      socket.emit("bet:cancelled", { panel, balance: result.data.data.balance });
    } else {
      // Demo path — refund only when engine actually removed the bet.
      const bet = engine.getPlayerBet(ownerId, panel);
      const ok = engine.cancelBet(ownerId, panel);
      if (!ok) {
        socket.emit("bet:cancel_failed", { panel, reason: "not_betting" });
        return;
      }
      const refund = bet?.amount ?? 0;
      const newBalance = refund > 0 ? await adjustDemoBalance(refund) : await getDemoBalance();
      socket.emit("bet:cancelled", { panel, balance: newBalance ?? undefined });
    }
  });

  socket.on("bet:cashout", async (payload: CashOutPayload) => {
    const { panel, clientId } = payload;
    const ownerId = playerKey(clientId);
    const authed = authedSockets.get(socket.id);
    if (!authed && authFailedSockets.has(socket.id)) {
      return;
    }

    if (authed && engine.roundRecordId) {
      const snapshotRoundId = engine.roundRecordId;
      const bet = engine.getPlayerBet(ownerId, panel);
      const prospectiveWin = bet
        ? Math.floor(bet.amount * engine.getLiveMultiplier() * 100) / 100
        : 0;

      if (engine.wouldExceedBudget(prospectiveWin)) {
        engine.forceCrashNow();
        socket.emit("bet:cashout_failed", { panel, reason: "budget_exhausted" });
        return;
      }

      const locked = engine.cashOut(ownerId, panel);
      if (!locked || !locked.betId) {
        const reason = engine.cashOutFailureReason(ownerId, panel);
        if (engine.phase === "flying" && engine.economyActiveForRound && engine.wouldExceedBudget(prospectiveWin)) {
          engine.forceCrashNow();
        }
        socket.emit("bet:cashout_failed", { panel, reason });
        return;
      }

      const result = await nestPost<{
        success: boolean;
        data: { balance: number; win: number };
      }>("/aviator/bet/cashout", authed.token, {
        roundId: snapshotRoundId,
        panel,
        betId: locked.betId,
        multiplier: locked.cashedOutAt,
      });

      if (!result.ok || !result.data?.data) {
        engine.undoCashOut(ownerId, panel);
        if (isSessionExpired(result)) {
          deauthOnSessionExpiry(socket, result);
          socket.emit("bet:cashout_failed", { panel, reason: "session_expired" });
          return;
        }
        if (result.reason === "budget_exhausted") {
          engine.forceCrashNow();
        }
        socket.emit("bet:cashout_failed", { panel, reason: result.reason ?? "rejected" });
        return;
      }

      const win = result.data.data.win;
      if (locked.win != null && win !== locked.win) {
        engine.recordPaidOut(win - locked.win);
      }

      socket.emit("bet:cashedout", {
        panel,
        multiplier: locked.cashedOutAt,
        win,
        balance: result.data.data.balance,
        betId: locked.betId,
      });
    } else {
      const bet = engine.getPlayerBet(ownerId, panel);
      const prospectiveWin = bet
        ? Math.floor(bet.amount * engine.getLiveMultiplier() * 100) / 100
        : 0;

      if (engine.wouldExceedBudget(prospectiveWin)) {
        engine.forceCrashNow();
        socket.emit("bet:cashout_failed", { panel, reason: "budget_exhausted" });
        return;
      }

      const result = engine.cashOut(ownerId, panel);
      if (result && result.win != null) {
        // cashOut() already records the payout internally now that demo
        // bets count toward the real economy — don't double-count here.
        const newBalance = await adjustDemoBalance(result.win);
        socket.emit("bet:cashedout", {
          panel,
          multiplier: result.cashedOutAt,
          win: result.win,
          balance: newBalance ?? undefined,
        });
      } else {
        const reason = engine.cashOutFailureReason(ownerId, panel);
        if (engine.phase === "flying" && engine.economyActiveForRound && engine.wouldExceedBudget(prospectiveWin)) {
          engine.forceCrashNow();
        }
        socket.emit("bet:cashout_failed", { panel, reason });
      }
    }
  });

  socket.on("disconnect", () => {
    // Demo wallet is shared/persistent now — nothing to clean up per-socket.
    authedSockets.delete(socket.id);
    authFailedSockets.delete(socket.id);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Aviator backend listening on http://localhost:${PORT}`);
  for (const ip of lanIpv4()) {
    console.log(`  LAN backend: http://${ip}:${PORT}`);
  }
  console.log("  (Friends use the frontend URL on :5173 — API is proxied in dev)");
  engine.start().catch((err) => {
    console.error("[startup] engine.start() failed:", err);
    process.exit(1);
  });
});
