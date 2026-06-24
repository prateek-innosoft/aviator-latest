import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import crypto from "node:crypto";
import { supabase } from "./supabaseClient.js";
import type { GameEngine } from "./gameEngine.js";

declare global {
  // eslint-disable-next-line no-var
  var __gameEngine: GameEngine | undefined;
  // eslint-disable-next-line no-var
  var __io: import("socket.io").Server | undefined;
}

// ── Simple admin credentials ───────────────────────────────────────────────
// Hardcoded for now — no Supabase Auth dependency.
const ADMIN_EMAIL    = "admin@aviator.com";
const ADMIN_PASSWORD = "admin123";
const ADMIN_ID       = "admin-0000-0000-0000-000000000001";

// Secret used to sign/verify admin tokens (HMAC-SHA256).
const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET ?? "aviator-admin-secret-key";

interface AdminToken {
  id: string;
  email: string;
  role: string;
  exp: number;
}

function signToken(payload: AdminToken): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig  = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifyToken(token: string): AdminToken | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", TOKEN_SECRET).update(body).digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as AdminToken;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const authRouter = Router();

// ── Rate limiters ──────────────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min window
  max: 50,                   // 50 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, reason: "too_many_attempts" },
  skipSuccessfulRequests: true,
});

const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, reason: "too_many_requests" },
});

// ── Zod schemas ────────────────────────────────────────────────────────────
const LoginSchema = z.object({
  email:    z.string().email().max(320).toLowerCase().trim(),
  password: z.string().min(6).max(128),
});

// ── Token verification middleware ──────────────────────────────────────────
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, reason: "missing_token" });
    return;
  }
  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ ok: false, reason: "invalid_token" });
    return;
  }

  (req as AuthedRequest).user = { id: payload.id, email: payload.email, role: payload.role };
  (req as AuthedRequest).token = token;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const role = (req as AuthedRequest).user?.role;
    if (role !== "admin" && role !== "superadmin") {
      res.status(403).json({ ok: false, reason: "forbidden" });
      return;
    }
    next();
  });
}

export interface AuthedRequest extends Request {
  user?: { id: string; email?: string | undefined; role?: string } & Record<string, unknown>;
  token?: string;
}

// ── POST /api/auth/login ──────────────────────────────────────────────────
authRouter.post("/login", loginLimiter, async (req: Request, res: Response) => {
  const parse = LoginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ ok: false, reason: "validation", errors: parse.error.flatten() });
    return;
  }
  const { email, password } = parse.data;

  // Simple hardcoded admin check
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const exp = Date.now() + 24 * 60 * 60 * 1000; // 24-hour token
    const token = signToken({ id: ADMIN_ID, email: ADMIN_EMAIL, role: "admin", exp });
    res.json({
      ok: true,
      access_token:  token,
      refresh_token: token,
      expires_at:    Math.floor(exp / 1000),
      user: {
        id:           ADMIN_ID,
        email:        ADMIN_EMAIL,
        username:     "admin",
        display_name: "Admin",
        role:         "admin",
        kyc_status:   "verified",
        balance:      0,
        currency:     "ZAR",
      },
    });
    return;
  }

  res.status(401).json({ ok: false, reason: "invalid_credentials" });
});

// ── POST /api/auth/refresh ─────────────────────────────────────────────────
authRouter.post("/refresh", async (req: Request, res: Response) => {
  const { refresh_token } = req.body;
  if (!refresh_token || typeof refresh_token !== "string") {
    res.status(400).json({ ok: false, reason: "missing_refresh_token" });
    return;
  }

  const payload = verifyToken(refresh_token);
  if (!payload) {
    res.status(401).json({ ok: false, reason: "refresh_failed" });
    return;
  }

  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const newToken = signToken({ ...payload, exp });
  res.json({
    ok: true,
    access_token:  newToken,
    refresh_token: newToken,
    expires_at:    Math.floor(exp / 1000),
  });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────
authRouter.post("/logout", requireAuth, async (_req: Request, res: Response) => {
  // Stateless tokens — client just discards the token.
  res.json({ ok: true });
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  const user = (req as AuthedRequest).user!;
  res.json({
    ok: true,
    user: {
      id:           user.id,
      email:        user.email ?? "",
      username:     "admin",
      display_name: "Admin",
      role:         user.role ?? "admin",
      kyc_status:   "verified",
      balance:      0,
      currency:     "ZAR",
    },
  });
});

// ── GET /api/admin/controls ────────────────────────────────────────────────
authRouter.get(
  "/admin/controls",
  adminLimiter,
  requireAdmin,
  async (_req: Request, res: Response) => {
    // Read from the config key-value table (best-effort).
    const cfg: Record<string, number> = {};
    try {
      const { data, error } = await supabase
        .from("config")
        .select("key, value")
        .in("key", ["min_bet", "max_bet"]);
      if (!error && data) {
        for (const row of data) cfg[row.key] = Number(row.value);
      }
    } catch { /* Supabase unreachable — use defaults */ }

    // Read current in-memory win mode from the game engine
    const engine = globalThis.__gameEngine;
    const currentWinMode = engine?.overrides.winMode ?? "normal";

    res.json({
      ok: true,
      controls: {
        id: 1,
        min_bet:          cfg.min_bet ?? engine?.overrides.minBet ?? 1,
        max_bet:          cfg.max_bet ?? engine?.overrides.maxBet ?? 50000,
        next_crash_point: engine?.overrides.nextCrashPoint ?? null,
        win_mode:         currentWinMode,
        forced_crash:     engine?.overrides.forcedCrash ?? null,
        updated_at:       new Date().toISOString(),
      },
    });
  }
);

// ── PATCH /api/admin/controls ─────────────────────────────────────────────
authRouter.patch(
  "/admin/controls",
  adminLimiter,
  requireAdmin,
  async (req: Request, res: Response) => {
    const ControlsSchema = z.object({
      min_bet:           z.number().min(0.01).max(1_000_000).optional(),
      max_bet:           z.number().min(1).max(10_000_000).optional(),
      next_crash_point:  z.number().min(1.01).max(130).nullable().optional(),
      win_mode:          z.enum(["normal", "win", "loss"]).optional(),
      forced_crash:      z.number().min(1.01).max(130).nullable().optional(),
    });
    const parse = ControlsSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ ok: false, reason: "validation", errors: parse.error.flatten() });
      return;
    }

    // Update config key-value rows for the fields we support.
    const updates: { key: string; value: number }[] = [];
    if (parse.data.min_bet    !== undefined) updates.push({ key: "min_bet",    value: parse.data.min_bet });
    if (parse.data.max_bet    !== undefined) updates.push({ key: "max_bet",    value: parse.data.max_bet });

    for (const u of updates) {
      const { error } = await supabase.from("config").update({ value: u.value, updated_at: new Date().toISOString() }).eq("key", u.key);
      if (error) console.warn("[admin] config update failed for key=%s: %s", u.key, error.message);
    }

    // Notify game engine of updated controls via global event emitter
    if (globalThis.__gameEngine) {
      if (parse.data.next_crash_point !== undefined) {
        globalThis.__gameEngine.setNextCrashOverride(parse.data.next_crash_point);
      }
      if (parse.data.win_mode !== undefined) {
        globalThis.__gameEngine.setWinMode(parse.data.win_mode);
      }
      if (parse.data.forced_crash !== undefined) {
        globalThis.__gameEngine.setForcedCrash(parse.data.forced_crash);
      }
      if (parse.data.min_bet !== undefined || parse.data.max_bet !== undefined) {
        globalThis.__gameEngine.setBetLimits(
          parse.data.min_bet ?? undefined,
          parse.data.max_bet ?? undefined,
        );
        // Broadcast new bet limits to all connected clients
        const io = globalThis.__io;
        if (io) {
          io.emit("betLimits:update", {
            minBet: globalThis.__gameEngine.overrides.minBet,
            maxBet: globalThis.__gameEngine.overrides.maxBet,
          });
        }
      }
    }
    res.json({ ok: true });
  }
);

// ── GET /api/admin/stats ───────────────────────────────────────────────────
authRouter.get(
  "/admin/stats",
  adminLimiter,
  requireAdmin,
  async (_req: Request, res: Response) => {
    const [usersRes, roundsRes, walletsRes] = await Promise.all([
      supabase.from("user_profiles").select("id, role, created_at", { count: "exact" }),
      supabase.from("rounds").select("id, crash_point, status, ended_at")
        .order("ended_at", { ascending: false }).limit(100),
      supabase.from("wallets").select("balance"),
    ]);

    const users = usersRes.data ?? [];
    const rounds = roundsRes.data ?? [];
    const wallets = walletsRes.data ?? [];

    const totalBalance = wallets.reduce((s, w) => s + Number(w.balance), 0);
    const avgCrash = rounds.length
      ? rounds.reduce((s, r) => s + Number(r.crash_point), 0) / rounds.length
      : 0;

    res.json({
      ok: true,
      stats: {
        total_users:    users.length,
        total_balance:  Math.round(totalBalance * 100) / 100,
        rounds_today:   rounds.filter(r => {
          const d = new Date(r.ended_at as string);
          const now = new Date();
          return d.toDateString() === now.toDateString();
        }).length,
        avg_crash:      Math.round(avgCrash * 100) / 100,
        recent_rounds:  rounds.slice(0, 20).map(r => ({
          id: r.id,
          crash_point: r.crash_point,
          status: r.status,
          ended_at: r.ended_at,
        })),
      },
    });
  }
);
