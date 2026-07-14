import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { crashPointFromSeed, generateSeed } from "./provablyFair.js";
import { generateBots } from "./fakeBets.js";
import * as store from "./store.js";
import { loadAdminControls as fetchAdminControls, applyControlsToEngine } from "./adminControls.js";
import {
  assignSimCashoutTarget,
  computeSafetyCeiling,
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

export type WinMode = "normal" | "win" | "protect";

export interface AdminOverrides {
  nextCrashPoint: number | null;
  winMode:        WinMode;
  forcedCrash:    number | null;
  minBet:         number;
  maxBet:         number;
}

export interface EconomyConfig {
  economyEnabled: boolean;
  houseHoldPct:   number;
  maxRtpPct:      number;
}

export interface RoundEconomyState {
  realStake:      number;
  maxPayout:      number;
  paidOut:        number;
  economyActive:  boolean;
  crashAttempts:  number;
  reserve:        number;
  fairSubMode:    FairSubMode | null;
}

type BotBet = LiveBet & { target: number };

export interface PlayerBet {
  socketId: string;
  userId:   string | null;
  panel: 0 | 1;
  amount: number;
  simCashoutTarget: number;
  cashedOut: boolean;
  cashedOutAt: number | null;
  win: number | null;
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

  // Per-round controlled economy (real authenticated bets only).
  roundRealStake = 0;
  roundMaxPayout = 0;
  roundPaidOut = 0;
  economyActiveForRound = false;
  private crashSelectAttempts = 0;
  private roundNominalBudget = 0;
  /** Which Fair Mode sub-table (tight/normal/bonus) the current round used — set by reserve level, see selectFairSubMode. */
  fairSubMode: FairSubMode | null = null;
  /**
   * Rolling unspent RTP budget carried between rounds. Rounds that pay out
   * less than their nominal share (totalStake × RTP) — including rounds
   * with too few bets for any payout to fit under a nominal-only budget —
   * bank the surplus here so later rounds can draw on it, pulling the
   * realized long-run RTP toward the target instead of staying well below
   * it. Capped relative to stake so no single round can pay out an
   * unbounded windfall.
   */
  private bankroll = INITIAL_BANKROLL_INR;
  private static readonly BANKROLL_CAP_MULTIPLE = 20;
  /**
   * Slow-moving average of real stake per economy-active round, used to
   * size the bankroll cap. A single round's own stake is too noisy for
   * this — real traffic swings from a $10 bet to a $50,000 pile-up round
   * to round, and capping growth at 20x *that one round's* stake would
   * clip an already-earned reserve down to near-zero the instant a small
   * round happened to settle right after a big one.
   *
   * Seeded so the cap starts at exactly INITIAL_BANKROLL_INR (not 0) — a
   * cold value of 0 used to make settleBankroll() set this straight to the
   * very FIRST round's own stake (see the old `=== 0 ? roundRealStake`
   * branch), which reproduced precisely the failure mode described above
   * on every fresh server start: one small first bet (e.g. ₹10) would
   * collapse a real ₹2,00,000 reserve down to ₹200 in a single round.
   */
  private avgRealStakeEma = INITIAL_BANKROLL_INR / GameEngine.BANKROLL_CAP_MULTIPLE;
  private static readonly STAKE_EMA_ALPHA = 0.02;

  overrides: AdminOverrides = {
    nextCrashPoint: null,
    winMode:        "normal",
    forcedCrash:    null,
    minBet:         1,
    maxBet:         50000,
  };

  economy: EconomyConfig = {
    economyEnabled: true,
    houseHoldPct:   0.30,
    maxRtpPct:      0.70,
  };

  setNextCrashOverride(v: number | null) { this.overrides.nextCrashPoint = v; }
  setWinMode(m: WinMode)                { this.overrides.winMode = m; }
  setForcedCrash(v: number | null)      { this.overrides.forcedCrash = v; }
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
   * Clamped to >= 0 — the reserve funds payouts, it can't go negative by
   * being set that way (it can still drift to 0 through normal play).
   *
   * Also raises avgRealStakeEma's floor if needed. The EMA-based cap (see
   * its own comment above) exists to stop a real round's own tiny stake
   * from silently collapsing a real reserve — but that same cap would
   * immediately claw an admin's manual top-up back down on the very next
   * settled round if typical recent stakes are small (cap = avgStake × 20).
   * Raising the floor here means an explicit admin action always sticks;
   * it only ever raises the cap, never re-opens the original collapse bug.
   */
  setBankroll(amount: number): void {
    this.bankroll = Math.max(0, Math.round(amount * 100) / 100);
    const requiredEma = round2(this.bankroll / GameEngine.BANKROLL_CAP_MULTIPLE);
    if (requiredEma > this.avgRealStakeEma) this.avgRealStakeEma = requiredEma;
  }

  getPlayerBet(socketId: string, panel: 0 | 1): PlayerBet | null {
    return this.playerBets.find(b => b.socketId === socketId && b.panel === panel) ?? null;
  }

  /**
   * Total stake counted toward the round's economy. Includes demo (no
   * userId) bets too — without a full player/wallet system wired in yet,
   * this is what makes placing a bet through the UI actually engage the
   * real RTP-guaranteed crash formula instead of always falling back to
   * lure mode (which only fires when truly nobody has anything at stake).
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
   * Bank this round's unspent RTP share (or draw down if it overspent) so
   * future rounds' payout ceiling reflects the real running average, not
   * just each round's own tiny slice. Runs once per round, right when the
   * round finalizes (no more cashouts possible after this).
   */
  private settleBankroll(): void {
    if (!this.economyActiveForRound) return;
    this.avgRealStakeEma = round2(
      (1 - GameEngine.STAKE_EMA_ALPHA) * this.avgRealStakeEma +
      GameEngine.STAKE_EMA_ALPHA * this.roundRealStake,
    );
    const surplus = round2(this.roundNominalBudget - this.roundPaidOut);
    const cap = round2(Math.max(this.avgRealStakeEma, 1) * GameEngine.BANKROLL_CAP_MULTIPLE);
    this.bankroll = Math.min(cap, Math.max(0, round2(this.bankroll + surplus)));
  }

  emitRoundEconomics(): void {
    const payload: RoundEconomyState & { roundId: string } = {
      roundId: this.roundId,
      realStake: this.roundRealStake,
      maxPayout: this.roundMaxPayout,
      paidOut: this.roundPaidOut,
      economyActive: this.economyActiveForRound,
      crashAttempts: this.crashSelectAttempts,
      reserve: this.bankroll,
      fairSubMode: this.fairSubMode,
    };
    this.emit("admin:roundEconomy", payload);
  }

  /** Win-mode crash (100x–130x) — bypasses economy table. */
  private computeWinModeCrash(): number {
    return round2(100 + Math.random() * 30);
  }

  /**
   * Lock bets and pick crash multiplier right before flight.
   * Uses weighted probability table + payout simulation against RTP budget.
   */
  private lockRoundAndSelectCrash(): void {
    this.roundRealStake = this.sumRealStake();

    if (this.overrides.forcedCrash !== null) {
      // Custom mode: the admin-entered multiplier is honored exactly — the RTP
      // budget must not cut the round short before this crash point is reached.
      this.crashPoint = round2(Math.min(this.overrides.forcedCrash, HARD_CAP_MULTIPLIER));
      this.economyActiveForRound = false;
      this.roundMaxPayout = 0;
      this.roundNominalBudget = 0;
      this.crashSelectAttempts = 0;
      return;
    }

    if (this.overrides.nextCrashPoint !== null) {
      this.crashPoint = round2(Math.min(this.overrides.nextCrashPoint, HARD_CAP_MULTIPLIER));
      this.overrides.nextCrashPoint = null;
      this.economyActiveForRound = this.economy.economyEnabled && this.roundRealStake > 0;
      this.roundNominalBudget = this.economyActiveForRound
        ? round2(this.roundRealStake * this.economy.maxRtpPct)
        : 0;
      this.roundMaxPayout = this.roundNominalBudget;
      this.crashSelectAttempts = 0;
      return;
    }

    if (this.overrides.winMode === "win") {
      this.crashPoint = round2(Math.min(this.computeWinModeCrash(), HARD_CAP_MULTIPLIER));
      this.economyActiveForRound = false;
      this.roundMaxPayout = 0;
      this.roundNominalBudget = 0;
      this.crashSelectAttempts = 0;
      return;
    }

    if (!this.economy.economyEnabled || this.roundRealStake <= 0) {
      // No real stakes — nobody has money on the line, so fly an enticing
      // "lure" round skewed toward higher multipliers instead of the normal
      // budget-constrained table, to make watchers want to place a bet.
      this.crashPoint = generateWeightedCrash(Math.random, NO_BET_LURE_TIERS);
      this.economyActiveForRound = false;
      this.roundMaxPayout = 0;
      this.roundNominalBudget = 0;
      this.crashSelectAttempts = 1;
      return;
    }

    if (this.overrides.winMode === "protect") {
      // Deliberately conservative disclosed table (70% 1.00-1.30x, 28%
      // 1.30-2.00x, 2% 2.00-2.50x) instead of the RTP formula — for a
      // thin-reserve launch window. Still a genuine random draw with no
      // knowledge of bet amounts; only the shape of the distribution
      // changes. The live budget/circuit-breaker still applies underneath
      // it, same as normal mode.
      this.crashPoint = round2(
        Math.min(generateWeightedCrash(Math.random, PROTECT_MODE_TIERS), HARD_CAP_MULTIPLIER),
      );
      this.roundNominalBudget = round2(this.roundRealStake * this.economy.maxRtpPct);
      this.roundMaxPayout = computeSafetyCeiling(
        this.roundRealStake,
        this.economy.maxRtpPct,
        this.bankroll,
      );
      this.economyActiveForRound = true;
      this.crashSelectAttempts = 1;

      console.log(
        `[RoundEconomy][protect] stake=${this.roundRealStake} maxPayout=${this.roundMaxPayout} ` +
        `crash=${this.crashPoint}`,
      );
      return;
    }

    // Fair Mode: the sub-mode is picked from the current reserve alone
    // (never from bet amounts), so it's a disclosed, uniform rule applied
    // identically to every player in the round — see selectFairSubMode.
    this.fairSubMode = selectFairSubMode(this.bankroll, Math.random);
    this.crashPoint = round2(
      Math.min(generateWeightedCrash(Math.random, fairTiersFor(this.fairSubMode)), HARD_CAP_MULTIPLIER),
    );
    this.roundNominalBudget = round2(this.roundRealStake * this.economy.maxRtpPct);
    this.roundMaxPayout = computeSafetyCeiling(
      this.roundRealStake,
      this.economy.maxRtpPct,
      this.bankroll,
    );
    this.economyActiveForRound = true;
    this.crashSelectAttempts = 1;

    console.log(
      `[RoundEconomy][fair:${this.fairSubMode}] reserve=${this.bankroll} stake=${this.roundRealStake} ` +
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
        `[GameEngine] Admin controls loaded: winMode=${controls.win_mode} rtp=${controls.max_rtp_pct}`,
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
    this.roundNominalBudget = 0;
    this.roundPaidOut = 0;
    this.economyActiveForRound = false;
    this.crashSelectAttempts = 0;
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
      const bets = this.allBets();
      this.emit("tick:multiplier", {
        multiplier: this.multiplier,
        bets,
        totalWin: this.sumTotalWin(),
      });
    }, TICK_MS);
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
      simCashoutTarget: assignSimCashoutTarget(),
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

  /**
   * Elapsed-real-time raw multiplier — the true mathematical value right
   * now, independent of the tick loop's cache. `this.multiplier` (and any
   * caller-supplied snapshot) only refreshes once per TICK_MS and can be
   * up to that long behind, which matters a lot right at flight start:
   * ~30% of real-money rounds have crashPoint === 1.00 exactly (per the
   * RTP formula), and there's a real window before the first tick where
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
