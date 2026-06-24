import { Router, Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient.js";
import type { GameEngine } from "./gameEngine.js";

declare global {
  // eslint-disable-next-line no-var
  var __gameEngine: GameEngine | undefined;
}

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

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

const CreateUserSchema = z.object({
  email:        z.string().email().max(320).toLowerCase().trim(),
  password:     z.string().min(8).max(128).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain uppercase, lowercase, and a digit"
  ),
  username:     z.string().min(3).max(30).regex(/^[a-z0-9_]+$/).optional(),
  display_name: z.string().min(1).max(50).optional(),
  role:         z.enum(["user", "admin", "superadmin"]).default("user"),
  balance:      z.number().min(0).max(10_000_000).default(50000),
});

// ── JWT verification middleware ────────────────────────────────────────────
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ ok: false, reason: "missing_token" });
    return;
  }
  const token = header.slice(7);

  // Verify the Supabase JWT by calling Supabase with the user token
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });

  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) {
    res.status(401).json({ ok: false, reason: "invalid_token" });
    return;
  }

  (req as AuthedRequest).user = { id: user.id, email: user.email ?? undefined };
  (req as AuthedRequest).token = token;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    const uid = (req as AuthedRequest).user?.id;
    const { data, error } = await supabase
      .from("users")
      .select("role")
      .eq("id", uid)
      .single();
    if (error || !data || !["admin", "superadmin"].includes(data.role)) {
      res.status(403).json({ ok: false, reason: "forbidden" });
      return;
    }
    next();
  });
}

export interface AuthedRequest extends Request {
  user?: { id: string; email?: string | undefined } & Record<string, unknown>;
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

  // Sign in via Supabase Auth REST API
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });

  if (error || !data.session) {
    // Generic message — never reveal whether email exists
    res.status(401).json({ ok: false, reason: "invalid_credentials" });
    return;
  }

  // Fetch profile
  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("id, email, username, display_name, role, kyc_status")
    .eq("id", data.user.id)
    .single();

  if (profileErr || !profile) {
    res.status(500).json({ ok: false, reason: "profile_missing" });
    return;
  }

  // Fetch wallet balance
  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance, currency")
    .eq("user_id", data.user.id)
    .single();

  res.json({
    ok: true,
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at:    data.session.expires_at,
    user: {
      id:           profile.id,
      email:        profile.email,
      username:     profile.username,
      display_name: profile.display_name,
      role:         profile.role,
      kyc_status:   profile.kyc_status,
      balance:      Number(wallet?.balance ?? 0),
      currency:     wallet?.currency ?? "ZAR",
    },
  });
});

// ── POST /api/auth/refresh ─────────────────────────────────────────────────
authRouter.post("/refresh", async (req: Request, res: Response) => {
  const { refresh_token } = req.body;
  if (!refresh_token || typeof refresh_token !== "string") {
    res.status(400).json({ ok: false, reason: "missing_refresh_token" });
    return;
  }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data, error } = await anonClient.auth.refreshSession({ refresh_token });
  if (error || !data.session) {
    res.status(401).json({ ok: false, reason: "refresh_failed" });
    return;
  }

  res.json({
    ok: true,
    access_token:  data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at:    data.session.expires_at,
  });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────
authRouter.post("/logout", requireAuth, async (req: Request, res: Response) => {
  // Supabase handles token invalidation server-side via the user's token
  const token = (req as AuthedRequest).token!;
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth:   { persistSession: false },
  });
  await userClient.auth.signOut();
  res.json({ ok: true });
});

// ── GET /api/auth/me ────────────────────────────────────────────────────────
authRouter.get("/me", requireAuth, async (req: Request, res: Response) => {
  const uid = (req as AuthedRequest).user!.id;

  const { data: profile, error } = await supabase
    .from("users")
    .select("id, email, username, display_name, role, kyc_status, created_at")
    .eq("id", uid)
    .single();

  if (error || !profile) {
    res.status(404).json({ ok: false, reason: "not_found" });
    return;
  }

  const { data: wallet } = await supabase
    .from("wallets")
    .select("balance, currency")
    .eq("user_id", uid)
    .single();

  res.json({
    ok: true,
    user: {
      ...profile,
      balance:  Number(wallet?.balance ?? 0),
      currency: wallet?.currency ?? "ZAR",
    },
  });
});

// ── POST /api/admin/users (admin only) ────────────────────────────────────
authRouter.post(
  "/admin/users",
  adminLimiter,
  requireAdmin,
  async (req: Request, res: Response) => {
    const parse = CreateUserSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ ok: false, reason: "validation", errors: parse.error.flatten() });
      return;
    }

    const { data, error } = await supabase.rpc("admin_create_user", {
      p_email:        parse.data.email,
      p_password:     parse.data.password,
      p_username:     parse.data.username ?? null,
      p_display_name: parse.data.display_name ?? null,
      p_role:         parse.data.role,
      p_balance:      parse.data.balance,
    });

    if (error) {
      res.status(500).json({ ok: false, reason: error.message });
      return;
    }

    const result = data as { ok: boolean; reason?: string; [k: string]: unknown };
    if (!result.ok) {
      const statusMap: Record<string, number> = {
        email_taken:    409,
        username_taken: 409,
        invalid_email:  400,
        invalid_role:   400,
        duplicate:      409,
      };
      res.status(statusMap[result.reason ?? ""] ?? 400).json(result);
      return;
    }

    res.status(201).json(result);
  }
);

// ── GET /api/admin/users (admin only) ─────────────────────────────────────
authRouter.get(
  "/admin/users",
  adminLimiter,
  requireAdmin,
  async (_req: Request, res: Response) => {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, username, display_name, role, kyc_status, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      res.status(500).json({ ok: false, reason: error.message });
      return;
    }

    const { data: wallets } = await supabase
      .from("wallets")
      .select("user_id, balance, currency");

    const { data: winControls } = await supabase
      .from("user_win_controls")
      .select("user_id, win_mode, win_rate, min_cashout, max_cashout, min_bet, max_bet, notes");

    const walletMap = new Map((wallets ?? []).map((w) => [w.user_id, w]));
    const winMap = new Map((winControls ?? []).map((w) => [w.user_id, w]));

    res.json({
      ok: true,
      users: (data ?? []).map((u) => ({
        ...u,
        balance:    Number(walletMap.get(u.id)?.balance ?? 0),
        currency:   walletMap.get(u.id)?.currency ?? "ZAR",
        win_control: winMap.get(u.id) ?? null,
      })),
    });
  }
);

// ── PATCH /api/admin/users/:id (admin only) — update role / balance ────────
authRouter.patch(
  "/admin/users/:id",
  adminLimiter,
  requireAdmin,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const PatchSchema = z.object({
      role:    z.enum(["user", "admin", "superadmin"]).optional(),
      balance: z.number().min(0).max(10_000_000).optional(),
      display_name: z.string().min(1).max(50).optional(),
    });
    const parse = PatchSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ ok: false, reason: "validation", errors: parse.error.flatten() });
      return;
    }
    const { role, balance, display_name } = parse.data;

    if (role !== undefined || display_name !== undefined) {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (role !== undefined) patch.role = role;
      if (display_name !== undefined) patch.display_name = display_name;
      const { error } = await supabase.from("users").update(patch).eq("id", id);
      if (error) { res.status(500).json({ ok: false, reason: error.message }); return; }
    }

    if (balance !== undefined) {
      const { error } = await supabase
        .from("wallets")
        .update({ balance, updated_at: new Date().toISOString() })
        .eq("user_id", id);
      if (error) { res.status(500).json({ ok: false, reason: error.message }); return; }
    }

    res.json({ ok: true });
  }
);

// ── DELETE /api/admin/users/:id (admin only) ──────────────────────────────
authRouter.delete(
  "/admin/users/:id",
  adminLimiter,
  requireAdmin,
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { error } = await supabase.from("users").delete().eq("id", id);
    if (error) { res.status(500).json({ ok: false, reason: error.message }); return; }
    res.json({ ok: true });
  }
);

// ── GET /api/admin/controls ────────────────────────────────────────────────
authRouter.get(
  "/admin/controls",
  adminLimiter,
  requireAdmin,
  async (_req: Request, res: Response) => {
    const { data, error } = await supabase
      .from("admin_controls")
      .select("*")
      .eq("id", 1)
      .single();
    if (error) { res.status(500).json({ ok: false, reason: error.message }); return; }
    res.json({ ok: true, controls: data });
  }
);

// ── PATCH /api/admin/controls ─────────────────────────────────────────────
authRouter.patch(
  "/admin/controls",
  adminLimiter,
  requireAdmin,
  async (req: Request, res: Response) => {
    const ControlsSchema = z.object({
      house_edge:        z.number().min(0).max(1).optional(),
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
    const patch = { ...parse.data, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("admin_controls").update(patch).eq("id", 1);
    if (error) { res.status(500).json({ ok: false, reason: error.message }); return; }

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
      }
      if (parse.data.house_edge !== undefined) {
        globalThis.__gameEngine.setGlobalWinRate(parse.data.house_edge);
      }
    }
    res.json({ ok: true });
  }
);

// ── GET /api/admin/win-controls/:userId ───────────────────────────────────
authRouter.get(
  "/admin/win-controls/:userId",
  adminLimiter,
  requireAdmin,
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const { data, error } = await supabase
      .from("user_win_controls")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) { res.status(500).json({ ok: false, reason: error.message }); return; }
    res.json({ ok: true, control: data });
  }
);

// ── PUT /api/admin/win-controls/:userId ───────────────────────────────────
authRouter.put(
  "/admin/win-controls/:userId",
  adminLimiter,
  requireAdmin,
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    const WinControlSchema = z.object({
      win_mode:    z.enum(["normal", "win", "loss"]).default("normal"),
      win_rate:    z.number().min(0).max(1).default(0.5),
      min_cashout: z.number().min(1.01).max(130).nullable().default(null),
      max_cashout: z.number().min(1.01).max(130).nullable().default(null),
      min_bet:     z.number().min(0.01).nullable().default(null),
      max_bet:     z.number().min(1).nullable().default(null),
      notes:       z.string().max(500).nullable().default(null),
    });
    const parse = WinControlSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({ ok: false, reason: "validation", errors: parse.error.flatten() });
      return;
    }
    const { error } = await supabase
      .from("user_win_controls")
      .upsert({ user_id: userId, ...parse.data, updated_at: new Date().toISOString() });
    if (error) { res.status(500).json({ ok: false, reason: error.message }); return; }

    // Push into live engine immediately so the next round picks it up
    if (globalThis.__gameEngine) {
      globalThis.__gameEngine.setUserWinControl(userId, {
        win_mode:    parse.data.win_mode,
        win_rate:    parse.data.win_rate,
        min_cashout: parse.data.min_cashout,
        max_cashout: parse.data.max_cashout,
        min_bet:     parse.data.min_bet,
        max_bet:     parse.data.max_bet,
      });
    }

    res.json({ ok: true });
  }
);

// ── DELETE /api/admin/win-controls/:userId ────────────────────────────────
authRouter.delete(
  "/admin/win-controls/:userId",
  adminLimiter,
  requireAdmin,
  async (req: Request, res: Response) => {
    const { userId } = req.params;
    await supabase.from("user_win_controls").delete().eq("user_id", userId);
    // Remove from live engine too
    if (globalThis.__gameEngine) {
      globalThis.__gameEngine.setUserWinControl(userId, null);
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
      supabase.from("users").select("id, role, created_at", { count: "exact" }),
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
