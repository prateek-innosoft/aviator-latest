import { nestEngineGet, nestEnginePut } from "./nestClient.js";
import type { GameEngine, WinMode } from "./gameEngine.js";

/**
 * Admin settings. min_bet/max_bet/win_mode/forced_crash are now sourced from
 * the platform NestJS backend (`/aviator/admin/config`) — the platform's own
 * admin dashboard is the real source of truth, same as the winMode/forcedCrash
 * values it must never expose to players. `custom_revert_to` has no Nest-side
 * field (it's just this engine's own bookkeeping for auto-reverting out of a
 * one-shot Custom round) and stays purely local, process-memory only.
 */

export interface AdminControlsState {
  id: number;
  min_bet: number;
  max_bet: number;
  /** "normal" = Fair (reserve-driven tables), "protect" = fixed conservative table. */
  win_mode: WinMode;
  /** Custom mode: fixed crash multiplier, or null when not in Custom mode. */
  forced_crash: number | null;
  /**
   * The mode active right before Custom was selected. Custom is a one-shot —
   * once a round with real money actually uses it, the engine auto-reverts
   * win_mode to this and clears forced_crash. Null when not in Custom mode.
   */
  custom_revert_to: WinMode | null;
  updated_at: string;
  updated_by: string | null;
}

export interface AdminControlsPatch {
  min_bet?: number;
  max_bet?: number;
  win_mode?: WinMode;
  forced_crash?: number | null;
}

// Shape of AviatorState as returned by the NestJS backend (src/aviator/aviator.types.ts).
interface AviatorStateResponse {
  minBet: number;
  maxBet: number;
  winMode: WinMode;
  forcedCrash: number | null;
  revision: number;
  updatedAt: string;
}

const DEFAULTS: AdminControlsState = {
  id: 1,
  min_bet: 1,
  max_bet: 50_000,
  win_mode: "normal",
  forced_crash: null,
  custom_revert_to: null,
  updated_at: new Date().toISOString(),
  updated_by: null,
};

// Local-only overlay — not persisted to Nest, resets on restart. Reset
// whenever we observe forced_crash go null -> set (entering Custom) or
// set -> null (leaving Custom, e.g. admin manually picked Fair/Protect).
let customRevertTo: WinMode | null = null;
let lastKnownForcedCrash: number | null = null;
let lastKnownWinMode: WinMode = DEFAULTS.win_mode;

function fromNestState(state: AviatorStateResponse): AdminControlsState {
  return {
    id: 1,
    min_bet: state.minBet,
    max_bet: state.maxBet,
    win_mode: state.winMode,
    forced_crash: state.forcedCrash,
    custom_revert_to: customRevertTo,
    updated_at: state.updatedAt,
    updated_by: null,
  };
}

/** Load persisted admin controls from the platform backend (source of truth for min/max/winMode/forcedCrash). */
export async function loadAdminControls(): Promise<AdminControlsState> {
  const result = await nestEngineGet<{ success: boolean; data: AviatorStateResponse }>(
    "/aviator/admin/config",
  );

  if (result.ok && result.data?.data) {
    const state = result.data.data;
    lastKnownForcedCrash = state.forcedCrash;
    lastKnownWinMode = state.winMode;
    return fromNestState(state);
  }

  console.warn("[adminControls] failed to load config from Nest backend:", result.reason);
  return { ...DEFAULTS, custom_revert_to: customRevertTo };
}

/** Merge patch, validate, persist via the platform backend's admin config endpoint. */
export async function saveAdminControls(
  patch: AdminControlsPatch,
  _updatedBy?: string,
): Promise<{ ok: true; controls: AdminControlsState } | { ok: false; reason: string }> {
  if (
    patch.min_bet !== undefined &&
    patch.max_bet !== undefined &&
    patch.min_bet > patch.max_bet
  ) {
    return { ok: false, reason: "min_bet cannot exceed max_bet" };
  }

  // Entering Custom mode (forced_crash null -> set): remember the mode we're
  // leaving so the engine can auto-revert to it after Custom's one round.
  // Exiting Custom mode (forced_crash set -> null): nothing left to revert
  // to. Otherwise (already in Custom, just retyping the crash value) leave
  // the remembered mode untouched.
  const enteringCustom = patch.forced_crash !== undefined && patch.forced_crash !== null && lastKnownForcedCrash === null;
  const exitingCustom  = patch.forced_crash !== undefined && patch.forced_crash === null && lastKnownForcedCrash !== null;
  if (enteringCustom) {
    customRevertTo = patch.win_mode ?? lastKnownWinMode;
  } else if (exitingCustom) {
    customRevertTo = null;
  }

  const result = await nestEnginePut<{ success: boolean; data: AviatorStateResponse }>(
    "/aviator/admin/config",
    {
      minBet: patch.min_bet,
      maxBet: patch.max_bet,
      winMode: patch.win_mode,
      forcedCrash: patch.forced_crash,
    },
  );

  if (!result.ok || !result.data?.data) {
    return { ok: false, reason: result.reason ?? "save_failed" };
  }

  lastKnownForcedCrash = result.data.data.forcedCrash;
  lastKnownWinMode = result.data.data.winMode;
  return { ok: true, controls: fromNestState(result.data.data) };
}

/** Apply loaded controls to the in-memory game engine. */
export function applyControlsToEngine(engine: GameEngine, controls: AdminControlsState): void {
  engine.overrides.minBet = controls.min_bet;
  engine.overrides.maxBet = controls.max_bet;
  engine.overrides.winMode = controls.win_mode;
  engine.overrides.forcedCrash = controls.forced_crash;
  engine.overrides.customRevertTo = controls.custom_revert_to;
}
