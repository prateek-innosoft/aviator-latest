import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { crashPointFromSeed, generateSeed } from "./provablyFair.js";
import { generateBots } from "./fakeBets.js";
import { supabase } from "./supabaseClient.js";
import { loadAdminControls as fetchAdminControls, applyControlsToEngine } from "./adminControls.js";
import type {
  GamePhase,
  LiveBet,
  PublicRoundState,
  RoundHistoryItem,
} from "./types.js";

const BETTING_MS = 5000;
const HARD_CAP_MULTIPLIER = 130; // absolute maximum — cannot be overridden by any method
const TICK_MS = 50;
const CRASH_PAUSE_MS = 3000;
const GROWTH = 0.16;
const HISTORY_LIMIT = 40;
const SERVER_INSTANCE_ID = process.env.SERVER_INSTANCE_ID ?? "aviator-server-1";

export type WinMode = "normal" | "win" | "loss";

export interface AdminOverrides {
  nextCrashPoint: number | null;  // one-shot override for next round
  winMode:        WinMode;        // global win/loss bias
  forcedCrash:    number | null;  // crash every round at this point
  minBet:         number;
  maxBet:         number;
}

type BotBet = LiveBet & { target: number };

export interface PlayerBet {
  socketId: string;
  userId:   string | null;
  panel: 0 | 1;
  amount: number;
  cashedOut: boolean;
  cashedOutAt: number | null;
  win: number | null;
}

export class GameEngine extends EventEmitter {
  phase: GamePhase = "betting";
  roundId = "";
  supabaseRoundId = ""; // UUID from the `rounds` table
  private startRoundPromise: Promise<void> = Promise.resolve();
  multiplier = 0.0;
  crashPoint = 1.0;
  countdown = BETTING_MS;

  private seed = "";
  hashedSeed = "";
  history: RoundHistoryItem[] = [];
  private bots: BotBet[] = [];
  private playerBets: PlayerBet[] = [];
  private roundStart = 0;
  private timer: NodeJS.Timeout | null = null;

  // ── Admin overrides ──────────────────────────────────────────────────────
  overrides: AdminOverrides = {
    nextCrashPoint: null,
    winMode:        "normal",
    forcedCrash:    null,
    minBet:         1,
    maxBet:         50000,
  };

  setNextCrashOverride(v: number | null) { this.overrides.nextCrashPoint = v; }
  setWinMode(m: WinMode)                { this.overrides.winMode = m; }
  setForcedCrash(v: number | null)      { this.overrides.forcedCrash = v; }
  setBetLimits(min?: number, max?: number) {
    if (min !== undefined) this.overrides.minBet = min;
    if (max !== undefined) this.overrides.maxBet = max;
  }

  /** Find an active bet by socket id and panel. Used by index.ts for cancel amount lookup. */
  getPlayerBet(socketId: string, panel: 0 | 1): PlayerBet | null {
    return this.playerBets.find(b => b.socketId === socketId && b.panel === panel) ?? null;
  }

  /** Compute the effective crash point after applying admin overrides. */
  private computeCrashPoint(): number {
    let result: number;

    // Forced crash wins over everything
    if (this.overrides.forcedCrash !== null) {
      result = this.overrides.forcedCrash;
    }
    // One-shot next round override
    else if (this.overrides.nextCrashPoint !== null) {
      result = this.overrides.nextCrashPoint;
      this.overrides.nextCrashPoint = null; // consume once
    }
    else {
      // ── Win/loss/fair distribution ──────────────────────────────────────
      if (this.overrides.winMode === "win") {
        // Player win: 100×–130×
        result = Math.round((100 + Math.random() * 30) * 100) / 100;
      } else if (this.overrides.winMode === "loss") {
        // House win: always crashes 1.00×–1.05× — just above break-even so
        // players can never cash out for any real profit.
        result = 1.00 + Math.round(Math.random() * 5) / 100; // 1.00, 1.01, 1.02, 1.03, 1.04, or 1.05
      } else {
        // ── Normal (fair): 5-tier weighted distribution ───────────────────
        // All tiers start at 1.00× (break-even) and cap at 1.10×.
        // Weights: 70% / 20% / 5% / 3% / 2%  (must sum to 1.00)
        //   Tier 1 (70%): 1.00× – 1.06×
        //   Tier 2 (20%): 1.00× – 1.08×
        //   Tier 3 ( 5%): 1.00× – 1.07×
        //   Tier 4 ( 3%): 1.00× – 1.09×
        //   Tier 5 ( 2%): 1.00× – 1.10×
        const r = Math.random();
        let lo = 1.00, hi: number;
        if      (r < 0.70) hi = 1.06; // tier 1
        else if (r < 0.90) hi = 1.08; // tier 2
        else if (r < 0.95) hi = 1.07; // tier 3
        else if (r < 0.98) hi = 1.09; // tier 4
        else               hi = 1.10; // tier 5
        result = Math.round((lo + Math.random() * (hi - lo)) * 100) / 100;
      }
    }

    // ── ABSOLUTE HARD CAP — no path can exceed 130× ──────────────────────
    return Math.floor(Math.min(result, HARD_CAP_MULTIPLIER) * 100) / 100;
  }

  constructor() {
    super();
  }

  /** Load real round history from DB, fallback to random if DB unreachable. */
  async loadHistory() {
    try {
      const { data, error } = await supabase
        .from("rounds")
        .select("id, crash_point")
        .eq("status", "crashed")
        .order("ended_at", { ascending: false })
        .limit(HISTORY_LIMIT);

      if (!error && data && data.length > 0) {
        this.history = data.map((r) => ({
          id: r.id as string,
          multiplier: r.crash_point as number,
        }));
        console.log(`[GameEngine] Loaded ${this.history.length} rounds from DB history.`);
        return;
      }
    } catch (err) {
      console.warn("[GameEngine] DB history load failed, using random seed:", err);
    }
    // Fallback: generate random history so bar isn't empty.
    for (let i = 0; i < HISTORY_LIMIT; i++) {
      const { seed } = generateSeed();
      this.history.unshift({ id: crypto.randomUUID(), multiplier: crashPointFromSeed(seed) });
    }
  }

  /** Load admin controls from DB and apply to overrides. */
  async loadAdminControls() {
    try {
      const controls = await fetchAdminControls();
      applyControlsToEngine(this, controls);
      console.log(
        `[GameEngine] Admin controls loaded: winMode=${controls.win_mode} min=${controls.min_bet} max=${controls.max_bet}`,
      );
    } catch (err) {
      console.warn("[GameEngine] Exception loading admin controls:", err);
    }
  }

  async start() {
    await Promise.all([
      this.loadHistory(),
      this.loadAdminControls(),
    ]);
    this.beginBetting();
  }

  private async beginBetting() {
    this.phase = "betting";
    this.roundId = crypto.randomUUID();
    this.supabaseRoundId = ""; // clear immediately — prevents old ID bleeding into new round
    this.multiplier = 0.0;
    this.countdown = BETTING_MS;

    const s = generateSeed();
    this.seed = s.seed;
    this.hashedSeed = s.hashedSeed;
    this.crashPoint = this.computeCrashPoint();

    this.playerBets = [];
    this.bots = generateBots(180 + Math.floor(Math.random() * 80));

    // Persist the new round to Supabase (commit to hashed seed before revealing).
    try {
      const { data, error } = await supabase.rpc("create_round", {
        p_hashed_seed: this.hashedSeed,
        p_server_instance_id: SERVER_INSTANCE_ID,
      });
      if (error) {
        console.error("[Supabase] create_round error:", error.message);
      } else {
        this.supabaseRoundId = data as string;
      }
    } catch (err) {
      console.error("[Supabase] create_round exception:", err);
    }

    this.emit("round:betting", this.publicState());

    const startedAt = Date.now();
    this.clearTimer();
    this.timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      this.countdown = Math.max(0, BETTING_MS - elapsed);
      this.emit("tick:countdown", { countdown: this.countdown });
      if (this.countdown <= 0) {
        this.clearTimer();
        this.beginFlying();
      }
    }, 100);
  }

  private async beginFlying() {
    this.phase = "flying";
    this.multiplier = 0.0;
    this.roundStart = Date.now();

    // Emit flying event immediately — don't block on Supabase latency.
    this.emit("round:flying", this.publicState());

    // Transition round to 'flying' in Supabase asynchronously.
    // Store the promise so resolve_round can wait for it on fast crashes.
    if (this.supabaseRoundId) {
      const rid = this.supabaseRoundId;
      this.startRoundPromise = Promise.resolve(supabase.rpc("start_round", { p_round_id: rid }))
        .then(({ error }) => {
          if (error) console.error("[Supabase] start_round error:", error.message);
        })
        .catch((err: unknown) => console.error("[Supabase] start_round exception:", err));
    } else {
      this.startRoundPromise = Promise.resolve();
    }

    this.clearTimer();
    this.timer = setInterval(() => {
      const t = (Date.now() - this.roundStart) / 1000;
      // Exponential growth curve shifted so multiplier starts at 0.00x.
      // Formula: e^(GROWTH*t) - 1  →  0.0 at t=0, crosses 1.0 at ~6.25s.
      // This allows sub-1x crash points (house win) to be reached naturally
      // as the plane visually climbs through 0.10x, 0.50x, 0.99x etc.
      const rawMultiplier = Math.exp(GROWTH * t) - 1;
      this.multiplier = Math.floor(rawMultiplier * 100) / 100;

      if (rawMultiplier >= this.crashPoint) {
        this.multiplier = this.crashPoint;
        this.resolveBots(true);
        const bets = this.allBets();
        const totalWin = bets.reduce((acc, b) => acc + (b.win ?? 0), 0);
        this.emit("tick:multiplier", {
          multiplier: this.multiplier,
          bets,
          totalWin: Math.round(totalWin * 100) / 100,
        });
        this.beginCrash();
        return;
      }

      this.resolveBots(false);
      const bets = this.allBets();
      const totalWin = bets.reduce((acc, b) => acc + (b.win ?? 0), 0);
      this.emit("tick:multiplier", {
        multiplier: this.multiplier,
        bets,
        totalWin: Math.round(totalWin * 100) / 100,
      });
    }, TICK_MS);
  }

  private async beginCrash() {
    this.phase = "crashed";
    this.clearTimer();

    this.history.unshift({ id: this.roundId, multiplier: this.crashPoint });
    this.history = this.history.slice(0, HISTORY_LIMIT);

    // Emit crash to all clients FIRST — before the Supabase await — so the
    // crash animation fires immediately and players never see a frozen plane.
    this.emit("round:crashed", {
      multiplier: this.crashPoint,
      seed: this.seed,
      hashedSeed: this.hashedSeed,
      history: this.history,
    });

    // Persist crash result to Supabase asynchronously — does not block next round.
    // Wait for start_round first so the DB doesn't reject with 'not_flying'.
    if (this.supabaseRoundId) {
      const rid = this.supabaseRoundId;
      this.startRoundPromise.then(() => Promise.resolve(supabase.rpc("resolve_round", {
        p_round_id: rid,
        p_crash_point: this.crashPoint,
        p_seed: this.seed,
        p_server_instance_id: SERVER_INSTANCE_ID,
      }))).then(({ data, error }) => {
        if (error) console.error("[Supabase] resolve_round error:", error.message);
        else if (!(data as { ok: boolean }).ok) console.warn("[Supabase] resolve_round not-ok:", data);
      }).catch((err: unknown) => console.error("[Supabase] resolve_round exception:", err));
    }

    this.timer = setTimeout(() => this.beginBetting(), CRASH_PAUSE_MS);
  }

  private resolveBots(roundEnding: boolean) {
    for (const bot of this.bots) {
      if (bot.cashedOut) continue;
      if (bot.target <= this.multiplier && bot.target < this.crashPoint) {
        bot.cashedOut = true;
        bot.cashedOutAt = bot.target;
        bot.win = Math.round(bot.bet * bot.target * 100) / 100;
      } else if (roundEnding) {
        // Lost — never cashed out before crash.
        bot.cashedOut = false;
        bot.cashedOutAt = null;
        bot.win = null;
      }
    }
  }

  placeBet(socketId: string, panel: 0 | 1, amount: number, userId?: string): boolean {
    if (this.phase !== "betting") return false;
    if (amount <= 0) return false;
    if (amount < this.overrides.minBet) return false;
    if (amount > this.overrides.maxBet) return false;
    const existing = this.playerBets.find(
      (b) => b.socketId === socketId && b.panel === panel,
    );
    if (existing) return false;
    this.playerBets.push({
      socketId,
      userId:   userId ?? null,
      panel,
      amount,
      cashedOut: false,
      cashedOutAt: null,
      win: null,
    });
    return true;
  }

  cancelBet(socketId: string, panel: 0 | 1): boolean {
    if (this.phase !== "betting") return false;
    const before = this.playerBets.length;
    this.playerBets = this.playerBets.filter(
      (b) => !(b.socketId === socketId && b.panel === panel),
    );
    return this.playerBets.length < before;
  }

  cashOut(socketId: string, panel: 0 | 1): PlayerBet | null {
    if (this.phase !== "flying") return null;
    const bet = this.playerBets.find(
      (b) => b.socketId === socketId && b.panel === panel && !b.cashedOut,
    );
    if (!bet) return null;
    bet.cashedOut = true;
    bet.cashedOutAt = this.multiplier;
    bet.win = Math.round(bet.amount * this.multiplier * 100) / 100;
    return bet;
  }

  getPlayerBets(socketId: string): PlayerBet[] {
    return this.playerBets.filter((b) => b.socketId === socketId);
  }

  private allBets(): LiveBet[] {
    const botBets: LiveBet[] = this.bots.map((b) => ({
      id: b.id,
      name: b.name,
      avatar: b.avatar,
      bet: b.bet,
      cashedOutAt: b.cashedOutAt,
      win: b.win,
      cashedOut: b.cashedOut,
    }));
    return botBets;
  }

  publicState(): PublicRoundState {
    const bets = this.allBets();
    const totalWin = bets.reduce((acc, b) => acc + (b.win ?? 0), 0);
    return {
      phase: this.phase,
      roundId: this.roundId,
      supabaseRoundId: this.supabaseRoundId,
      multiplier: this.multiplier,
      countdown: this.countdown,
      hashedSeed: this.hashedSeed,
      history: this.history,
      bets,
      totalBets: bets.length,
      totalWin: Math.round(totalWin * 100) / 100,
    };
  }

  private clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
