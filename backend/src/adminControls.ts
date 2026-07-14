import type { GameEngine, WinMode } from "./gameEngine.js";

/**
 * Live game admin settings.
 *
 * Previously persisted in Supabase (`admin_controls` table); now an in-memory
 * singleton for the standalone build. It resets to DEFAULTS on restart — the
 * host site provides durable config storage when this module is merged in.
 */

export interface AdminControlsState {
  id: number;
  min_bet: number;
  max_bet: number;
  win_mode: WinMode;
  forced_crash: number | null;
  next_crash_point: number | null;
  economy_enabled: boolean;
  house_hold_pct: number;
  max_rtp_pct: number;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminControlsPatch {
  min_bet?: number;
  max_bet?: number;
  win_mode?: WinMode;
  forced_crash?: number | null;
  next_crash_point?: number | null;
  economy_enabled?: boolean;
  house_hold_pct?: number;
  max_rtp_pct?: number;
}

const DEFAULTS: AdminControlsState = {
  id: 1,
  min_bet: 1,
  max_bet: 50_000,
  win_mode: "normal",
  forced_crash: null,
  next_crash_point: null,
  economy_enabled: true,
  house_hold_pct: 0.30,
  max_rtp_pct: 0.70,
  updated_at: new Date().toISOString(),
  updated_by: null,
};

// The single source of truth for the running server session.
let current: AdminControlsState = { ...DEFAULTS };

export async function loadAdminControls(): Promise<AdminControlsState> {
  return { ...current };
}

export async function saveAdminControls(
  patch: AdminControlsPatch,
  updatedBy?: string,
): Promise<
  | { ok: true; controls: AdminControlsState; economyPersisted: boolean; warning?: string }
  | { ok: false; reason: string }
> {
  const next: AdminControlsState = {
    ...current,
    min_bet: patch.min_bet !== undefined ? patch.min_bet : current.min_bet,
    max_bet: patch.max_bet !== undefined ? patch.max_bet : current.max_bet,
    win_mode: patch.win_mode !== undefined ? patch.win_mode : current.win_mode,
    forced_crash: patch.forced_crash !== undefined ? patch.forced_crash : current.forced_crash,
    next_crash_point:
      patch.next_crash_point !== undefined ? patch.next_crash_point : current.next_crash_point,
    economy_enabled:
      patch.economy_enabled !== undefined ? patch.economy_enabled : current.economy_enabled,
    house_hold_pct:
      patch.house_hold_pct !== undefined ? patch.house_hold_pct : current.house_hold_pct,
    max_rtp_pct: patch.max_rtp_pct !== undefined ? patch.max_rtp_pct : current.max_rtp_pct,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? current.updated_by,
  };

  if (next.min_bet > next.max_bet) {
    return { ok: false, reason: "min_bet cannot exceed max_bet" };
  }
  if (next.house_hold_pct < 0 || next.house_hold_pct > 1) {
    return { ok: false, reason: "house_hold_pct must be between 0 and 1" };
  }
  if (next.max_rtp_pct < 0 || next.max_rtp_pct > 1) {
    return { ok: false, reason: "max_rtp_pct must be between 0 and 1" };
  }

  // Keep house-hold and RTP as exact complements when either is set.
  if (patch.house_hold_pct !== undefined) {
    next.max_rtp_pct = Math.round((1 - next.house_hold_pct) * 10000) / 10000;
  } else if (patch.max_rtp_pct !== undefined) {
    next.house_hold_pct = Math.round((1 - next.max_rtp_pct) * 10000) / 10000;
  }

  current = next;

  // In-memory store always persists for the session — no partial-save caveat.
  return { ok: true, controls: { ...current }, economyPersisted: true };
}

export function applyControlsToEngine(engine: GameEngine, controls: AdminControlsState): void {
  engine.overrides.minBet = controls.min_bet;
  engine.overrides.maxBet = controls.max_bet;
  engine.overrides.winMode = controls.win_mode;
  engine.overrides.forcedCrash = controls.forced_crash;
  engine.overrides.nextCrashPoint = controls.next_crash_point;
  engine.economy.economyEnabled = controls.economy_enabled;
  engine.economy.houseHoldPct = controls.house_hold_pct;
  engine.economy.maxRtpPct = controls.max_rtp_pct;
}
