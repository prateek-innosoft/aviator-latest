import { useEffect, useState, useCallback, useRef } from "react";
import { LogOut, RefreshCw, Check, ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "../lib/authContext";
import { adminApi, adminFmt, type AdminRoundEconomyEvent } from "./api";
import { useGame } from "../store/gameStore";
import { socket } from "../lib/socket";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Toast = { msg: string; ok: boolean } | null;

// ─────────────────────────────────────────────────────────────────────────────
// Small shared helpers
// ─────────────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Standalone Admin Login — shown at /admin before credentials are verified
// ─────────────────────────────────────────────────────────────────────────────
export function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const { login, error: authError, clearError } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");

  // The context `loading` flag briefly unmounts this component during a login
  // attempt, so a locally-set error can be lost on remount. `authError` from
  // context survives that remount, so we show whichever error is present.
  const shownError =
    err ||
    (authError === "Invalid email or password" ? "Invalid email or password." :
     authError === "Too many attempts. Try again in 15 min." ? "Too many attempts. Wait 15 min." :
     authError === "Network error" ? "Network error. Please try again." :
     authError ? "Login failed. Please try again." : "");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    clearError();
    setLoading(true);
    const result = await login(email.trim().toLowerCase(), password);
    setLoading(false);
    if (!result.ok) {
      setErr(
        result.reason === "invalid_credentials" ? "Invalid email or password." :
        result.reason === "too_many_attempts"   ? "Too many attempts. Wait 15 min." :
        "Login failed. Please try again."
      );
      return;
    }
    onLogin();
  };

  const f = "w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] text-gray-800 placeholder-gray-300 outline-none transition focus:border-gray-400 focus:bg-white";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-4" data-testid="admin-login">
      <div className="w-full max-w-[360px]">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e8173a] shadow-lg shadow-[#e8173a]/30">
            <svg viewBox="0 0 24 24" className="h-6 w-6 fill-none stroke-white" strokeWidth="2.5">
              <path d="M5 19L19 5M19 5H9M19 5v10" />
            </svg>
          </div>
          <div className="text-center">
            <h1 className="text-[22px] font-black text-gray-900">Aviator Admin</h1>
            <p className="text-[13px] text-gray-400">Sign in to manage the game</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Admin Email</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="admin@aviator.com" className={f} autoFocus data-testid="admin-email" />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" className={f} data-testid="admin-password" />
          </div>

          {shownError && (
            <div data-testid="admin-login-error" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-600">{shownError}</div>
          )}

          <button type="submit" disabled={loading} data-testid="admin-login-submit"
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e8173a] py-3.5 text-[14px] font-bold text-white shadow-md shadow-[#e8173a]/25 transition hover:bg-[#c9122f] disabled:opacity-60">
            {loading ? <Spinner /> : null}
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-gray-300">
          Only admin and superadmin accounts can access this panel.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NumStepper — ▼ value ▲
// ─────────────────────────────────────────────────────────────────────────────
function NumStepper({ label, value, onChange, min = 1, max = 100, step = 1, suffix = "R", testId, onFocus, onBlur }: {
  label: string; value: string; onChange: (v: string) => void;
  min?: number; max?: number; step?: number; suffix?: string; testId?: string;
  onFocus?: () => void; onBlur?: () => void;
}) {
  const nudge = (dir: 1 | -1) => {
    const next = Math.max(min, Math.min(max, +(+value + step * dir).toFixed(2)));
    onChange(String(next));
  };
  const tid = testId ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return (
    <div className="flex flex-col gap-1.5" data-testid={`stepper-${tid}`}>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
        <button onClick={() => nudge(-1)} data-testid={`stepper-${tid}-dec`} className="flex h-10 w-9 shrink-0 items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-95">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-0.5">
          <input type="number" value={value} min={min} max={max} step={step}
            data-testid={`stepper-${tid}-input`}
            onFocus={onFocus}
            onChange={e => onChange(e.target.value)}
            onBlur={() => {
              const n = Number(value);
              if (value === "" || !Number.isFinite(n)) onChange(String(min));
              onBlur?.();
            }}
            className="w-full bg-transparent text-center text-[15px] font-bold text-gray-800 outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <span className="text-[11px] font-semibold text-gray-400">{suffix}</span>
        </div>
        <button onClick={() => nudge(1)} data-testid={`stepper-${tid}-inc`} className="flex h-10 w-9 shrink-0 items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-95">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Multiplier pill colour by value
// ─────────────────────────────────────────────────────────────────────────────
const pillColor = (cp: number) =>
  cp >= 10 ? "bg-emerald-100 text-emerald-700"
: cp >= 3  ? "bg-sky-100 text-sky-600"
: cp >= 2  ? "bg-gray-100 text-gray-500"
           : "bg-red-100 text-red-500";

// ─────────────────────────────────────────────────────────────────────────────
// LiveTicker — live game state in the top bar
// ─────────────────────────────────────────────────────────────────────────────
function LiveTicker() {
  const phase      = useGame(s => s.phase);
  const multiplier = useGame(s => s.multiplier);
  const countdown  = useGame(s => s.countdown);
  const history    = useGame(s => s.history);

  const isFlying  = phase === "flying";
  const isCrashed = phase === "crashed";
  const isBetting = phase === "betting";

  const multColor = isFlying ? "text-emerald-600" : isCrashed ? "text-red-500" : "text-gray-400";
  const dotColor  = isFlying ? "bg-emerald-500 animate-pulse" : isCrashed ? "bg-red-500" : "bg-amber-400 animate-pulse";
  const phaseLabel = isFlying ? "LIVE" : isCrashed ? "CRASHED" : `${(countdown / 1000).toFixed(1)}s`;

  return (
    <div className="ml-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{phaseLabel}</span>
        <span className={`min-w-[3.2rem] text-right text-[17px] font-black tabular-nums leading-none ${multColor}`} data-testid="admin-live-multiplier">
          {isBetting ? "—" : `${multiplier.toFixed(2)}×`}
        </span>
      </div>

      {history.length > 0 && (
        <div className="hidden items-center gap-1 xl:flex">
          {history.slice(0, 8).map((r, i) => (
            <span key={r.id ?? i} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${pillColor(r.multiplier)}`}>
              {r.multiplier.toFixed(2)}×
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RoundHistory — the current round shows IMMEDIATELY (live), finished rounds below
// ─────────────────────────────────────────────────────────────────────────────
function RoundHistory({ liveEconomy }: { liveEconomy: AdminRoundEconomyEvent | null }) {
  const phase      = useGame(s => s.phase);
  const multiplier = useGame(s => s.multiplier);
  const countdown  = useGame(s => s.countdown);
  const history    = useGame(s => s.history);

  const liveLabel =
    phase === "betting" ? `Betting · ${(countdown / 1000).toFixed(1)}s` :
    phase === "flying"  ? "In flight" :
    "Crashed";
  const liveBadge =
    phase === "betting" ? "bg-amber-100 text-amber-700" :
    phase === "flying"  ? "bg-emerald-100 text-emerald-700" :
    "bg-red-100 text-red-600";
  const liveValue = phase === "betting" ? "—" : `${multiplier.toFixed(2)}×`;

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" data-testid="round-history">
      <div className="mb-4">
        <h2 className="text-[15px] font-bold text-gray-900">Round History</h2>
        <p className="text-[12px] text-gray-400">The current round appears live and updates every moment — you don't wait for it to finish.</p>
      </div>

      {/* Current round — visible immediately */}
      <div
        data-testid="round-history-current"
        className="mb-4 flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3"
      >
        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${liveBadge}`}>
          {liveLabel}
        </span>
        {liveEconomy?.fairSubMode && (
          <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white">
            {liveEconomy.fairSubMode}
          </span>
        )}
        <span
          className={`ml-auto text-[22px] font-black tabular-nums leading-none ${
            phase === "flying" ? "text-emerald-600" : phase === "crashed" ? "text-red-500" : "text-gray-400"
          }`}
        >
          {liveValue}
        </span>
      </div>

      {/* Finished rounds */}
      <div className="flex flex-wrap gap-1.5" data-testid="round-history-list">
        {history.length === 0 && <span className="text-[12px] text-gray-400">No finished rounds yet.</span>}
        {history.slice(0, 40).map((r, i) => (
          <span key={r.id ?? i} className={`rounded-md px-2 py-1 text-[11px] font-bold tabular-nums ${pillColor(r.multiplier)}`}>
            {r.multiplier.toFixed(2)}×
          </span>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main admin panel
// ─────────────────────────────────────────────────────────────────────────────
export function RateControlPanel({ token }: { token: string }) {
  const { profile, logout } = useAuth();
  const init = useGame(s => s.init);

  useEffect(() => { init(); }, [init]);

  // "fair" = reserve-driven tables, "protect" = fixed conservative table,
  // "custom" = a fixed crash the admin types in.
  const [crashMode, setCrashMode]         = useState<"fair" | "protect" | "custom">("fair");
  const [customCrash, setCustomCrash]     = useState("2.00");
  const [minBet, setMinBet]               = useState("1");
  const [maxBet, setMaxBet]               = useState("50000");
  const [liveEconomy, setLiveEconomy]     = useState<AdminRoundEconomyEvent | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [toast, setToast]                 = useState<Toast>(null);
  const [reserveInput, setReserveInput]   = useState("200000");
  const [reserveSaving, setReserveSaving] = useState(false);
  // The crash value actually armed on the server right now — null when
  // Custom mode isn't active. Deliberately separate from `customCrash`
  // (the editable draft in the input box): typing must never look like it
  // already took effect before Set is clicked.
  const [activeCustomCrash, setActiveCustomCrash] = useState<number | null>(null);
  const [customCrashSaving, setCustomCrashSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitSeqRef = useRef(0);
  const dirtyRef = useRef(false);
  // True while the admin is actively editing the reserve input — pauses the
  // live socket sync below so an in-progress edit doesn't get overwritten
  // out from under them.
  const reserveDirtyRef = useRef(false);
  // True only while the admin is actively typing an un-set custom crash
  // value. Deliberately separate from dirtyRef (which stays true forever
  // after the admin's first edit anywhere on this page, until Refresh) —
  // the mode selector needs to keep reflecting Custom mode's automatic
  // one-round revert live regardless of unrelated edits elsewhere.
  const customEditingRef = useRef(false);
  const show = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2200); };

  const load = useCallback(async (force = false) => {
    if (force) dirtyRef.current = false;
    setLoading(true);
    try {
      const { controls } = await adminApi.getControls(token);
      // Status, not draft — always reflect the truth regardless of dirtyRef.
      setActiveCustomCrash(controls.forced_crash);
      if (force || !dirtyRef.current) {
        setMinBet(String(controls.min_bet));
        setMaxBet(String(controls.max_bet));
        setCrashMode(
          controls.forced_crash != null ? "custom" :
          controls.win_mode === "protect" ? "protect" : "fair",
        );
        if (controls.forced_crash != null && !customEditingRef.current) {
          setCustomCrash(String(controls.forced_crash));
        }
      }
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    adminApi.getReserve(token)
      .then(({ reserve }) => setReserveInput(String(reserve)))
      .catch(() => { /* the live economy feed will still show it once a round runs */ });
  }, [token]);

  const commitReserve = useCallback(async () => {
    const amount = Number(reserveInput);
    if (!Number.isFinite(amount) || amount < 0) {
      show("Reserve must be a non-negative number", false);
      return;
    }
    setReserveSaving(true);
    try {
      const { reserve } = await adminApi.setReserve(token, amount);
      reserveDirtyRef.current = false;
      setReserveInput(String(reserve));
      show(`Reserve set to ${adminFmt.fmt(reserve)}`, true);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Failed to set reserve", false);
    } finally {
      setReserveSaving(false);
    }
  }, [token, reserveInput]);

  useEffect(() => {
    const onEcon = (p: AdminRoundEconomyEvent) => {
      setLiveEconomy(p);
      // Keep the editable reserve field live too — it used to only load once
      // on mount, so it silently went stale while the page sat open, and
      // clicking "Set" with that stale number would wipe out real reserve
      // growth that happened since. Skip the sync while the admin is
      // actively editing it themselves.
      if (!reserveDirtyRef.current) setReserveInput(String(p.reserve));
    };
    socket.on("admin:roundEconomy", onEcon);
    return () => { socket.off("admin:roundEconomy", onEcon); };
  }, []);

  useEffect(() => {
    // Custom mode auto-reverts server-side after its one round (see
    // gameEngine.ts). Pick that reversion up live so the Game Mode selector
    // snaps back to Fair/Protect on its own, instead of continuing to show
    // "Custom" for a mode that's no longer actually active. Gated only by
    // customEditingRef (not the page-wide dirtyRef) — an edit to bet limits
    // or an earlier mode click must not permanently block this from then on.
    const onControls = (p: { win_mode: "normal" | "protect"; forced_crash: number | null }) => {
      // Status, not draft — always reflect the truth so the panel can never
      // claim a value is active when the server has already reverted it.
      setActiveCustomCrash(p.forced_crash);
      if (customEditingRef.current) return;
      setCrashMode(
        p.forced_crash != null ? "custom" :
        p.win_mode === "protect" ? "protect" : "fair",
      );
      if (p.forced_crash != null) setCustomCrash(String(p.forced_crash));
    };
    socket.on("admin:controls", onControls);
    return () => { socket.off("admin:controls", onControls); };
  }, []);

  const commit = useCallback(async (
    mode: "fair" | "protect" | "custom",
    customC: string,
    minB: string,
    maxB: string,
  ) => {
    const min = Number(minB);
    const max = Number(maxB);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    if (min < 0.01 || max < 1 || min > max) return;

    let forced_crash: number | null = null;
    if (mode === "custom") {
      const c = Number(customC);
      if (!Number.isFinite(c) || c < 1 || c > 130) return;
      forced_crash = Math.round(c * 100) / 100;
    }

    setSaving(true);
    const seq = ++commitSeqRef.current;
    try {
      await adminApi.patchControls(token, {
        win_mode: mode === "protect" ? "protect" : "normal",
        forced_crash,
        min_bet: Math.round(min * 100) / 100,
        max_bet: Math.round(max * 100) / 100,
      });
      if (seq !== commitSeqRef.current) return;
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch (e: unknown) {
      if (seq === commitSeqRef.current) {
        show(e instanceof Error ? e.message : "Save failed", false);
      }
    } finally {
      if (seq === commitSeqRef.current) setSaving(false);
    }
  }, [token]);

  const schedule = (
    mode: "fair" | "protect" | "custom",
    customC: string,
    minB: string,
    maxB: string,
  ) => {
    dirtyRef.current = true;
    const min = Number(minB);
    const max = Number(maxB);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    if (min < 0.01 || max < 1 || min > max) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(mode, customC, minB, maxB), 600);
  };

  const handleMode = (m: "fair" | "protect" | "custom") => {
    setCrashMode(m);
    if (m === "custom") {
      // Only switch the view. Selecting the Custom tab must never by itself
      // arm a forced crash — that only happens when the admin explicitly
      // clicks Set below, with the value they actually typed.
      customEditingRef.current = true;
      return;
    }
    customEditingRef.current = false;
    schedule(m, customCrash, minBet, maxBet);
  };
  const handleCustomCrash = (v: string) => { customEditingRef.current = true; setCustomCrash(v); };
  const commitCustomCrash = useCallback(async () => {
    const c = Number(customCrash);
    if (!Number.isFinite(c) || c < 1 || c > 130) {
      show("Custom crash must be between 1.00× and 130.00×", false);
      return;
    }
    const forced = Math.round(c * 100) / 100;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    customEditingRef.current = false;
    setCustomCrashSaving(true);
    try {
      const { controls } = await adminApi.patchControls(token, { forced_crash: forced });
      setActiveCustomCrash(controls.forced_crash);
      show(`Custom crash set to ${forced.toFixed(2)}× — applies to the next round with real bets, one time only`, true);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Failed to set custom crash", false);
    } finally {
      setCustomCrashSaving(false);
    }
  }, [token, customCrash]);
  const handleMinBet = (v: string) => { setMinBet(v);  schedule(crashMode, customCrash, v, maxBet); };
  const handleMaxBet = (v: string) => { setMaxBet(v);  schedule(crashMode, customCrash, minBet, v); };

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f6f8] text-gray-900">

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className="flex shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#e8173a]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-white" strokeWidth="2.5">
              <path d="M5 19L19 5M19 5H9M19 5v10" />
            </svg>
          </div>
          <span className="text-[14px] font-bold text-gray-900">Aviator</span>
          <span className="rounded-md bg-[#e8173a]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-[#e8173a]">Admin</span>
        </div>

        <LiveTicker />

        <div className="ml-auto flex items-center gap-2">
          <div className={`flex items-center gap-1 text-[11px] transition-opacity duration-200 ${saving || saved ? "opacity-100" : "opacity-0"}`}>
            {saving
              ? <><Spinner /><span className="text-gray-400">Saving…</span></>
              : <><Check className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Saved</span></>
            }
          </div>
          <button onClick={() => load(true)} disabled={loading} title="Refresh" data-testid="admin-refresh"
            className="rounded-lg p-1.5 text-gray-300 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-[#e8173a] to-[#ff6b35] text-[8px] font-black text-white">
              {(profile?.display_name ?? profile?.email ?? "A").charAt(0).toUpperCase()}
            </div>
            <span className="text-[12px] font-medium text-gray-700">{profile?.display_name ?? profile?.username ?? "Admin"}</span>
          </div>
          <button onClick={logout} aria-label="Sign out"
            className="rounded-lg p-1.5 text-gray-300 transition hover:bg-red-50 hover:text-red-500">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="mx-auto w-full max-w-[760px] flex-1 px-5 py-8">

        <div className="mb-6">
          <h1 className="text-[20px] font-black text-gray-900">Game Controls</h1>
          <p className="text-[13px] text-gray-400">Settings apply to every player worldwide, starting next round.</p>
        </div>

        {/* Game Mode card */}
        <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-[15px] font-bold text-gray-900">Game Mode</h2>
            <p className="text-[12px] text-gray-400">Controls the crash-multiplier distribution for every round. (When nobody has bet, the round always flies an exciting lure round regardless of mode.)</p>
          </div>

          {/* 3-position selector */}
          <div className="grid grid-cols-3 gap-3">
            {/* Fair */}
            <button
              onClick={() => handleMode("fair")}
              data-testid="mode-fair"
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition ${
                crashMode === "fair"
                  ? "border-amber-400 bg-amber-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                crashMode === "fair" ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-400"
              }`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2.5">
                  <path d="M12 3v18M3 12h18" />
                </svg>
              </div>
              <div className="text-center">
                <div className={`text-[14px] font-black ${crashMode === "fair" ? "text-amber-600" : "text-gray-400"}`}>Fair</div>
                <div className="mt-0.5 text-[11px] text-gray-400">Reserve-driven tables</div>
              </div>
            </button>

            {/* Protect */}
            <button
              onClick={() => handleMode("protect")}
              data-testid="mode-protect"
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition ${
                crashMode === "protect"
                  ? "border-rose-400 bg-rose-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                crashMode === "protect" ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-400"
              }`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2.5">
                  <path d="M12 3l7 3.5v5c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5v-5L12 3z" />
                </svg>
              </div>
              <div className="text-center">
                <div className={`text-[14px] font-black ${crashMode === "protect" ? "text-rose-600" : "text-gray-400"}`}>Protect</div>
                <div className="mt-0.5 text-[11px] text-gray-400">Conservative table</div>
              </div>
            </button>

            {/* Custom — amber + pulsing "ARMED" badge once a value is actually
                set and waiting for its one round; indigo while just viewing/
                editing the tab with nothing armed yet; plain gray again the
                instant it lands and auto-reverts. */}
            <button
              onClick={() => handleMode("custom")}
              data-testid="mode-custom"
              className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition ${
                crashMode === "custom" && activeCustomCrash != null
                  ? "border-amber-400 bg-amber-50"
                  : crashMode === "custom"
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}>
              {crashMode === "custom" && activeCustomCrash != null && (
                <span
                  data-testid="mode-custom-armed-badge"
                  className="absolute -top-2 right-2 flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow"
                >
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                  Armed
                </span>
              )}
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                crashMode === "custom" && activeCustomCrash != null
                  ? "bg-amber-500 text-white"
                  : crashMode === "custom"
                  ? "bg-indigo-500 text-white"
                  : "bg-gray-100 text-gray-400"
              }`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2.5">
                  <path d="M12 20V10M12 4v.01M6 20v-6M18 20V8" />
                </svg>
              </div>
              <div className="text-center">
                <div className={`text-[14px] font-black ${
                  crashMode === "custom" && activeCustomCrash != null
                    ? "text-amber-600"
                    : crashMode === "custom"
                    ? "text-indigo-600"
                    : "text-gray-400"
                }`}>Custom</div>
                <div className="mt-0.5 text-[11px] text-gray-400">Fixed crash you set</div>
              </div>
            </button>
          </div>

          {crashMode === "custom" && (
            <div className="mt-4">
              <NumStepper
                testId="customcrash"
                label="Custom crash multiplier"
                value={customCrash}
                onChange={handleCustomCrash}
                onFocus={() => { customEditingRef.current = true; }}
                onBlur={() => { customEditingRef.current = false; }}
                min={1}
                max={130}
                step={0.1}
                suffix="×"
              />
              <button
                onClick={commitCustomCrash}
                disabled={customCrashSaving}
                data-testid="customcrash-set"
                className="mt-2 w-full rounded-lg bg-gray-900 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-gray-700 disabled:opacity-50"
              >
                {customCrashSaving ? "Setting…" : "Set Custom Crash"}
              </button>
              <p className="mt-1.5 text-[11px] text-gray-400">
                {Number(customCrash) !== activeCustomCrash
                  ? `Not applied yet — click Set to arm ${Number(customCrash || 0).toFixed(2)}×.`
                  : "This value is already the active one."}
                {" "}Applies starting the next round, for that one round only — then automatically reverts to whichever mode was active before Custom.
              </p>
            </div>
          )}

          <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-[12px] leading-relaxed text-gray-500" data-testid="mode-status">
            {crashMode === "custom"
              ? activeCustomCrash != null
                ? `Custom mode is ACTIVE: the next round with real bets will crash at exactly ${activeCustomCrash.toFixed(2)}× (one time only, then auto-reverts).`
                : "Custom mode selected, but nothing is armed yet — type a value above and click Set Custom Crash to apply it."
              : crashMode === "protect"
              ? "Protect Mode — a fixed, conservative table for thin-reserve periods: 72% of rounds crash 1.00×–1.30×, 28% crash 1.30×–2.00×. A genuine random draw with no knowledge of bet amounts."
              : "Fair Mode — the crash table is picked by the company reserve below: Tight (reserve < ₹3L), Normal (₹3L–₹7L), or a 70/30 Normal/Bonus mix (reserve ≥ ₹7L). Uniform for every player, never based on bet amounts."}
          </div>
        </section>

        {/* Company Reserve card */}
        <section className="mb-5 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm" data-testid="company-reserve">
          <div className="mb-4">
            <h2 className="text-[15px] font-bold text-gray-900">Company Reserve</h2>
            <p className="text-[12px] text-gray-400">
              A real running ledger — it grows when players lose and shrinks when they win (stake collected − paid out, every round). It also drives which Fair table is active.
            </p>
          </div>

          {liveEconomy && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Live reserve</span>
              <span className="text-[16px] font-black tabular-nums text-emerald-700" data-testid="live-reserve">
                ₹{adminFmt.fmt(liveEconomy.reserve)}
              </span>
              {crashMode === "fair" && liveEconomy.fairSubMode && (
                <span className="ml-auto rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-white">
                  {liveEconomy.fairSubMode} mode
                </span>
              )}
            </div>
          )}

          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            Set reserve (withdraw profit by setting it lower, top it up by setting it higher)
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              value={reserveInput}
              onFocus={() => { reserveDirtyRef.current = true; }}
              onChange={(e) => { reserveDirtyRef.current = true; setReserveInput(e.target.value); }}
              onBlur={() => { reserveDirtyRef.current = false; }}
              data-testid="reserve-input"
              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-[15px] font-bold text-gray-900 outline-none tabular-nums focus:border-gray-400"
            />
            <button
              onClick={commitReserve}
              disabled={reserveSaving}
              data-testid="reserve-set"
              className="shrink-0 rounded-lg bg-gray-900 px-4 py-2 text-[12px] font-bold text-white transition hover:bg-gray-700 disabled:opacity-50"
            >
              {reserveSaving ? "Setting…" : "Set"}
            </button>
          </div>
        </section>

        {/* Round History card — current round is visible immediately */}
        <RoundHistory liveEconomy={liveEconomy} />

        {/* Bet Limits card */}
        <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-[15px] font-bold text-gray-900">Bet Limits</h2>
            <p className="text-[12px] text-gray-400">Minimum and maximum bet amount allowed per round.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumStepper testId="minbet" label="Minimum bet" value={minBet} onChange={handleMinBet} min={1} max={99999} step={10} suffix="R" />
            <NumStepper testId="maxbet" label="Maximum bet" value={maxBet} onChange={handleMaxBet} min={1} max={9999999} step={500} suffix="R" />
          </div>
        </section>

        {/* Guidelines */}
        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-blue-500">How it works</h2>
          <div className="space-y-2 text-[12px] leading-relaxed text-blue-700">
            <p><span className="font-semibold">Modes</span> — with no bets a round flies a wide "lure" table; with real bets it uses Fair (reserve-driven tables), Protect (fixed 72/28 conservative table), or Custom (your exact crash). No round can ever pay out more than the reserve plus that round's own stake.</p>
            <p><span className="font-semibold">Company Reserve</span> is a real ledger — losses grow it, wins shrink it — and it selects the Fair sub-mode (Tight / Normal / Bonus). Set it manually to withdraw or top up.</p>
            <p><span className="font-semibold">Bet Limits</span> apply to all players — bets outside this range are rejected.</p>
            <p className="border-t border-blue-200 pt-2 text-blue-600">Changes save automatically and take effect on the next round. The live multiplier and current round show in the top bar and Round History above.</p>
          </div>
        </section>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl border px-5 py-3 text-[13px] font-semibold shadow-lg ${
          toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"
        }`}>{toast.msg}</div>
      )}
    </div>
  );
}
