import "dotenv/config";
import http from "node:http";
import os from "node:os";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import { GameEngine } from "./gameEngine.js";
import { supabase } from "./supabaseClient.js";
import { authRouter, requireAuth, type AuthedRequest } from "./authRouter.js";
import type { CancelBetPayload, CashOutPayload, PlaceBetPayload } from "./types.js";

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? "0.0.0.0";
const STARTING_BALANCE = Number(process.env.STARTING_BALANCE ?? 1000);

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

// Demo in-memory balances for unauthenticated (demo) sockets.
const demoBalances = new Map<string, number>();

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
    const { data, error } = await supabase
      .from("wallets")
      .select("balance, currency")
      .eq("user_id", uid)
      .single();
    if (error || !data) {
      res.status(404).json({ ok: false, reason: "wallet_not_found" });
      return;
    }
    res.json({ ok: true, balance: Number(data.balance), currency: data.currency });
  });
});

/** Fetch a user's real wallet balance from Supabase. */
async function getWalletBalance(userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("wallets")
    .select("balance")
    .eq("user_id", userId)
    .single();
  if (error || !data) return null;
  return Number(data.balance);
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
engine.on("round:crashed", async (p) => {
  // Broadcast the crash to all clients first.
  broadcast("round:crashed", p);
  // Sync authoritative balance to every connected socket.
  for (const [sid, socket] of io.sockets.sockets) {
    const userId = authedSockets.get(sid);
    if (userId) {
      // Authenticated user — fetch real wallet balance from DB.
      const realBalance = await getWalletBalance(userId);
      if (realBalance !== null) {
        socket.emit("balance:sync", { balance: realBalance });
      }
    } else {
      // Demo user — use in-memory balance.
      const bal = demoBalances.get(sid);
      if (bal != null) {
        socket.emit("balance:sync", { balance: bal });
      }
    }
  }
});

io.on("connection", (socket) => {
  let authedUserId: string | null = null;

  // Demo balance is per session (per socket). Every fresh page load starts at
  // STARTING_BALANCE so testing always begins from a clean wallet.
  const getDemoBalance = () => demoBalances.get(socket.id) ?? STARTING_BALANCE;
  const setDemoBalance = (v: number) => { demoBalances.set(socket.id, v); };

  demoBalances.set(socket.id, STARTING_BALANCE);

  socket.emit("init", {
    state: engine.publicState(),
    balance: getDemoBalance(),
    currency: "ZAR",
    betLimits: { minBet: engine.overrides.minBet, maxBet: engine.overrides.maxBet },
  });

  // Authenticated client identifies itself so we can push real wallet balance.
  socket.on("auth:identify", async (payload: { userId: string; token: string }) => {
    if (!payload?.userId || !payload?.token) return;
    // Verify the token quickly via Supabase.
    const { data: { user }, error } = await supabase.auth.getUser(payload.token);
    if (error || !user || user.id !== payload.userId) return;
    authedUserId = user.id;
    authedSockets.set(socket.id, authedUserId);
    // Push real wallet balance immediately.
    const realBalance = await getWalletBalance(authedUserId);
    if (realBalance !== null) {
      socket.emit("balance:sync", { balance: realBalance });
    }
  });

  // Client still emits a stable token, but demo balances are per-session now,
  // so we simply acknowledge it without restoring any prior balance.
  socket.on("client:token", () => {});

  socket.on("bet:place", async (payload: PlaceBetPayload) => {
    const { panel, amount, userId } = payload;

    if (userId && engine.supabaseRoundId) {
      // Authenticated path: use Supabase wallet RPC.
      const { data, error } = await supabase.rpc("place_bet", {
        p_user_id: userId,
        p_round_id: engine.supabaseRoundId,
        p_panel: panel,
        p_amount: amount,
        p_reference: socket.id,
      });
      if (error) {
        socket.emit("bet:rejected", { panel, reason: "server_error" });
        return;
      }
      const result = data as { ok: boolean; reason?: string; balance?: number; bet_id?: string };
      if (!result.ok) {
        socket.emit("bet:rejected", { panel, reason: result.reason ?? "rejected" });
        return;
      }
      engine.placeBet(socket.id, panel, amount, userId);
      socket.emit("bet:accepted", {
        panel,
        amount,
        balance: result.balance,
        betId: result.bet_id,
      });
    } else {
      // Demo / unauthenticated path: in-memory balance.
      const balance = getDemoBalance();
      if (amount < engine.overrides.minBet) {
        socket.emit("bet:rejected", { panel, reason: "below_min", minBet: engine.overrides.minBet });
        return;
      }
      if (amount > engine.overrides.maxBet) {
        socket.emit("bet:rejected", { panel, reason: "above_max", maxBet: engine.overrides.maxBet });
        return;
      }
      if (amount > balance) {
        socket.emit("bet:rejected", { panel, reason: "insufficient" });
        return;
      }
      const ok = engine.placeBet(socket.id, panel, amount);
      if (ok) {
        const newBalance = Math.round((balance - amount) * 100) / 100;
        setDemoBalance(newBalance);
        socket.emit("bet:accepted", { panel, amount, balance: newBalance });
      } else {
        socket.emit("bet:rejected", { panel, reason: "phase" });
      }
    }
  });

  socket.on("bet:cancel", async (payload: CashOutPayload) => {
    const { panel } = payload;
    if (authedUserId && engine.supabaseRoundId) {
      const bet = engine.getPlayerBet(socket.id, panel);
      const amount = bet?.amount ?? 0;
      const { data, error } = await supabase.rpc("cancel_bet", {
        p_user_id: authedUserId,
        p_round_id: engine.supabaseRoundId,
        p_panel: panel,
        p_reference: socket.id,
      });
      engine.cancelBet(socket.id, panel);
      if (!error && (data as { ok: boolean }).ok) {
        socket.emit("bet:cancelled", { panel, balance: (data as { balance?: number }).balance });
      } else {
        socket.emit("bet:cancelled", { panel });
        void amount;
      }
    } else {
      const bet = engine.getPlayerBet(socket.id, panel);
      const ok = engine.cancelBet(socket.id, panel);
      if (ok && bet) {
        const balance = getDemoBalance();
        const newBalance = Math.round((balance + bet.amount) * 100) / 100;
        setDemoBalance(newBalance);
        socket.emit("bet:cancelled", { panel, balance: newBalance });
      } else if (ok) {
        socket.emit("bet:cancelled", { panel });
      }
    }
  });


  socket.on("bet:cancelWithAmount", async (payload: CancelBetPayload) => {
    const { panel, amount, userId } = payload;
    console.log(`[bet:cancelWithAmount] userId=${userId} panel=${panel} roundId=${engine.supabaseRoundId} phase=${engine.phase}`);

    if (userId && engine.supabaseRoundId) {
      // Authenticated path: use Supabase wallet RPC.
      const { data, error } = await supabase.rpc("cancel_bet", {
        p_user_id: userId,
        p_round_id: engine.supabaseRoundId,
        p_panel: panel,
        p_reference: socket.id,
      });
      console.log(`[bet:cancelWithAmount] RPC result:`, JSON.stringify(data), `error:`, error?.message);
      if (error) {
        socket.emit("bet:cancel_failed", { panel, reason: "server_error" });
        return;
      }
      const result = data as { ok: boolean; reason?: string; balance?: number };
      if (!result.ok) {
        socket.emit("bet:cancel_failed", { panel, reason: result.reason ?? "rejected" });
        return;
      }
      engine.cancelBet(socket.id, panel);
      socket.emit("bet:cancelled", { panel, balance: result.balance });
    } else {
      // Demo path — cancel in engine (betting phase) or just clear state (queued).
      const ok = engine.cancelBet(socket.id, panel);
      // Even if engine returns false (was queued, not in betting phase), refund the amount.
      const balance = getDemoBalance();
      const newBalance = Math.round((balance + amount) * 100) / 100;
      setDemoBalance(newBalance);
      socket.emit("bet:cancelled", { panel, balance: newBalance });
      void ok;
    }
  });

  socket.on("bet:cashout", async (payload: CashOutPayload) => {
    const { panel, userId } = payload;

    if (userId && engine.supabaseRoundId) {
      // Authenticated path: cashout via Supabase RPC using current multiplier.
      const multiplier = engine.multiplier;
      const { data, error } = await supabase.rpc("cashout_bet", {
        p_user_id: userId,
        p_round_id: engine.supabaseRoundId,
        p_panel: panel,
        p_multiplier: multiplier,
        p_reference: socket.id,
      });
      if (error) {
        return;
      }
      const result = data as {
        ok: boolean;
        reason?: string;
        balance?: number;
        win?: number;
        multiplier?: number;
        bet_id?: string;
      };
      if (!result.ok) return;

      engine.cashOut(socket.id, panel);
      socket.emit("bet:cashedout", {
        panel,
        multiplier: result.multiplier,
        win: result.win,
        balance: result.balance,
        betId: result.bet_id,
      });
    } else {
      // Demo path.
      const result = engine.cashOut(socket.id, panel);
      if (result && result.win != null) {
        const balance = getDemoBalance();
        const newBalance = Math.round((balance + result.win) * 100) / 100;
        setDemoBalance(newBalance);
        socket.emit("bet:cashedout", {
          panel,
          multiplier: result.cashedOutAt,
          win: result.win,
          balance: newBalance,
        });
      }
    }
  });

  socket.on("disconnect", () => {
    demoBalances.delete(socket.id);
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
