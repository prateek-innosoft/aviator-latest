import { supabase } from "./supabaseClient.js";
import type { GameEngine, WinMode } from "./gameEngine.js";

export interface AdminControlsState {
  id: number;
  min_bet: number;
  max_bet: number;
  win_mode: WinMode;
  forced_crash: number | null;
  next_crash_point: number | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminControlsPatch {
  min_bet?: number;
  max_bet?: number;
  win_mode?: WinMode;
  forced_crash?: number | null;
  next_crash_point?: number | null;
}

const DEFAULTS: AdminControlsState = {
  id: 1,
  min_bet: 1,
  max_bet: 50_000,
  win_mode: "normal",
  forced_crash: null,
  next_crash_point: null,
  updated_at: new Date().toISOString(),
  updated_by: null,
};

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalize(row: Record<string, unknown>): AdminControlsState {
  const win = row.win_mode;
  const winMode: WinMode =
    win === "win" || win === "loss" || win === "normal" ? win : "normal";
  return {
    id: 1,
    min_bet: num(row.min_bet, DEFAULTS.min_bet),
    max_bet: num(row.max_bet, DEFAULTS.max_bet),
    win_mode: winMode,
    forced_crash: row.forced_crash == null ? null : num(row.forced_crash, 0),
    next_crash_point: row.next_crash_point == null ? null : num(row.next_crash_point, 0),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    updated_by: typeof row.updated_by === "string" ? row.updated_by : null,
  };
}

/** Keep RPC place_bet limits in sync with admin_controls. */
async function syncBetLimitsConfig(minBet: number, maxBet: number): Promise<string | null> {
  const value = { min_bet: minBet, max_bet: maxBet, currency: "ZAR" };
  const { error } = await supabase
    .from("config")
    .upsert(
      { key: "bet_limits", value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  return error?.message ?? null;
}

async function loadFromConfigFallback(): Promise<AdminControlsState | null> {
  const { data, error } = await supabase
    .from("config")
    .select("value")
    .eq("key", "bet_limits")
    .maybeSingle();
  if (error || !data?.value || typeof data.value !== "object") return null;
  const v = data.value as Record<string, unknown>;
  return normalize({
    ...DEFAULTS,
    min_bet: v.min_bet,
    max_bet: v.max_bet,
  });
}

/** Load persisted admin controls (DB is source of truth). */
export async function loadAdminControls(): Promise<AdminControlsState> {
  const { data, error } = await supabase
    .from("admin_controls")
    .select("min_bet, max_bet, win_mode, forced_crash, next_crash_point, updated_at, updated_by")
    .eq("id", 1)
    .maybeSingle();

  if (!error && data) return normalize(data);

  if (error) {
    console.warn("[adminControls] admin_controls read failed:", error.message);
  }

  const fallback = await loadFromConfigFallback();
  return fallback ?? { ...DEFAULTS };
}

/** Merge patch, validate, persist to admin_controls + config.bet_limits. */
export async function saveAdminControls(
  patch: AdminControlsPatch,
  updatedBy?: string,
): Promise<{ ok: true; controls: AdminControlsState } | { ok: false; reason: string }> {
  const current = await loadAdminControls();

  const next: AdminControlsState = {
    ...current,
    min_bet: patch.min_bet !== undefined ? patch.min_bet : current.min_bet,
    max_bet: patch.max_bet !== undefined ? patch.max_bet : current.max_bet,
    win_mode: patch.win_mode !== undefined ? patch.win_mode : current.win_mode,
    forced_crash: patch.forced_crash !== undefined ? patch.forced_crash : current.forced_crash,
    next_crash_point:
      patch.next_crash_point !== undefined ? patch.next_crash_point : current.next_crash_point,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? current.updated_by,
  };

  if (next.min_bet > next.max_bet) {
    return { ok: false, reason: "min_bet cannot exceed max_bet" };
  }

  const row = {
    id: 1,
    min_bet: next.min_bet,
    max_bet: next.max_bet,
    win_mode: next.win_mode,
    forced_crash: next.forced_crash,
    next_crash_point: next.next_crash_point,
    updated_at: next.updated_at,
    updated_by: next.updated_by,
  };

  const { error: upsertError } = await supabase
    .from("admin_controls")
    .upsert(row, { onConflict: "id" });
  if (upsertError) {
    console.error("[adminControls] upsert failed:", upsertError.message);
    return { ok: false, reason: upsertError.message };
  }

  const cfgErr = await syncBetLimitsConfig(next.min_bet, next.max_bet);
  if (cfgErr) {
    console.error("[adminControls] config sync failed:", cfgErr);
    return { ok: false, reason: `config sync failed: ${cfgErr}` };
  }

  return { ok: true, controls: next };
}

/** Apply loaded controls to the in-memory game engine. */
export function applyControlsToEngine(engine: GameEngine, controls: AdminControlsState): void {
  engine.overrides.minBet = controls.min_bet;
  engine.overrides.maxBet = controls.max_bet;
  engine.overrides.winMode = controls.win_mode;
  engine.overrides.forcedCrash = controls.forced_crash;
  engine.overrides.nextCrashPoint = controls.next_crash_point;
}
