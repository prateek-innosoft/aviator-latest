export type GamePhase = "betting" | "flying" | "crashed";

export interface RoundHistoryItem {
  id: string;
  multiplier: number;
}

export interface LiveBet {
  id: string;
  name: string;
  avatar: number;
  bet: number;
  cashedOutAt: number | null;
  win: number | null;
  cashedOut: boolean;
}

export interface PublicRoundState {
  phase: GamePhase;
  roundId: string;
  multiplier: number;
  countdown: number;
  hashedSeed: string;
  history: RoundHistoryItem[];
  bets: LiveBet[];
  totalBets: number;
  totalWin: number;
}

export type BetMode = "bet" | "auto";

export interface PanelState {
  mode: BetMode;
  amount: number;
  /** Has an active bet placed this round (or queued). */
  active: boolean;
  /** Bet is queued for next round (placed during flying/crashed). */
  queued: boolean;
  /** Has cashed out this round. */
  cashedOut: boolean;
  cashedOutAt: number | null;
  win: number | null;
  autoBet: boolean;
  autoCashOut: boolean;
  autoCashOutValue: number;
  /** Prevents duplicate cash-out emits while waiting for server ack. */
  cashOutPending: boolean;
  /** True when the active bet was placed via the authenticated (DB) path. */
  betIsAuthenticated: boolean;
}
