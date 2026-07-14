import "dotenv/config";
import http from "node:http";
import os from "node:os";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { GameEngine } from "./gameEngine.js";
import * as store from "./store.js";
import { authRouter, requireAuth, verifyToken, type AuthedRequest } from "./authRouter.js";
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

// Auth routes
app.use("/api/auth", authRouter);
app.use("/api", authRouter); // also mounts /api/admin/controls + /api/admin/stats

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

/** Authenticated wallet balance endpoint. */
app.get("/api/wallet", async (req, res) => {
  await requireAuth(req, res, async () => {
    const uid = (req as AuthedRequest).user!.id;
    const wallet = store.getWallet(uid);
    if (!wallet) {
      res.status(404).json({ ok: false, reason: "wallet_not_found" });
      return;
    }
    res.json({ ok: true, balance: wallet.balance, currency: wallet.currency });
  });
});

/** Fetch a user's real wallet balance from the store. */
function getWalletBalance(userId: string): number | null {
  return store.getWalletBalance(userId);
}

// Map from socket.id → authenticated userId (for authenticated sockets).
const authedSockets = new Map<string, string>();

function broadcast(event: string, payload: unknown) {
  io.emit(event, payload);
}

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
    const userId = authedSockets.get(sid);
    if (userId) {
      // Authenticated user — fetch real wallet balance from DB. This is an
      // await, so the socket could re-identify as a DIFFERENT user (logout
      // + login again) while it's in flight — re-check identity before
      // emitting so a stale fetch for the OLD user can't land after and
      // overwrite the new user's already-correct balance.
      const realBalance = await getWalletBalance(userId);
      if (realBalance !== null && authedSockets.get(sid) === userId) {
        socket.emit("balance:sync", { balance: realBalance });
      }
    } else {
      socket.emit("balance:sync", { balance: sharedDemoBalance });
    }
  }
});

io.on("connection", async (socket) => {
  let authedUserId: string | null = null;

  // Demo balance is a single shared persistent wallet (see
  // migration 000006_demo_wallet.sql) — it survives reconnects instead of
  // resetting to a fresh default every time a socket connects.
  socket.emit("init", {
    state: engine.publicState(),
    balance: await getDemoBalance(),
    currency: "INR",
    betLimits: { minBet: engine.overrides.minBet, maxBet: engine.overrides.maxBet },
  });

  // Authenticated client identifies itself so we can push real wallet balance.
  socket.on("auth:identify", async (payload: { userId: string; token: string }) => {
    if (!payload?.userId || !payload?.token) return;
    // Verify the HMAC-SHA256 token (not a Supabase JWT).
    const decoded = verifyToken(payload.token);
    if (!decoded || decoded.id !== payload.userId) return;
    authedUserId = decoded.id;
    authedSockets.set(socket.id, authedUserId);
    // Push real wallet balance immediately. Re-check identity after the
    // await in case a second identify (rapid re-login) landed while this
    // fetch was in flight — don't let a stale fetch overwrite a newer one.
    const realBalance = await getWalletBalance(authedUserId);
    if (realBalance !== null && authedSockets.get(socket.id) === authedUserId) {
      socket.emit("balance:sync", { balance: realBalance });
    }
  });

  // Client logged out — forget this socket's auth association so it stops
  // receiving the old user's real wallet balance on future round:crashed
  // broadcasts (it's back to demo mode client-side; the server needs to
  // know that too, or a stale balance:sync would silently overwrite the
  // demo balance the next time a round ends).
  socket.on("auth:clear", () => {
    authedUserId = null;
    authedSockets.delete(socket.id);
  });

  socket.on("bet:place", async (payload: PlaceBetPayload) => {
    const { panel, amount, userId } = payload;
    try {
      if (userId) {
        if (!engine.roundRecordId || engine.phase !== "betting") {
          socket.emit("bet:rejected", { panel, reason: "round_not_ready" });
          return;
        }
      // Authenticated path: atomic wallet debit via the store.
      const result = store.placeBet(userId, engine.roundRecordId, panel, amount, socket.id);
      if (!result.ok) {
        socket.emit("bet:rejected", { panel, reason: result.reason ?? "rejected" });
        return;
      }
      const placed = engine.placeBet(socket.id, panel, amount, userId);
      if (!placed) {
        // Engine rejected (e.g. phase moved on) — roll back the debit.
        store.cancelBet(userId, engine.roundRecordId, panel, socket.id);
        socket.emit("bet:rejected", { panel, reason: "phase" });
        return;
      }
      socket.emit("bet:accepted", {
        panel,
        amount,
        balance: result.balance,
        betId: result.bet_id,
      });
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
      const ok = engine.placeBet(socket.id, panel, amount);
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
    const { panel, userId } = payload;
    if ((userId ?? authedUserId) && engine.roundRecordId) {
      const effectiveUserId = userId ?? authedUserId!;
      if (!engine.cancelBet(socket.id, panel)) {
        socket.emit("bet:cancel_failed", { panel, reason: "not_betting" });
        return;
      }
      const result = store.cancelBet(effectiveUserId, engine.roundRecordId, panel, socket.id);
      if (result.ok) {
        socket.emit("bet:cancelled", { panel, balance: result.balance });
      } else {
        socket.emit("bet:cancel_failed", { panel, reason: "server_error" });
      }
    } else {
      const bet = engine.getPlayerBet(socket.id, panel);
      const ok = engine.cancelBet(socket.id, panel);
      if (ok && bet) {
        const newBalance = await adjustDemoBalance(bet.amount);
        socket.emit("bet:cancelled", { panel, balance: newBalance ?? undefined });
      } else if (ok) {
        socket.emit("bet:cancelled", { panel });
      }
    }
  });


  socket.on("bet:cancelWithAmount", async (payload: CancelBetPayload) => {
    const { panel, userId } = payload;

    if (userId && engine.roundRecordId) {
      // Remove from the engine FIRST (cheap, synchronous, no money moved) —
      // only refund via the store if the engine actually had this bet.
      // Doing this in the other order let a bet get refunded by the store
      // while engine.cancelBet() then failed (phase already flying) and
      // silently left the bet sitting in engine.playerBets — refunded in
      // the wallet, yet still exposed to the round's economics as if live.
      if (!engine.cancelBet(socket.id, panel)) {
        socket.emit("bet:cancel_failed", { panel, reason: "not_betting" });
        return;
      }
      const result = store.cancelBet(userId, engine.roundRecordId, panel, socket.id);
      if (!result.ok) {
        socket.emit("bet:cancel_failed", { panel, reason: result.reason ?? "server_error" });
        return;
      }
      socket.emit("bet:cancelled", { panel, balance: result.balance });
    } else {
      // Demo path — refund only when engine actually removed the bet.
      const bet = engine.getPlayerBet(socket.id, panel);
      const ok = engine.cancelBet(socket.id, panel);
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
    const { panel, userId } = payload;

    if (userId && engine.roundRecordId) {
      const snapshotRoundId    = engine.roundRecordId;
      const bet = engine.getPlayerBet(socket.id, panel);
      const prospectiveWin = bet
        ? Math.floor(bet.amount * engine.getLiveMultiplier() * 100) / 100
        : 0;

      if (engine.wouldExceedBudget(prospectiveWin)) {
        engine.forceCrashNow();
        socket.emit("bet:cashout_failed", { panel, reason: "budget_exhausted" });
        return;
      }

      const locked = engine.cashOut(socket.id, panel);
      if (!locked) {
        // Only force-crash if this rejection is actually a budget race (the
        // pre-check above passed but another cashout consumed the budget in
        // the meantime) — re-check rather than crashing unconditionally.
        // Crashing the round for everyone on a harmless duplicate/rejected
        // cashout (e.g. a double-click, or a bet that was already cashed
        // out) would punish every other player for one client's no-op.
        if (engine.phase === "flying" && engine.economyActiveForRound && engine.wouldExceedBudget(prospectiveWin)) {
          engine.forceCrashNow();
        }
        socket.emit("bet:cashout_failed", { panel, reason: "rejected" });
        return;
      }

      const result = store.cashoutBet(userId, snapshotRoundId, panel, locked.cashedOutAt!, socket.id);

      if (!result.ok) {
        engine.undoCashOut(socket.id, panel);
        if (result.reason === "budget_exhausted") {
          engine.forceCrashNow();
        }
        socket.emit("bet:cashout_failed", {
          panel,
          reason: result.reason ?? "rejected",
        });
        return;
      }

      const win = result.win ?? locked.win ?? 0;
      if (locked.win != null && win !== locked.win) {
        engine.recordPaidOut(win - locked.win);
      }

      socket.emit("bet:cashedout", {
        panel,
        multiplier: result.multiplier ?? locked.cashedOutAt,
        win,
        balance: result.balance,
        betId: result.bet_id,
      });
    } else {
      const bet = engine.getPlayerBet(socket.id, panel);
      const prospectiveWin = bet
        ? Math.floor(bet.amount * engine.getLiveMultiplier() * 100) / 100
        : 0;

      if (engine.wouldExceedBudget(prospectiveWin)) {
        engine.forceCrashNow();
        socket.emit("bet:cashout_failed", { panel, reason: "budget_exhausted" });
        return;
      }

      const result = engine.cashOut(socket.id, panel);
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
        // Same reasoning as the authenticated branch above — only crash the
        // round if this rejection is genuinely a budget race, not any
        // rejected cashout (e.g. a harmless duplicate click).
        if (engine.phase === "flying" && engine.economyActiveForRound && engine.wouldExceedBudget(prospectiveWin)) {
          engine.forceCrashNow();
        }
        socket.emit("bet:cashout_failed", { panel, reason: "rejected" });
      }
    }
  });

  socket.on("disconnect", () => {
    // Demo wallet is shared/persistent now — nothing to clean up per-socket.
    authedSockets.delete(socket.id);
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
