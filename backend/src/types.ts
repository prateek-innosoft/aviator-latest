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
  /** Multiplier the player cashed out at, null if still in / lost. */
  cashedOutAt: number | null;
  win: number | null;
  /** true once the player has cashed out this round. */
  cashedOut: boolean;
}

export interface PublicRoundState {
  phase: GamePhase;
  roundId: string;
  /** Store round-record id — gates authenticated wallet operations for the round. */
  roundRecordId?: string;
  /** Current multiplier during flying phase. */
  multiplier: number;
  /** ms remaining in betting countdown. */
  countdown: number;
  /** Server hashed seed for provable fairness (revealed after crash). */
  hashedSeed: string;
  history: RoundHistoryItem[];
  bets: LiveBet[];
  totalBets: number;
  totalWin: number;
  /** Server wall-clock timestamp when the current flight began. */
  flightStartedAt: number | null;
}

export interface PlaceBetPayload {
  panel: 0 | 1;
  amount: number;
  /** Stable browser-tab identity; survives Socket.IO reconnects mid-round. */
  clientId?: string;
  /** Authenticated user id — required for wallet operations. */
  userId?: string;
  /** If set, the server resolves cash-out itself the instant the live
   * multiplier reaches this value — exact, no client round-trip needed. */
  autoCashOutTarget?: number | null;
}

export interface CancelBetPayload {
  panel: 0 | 1;
  amount: number;
  /** Stable browser-tab identity; survives Socket.IO reconnects mid-round. */
  clientId?: string;
  /** Authenticated user id — required for wallet operations. */
  userId?: string;
}

export interface CashOutPayload {
  panel: 0 | 1;
  /** Stable browser-tab identity; survives Socket.IO reconnects mid-round. */
  clientId?: string;
  /** Authenticated user id — required for wallet operations. */
  userId?: string;
}
