import { create } from "zustand";
import { clientSessionId, socket } from "../lib/socket";
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
  /** Admin-controlled bet limits, synced from server. */
  betLimits: { minBet: number; maxBet: number };
  /** Toast for bet rejection messages. */
  betErrorToast: { msg: string; at: number } | null;

  setPanel: (panel: 0 | 1, patch: Partial<PanelState>) => void;
  placeBet: (panel: 0 | 1) => void;
  cancelBet: (panel: 0 | 1) => void;
  cashOut: (panel: 0 | 1) => void;
  setAuth: (auth: { userId: string | null; accessToken: string | null }) => void;
  init: () => void;
}

function sumBetWins(bets: LiveBet[]): number {
  return Math.round(bets.reduce((acc, b) => acc + (b.win ?? 0), 0) * 100) / 100;
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
    autoCashOutValue: 1.15,
    cashOutPending: false,
    betIsAuthenticated: false,
  };
}

// Module-level (not per-store-instance) so it survives even if create<>()
// were ever called more than once — see the comment in init() below.
let initialized = false;

// ── Smooth 60fps multiplier ──────────────────────────────────────────────────
// The server only ticks the authoritative multiplier every ~50ms, which reads
// steppy. Instead of trusting that value directly for display, we EXTRAPOLATE
// it forward every animation frame from the most recent server tick using the
// exact same growth curve the server uses (exp(GROWTH·t)). Each server tick
// re-anchors us (correcting any drift), so the number stays authoritative but
// climbs buttery-smooth at the screen's refresh rate on both the player page
// and the admin panel (they share this store). MUST match the backend GROWTH.
const GROWTH = 0.16;
let rafId: number | null = null;
let anchorMult = 1.0;      // last server-confirmed multiplier
let anchorAt = 0;          // performance.now() when that value was received
let flightStartedAtServer: number | null = null;
let serverClockOffsetMs: number | null = null; // server Date.now() - browser Date.now()

function syncServerClock() {
  const sentAt = Date.now();
  socket.emit("time:sync", (reply: { serverTime?: number }) => {
    if (!Number.isFinite(reply?.serverTime)) return;
    const receivedAt = Date.now();
    // NTP-style midpoint removes roughly half of the round-trip latency. This
    // matters on polling tunnels where packets may arrive hundreds of ms late.
    serverClockOffsetMs = reply.serverTime! - (sentAt + receivedAt) / 2;
    if (useGame.getState().phase === "flying") startMultiplierAnim();
  });
}

function stopMultiplierAnim() {
  if (rafId != null && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(rafId);
  rafId = null;
}

function startMultiplierAnim() {
  if (typeof requestAnimationFrame === "undefined") return;
  stopMultiplierAnim();
  const loop = () => {
    const s = useGame.getState();
    if (s.phase !== "flying") { rafId = null; return; }
    const display = flightStartedAtServer != null && serverClockOffsetMs != null
      ? Math.floor(
          Math.exp(
            GROWTH * Math.max(0, (Date.now() + serverClockOffsetMs - flightStartedAtServer) / 1000),
          ) * 100,
        ) / 100
      : Math.floor(
          anchorMult * Math.exp(GROWTH * Math.max(0, (performance.now() - anchorAt) / 1000)) * 100,
        ) / 100;
    if (display !== s.multiplier) useGame.setState({ multiplier: display });
    rafId = requestAnimationFrame(loop);
  };
  rafId = requestAnimationFrame(loop);
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
  balance: 50000, // placeholder until "init" echoes the real (persistent) server balance
  currency: "INR",
  crashFlash: null,
  flyingStartedAt: null,
  panels: [defaultPanel(100), defaultPanel(100)],
  lastWinToast: null,
  userId: null,
  accessToken: null,
  betLimits: { minBet: 1, maxBet: 50000 },
  betErrorToast: null,

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
    if (p.amount < s.betLimits.minBet) {
      set({ betErrorToast: { msg: `Minimum bet is ${s.betLimits.minBet} INR`, at: Date.now() } });
      return;
    }
    if (p.amount > s.betLimits.maxBet) {
      set({ betErrorToast: { msg: `Maximum bet is ${s.betLimits.maxBet} INR`, at: Date.now() } });
      return;
    }
    if (p.amount > s.balance) return;
    const userId = s.userId;
    const isAuth = !!userId;
    if (s.phase === "betting") {
      // Balance is deducted by the server, which echoes the authoritative
      // value back via "bet:accepted". No optimistic mutation here — that was
      // the source of balance flicker/desync.
      // autoCashOutTarget lets the server resolve the cash-out itself, in its
      // own tick loop — exact, no client round-trip to overshoot or race.
      const autoCashOutTarget = p.autoCashOut ? p.autoCashOutValue : null;
      socket.emit("bet:place", { panel, amount: p.amount, autoCashOutTarget, clientId: clientSessionId, ...(isAuth ? { userId } : {}) });
      get().setPanel(panel, { active: true, betIsAuthenticated: isAuth });
    } else {
      // Queue for next round. The server only takes the money when the bet is
      // actually placed at the start of the next round, so we do NOT deduct now.
      get().setPanel(panel, { queued: true, betIsAuthenticated: isAuth });
    }
  },

  cancelBet: (panel) => {
    const s = get();
    const p = s.panels[panel];
    const userId = s.userId;
    // Use the path that matches how the bet was placed, not current auth state.
    const isAuth = p.betIsAuthenticated && !!userId;

    // A still-queued bet was never sent to the server, so there's nothing to
    // refund — just clear the panel locally.
    if (p.queued && !p.active) {
      get().setPanel(panel, { active: false, queued: false });
      return;
    }

    // Active bet: server refunds and echoes the authoritative balance back via
    // "bet:cancelled". No optimistic refund here.
    socket.emit("bet:cancelWithAmount", { panel, amount: p.amount, clientId: clientSessionId, ...(isAuth ? { userId } : {}) });
    get().setPanel(panel, { active: false, queued: false });
  },

  cashOut: (panel) => {
    const s = get();
    const p = s.panels[panel];
    if (!p.active || p.cashedOut || p.cashOutPending) return;
    if (s.phase !== "flying") return;
    const userId = s.userId;
    // Only send userId if the bet was PLACED as authenticated — prevents
    // the backend trying to find a DB bet that doesn't exist.
    const isAuth = p.betIsAuthenticated && !!userId;
    get().setPanel(panel, { cashOutPending: true });
    socket.emit("bet:cashout", { panel, clientId: clientSessionId, ...(isAuth ? { userId } : {}) });
  },

  init: () => {
    // React StrictMode (dev only) intentionally mounts effects twice without
    // waiting for cleanup, and this effect never returns one — so without
    // this guard every socket.on() below gets registered twice on the
    // shared `socket` singleton. That means every event fires its handler
    // twice: two bet:place emits per auto-bet round, the engine's duplicate
    // check silently cancel-refunds the first (already-accepted) bet, and
    // the stale balance never corrects — the multiplier can clear the
    // target with nothing left to actually cash out. Real bug, not just a
    // dev nuisance: guard so init() only ever wires listeners once.
    if (initialized) return;
    initialized = true;
    socket.on("connect", () => {
      set({ connected: true });
      syncServerClock();
    });
    socket.on("disconnect", () => { stopMultiplierAnim(); set({ connected: false }); });
    if (socket.connected) {
      set({ connected: true });
      syncServerClock();
    }

    // Browsers pause requestAnimationFrame entirely while a tab is hidden, but
    // don't clear rafId just because the callback stopped firing — so a stale
    // loop can sit dormant instead of cleanly resuming. tick:multiplier and
    // round:crashed keep updating anchorMult/anchorAt/phase correctly the whole
    // time (they aren't rAF-gated), so on return we just need a clean restart
    // of the animation from that already-correct state — not a resync.
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState !== "visible") return;
        syncServerClock();
        stopMultiplierAnim();
        if (get().phase === "flying") startMultiplierAnim();
      });
    }

    socket.on(
      "init",
      (data: { state: PublicRoundState; balance: number; currency: string; betLimits?: { minBet: number; maxBet: number } }) => {
        const st = data.state;
        // "init" always carries the shared DEMO balance — the server doesn't
        // yet know this socket is authenticated at connection time. If we're
        // already logged in (e.g. reconnecting after a brief drop), applying
        // it would flash the wrong number before the real one lands a moment
        // later via "balance:sync" (from the auth:identify round-trip).
        const alreadyAuthed = get().userId != null;
        set({
          phase: st.phase,
          roundId: st.roundId,
          multiplier: st.multiplier,
          countdown: st.countdown,
          history: st.history,
          bets: st.bets,
          totalBets: st.totalBets,
          totalWin: st.totalWin,
          ...(alreadyAuthed ? {} : { balance: data.balance }),
          currency: data.currency,
          flyingStartedAt: st.phase === "flying" && st.flightStartedAt
            ? st.flightStartedAt - (serverClockOffsetMs ?? 0)
            : null,
          ...(data.betLimits ? { betLimits: data.betLimits } : {}),
        });
        // Clamp panel amounts to the received bet limits.
        if (data.betLimits) {
          const bl = data.betLimits;
          set((s) => {
            const panels = s.panels.map((panel) => ({
              ...panel,
              amount: Math.max(bl.minBet, Math.min(bl.maxBet, panel.amount)),
            })) as [PanelState, PanelState];
            return { panels };
          });
        }
        // Reconnected mid-flight — anchor and start the smooth loop.
        if (st.phase === "flying") {
          flightStartedAtServer = st.flightStartedAt;
          anchorMult = st.multiplier;
          anchorAt = performance.now();
          startMultiplierAnim();
        }
      },
    );

    socket.on("round:betting", (st: PublicRoundState) => {
      stopMultiplierAnim();
      flightStartedAtServer = null;
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
          cashOutPending: false,
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
      // The server deducts the balance once and echoes the authoritative value
      // back via "bet:accepted" — the client never mutates balance itself.
      wantsBet.forEach((want, i) => {
        const s = get();
        const p = s.panels[i];
        const wasQueued = prev[i].queued;
        if (!want) return;
        const userId = s.userId;
        const isAuth = !!userId;
        if (wasQueued) {
          const autoCashOutTarget = p.autoCashOut ? p.autoCashOutValue : null;
          socket.emit("bet:place", { panel: i, amount: p.amount, autoCashOutTarget, clientId: clientSessionId, ...(isAuth ? { userId } : {}) });
          s.setPanel(i as 0 | 1, { active: true, queued: false, betIsAuthenticated: isAuth });
        } else if (prev[i].autoBet && p.mode === "auto" && p.amount <= s.balance) {
          // Auto Cash Out only ever fires while mode === "auto" (see tick:multiplier
          // below) — Auto Bet must require the same, or switching to the "Bet" tab
          // leaves auto-bet silently placing bets every round with no way to ever
          // auto-cash-out, draining the balance with no recourse.
          get().placeBet(i as 0 | 1);
        }
      });
    });

    socket.on("tick:countdown", (p: { countdown: number }) =>
      set({ countdown: p.countdown }),
    );

    socket.on("round:flying", (st: PublicRoundState) => {
      flightStartedAtServer = st.flightStartedAt;
      set({
        phase: "flying",
        multiplier: 1.0,
        flyingStartedAt: st.flightStartedAt
          ? st.flightStartedAt - (serverClockOffsetMs ?? 0)
          : Date.now(),
        bets: st.bets,
        totalBets: st.totalBets,
        totalWin: st.totalWin,
      });
      // Anchor the smooth-multiplier extrapolation at 1.00x and start the
      // 60fps loop; server ticks re-anchor it as they arrive.
      anchorMult = 1.0;
      anchorAt = performance.now();
      startMultiplierAnim();
    });

    socket.on(
      "tick:multiplier",
      (p: { multiplier: number; bets: LiveBet[]; totalWin?: number }) => {
        const totalWin = p.totalWin ?? sumBetWins(p.bets);
        // Re-anchor the smooth extrapolation to this authoritative value; the
        // rAF loop drives the displayed `multiplier` between ticks. (While not
        // flying — e.g. the final crash tick — set it directly as a fallback.)
        anchorMult = p.multiplier;
        anchorAt = performance.now();
        if (get().phase === "flying" && rafId != null) {
          set({ bets: p.bets, totalWin });
        } else {
          set({ multiplier: p.multiplier, bets: p.bets, totalWin });
        }

      },
    );

    socket.on(
      "round:crashed",
      (p: {
        multiplier: number;
        history: RoundHistoryItem[];
        balance?: number;
      }) => {
        // Stop the smooth loop and snap to the authoritative crash value.
        stopMultiplierAnim();
        flightStartedAtServer = null;
        set((s) => {
          const panels = s.panels.map((panel) => ({
            ...panel,
            active: false,
            cashOutPending: false,
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

    socket.on("bet:rejected", (p: { panel: 0 | 1; reason?: string; minBet?: number; maxBet?: number }) => {
      // The client never deducted optimistically, so there's nothing to revert.
      // Balance stays as the server reported it; just clear the panel state.
      get().setPanel(p.panel, { active: false, queued: false });
      // No toast for phase/duplicate — these are expected during normal play.
      // No toast for session_expired either — the "auth:failed" handler already
      // shows a clear message for that; a second toast here would just repeat it
      // with the confusing raw upstream reason instead.
      const silentReasons = ["phase", "duplicate", "session_expired"];
      if (p.reason && silentReasons.includes(p.reason)) return;
      // Show user-friendly toast for actionable rejections only.
      const reasonMessages: Record<string, string> = {
        below_min: p.minBet ? `Minimum bet is ${p.minBet} INR` : "Bet amount is too low",
        above_max: p.maxBet ? `Maximum bet is ${p.maxBet} INR` : "Bet amount is too high",
        insufficient: "Insufficient balance",
        server_error: "Server error — please try again",
        invalid_amount: "Invalid bet amount",
        no_wallet: "No wallet found — please log in",
        rejected: "Bet rejected",
        round_not_ready: "Round isn't ready yet — please try again",
      };
      const msg = p.reason ? (reasonMessages[p.reason] ?? p.reason) : "Bet rejected";
      set({ betErrorToast: { msg, at: Date.now() } });
    });

    // Admin updates bet limits — sync immediately and clamp panel amounts.
    socket.on("betLimits:update", (p: { minBet: number; maxBet: number }) => {
      set((s) => {
        const panels = s.panels.map((panel) => ({
          ...panel,
          amount: Math.max(p.minBet, Math.min(p.maxBet, panel.amount)),
        })) as [PanelState, PanelState];
        return { betLimits: { minBet: p.minBet, maxBet: p.maxBet }, panels };
      });
    });

    // Server restores persistent balance after reconnect.
    socket.on("balance:sync", (p: { balance: number }) => {
      set({ balance: p.balance });
    });

    // Platform session token was missing/invalid/expired — the server never
    // marked this socket authed, so it silently plays on the demo wallet.
    // Surface that instead of leaving a real player wondering why nothing's
    // hitting their real balance.
    socket.on("auth:failed", () => {
      set({ userId: null, accessToken: null, betErrorToast: { msg: "Session expired — playing in demo mode", at: Date.now() } });
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
          cashOutPending: false,
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

    socket.on("bet:cashout_failed", (p: { panel: 0 | 1; reason?: string }) => {
      // active stays true here on purpose — the bet may still be live (e.g.
      // a transient RPC error) and the next tick can retry. Only tell the
      // player when the round is genuinely gone, so a real miss isn't
      // silent — this was previously silent, which read exactly like "the
      // multiplier passed my target but nothing happened."
      get().setPanel(p.panel, { cashOutPending: false });
      if (p.reason === "round_ended" || p.reason === "not_flying") {
        set({ betErrorToast: { msg: "Missed it — the round ended before your cash out went through", at: Date.now() } });
      } else if (p.reason === "budget_exhausted") {
        set({ betErrorToast: { msg: "Round capped — bet settled at the payout limit", at: Date.now() } });
      } else if (p.reason === "bet_not_found") {
        set({ betErrorToast: { msg: "Cash out could not find your active bet - please try once more", at: Date.now() } });
      } else if (p.reason === "rejected") {
        set({ betErrorToast: { msg: "Cash out could not be completed - please try again", at: Date.now() } });
      }
    });
  },
}));
