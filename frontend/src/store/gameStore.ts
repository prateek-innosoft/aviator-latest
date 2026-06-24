import { create } from "zustand";
import { socket } from "../lib/socket";
import type {
  GamePhase,
  LiveBet,
  PanelState,
  PublicRoundState,
  RoundHistoryItem,
} from "../types";

interface CrashFlash {
  multiplier: number;
  at: number;
}

interface GameState {
  connected: boolean;
  phase: GamePhase;
  roundId: string;
  multiplier: number;
  countdown: number;
  history: RoundHistoryItem[];
  bets: LiveBet[];
  totalBets: number;
  totalWin: number;
  balance: number;
  currency: string;
  crashFlash: CrashFlash | null;
  /** wall-clock ms at which the flying phase began (for animation). */
  flyingStartedAt: number | null;
  panels: [PanelState, PanelState];
  lastWinToast: { panel: number; mult: number; win: number; at: number } | null;
  /** Authenticated user id — null for demo/guest. */
  userId: string | null;
  accessToken: string | null;

  setPanel: (panel: 0 | 1, patch: Partial<PanelState>) => void;
  placeBet: (panel: 0 | 1) => void;
  cancelBet: (panel: 0 | 1) => void;
  cashOut: (panel: 0 | 1) => void;
  setAuth: (auth: { userId: string | null; accessToken: string | null }) => void;
  init: () => void;
}

function defaultPanel(amount: number): PanelState {
  return {
    mode: "bet",
    amount,
    active: false,
    queued: false,
    cashedOut: false,
    cashedOutAt: null,
    win: null,
    autoBet: false,
    autoCashOut: false,
    autoCashOutValue: 1.1,
    betIsAuthenticated: false,
  };
}

export const useGame = create<GameState>((set, get) => ({
  connected: false,
  phase: "betting",
  roundId: "",
  multiplier: 1.0,
  countdown: 5000,
  history: [],
  bets: [],
  totalBets: 0,
  totalWin: 0,
  balance: 1000,
  currency: "ZAR",
  crashFlash: null,
  flyingStartedAt: null,
  panels: [defaultPanel(2), defaultPanel(2)],
  lastWinToast: null,
  userId: null,
  accessToken: null,

  setAuth: ({ userId, accessToken }) => set({ userId, accessToken }),

  setPanel: (panel, patch) =>
    set((s) => {
      const panels = [...s.panels] as [PanelState, PanelState];
      panels[panel] = { ...panels[panel], ...patch };
      return { panels };
    }),

  placeBet: (panel) => {
    const s = get();
    const p = s.panels[panel];
    if (p.active || p.queued) return;
    if (p.amount > s.balance) return;
    const userId = s.userId;
    const isAuth = !!userId;
    if (s.phase === "betting") {
      // Optimistically deduct only for demo users; authenticated users wait for server.
      if (!isAuth) {
        set({ balance: Math.round((s.balance - p.amount) * 100) / 100 });
      }
      socket.emit("bet:place", { panel, amount: p.amount, ...(isAuth ? { userId } : {}) });
      get().setPanel(panel, { active: true, betIsAuthenticated: isAuth });
    } else {
      // Queued: deduct optimistically so UI shows reduced balance immediately.
      set({ balance: Math.round((s.balance - p.amount) * 100) / 100 });
      get().setPanel(panel, { queued: true, betIsAuthenticated: isAuth });
    }
  },

  cancelBet: (panel) => {
    const s = get();
    const p = s.panels[panel];
    const userId = s.userId;
    // Use the path that matches how the bet was placed, not current auth state.
    const isAuth = p.betIsAuthenticated && !!userId;
    if (!isAuth) {
      set({ balance: Math.round((s.balance + p.amount) * 100) / 100 });
    }
    socket.emit("bet:cancelWithAmount", { panel, amount: p.amount, ...(isAuth ? { userId } : {}) });
    get().setPanel(panel, { active: false, queued: false });
  },

  cashOut: (panel) => {
    const s = get();
    const p = s.panels[panel];
    if (!p.active || p.cashedOut) return;
    const userId = s.userId;
    // Only send userId if the bet was PLACED as authenticated — prevents
    // the backend trying to find a DB bet that doesn't exist.
    const isAuth = p.betIsAuthenticated && !!userId;
    socket.emit("bet:cashout", { panel, ...(isAuth ? { userId } : {}) });
  },

  init: () => {
    socket.on("connect", () => set({ connected: true }));
    socket.on("disconnect", () => set({ connected: false }));

    socket.on(
      "init",
      (data: { state: PublicRoundState; balance: number; currency: string }) => {
        const st = data.state;
        set({
          phase: st.phase,
          roundId: st.roundId,
          multiplier: st.multiplier,
          countdown: st.countdown,
          history: st.history,
          bets: st.bets,
          totalBets: st.totalBets,
          totalWin: st.totalWin,
          balance: data.balance,
          currency: data.currency,
          flyingStartedAt: st.phase === "flying" ? Date.now() : null,
        });
      },
    );

    socket.on("round:betting", (st: PublicRoundState) => {
      // Remember which panels wanted to bet this round (queued last round or auto).
      const prev = get().panels;
      const wantsBet = prev.map((p) => p.queued || p.autoBet);

      set((s) => {
        // New round: clear all per-round flags. Queued/auto bets are (re)placed
        // below via placeBet so the server actually registers them.
        const panels = s.panels.map((p) => ({
          ...p,
          active: false,
          queued: false,
          cashedOut: false,
          cashedOutAt: null,
          win: null,
          betIsAuthenticated: false,
        })) as [PanelState, PanelState];
        return {
          phase: "betting",
          roundId: st.roundId,
          multiplier: 1.0,
          countdown: st.countdown,
          bets: st.bets,
          totalBets: st.totalBets,
          totalWin: st.totalWin,
          crashFlash: null,
          flyingStartedAt: null,
          panels,
        };
      });

      // Place queued + auto bets now that we're in the live betting window.
      // Note: queued bets already had their amount deducted from balance when queued,
      // so we emit directly to avoid a double-deduction.
      wantsBet.forEach((want, i) => {
        const s = get();
        const p = s.panels[i];
        const wasQueued = prev[i].queued;
        if (!want) return;
        const userId = s.userId;
        const isAuth = !!userId;
        if (wasQueued) {
          // Re-place queued bet without another balance deduction.
          socket.emit("bet:place", { panel: i, amount: p.amount, ...(isAuth ? { userId } : {}) });
          s.setPanel(i as 0 | 1, { active: true, queued: false, betIsAuthenticated: isAuth });
        } else if (prev[i].autoBet && p.amount <= s.balance) {
          // Auto bet — use normal placeBet which handles deduction.
          get().placeBet(i as 0 | 1);
        }
      });
    });

    socket.on("tick:countdown", (p: { countdown: number }) =>
      set({ countdown: p.countdown }),
    );

    socket.on("round:flying", (st: PublicRoundState) => {
      set({
        phase: "flying",
        multiplier: 1.0,
        flyingStartedAt: Date.now(),
        bets: st.bets,
        totalBets: st.totalBets,
      });
    });

    socket.on(
      "tick:multiplier",
      (p: { multiplier: number; bets: LiveBet[] }) => {
        set({ multiplier: p.multiplier, bets: p.bets });

        // Auto cash-out handling.
        const s = get();
        s.panels.forEach((panel, i) => {
          if (
            panel.active &&
            !panel.cashedOut &&
            panel.autoCashOut &&
            p.multiplier >= panel.autoCashOutValue
          ) {
            get().cashOut(i as 0 | 1);
          }
        });
      },
    );

    socket.on(
      "round:crashed",
      (p: {
        multiplier: number;
        history: RoundHistoryItem[];
        balance?: number;
      }) => {
        set((s) => {
          const panels = s.panels.map((panel) => ({
            ...panel,
            active: false,
          })) as [PanelState, PanelState];
          return {
            phase: "crashed",
            multiplier: p.multiplier,
            history: p.history,
            crashFlash: { multiplier: p.multiplier, at: Date.now() },
            // Sync authoritative balance if server sends it (covers lost bets).
            ...(p.balance != null ? { balance: p.balance } : {}),
            panels,
          };
        });
      },
    );

    socket.on(
      "bet:accepted",
      (p: { panel: 0 | 1; amount: number; balance: number }) => {
        // Sync with authoritative server balance (corrects any optimistic drift).
        if (p.balance != null) set({ balance: p.balance });
      },
    );

    socket.on(
      "bet:cancelled",
      (p: { panel: 0 | 1; balance?: number }) => {
        // Server sends authoritative balance after refund — sync it.
        if (p.balance != null) set({ balance: p.balance });
        get().setPanel(p.panel, { active: false, queued: false });
      },
    );

    socket.on("bet:rejected", (p: { panel: 0 | 1; reason?: string }) => {
      const s = get();
      const panel = s.panels[p.panel];
      // Revert optimistic deduction only for demo users (authenticated users
      // never had it deducted — server sends authoritative balance via balance:sync).
      if (!s.userId) {
        set({ balance: Math.round((s.balance + panel.amount) * 100) / 100 });
      }
      get().setPanel(p.panel, { active: false, queued: false });
    });

    // Server restores persistent balance after reconnect.
    socket.on("balance:sync", (p: { balance: number }) => {
      set({ balance: p.balance });
    });

    socket.on(
      "bet:cashedout",
      (p: {
        panel: 0 | 1;
        multiplier: number;
        win: number;
        balance: number;
      }) => {
        set({ balance: p.balance });
        get().setPanel(p.panel, {
          cashedOut: true,
          cashedOutAt: p.multiplier,
          win: p.win,
          active: false,
        });
        set({
          lastWinToast: {
            panel: p.panel,
            mult: p.multiplier,
            win: p.win,
            at: Date.now(),
          },
        });
      },
    );
  },
}));
