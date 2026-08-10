import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { crashPointFromSeed, generateSeed } from "./provablyFair.js";
import { generateBots } from "./fakeBets.js";
import * as store from "./store.js";
import { loadAdminControls as fetchAdminControls, applyControlsToEngine } from "./adminControls.js";
import { loadReserve, saveReserve } from "./reserveStore.js";
import {
  fairTiersFor,
  generateWeightedCrash,
  HARD_CAP_MULTIPLIER,
  NO_BET_LURE_TIERS,
  PROTECT_MODE_TIERS,
  selectFairSubMode,
  type FairSubMode,
} from "./roundEconomy.js";
import type {
  GamePhase,
  LiveBet,
  PublicRoundState,
  RoundHistoryItem,
} from "./types.js";

const BETTING_MS = 5000;
const TICK_MS = 50;
const CRASH_PAUSE_MS = 3000;
const GROWTH = 0.16;
const HISTORY_LIMIT = 40;
const SERVER_INSTANCE_ID = process.env.SERVER_INSTANCE_ID ?? "aviator-server-1";

/** Company's real starting payout reserve, in INR (₹2,00,000 / 2 lakh). */
const INITIAL_BANKROLL_INR = 200000;

/** Fair = reserve-driven tables, protect = fixed conservative table. */
export type WinMode = "normal" | "protect";

export interface AdminOverrides {
  winMode:     WinMode;
  /** Custom mode: fixed crash multiplier, or null when not in custom mode. */
  forcedCrash: number | null;
  minBet:      number;
  maxBet:      number;
  /** Mode to auto-revert to once Custom mode's one round is consumed. */
  customRevertTo: WinMode | null;
}

export interface RoundEconomyState {
  realStake:     number;
  /** Per-round payout ceiling = reserve + this round's stake. */
  maxPayout:     number;
  paidOut:       number;
  economyActive: boolean;
  reserve:       number;
  fairSubMode:   FairSubMode | null;
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
  /** If set, the tick loop cashes this out itself the instant the live
   * multiplier reaches it — same mechanism as bot targets, exact and with
   * no client round-trip latency. Null when auto cash-out wasn't enabled. */
  autoCashOutTarget: number | null;
  /** CasinoTransaction id from the platform backend, for authenticated bets. Null for demo bets. */
  betId: string | null;
}

function round2(n: number): number {
  return Math.floor(n * 100) / 100;
}

export class GameEngine extends EventEmitter {
  phase: GamePhase = "betting";
  roundId = "";
  /** Store round-record id — gates authenticated wallet operations for the round. */
  roundRecordId = "";
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
  private crashing = false;

  // Per-round economy (all real bets — demo included — count).
  roundRealStake = 0;
  /** Per-round payout ceiling = current reserve + this round's stake. */
  roundMaxPayout = 0;
  roundPaidOut = 0;
  economyActiveForRound = false;
  /** Which Fair Mode sub-table (tight/normal/bonus) the current round used — set by reserve level, see selectFairSubMode. */
  fairSubMode: FairSubMode | null = null;
  /**
   * The company reserve — a real running ledger. Each round it grows by the
   * net of that round: stake collected − amount paid out to players. It's
   * also the per-round payout ceiling (a round can never pay out more than
   * reserve + that round's own stake), which guarantees the reserve can
   * never go negative through play. Drives Fair Mode's Tight/Normal/Bonus
   * selection. Starts at ₹2,00,000; in-memory only (resets on restart).
   */
  private bankroll = loadReserve() ?? INITIAL_BANKROLL_INR;

  overrides: AdminOverrides = {
    winMode:     "normal",
    forcedCrash: null,
    minBet:      1,
    maxBet:      50000,
    customRevertTo: null,
  };

  setWinMode(m: WinMode)           { this.overrides.winMode = m; }
  setForcedCrash(v: number | null) { this.overrides.forcedCrash = v; }
  setBetLimits(min?: number, max?: number) {
    if (min !== undefined) this.overrides.minBet = min;
    if (max !== undefined) this.overrides.maxBet = max;
  }

  /** Current company reserve — drives Fair Mode's Tight/Normal/Bonus selection. */
  getBankroll(): number {
    return this.bankroll;
  }

  /**
   * Directly set the reserve (e.g. an admin withdrawal/top-up via the API).
   * Clamped to >= 0. It then continues to move with real play from this new
   * value via settleBankroll().
   */
  setBankroll(amount: number): void {
    this.bankroll = Math.max(0, Math.round(amount * 100) / 100);
    saveReserve(this.bankroll);
  }

  getPlayerBet(socketId: string, panel: 0 | 1): PlayerBet | null {
    return this.playerBets.find(b => b.socketId === socketId && b.panel === panel) ?? null;
  }

  /**
   * Total stake counted toward the round's economy. Includes demo (no
   * userId) bets too, so any bet placed through the UI engages the real
   * economy (fair/protect) rather than falling into lure mode — lure only
   * fires when truly nobody has anything at stake.
   */
  sumRealStake(): number {
    return round2(this.playerBets.reduce((s, b) => s + b.amount, 0));
  }

  wouldExceedBudget(additionalWin: number): boolean {
    if (!this.economyActiveForRound) return false;
    return this.roundPaidOut + additionalWin > this.roundMaxPayout + 0.001;
  }

  recordPaidOut(win: number): void {
    this.roundPaidOut = round2(this.roundPaidOut + win);
    this.emitRoundEconomics();
    if (
      this.economyActiveForRound &&
      this.roundPaidOut >= this.roundMaxPayout - 0.001 &&
      this.phase === "flying" &&
      !this.crashing
    ) {
      this.forceCrashNow();
    }
  }

  undoCashOut(socketId: string, panel: 0 | 1): boolean {
    const bet = this.playerBets.find(
      (b) => b.socketId === socketId && b.panel === panel && b.cashedOut,
    );
    if (!bet) return false;
    const reserved = bet.win ?? 0;
    bet.cashedOut = false;
    bet.cashedOutAt = null;
    bet.win = null;
    if (reserved > 0 && this.economyActiveForRound) {
      this.roundPaidOut = round2(Math.max(0, this.roundPaidOut - reserved));
      this.emitRoundEconomics();
    }
    return true;
  }

  /**
   * The reserve is a real ledger: after each economy-active round it moves
   * by that round's net for the house — the stake it collected minus what it
   * paid out. Players losing (crashing before cashout) grows the reserve;
   * players winning shrinks it. Runs once per round at finalization.
   *
   * The reserve can never go below 0 here: roundMaxPayout is capped at
   * (reserve + stake), and cashouts are rejected past that ceiling, so
   * roundPaidOut <= reserve + roundRealStake always — the subtraction below
   * therefore stays >= 0. The max(0, …) is just belt-and-suspenders.
   */
  private settleBankroll(): void {
    if (!this.economyActiveForRound) return;
    const net = round2(this.roundRealStake - this.roundPaidOut);
    this.bankroll = Math.max(0, round2(this.bankroll + net));
    saveReserve(this.bankroll);
  }

  emitRoundEconomics(): void {
    const payload: RoundEconomyState & { roundId: string } = {
      roundId: this.roundId,
      realStake: this.roundRealStake,
      maxPayout: this.roundMaxPayout,
      paidOut: this.roundPaidOut,
      economyActive: this.economyActiveForRound,
      reserve: this.bankroll,
      fairSubMode: this.fairSubMode,
    };
    this.emit("admin:roundEconomy", payload);
  }

  /**
   * Lock bets and pick this round's crash multiplier right before flight.
   *
   * Mode precedence (per the disclosed design — no RTP anywhere):
   *   1. No real stake            → LURE (wide table; no money at risk)
   *   2. Custom (forcedCrash set) → the exact multiplier the admin typed
   *   3. Protect                  → fixed conservative two-tier table
   *   4. Fair (default)           → reserve-driven Tight/Normal/Bonus table
   *
   * For every economy-active branch (2–4) the per-round payout ceiling is
   * (reserve + this round's stake): the house can never pay out more than it
   * holds plus what it just collected, which keeps the reserve solvent.
   */
  private lockRoundAndSelectCrash(): void {
    this.roundRealStake = this.sumRealStake();

    // 1. Nobody has real money on the line — fly an enticing lure round.
    //    This takes precedence over every admin mode: with zero stake there
    //    is no bet to honor, so a Custom/Protect/Fair setting doesn't apply.
    if (this.roundRealStake <= 0) {
      this.crashPoint = generateWeightedCrash(Math.random, NO_BET_LURE_TIERS);
      this.economyActiveForRound = false;
      this.roundMaxPayout = 0;
      this.fairSubMode = null;
      return;
    }

    // The reserve funds payouts; a round can never pay out more than the
    // house holds plus what it just took this round.
    this.roundMaxPayout = round2(this.bankroll + this.roundRealStake);
    this.economyActiveForRound = true;

    // 2. Custom mode: honor the admin's exact fixed crash. One-shot — this
    //    round is the one round Custom mode gets, so consume it immediately:
    //    the very next round already reverts to whatever mode was active
    //    before Custom was chosen, no manual admin action required.
    if (this.overrides.forcedCrash !== null) {
      this.crashPoint = round2(Math.min(this.overrides.forcedCrash, HARD_CAP_MULTIPLIER));
      this.fairSubMode = null;
      console.log(`[Economy][custom] stake=${this.roundRealStake} crash=${this.crashPoint}`);
      const revertTo = this.overrides.customRevertTo ?? "normal";
      this.overrides.forcedCrash = null;
      this.overrides.winMode = revertTo;
      this.overrides.customRevertTo = null;
      this.emit("admin:customModeConsumed", { winMode: revertTo });
      return;
    }

    // 3. Protect mode: fixed conservative two-tier table.
    if (this.overrides.winMode === "protect") {
      this.crashPoint = round2(
        Math.min(generateWeightedCrash(Math.random, PROTECT_MODE_TIERS), HARD_CAP_MULTIPLIER),
      );
      this.fairSubMode = null;
      console.log(
        `[Economy][protect] reserve=${this.bankroll} stake=${this.roundRealStake} ` +
        `maxPayout=${this.roundMaxPayout} crash=${this.crashPoint}`,
      );
      return;
    }

    // 4. Fair mode: sub-mode picked from the current reserve alone (never from
    //    bet amounts) — a disclosed, uniform rule for everyone in the round.
    this.fairSubMode = selectFairSubMode(this.bankroll, Math.random);
    this.crashPoint = round2(
      Math.min(generateWeightedCrash(Math.random, fairTiersFor(this.fairSubMode)), HARD_CAP_MULTIPLIER),
    );
    console.log(
      `[Economy][fair:${this.fairSubMode}] reserve=${this.bankroll} stake=${this.roundRealStake} ` +
      `maxPayout=${this.roundMaxPayout} crash=${this.crashPoint}`,
    );
  }

  constructor() {
    super();
  }

  loadHistory() {
    // The store is empty on a fresh start (no cross-restart persistence), so
    // seed the initial history strip with random-but-plausible crash points.
    const past = store
      .getRecentRounds(HISTORY_LIMIT)
      .filter((r) => r.status === "crashed" && r.crash_point != null);
    if (past.length > 0) {
      this.history = past.map((r) => ({ id: r.id, multiplier: r.crash_point as number }));
      console.log(`[GameEngine] Loaded ${this.history.length} rounds from store history.`);
      return;
    }
    for (let i = 0; i < HISTORY_LIMIT; i++) {
      const { seed } = generateSeed();
      this.history.unshift({ id: crypto.randomUUID(), multiplier: crashPointFromSeed(seed) });
    }
  }

  async loadAdminControls() {
    try {
      const controls = await fetchAdminControls();
      applyControlsToEngine(this, controls);
      console.log(
        `[GameEngine] Admin controls loaded: winMode=${controls.win_mode} ` +
        `forcedCrash=${controls.forced_crash ?? "none"}`,
      );
    } catch (err) {
      console.warn("[GameEngine] Exception loading admin controls:", err);
    }
  }

  async start() {
    this.loadHistory();
    await this.loadAdminControls();
    this.beginBetting();
  }

  private beginBetting() {
    this.phase = "betting";
    this.roundId = crypto.randomUUID();
    this.roundRecordId = "";
    this.multiplier = 1.0;
    this.countdown = BETTING_MS;
    this.crashing = false;
    this.roundRealStake = 0;
    this.roundMaxPayout = 0;
    this.roundPaidOut = 0;
    this.economyActiveForRound = false;
    this.fairSubMode = null;

    const s = generateSeed();
    this.seed = s.seed;
    this.hashedSeed = s.hashedSeed;
    // Crash point is chosen at flight lock (after all bets are in).
    this.crashPoint = 1.0;

    this.playerBets = [];
    this.bots = generateBots(180 + Math.floor(Math.random() * 80));

    // Authenticated (real-money) bets are gated on roundRecordId being set
    // (see bet:place's "round_not_ready" check in index.ts). The in-memory
    // store creates the record synchronously and can't fail, so it's always
    // ready before the first bet.
    this.roundRecordId = store.createRound(this.hashedSeed, SERVER_INSTANCE_ID);

    this.emit("round:betting", this.publicState());
    this.emitRoundEconomics();

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

  private beginFlying() {
    // Gather bets and select crash from economy rules before take-off.
    this.lockRoundAndSelectCrash();

    this.phase = "flying";
    this.multiplier = 1.0;
    this.roundStart = Date.now();
    this.crashing = false;
    this.roundPaidOut = 0;

    this.emit("round:flying", this.publicState());
    this.emitRoundEconomics();

    if (this.roundRecordId) {
      store.startRound(this.roundRecordId);
    }

    this.clearTimer();
    this.timer = setInterval(() => {
      if (this.crashing) return;

      const t = (Date.now() - this.roundStart) / 1000;
      const rawMultiplier = Math.exp(GROWTH * t);
      this.multiplier = Math.floor(rawMultiplier * 100) / 100;

      if (
        this.economyActiveForRound &&
        this.roundPaidOut >= this.roundMaxPayout - 0.001
      ) {
        this.forceCrashNow();
        return;
      }

      if (rawMultiplier >= this.crashPoint) {
        this.multiplier = this.crashPoint;
        this.resolveBots(true);
        this.emitAutoCashouts();
        const bets = this.allBets();
        this.emit("tick:multiplier", {
          multiplier: this.multiplier,
          bets,
          totalWin: this.sumTotalWin(),
        });
        this.beginCrash();
        return;
      }

      this.resolveBots(false);
      this.emitAutoCashouts();
      const bets = this.allBets();
      this.emit("tick:multiplier", {
        multiplier: this.multiplier,
        bets,
        totalWin: this.sumTotalWin(),
      });
    }, TICK_MS);
  }

  /**
   * Same mechanism as resolveBots(), but for real players who enabled Auto
   * Cash Out: resolved server-side, in-tick, against the authoritative
   * multiplier — no client round-trip, so it can't overshoot the target due
   * to network latency and can't miss a narrow window between the target
   * and the crash point the way a client-driven emit-and-wait cycle can.
   * Emits "playerBet:autoCashedOut" per resolved bet so index.ts can credit
   * the wallet and notify that one socket.
   */
  private emitAutoCashouts(): void {
    for (const bet of this.playerBets) {
      if (bet.cashedOut) continue;
      if (bet.autoCashOutTarget == null) continue;
      if (bet.autoCashOutTarget > this.multiplier) continue;
      if (bet.autoCashOutTarget >= this.crashPoint) continue;
      const win = round2(bet.amount * bet.autoCashOutTarget);
      if (this.wouldExceedBudget(win)) continue;
      bet.cashedOut = true;
      bet.cashedOutAt = bet.autoCashOutTarget;
      bet.win = win;
      if (this.economyActiveForRound) this.recordPaidOut(win);
      this.emit("playerBet:autoCashedOut", { ...bet });
    }
  }

  forceCrashNow(): void {
    if (this.phase !== "flying" || this.crashing) return;
    this.crashing = true;
    this.crashPoint = this.multiplier;
    this.clearTimer();
    this.resolveBots(true);
    const bets = this.allBets();
    this.emit("tick:multiplier", {
      multiplier: this.multiplier,
      bets,
      totalWin: this.sumTotalWin(),
    });
    void this.beginCrash();
  }

  private async beginCrash() {
    if (this.phase === "crashed") return;
    this.phase = "crashed";
    this.clearTimer();
    this.settleBankroll();

    this.history.unshift({ id: this.roundId, multiplier: this.crashPoint });
    this.history = this.history.slice(0, HISTORY_LIMIT);

    this.emit("round:crashed", {
      multiplier: this.crashPoint,
      seed: this.seed,
      hashedSeed: this.hashedSeed,
      history: this.history,
    });

    if (this.roundRecordId) {
      store.resolveRound(this.roundRecordId, this.crashPoint, this.seed);
    }

    this.emitRoundEconomics();
    this.timer = setTimeout(() => this.beginBetting(), CRASH_PAUSE_MS);
  }

  private resolveBots(roundEnding: boolean) {
    for (const bot of this.bots) {
      if (bot.cashedOut) continue;
      if (bot.target <= this.multiplier && bot.target < this.crashPoint) {
        bot.cashedOut = true;
        bot.cashedOutAt = bot.target;
        bot.win = round2(bot.bet * bot.target);
      } else if (roundEnding) {
        bot.cashedOut = false;
        bot.cashedOutAt = null;
        bot.win = null;
      }
    }
  }

  placeBet(
    socketId: string,
    panel: 0 | 1,
    amount: number,
    userId?: string,
    autoCashOutTarget?: number | null,
    betId?: string,
  ): boolean {
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
      autoCashOutTarget: autoCashOutTarget ?? null,
      betId: betId ?? null,
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

  /**
   * Elapsed-real-time raw multiplier — the true mathematical value right
   * now, independent of the tick loop's cache. `this.multiplier` (and any
   * caller-supplied snapshot) only refreshes once per TICK_MS and can be
   * up to that long behind, which matters a lot right at flight start:
   * the tables can produce crashPoint === 1.00 exactly (e.g. the low end of
   * Tight/Protect), and there's a real window before the first tick where
   * `this.multiplier` is still frozen at 1.00 — a cashout landing there
   * would otherwise be paid at 1.00x (break-even) on a round that should
   * be a 100% loss.
   */
  private liveRawMultiplier(): number {
    const t = (Date.now() - this.roundStart) / 1000;
    return Math.exp(GROWTH * t);
  }

  /** Authoritative live multiplier for external pre-checks, clamped to crashPoint. */
  getLiveMultiplier(): number {
    if (this.phase !== "flying") return this.multiplier;
    return Math.floor(Math.min(this.liveRawMultiplier(), this.crashPoint) * 100) / 100;
  }

  cashOutFailureReason(
    socketId: string,
    panel: 0 | 1,
  ): "round_ended" | "bet_not_found" | "already_cashed_out" | "budget_exhausted" | "rejected" {
    if (this.phase !== "flying" || this.crashing || this.liveRawMultiplier() >= this.crashPoint) {
      return "round_ended";
    }
    const bet = this.playerBets.find((b) => b.socketId === socketId && b.panel === panel);
    if (!bet) return "bet_not_found";
    if (bet.cashedOut) return "already_cashed_out";
    const multiplier = Math.floor(this.liveRawMultiplier() * 100) / 100;
    if (this.wouldExceedBudget(round2(bet.amount * multiplier))) return "budget_exhausted";
    return "rejected";
  }

  cashOut(socketId: string, panel: 0 | 1): PlayerBet | null {
    if (this.phase !== "flying" || this.crashing) return null;
    // The round may have already reached its crash point by true elapsed
    // time even though the tick loop hasn't processed it yet — reject
    // rather than pay out a stale pre-crash multiplier.
    if (this.liveRawMultiplier() >= this.crashPoint) return null;
    const bet = this.playerBets.find(
      (b) => b.socketId === socketId && b.panel === panel && !b.cashedOut,
    );
    if (!bet) return null;

    const mult = Math.floor(this.liveRawMultiplier() * 100) / 100;
    const win = round2(bet.amount * mult);
    if (this.wouldExceedBudget(win)) return null;

    bet.cashedOut = true;
    bet.cashedOutAt = mult;
    bet.win = win;
    if (this.economyActiveForRound) {
      this.recordPaidOut(win);
    }
    return bet;
  }

  getPlayerBets(socketId: string): PlayerBet[] {
    return this.playerBets.filter((b) => b.socketId === socketId);
  }

  private sumTotalWin(): number {
    const botWin = this.bots.reduce((acc, b) => acc + (b.win ?? 0), 0);
    const playerWin = this.playerBets.reduce(
      (acc, b) => acc + (b.cashedOut ? (b.win ?? 0) : 0),
      0,
    );
    return round2(botWin + playerWin);
  }

  private allBets(): LiveBet[] {
    return this.bots.map((b) => ({
      id: b.id,
      name: b.name,
      avatar: b.avatar,
      bet: b.bet,
      cashedOutAt: b.cashedOutAt,
      win: b.win,
      cashedOut: b.cashedOut,
    }));
  }

  publicState(): PublicRoundState {
    const bets = this.allBets();
    const totalWin = this.sumTotalWin();
    return {
      phase: this.phase,
      roundId: this.roundId,
      roundRecordId: this.roundRecordId,
      multiplier: this.multiplier,
      countdown: this.countdown,
      hashedSeed: this.hashedSeed,
      history: this.history,
      bets,
      totalBets: bets.length,
      totalWin: round2(totalWin),
      flightStartedAt: this.phase === "flying" ? this.roundStart : null,
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
