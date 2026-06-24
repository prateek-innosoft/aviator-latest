import { useEffect, useState, useCallback, useRef } from "react";
import { LogOut, RefreshCw, Check, ChevronUp, ChevronDown } from "lucide-react";
import { useAuth } from "../lib/authContext";
import { adminApi, type AdminControls } from "./api";
import { useGame } from "../store/gameStore";

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
  const { login } = useAuth();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [err, setErr]           = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
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
    <div className="flex min-h-screen items-center justify-center bg-[#f5f6f8] px-4">
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
              placeholder="admin@aviator.local" className={f} autoFocus />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Password</label>
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" className={f} />
          </div>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-600">{err}</div>
          )}

          <button type="submit" disabled={loading}
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
function NumStepper({ label, value, onChange, min = 1, max = 100, step = 1, suffix = "R" }: {
  label: string; value: string; onChange: (v: string) => void;
  min?: number; max?: number; step?: number; suffix?: string;
}) {
  const nudge = (dir: 1 | -1) => {
    const next = Math.max(min, Math.min(max, +(+value + step * dir).toFixed(2)));
    onChange(String(next));
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
        <button onClick={() => nudge(-1)} className="flex h-10 w-9 shrink-0 items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-95">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-0.5">
          <input type="number" value={value} min={min} max={max} step={step} onChange={e => onChange(e.target.value)}
            className="w-full bg-transparent text-center text-[15px] font-bold text-gray-800 outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <span className="text-[11px] font-semibold text-gray-400">{suffix}</span>
        </div>
        <button onClick={() => nudge(1)} className="flex h-10 w-9 shrink-0 items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-95">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LiveTicker — live game state
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

  const pillColor = (cp: number) =>
    cp >= 10 ? "bg-emerald-100 text-emerald-700"
  : cp >= 3  ? "bg-sky-100 text-sky-600"
  : cp >= 2  ? "bg-gray-100 text-gray-500"
             : "bg-red-100 text-red-500";

  return (
    <div className="ml-4 flex items-center gap-3">
      <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{phaseLabel}</span>
        <span className={`min-w-[3.2rem] text-right text-[17px] font-black tabular-nums leading-none ${multColor}`}>
          {isBetting ? "—" : `${multiplier.toFixed(2)}×`}
        </span>
      </div>
      {history.length > 0 && (
        <div className="hidden items-center gap-1 lg:flex">
          {history.slice(0, 10).map((r, i) => (
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

  const [globalWinRate, setGlobalWinRate] = useState(50);
  const [minBet, setMinBet]               = useState("1");
  const [maxBet, setMaxBet]               = useState("50000");
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [toast, setToast]                 = useState<Toast>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2200); };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { controls } = await adminApi.getControls(token);
      setMinBet(String(controls.min_bet));
      setMaxBet(String(controls.max_bet));
      setGlobalWinRate(Math.round((controls.house_edge ?? 0.5) * 100));
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const commit = useCallback(async (rate: number, minB: string, maxB: string) => {
    setSaving(true);
    try {
      const patch: Partial<AdminControls> = {
        win_mode:   "normal",
        house_edge: rate / 100,
        min_bet:    Number(minB),
        max_bet:    Number(maxB),
      };
      await adminApi.patchControls(token, patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Save failed", false);
    } finally {
      setSaving(false);
    }
  }, [token]);

  const schedule = (rate: number, minB: string, maxB: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commit(rate, minB, maxB), 600);
  };

  const handleRate   = (r: number) => { setGlobalWinRate(r); schedule(r, minBet, maxBet); };
  const handleMinBet = (v: string) => { setMinBet(v);  schedule(globalWinRate, v, maxBet); };
  const handleMaxBet = (v: string) => { setMaxBet(v);  schedule(globalWinRate, minBet, v); };

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
          <button onClick={load} disabled={loading} title="Refresh"
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
          <div className="mb-4 flex items-baseline justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-gray-900">Global Win Rate</h2>
              <p className="text-[12px] text-gray-400">How often players win across the whole game.</p>
            </div>
            <span className={`rounded-lg px-2.5 py-1 text-[14px] font-black tabular-nums ${
              globalWinRate >= 75 ? "bg-emerald-100 text-emerald-700"
              : globalWinRate <= 25 ? "bg-red-100 text-red-600"
              : "bg-gray-100 text-gray-600"
            }`}>{globalWinRate}%</span>
          </div>

          <div className="mb-1.5 flex justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-red-400">House wins</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Fair</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-500">Players win</span>
          </div>
          <div className="relative h-8">
            <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full"
              style={{ background: "linear-gradient(to right, #ef4444, #f59e0b 50%, #10b981)" }} />
            <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-l-full bg-white/60"
              style={{ left: 0, width: `${globalWinRate}%` }} />
            <input type="range" min={0} max={100} value={globalWinRate}
              onChange={e => handleRate(Number(e.target.value))}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            <div className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-colors"
              style={{ left: `${globalWinRate}%`, background: globalWinRate >= 75 ? "#10b981" : globalWinRate <= 25 ? "#ef4444" : "#6b7280" }} />
          </div>

          <div className="mt-4 grid grid-cols-5 gap-1.5">
            {([
              { label: "0%",   v: 0   },
              { label: "25%",  v: 25  },
              { label: "50%",  v: 50  },
              { label: "75%",  v: 75  },
              { label: "100%", v: 100 },
            ] as const).map(p => (
              <button key={p.v} onClick={() => handleRate(p.v)}
                className={`rounded-lg border py-2 text-[11px] font-bold transition ${
                  globalWinRate === p.v ? "border-gray-300 bg-gray-100 text-gray-700" : "border-gray-200 text-gray-400 hover:bg-gray-50"
                }`}>{p.label}</button>
            ))}
          </div>

          <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3 text-[12px] leading-relaxed text-gray-500">
            {globalWinRate >= 90 ? "Players win almost every round with very high multipliers (up to 130×)."
            : globalWinRate >= 65 ? "Players win more often than they lose. Generous payouts."
            : globalWinRate >= 35 ? "Balanced — statistically fair for all players (capped at 10×)."
            : globalWinRate >= 10 ? "House wins more often — players lose most bets (crash around 1–2×)."
            : "Players crash almost every round before cashing out."}
          </div>
        </section>

        {/* Bet Limits card */}
        <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-[15px] font-bold text-gray-900">Bet Limits</h2>
            <p className="text-[12px] text-gray-400">Minimum and maximum bet amount allowed per round.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <NumStepper label="Minimum bet" value={minBet} onChange={handleMinBet} min={1} max={99999} step={10} suffix="R" />
            <NumStepper label="Maximum bet" value={maxBet} onChange={handleMaxBet} min={1} max={9999999} step={500} suffix="R" />
          </div>
        </section>

        {/* Guidelines */}
        <section className="rounded-2xl border border-blue-100 bg-blue-50 p-6">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-blue-500">How it works</h2>
          <div className="space-y-2 text-[12px] leading-relaxed text-blue-700">
            <p><span className="font-semibold">Global Win Rate</span> biases the outcome of every round. Move it left for the house to win, right for players to win, or keep it at 50% for a provably-fair game.</p>
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
