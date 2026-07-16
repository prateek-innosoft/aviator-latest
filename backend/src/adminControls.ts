import type { GameEngine, WinMode } from "./gameEngine.js";

/**
 * Live game admin settings.
 *
 * In-memory singleton for the standalone build — resets to DEFAULTS on
 * restart; the host site provides durable config storage when this module is
 * merged in. There is no RTP / round-economy config anymore: the crash tables
 * (fair/protect/custom) and the reserve ledger are the whole economy.
 */

export interface AdminControlsState {
  id: number;
  min_bet: number;
  max_bet: number;
  /** "normal" = Fair (reserve-driven tables), "protect" = fixed conservative table. */
  win_mode: WinMode;
  /** Custom mode: fixed crash multiplier, or null when not in Custom mode. */
  forced_crash: number | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminControlsPatch {
  min_bet?: number;
  max_bet?: number;
  win_mode?: WinMode;
  forced_crash?: number | null;
}

const DEFAULTS: AdminControlsState = {
  id: 1,
  min_bet: 1,
  max_bet: 50_000,
  win_mode: "normal",
  forced_crash: null,
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
  | { ok: true; controls: AdminControlsState }
  | { ok: false; reason: string }
> {
  const next: AdminControlsState = {
    ...current,
    min_bet: patch.min_bet !== undefined ? patch.min_bet : current.min_bet,
    max_bet: patch.max_bet !== undefined ? patch.max_bet : current.max_bet,
    win_mode: patch.win_mode !== undefined ? patch.win_mode : current.win_mode,
    forced_crash: patch.forced_crash !== undefined ? patch.forced_crash : current.forced_crash,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy ?? current.updated_by,
  };

  if (next.min_bet > next.max_bet) {
    return { ok: false, reason: "min_bet cannot exceed max_bet" };
  }

  current = next;
  return { ok: true, controls: { ...current } };
}

export function applyControlsToEngine(engine: GameEngine, controls: AdminControlsState): void {
  engine.overrides.minBet = controls.min_bet;
  engine.overrides.maxBet = controls.max_bet;
  engine.overrides.winMode = controls.win_mode;
  engine.overrides.forcedCrash = controls.forced_crash;
}
