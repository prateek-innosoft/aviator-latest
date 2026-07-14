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
    // token will be available via useAuth session — signal parent
    onLogin();
  };

  const f = "w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-[14px] text-gray-800 placeholder-gray-300 outline-none transition focus:border-gray-400 focus:bg-white";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-4" data-testid="admin-login">
      <div className="w-full max-w-[360px]">
        {/* Logo */}
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
function NumStepper({ label, value, onChange, min = 1, max = 100, step = 1, suffix = "R", testId }: {
  label: string; value: string; onChange: (v: string) => void;
  min?: number; max?: number; step?: number; suffix?: string; testId?: string;
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
            onChange={e => onChange(e.target.value)}
            onBlur={() => {
              const n = Number(value);
              if (value === "" || !Number.isFinite(n)) onChange(String(min));
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
// LiveTicker — live game state
// ─────────────────────────────────────────────────────────────────────────────
function LiveTicker({ liveEconomy }: { liveEconomy: AdminRoundEconomyEvent | null }) {
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

  const pillColor = (cp: number) =>
    cp >= 10 ? "bg-emerald-100 text-emerald-700"
  : cp >= 3  ? "bg-sky-100 text-sky-600"
  : cp >= 2  ? "bg-gray-100 text-gray-500"
             : "bg-red-100 text-red-500";

  const budgetLeft = liveEconomy
    ? Math.max(0, liveEconomy.maxPayout - liveEconomy.paidOut)
    : 0;

  return (
    <div className="ml-4 flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{phaseLabel}</span>
        <span className={`min-w-[3.2rem] text-right text-[17px] font-black tabular-nums leading-none ${multColor}`}>
          {isBetting ? "—" : `${multiplier.toFixed(2)}×`}
        </span>
      </div>

      {liveEconomy?.economyActive && (
        <div className="hidden items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 md:flex">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">Budget</span>
          <span className="text-[12px] font-bold tabular-nums text-emerald-700">
            {adminFmt.fmt(liveEconomy.paidOut)} / {adminFmt.fmt(liveEconomy.maxPayout)}
          </span>
          <span className="text-[10px] text-emerald-600">({adminFmt.fmt(budgetLeft)} left)</span>
        </div>
      )}

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
// Main admin panel — Global Win Rate + Bet Limits only
// ─────────────────────────────────────────────────────────────────────────────
export function RateControlPanel({ token }: { token: string }) {
  const { profile, logout } = useAuth();
  const init = useGame(s => s.init);

  useEffect(() => { init(); }, [init]);

  // "fair" = RTP-formula economy, "protect" = conservative disclosed table
  // (thin-reserve mode), "custom" = admin-entered forced crash
  const [crashMode, setCrashMode]         = useState<"fair" | "protect" | "custom">("fair");
  const [customCrash, setCustomCrash]     = useState("2.00");
  const [minBet, setMinBet]               = useState("1");
  const [maxBet, setMaxBet]               = useState("50000");
  const [economicsEnabled, setEconomicsEnabled] = useState(true);
  const [houseHoldPct, setHouseHoldPct]   = useState("30");
  const [maxRtpPct, setMaxRtpPct]         = useState("70");
  const [liveEconomy, setLiveEconomy]     = useState<AdminRoundEconomyEvent | null>(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [toast, setToast]                 = useState<Toast>(null);
  const [reserveInput, setReserveInput]   = useState("200000");
  const [reserveSaving, setReserveSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitSeqRef = useRef(0);
  const dirtyRef = useRef(false);
  const show = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2200); };

  const load = useCallback(async (force = false) => {
    if (force) dirtyRef.current = false;
    setLoading(true);
    try {
      const { controls } = await adminApi.getControls(token);
      // Don't clobber values the admin has already started editing while the
      // initial (non-forced) fetch was still in flight.
      if (force || !dirtyRef.current) {
        setMinBet(String(controls.min_bet));
        setMaxBet(String(controls.max_bet));
        setCrashMode(
          controls.forced_crash != null ? "custom" :
          controls.win_mode === "protect" ? "protect" : "fair",
        );
        if (controls.forced_crash != null) setCustomCrash(String(controls.forced_crash));
        setEconomicsEnabled(controls.economics_enabled);
        setHouseHoldPct(String(Math.round(controls.house_hold_pct * 100)));
        setMaxRtpPct(String(Math.round(controls.max_rtp_pct * 100)));
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
      .catch(() => { /* live ticker will still show it once a round runs */ });
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
      setReserveInput(String(reserve));
      show(`Reserve set to ${adminFmt.fmt(reserve)}`, true);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Failed to set reserve", false);
    } finally {
      setReserveSaving(false);
    }
  }, [token, reserveInput]);

  useEffect(() => {
    const onEcon = (p: AdminRoundEconomyEvent) => setLiveEconomy(p);
    socket.on("admin:roundEconomy", onEcon);
    return () => { socket.off("admin:roundEconomy", onEcon); };
  }, []);

  const commit = useCallback(async (
    mode: "fair" | "protect" | "custom",
    customC: string,
    minB: string,
    maxB: string,
    econEnabled: boolean,
    holdPct: string,
    _rtpPct: string,
  ) => {
    const min = Number(minB);
    const max = Number(maxB);
    const hold = Number(holdPct);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    if (min < 0.01 || max < 1 || min > max) return;
    if (!Number.isFinite(hold) || hold < 1 || hold > 99) return;

    let forced_crash: number | null = null;
    if (mode === "custom") {
      const c = Number(customC);
      if (!Number.isFinite(c) || c < 1 || c > 130) return;
      forced_crash = Math.round(c * 100) / 100;
    }

    setSaving(true);
    const seq = ++commitSeqRef.current;
    try {
      const syncedRtp = Math.max(0.01, Math.min(0.99, (100 - hold) / 100));
      const result = await adminApi.patchControls(token, {
        win_mode: mode === "protect" ? "protect" : "normal",
        forced_crash,
        min_bet: Math.round(min * 100) / 100,
        max_bet: Math.round(max * 100) / 100,
        economics_enabled: econEnabled,
        house_hold_pct: Math.round(hold) / 100,
        max_rtp_pct: syncedRtp,
      });
      if (seq !== commitSeqRef.current) return;
      if (result.warning) {
        show(result.warning, false);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 1200);
      }
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
    econEnabled = economicsEnabled,
    holdPct = houseHoldPct,
    rtpPct = maxRtpPct,
  ) => {
    dirtyRef.current = true;
    const min = Number(minB);
    const max = Number(maxB);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return;
    if (min < 0.01 || max < 1 || min > max) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(
      () => commit(mode, customC, minB, maxB, econEnabled, holdPct, rtpPct),
      600,
    );
  };

  const handleMode        = (m: "fair" | "protect" | "custom") => { setCrashMode(m); schedule(m, customCrash, minBet, maxBet); };
  const handleCustomCrash = (v: string) => { setCustomCrash(v); schedule("custom", v, minBet, maxBet); };
  const handleMinBet = (v: string) => { setMinBet(v);  schedule(crashMode, customCrash, v, maxBet); };
  const handleMaxBet = (v: string) => { setMaxBet(v);  schedule(crashMode, customCrash, minBet, v); };
  const handleEconToggle = (v: boolean) => { setEconomicsEnabled(v); schedule(crashMode, customCrash, minBet, maxBet, v); };
  const handleHoldPct = (v: string) => {
    setHouseHoldPct(v);
    const holdNum = Number(v);
    if (Number.isFinite(holdNum)) setMaxRtpPct(String(Math.max(1, Math.min(99, 100 - holdNum))));
    schedule(crashMode, customCrash, minBet, maxBet, economicsEnabled, v);
  };

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

        <LiveTicker liveEconomy={liveEconomy} />

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

        {/* Global Win Rate card */}
        <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-[15px] font-bold text-gray-900">Global Win Rate</h2>
            <p className="text-[12px] text-gray-400">Controls the multiplier range for every round.</p>
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
                <div className="mt-0.5 text-[11px] text-gray-400">Weighted table 1×–20×+</div>
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

            {/* Custom */}
            <button
              onClick={() => handleMode("custom")}
              data-testid="mode-custom"
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition ${
                crashMode === "custom"
                  ? "border-indigo-400 bg-indigo-50"
                  : "border-gray-200 bg-white hover:border-gray-300"
              }`}>
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                crashMode === "custom" ? "bg-indigo-500 text-white" : "bg-gray-100 text-gray-400"
              }`}>
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="2.5">
                  <path d="M12 20V10M12 4v.01M6 20v-6M18 20V8" />
                </svg>
              </div>
              <div className="text-center">
                <div className={`text-[14px] font-black ${crashMode === "custom" ? "text-indigo-600" : "text-gray-400"}`}>Custom</div>
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
                min={1}
                max={130}
                step={0.1}
                suffix="×"
              />
            </div>
          )}

          <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-[12px] leading-relaxed text-gray-500">
            {crashMode === "custom"
              ? `Every round crashes at exactly ${Number(customCrash || 0).toFixed(2)}× (1×–130×). Whatever you enter here is used as the crash point.`
              : crashMode === "protect"
              ? "Protect Mode — a disclosed, conservative weighted table for thin-reserve periods: 70% of rounds crash 1.00×–1.30×, 28% crash 1.30×–2.00×, 2% crash 2.00×–2.50×. Still a genuine random draw with no knowledge of bet amounts — just a smaller, uniform payout ceiling than Fair mode."
              : "Controlled economy — crash = RTP ÷ (1 − r), mathematically guaranteeing the target return; a generous safety ceiling backstops implausible payout pile-ups."}
          </div>
        </section>

        {/* Round Economy */}
        <section className="mb-5 rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm" data-testid="round-economy">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Round Economy</h2>
              <p className="text-[12px] text-gray-400">
                Fair mode picks Tight / Normal / Bonus from the current reserve alone — never from bet amounts — before every round.
              </p>
            </div>
            <label className="flex items-center gap-2 text-[12px] font-semibold text-gray-600">
              <input
                type="checkbox"
                checked={economicsEnabled}
                onChange={(e) => handleEconToggle(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Enabled
            </label>
          </div>

          {crashMode === "fair" && liveEconomy?.fairSubMode && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">Active sub-mode</span>
              <span className="rounded-full bg-amber-500 px-2.5 py-0.5 text-[11px] font-black uppercase tracking-wide text-white">
                {liveEconomy.fairSubMode}
              </span>
              <span className="ml-auto text-[12px] font-bold tabular-nums text-amber-700">
                Reserve: {adminFmt.fmt(liveEconomy.reserve)}
              </span>
            </div>
          )}

          <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              Reserve (starts at ₹2,00,000 — withdraw profit by setting it lower, top it up by setting it higher)
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={reserveInput}
                onChange={(e) => setReserveInput(e.target.value)}
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
          </div>

          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Round stake</div>
              <div className="text-[18px] font-black tabular-nums text-gray-900">
                {adminFmt.fmt(liveEconomy?.realStake ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Payout budget</div>
              <div className="text-[18px] font-black tabular-nums text-emerald-700">
                {adminFmt.fmt(liveEconomy?.maxPayout ?? 0)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Paid out</div>
              <div className="text-[18px] font-black tabular-nums text-gray-900">
                {adminFmt.fmt(liveEconomy?.paidOut ?? 0)}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <NumStepper testId="hold" label="House hold %" value={houseHoldPct} onChange={handleHoldPct} min={1} max={99} step={1} suffix="%" />
            <NumStepper testId="rtp" label="Max RTP %" value={maxRtpPct} onChange={() => {}} min={1} max={99} step={1} suffix="%" />
          </div>

          <div className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[11px] leading-relaxed text-emerald-800">
            Fair mode's crash point comes from the Tight / Normal / Bonus tables (picked by
            reserve level above), not this RTP % directly — House Hold / Max RTP here size the
            payout budget and safety-ceiling circuit breaker underneath it, same as Protect mode.
          </div>
        </section>

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
            <p><span className="font-semibold">Round Economy</span> locks all real bets before flight, then Fair mode picks a crash table by current reserve — never by bet amounts — so every player in a round faces the same disclosed odds.</p>
            <p><span className="font-semibold">Global Win Rate</span> — Fair auto-selects Tight (reserve &lt; ₹3L), Normal (₹3L–₹7L), or a 70/30 Normal/Bonus mix (reserve ≥ ₹7L); Protect uses a fixed conservative table (70% 1.00×–1.30×, 28% 1.30×–2.00×, 2% 2.00×–2.50×) for thin-reserve periods; Custom forces every round to the exact multiplier you enter.</p>
            <p><span className="font-semibold">Bet Limits</span> apply to all players — bets outside this range are rejected.</p>
            <p className="border-t border-blue-200 pt-2 text-blue-600">Changes save automatically and take effect on the next round. The live multiplier and recent crash history are shown in the top bar.</p>
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
