import { useEffect, useState, useCallback, useRef } from "react";
import { LogOut, RefreshCw, Check, ChevronUp, ChevronDown, X } from "lucide-react";
import { useAuth } from "../lib/authContext";
import { adminApi, type AdminUser, type AdminControls, type WinControl } from "./api";
import { useGame } from "../store/gameStore";

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Types
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type Mode = "normal" | "win" | "loss";
type Toast = { msg: string; ok: boolean } | null;

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Small shared helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Standalone Admin Login â€” shown at /admin before credentials are verified
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    // token will be available via useAuth session â€” signal parent
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
              placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" className={f} />
          </div>

          {err && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[12px] text-red-600">{err}</div>
          )}

          <button type="submit" disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e8173a] py-3.5 text-[14px] font-bold text-white shadow-md shadow-[#e8173a]/25 transition hover:bg-[#c9122f] disabled:opacity-60">
            {loading ? <Spinner /> : null}
            {loading ? "Signing inâ€¦" : "Sign In"}
          </button>
        </form>

        <p className="mt-6 text-center text-[11px] text-gray-300">
          Only admin and superadmin accounts can access this panel.
        </p>
      </div>
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ModePill badge
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ModePill({ mode }: { mode: Mode }) {
  const cfg = {
    win:    "bg-emerald-50 text-emerald-600 border-emerald-200",
    loss:   "bg-red-50 text-red-500 border-red-200",
    normal: "bg-gray-100 text-gray-400 border-gray-200",
  }[mode];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-widest ${cfg}`}>
      {mode === "win" ? "WIN" : mode === "loss" ? "LOSS" : "AUTO"}
    </span>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// NumStepper â€” â–¼ value â–²
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        <button onClick={() => nudge(-1)} className="flex h-9 w-8 shrink-0 items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-95">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-0.5">
          <input type="number" value={value} min={min} max={max} step={step} onChange={e => onChange(e.target.value)}
            className="w-20 bg-transparent text-center text-[14px] font-bold text-gray-800 outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <span className="text-[11px] font-semibold text-gray-400">{suffix}</span>
        </div>
        <button onClick={() => nudge(1)} className="flex h-9 w-8 shrink-0 items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-95">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}


// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// UserDrawer â€” side panel for precise per-user win control
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function UserDrawer({ user, token, onClose, onSaved }: {
  user: AdminUser; token: string; onClose: () => void; onSaved: (u: AdminUser) => void;
}) {
  const ex = user.win_control;
  const rateToMode = (r: number): Mode => r >= 80 ? "win" : r <= 20 ? "loss" : "normal";

  const [winRate, setWinRate] = useState(Math.round((ex?.win_rate ?? 0.5) * 100));
  const [minBet, setMinBet]   = useState(ex?.min_bet != null ? String(ex.min_bet) : "1");
  const [maxBet, setMaxBet]   = useState(ex?.max_bet != null ? String(ex.max_bet) : "50000");
  const [saving, setSaving]   = useState(false);
  const [toast, setToast]     = useState<Toast>(null);

  const mode = rateToMode(winRate);
  const show = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2200); };
  const barColor = mode === "win" ? "#10b981" : mode === "loss" ? "#ef4444" : "#6366f1";

  const save = async () => {
    setSaving(true);
    try {
      const body: Omit<WinControl, "user_id"> = {
        win_mode:    mode,
        win_rate:    winRate / 100,
        min_cashout: null,
        max_cashout: null,
        min_bet:     Number(minBet) || null,
        max_bet:     Number(maxBet) || null,
        notes:       null,
      };
      await adminApi.putWinControl(token, user.id, body);
      show("Saved", true);
      onSaved({ ...user, win_control: { user_id: user.id, ...body } });
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Failed", false);
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    try {
      await adminApi.deleteWinControl(token, user.id);
      show("Controls removed", true);
      onSaved({ ...user, win_control: null });
      setTimeout(onClose, 500);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Failed", false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[340px] flex-col border-l border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-black text-white ${
            mode === "win" ? "bg-emerald-500" : mode === "loss" ? "bg-red-500" : "bg-gray-300"
          }`}>
            {(user.display_name ?? user.email).charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-[14px] font-bold text-gray-900">{user.display_name ?? user.username ?? user.email.split("@")[0]}</p>
              <ModePill mode={mode} />
            </div>
            <p className="truncate text-[11px] text-gray-400">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 transition hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {/* Win Chance */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Win Chance</p>
              <span className={`text-[26px] font-black tabular-nums leading-none ${
                mode === "win" ? "text-emerald-500" : mode === "loss" ? "text-red-500" : "text-gray-700"
              }`}>{winRate}<span className="text-[14px] font-bold opacity-40">%</span></span>
            </div>
            <div className="relative h-3 rounded-full bg-gray-200">
              <div className="absolute left-0 top-0 h-3 rounded-full transition-all" style={{ width: `${winRate}%`, background: barColor }} />
              <input type="range" min={0} max={100} value={winRate} onChange={e => setWinRate(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </div>
            <div className="mt-2 grid grid-cols-3 text-[10px]">
              <span className="text-red-400">â† Always Lose</span>
              <span className="text-center text-gray-400">Fair (50%)</span>
              <span className="text-right text-emerald-500">Always Win â†’</span>
            </div>
            <div className="mt-3 flex gap-2">
              {([
                { label: "Always Lose", v: 0,   cls: "border-red-200 text-red-500 hover:bg-red-50" },
                { label: "Fair",        v: 50,  cls: "border-gray-200 text-gray-500 hover:bg-gray-50" },
                { label: "Always Win",  v: 100, cls: "border-emerald-200 text-emerald-600 hover:bg-emerald-50" },
              ] as const).map(p => (
                <button key={p.v} onClick={() => setWinRate(p.v)}
                  className={`flex-1 rounded-lg border py-1.5 text-[10px] font-bold transition ${p.cls} ${winRate === p.v ? "opacity-100" : "opacity-50"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Per-user Bet Limits */}
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">Bet Limits (this user)</p>
            <p className="mb-3 text-[11px] text-gray-400">Leave at defaults to use the global limits.</p>
            <div className="grid grid-cols-2 gap-3">
              <NumStepper label="Min Bet" value={minBet} onChange={setMinBet} min={1} max={999999} step={10} suffix="R" />
              <NumStepper label="Max Bet" value={maxBet} onChange={setMaxBet} min={1} max={9999999} step={500} suffix="R" />
            </div>
          </div>

          {/* Guidelines */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">How win chance works</p>
            <div className="space-y-1.5 text-[11px] text-gray-500 leading-relaxed">
              <p><span className="font-semibold text-red-500">0%</span> â€” Plane crashes early every round. Player always loses.</p>
              <p><span className="font-semibold text-gray-600">50%</span> â€” Provably fair. No bias for or against the player.</p>
              <p><span className="font-semibold text-emerald-600">100%</span> â€” Very high crash points (100â€“130Ã—). Player wins big.</p>
              <p className="pt-1 text-gray-400">The mode badge (WIN / AUTO / LOSS) is derived automatically from this percentage.</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4 flex gap-2">
          <button onClick={clear} disabled={saving || !user.win_control}
            className="flex-1 rounded-xl border border-red-200 bg-red-50 py-2.5 text-[12px] font-semibold text-red-500 transition hover:bg-red-100 disabled:opacity-25 disabled:cursor-not-allowed">
            Reset
          </button>
          <button onClick={save} disabled={saving}
            className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-[#e8173a] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#c9122f] disabled:opacity-50 active:scale-[0.98]">
            {saving ? <Spinner /> : <Check className="h-4 w-4" />}
            Apply
          </button>
        </div>

        {toast && (
          <div className={`absolute bottom-[72px] left-4 right-4 rounded-xl border px-4 py-3 text-[12px] font-semibold shadow-xl ${
            toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"
          }`}>{toast.msg}</div>
        )}
      </aside>
    </>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// LiveTicker â€” top bar live game state
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
          {isBetting ? "â€”" : `${multiplier.toFixed(2)}Ã—`}
        </span>
      </div>
      {history.length > 0 && (
        <div className="hidden items-center gap-1 xl:flex">
          {history.slice(0, 8).map((r, i) => (
            <span key={r.id ?? i} className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${pillColor(r.multiplier)}`}>
              {r.multiplier.toFixed(2)}Ã—
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main admin panel
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function RateControlPanel({ token }: { token: string }) {
  const { profile, logout } = useAuth();
  const init = useGame(s => s.init);

  useEffect(() => { init(); }, [init]);

  // Global settings
  const [, setRawControls]              = useState<AdminControls | null>(null);
  const [globalWinRate, setGlobalWinRate] = useState(50);
  const [minBet, setMinBet]             = useState("1");
  const [maxBet, setMaxBet]             = useState("50000");
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savedGlobal, setSavedGlobal]   = useState(false);

  // Users
  const [users, setUsers]             = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [drawer, setDrawer]           = useState<AdminUser | null>(null);
  const [rowSaving, setRowSaving]     = useState<Record<string, boolean>>({});
  const [toast, setToast]             = useState<Toast>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2200); };

  const loadAll = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const [{ controls }, { users }] = await Promise.all([
        adminApi.getControls(token),
        adminApi.getUsers(token),
      ]);
      setRawControls(controls);
      setMinBet(String(controls.min_bet));
      setMaxBet(String(controls.max_bet));
      setGlobalWinRate(Math.round((controls.house_edge ?? 0.5) * 100));
      setUsers(users);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const commitGlobal = useCallback(async (rate: number, minB: string, maxB: string) => {
    setSavingGlobal(true);
    try {
      await adminApi.patchControls(token, {
        win_mode:   "normal",
        house_edge: rate / 100,
        min_bet:    Number(minB),
        max_bet:    Number(maxB),
      });
      setSavedGlobal(true);
      setTimeout(() => setSavedGlobal(false), 1200);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Save failed", false);
    } finally {
      setSavingGlobal(false);
    }
  }, [token]);

  const scheduleGlobalSave = (rate: number, minB: string, maxB: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commitGlobal(rate, minB, maxB), 600);
  };

  const handleRateChange    = (r: number)  => { setGlobalWinRate(r); scheduleGlobalSave(r, minBet, maxBet); };
  const handleMinBetChange  = (v: string)  => { setMinBet(v);  scheduleGlobalSave(globalWinRate, v, maxBet); };
  const handleMaxBetChange  = (v: string)  => { setMaxBet(v);  scheduleGlobalSave(globalWinRate, minBet, v); };

  const quickAssign = async (user: AdminUser, mode: Mode) => {
    setRowSaving(s => ({ ...s, [user.id]: true }));
    const rate = mode === "win" ? 1 : mode === "loss" ? 0 : 0.5;
    try {
      const ex = user.win_control;
      const body: Omit<WinControl, "user_id"> = {
        win_mode:    mode,
        win_rate:    rate,
        min_cashout: ex?.min_cashout ?? null,
        max_cashout: ex?.max_cashout ?? null,
        min_bet:     ex?.min_bet ?? null,
        max_bet:     ex?.max_bet ?? null,
        notes:       null,
      };
      await adminApi.putWinControl(token, user.id, body);
      setUsers(us => us.map(u => u.id === user.id ? { ...u, win_control: { user_id: user.id, ...body } } : u));
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Failed", false);
    } finally {
      setRowSaving(s => ({ ...s, [user.id]: false }));
    }
  };

  const handleDrawerSaved = (updated: AdminUser) => {
    setUsers(us => us.map(u => u.id === updated.id ? updated : u));
    if (drawer?.id === updated.id) setDrawer(updated);
  };

  const players  = users.filter(u => u.role === "user");

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f6f8] text-gray-900">

      {/* â”€â”€ Top bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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
          <div className={`flex items-center gap-1 text-[11px] transition-opacity duration-200 ${savingGlobal || savedGlobal ? "opacity-100" : "opacity-0"}`}>
            {savingGlobal
              ? <><Spinner /><span className="text-gray-400">Savingâ€¦</span></>
              : <><Check className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Saved</span></>
            }
          </div>
          <button onClick={loadAll} disabled={loadingUsers} title="Refresh"
            className="rounded-lg p-1.5 text-gray-300 transition hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30">
            <RefreshCw className={`h-3.5 w-3.5 ${loadingUsers ? "animate-spin" : ""}`} />
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

      <div className="flex min-h-0 flex-1">

        {/* â”€â”€ Left sidebar: Global controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <aside className="flex w-[300px] shrink-0 flex-col border-r border-gray-200 bg-white overflow-y-auto">

          {/* Global Win Rate */}
          <div className="border-b border-gray-100 px-5 py-5">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-[12px] font-bold text-gray-800">Global Win Rate</p>
              <span className={`rounded-lg px-2 py-0.5 text-[11px] font-black tabular-nums ${
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
                onChange={e => handleRateChange(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              <div className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-colors"
                style={{ left: `${globalWinRate}%`, background: globalWinRate >= 75 ? "#10b981" : globalWinRate <= 25 ? "#ef4444" : "#6b7280" }} />
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1">
              {([
                { label: "0%",   v: 0   },
                { label: "25%",  v: 25  },
                { label: "50%",  v: 50  },
                { label: "75%",  v: 75  },
                { label: "100%", v: 100 },
              ] as const).map(p => (
                <button key={p.v} onClick={() => handleRateChange(p.v)}
                  className={`rounded-lg border py-1.5 text-[10px] font-bold transition ${
                    globalWinRate === p.v ? "border-gray-300 bg-gray-100 text-gray-700" : "border-gray-200 text-gray-300 hover:bg-gray-50"
                  }`}>{p.label}</button>
              ))}
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-gray-400">
              {globalWinRate >= 90 ? "Players win almost every round with large multipliers."
              : globalWinRate >= 65 ? "Players win more often than they lose."
              : globalWinRate >= 35 ? "Balanced â€” statistically fair for all players."
              : globalWinRate >= 10 ? "House wins more often â€” players lose most bets."
              : "Players crash almost every round before cashing out."}
            </p>
          </div>

          {/* Global Bet Limits */}
          <div className="px-5 py-5">
            <p className="mb-1 text-[12px] font-bold text-gray-800">Bet Limits</p>
            <p className="mb-4 text-[11px] text-gray-400">Min and max bet amount for all players.</p>
            <div className="space-y-3">
              <NumStepper label="Minimum bet" value={minBet} onChange={handleMinBetChange} min={1} max={99999} step={10} suffix="R" />
              <NumStepper label="Maximum bet" value={maxBet} onChange={handleMaxBetChange} min={1} max={9999999} step={500} suffix="R" />
            </div>
          </div>

          {/* Guidelines */}
          <div className="mx-5 mb-5 rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-blue-500">Admin Guide</p>
            <div className="space-y-1.5 text-[11px] text-blue-700 leading-relaxed">
              <p>ðŸŸ¢ <span className="font-semibold">WIN</span> â€” Crash 100â€“130Ã—. Player always cashes out big.</p>
              <p>ðŸ”´ <span className="font-semibold">LOSS</span> â€” Crash 1â€“2Ã—. Player never cashes out.</p>
              <p>âšª <span className="font-semibold">AUTO</span> â€” Provably fair. No rigging.</p>
              <p className="pt-1 border-t border-blue-200">Click <span className="font-semibold">Â·Â·Â·</span> on any player to set a precise win % and individual bet limits.</p>
              <p>Global rate affects all AUTO-mode players. Per-user overrides always take priority.</p>
            </div>
          </div>

          <div className="mt-auto border-t border-gray-100 px-5 py-3">
            <p className="text-[10px] text-gray-300">Auto-saved Â· changes apply next round</p>
          </div>
        </aside>

        {/* â”€â”€ Right: Players list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <main className="flex min-w-0 flex-1 flex-col">

          {/* Column header */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
            <div>
              <span className="text-[14px] font-bold text-gray-900">Players</span>
              <span className="ml-2 text-[11px] text-gray-400">{players.length} registered</span>
            </div>
            <button onClick={loadAll} disabled={loadingUsers}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[11px] font-semibold text-gray-500 transition hover:bg-gray-50 disabled:opacity-40">
              <RefreshCw className={`h-3 w-3 ${loadingUsers ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <div className="flex items-center justify-center gap-2 py-20 text-gray-300">
                <Spinner /><span className="text-[13px]">Loading playersâ€¦</span>
              </div>
            ) : players.length === 0 ? (
              <div className="py-20 text-center text-[13px] text-gray-300">No players found</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {players.map(user => {
                  const ctrl  = user.win_control;
                  const mode: Mode = ctrl?.win_mode ?? "normal";
                  const rate  = ctrl ? Math.round(ctrl.win_rate * 100) : 50;
                  const isBusy = rowSaving[user.id];

                  return (
                    <div key={user.id} className="flex items-center gap-4 bg-white px-5 py-3.5 transition hover:bg-gray-50/70">

                      {/* Avatar + info */}
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-black ${
                          mode === "win"  ? "bg-emerald-100 text-emerald-600"
                          : mode === "loss" ? "bg-red-100 text-red-500"
                                           : "bg-gray-100 text-gray-500"
                        }`}>
                          {(user.display_name ?? user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-gray-800">
                              {user.display_name ?? user.username ?? user.email.split("@")[0]}
                            </span>
                            <ModePill mode={mode} />
                          </div>
                          <p className="truncate text-[11px] text-gray-400">{user.email}</p>
                          {/* Win rate mini bar */}
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="h-1.5 w-24 rounded-full bg-gray-200 overflow-hidden">
                              <div className={`h-1.5 rounded-full transition-all ${
                                mode === "win" ? "bg-emerald-500" : mode === "loss" ? "bg-red-500" : "bg-indigo-400"
                              }`} style={{ width: `${rate}%` }} />
                            </div>
                            <span className="text-[10px] tabular-nums text-gray-400">{rate}% win</span>
                            <span className="text-[10px] text-gray-300">Â·</span>
                            <span className="text-[10px] tabular-nums text-gray-400">R{user.balance.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* WIN / AUTO / LOSS quick buttons */}
                      <div className="flex shrink-0 items-center gap-1">
                        {isBusy ? (
                          <span className="px-3 text-gray-300"><Spinner /></span>
                        ) : (
                          <>
                            <button onClick={() => quickAssign(user, "win")}
                              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black tracking-wide transition ${
                                mode === "win"
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-600"
                                  : "border-gray-200 text-gray-400 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600"
                              }`}>WIN</button>
                            <button onClick={() => quickAssign(user, "normal")}
                              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black tracking-wide transition ${
                                mode === "normal"
                                  ? "border-gray-300 bg-gray-100 text-gray-600"
                                  : "border-gray-200 text-gray-400 hover:border-gray-300 hover:bg-gray-100 hover:text-gray-600"
                              }`}>AUTO</button>
                            <button onClick={() => quickAssign(user, "loss")}
                              className={`rounded-lg border px-2.5 py-1.5 text-[10px] font-black tracking-wide transition ${
                                mode === "loss"
                                  ? "border-red-300 bg-red-50 text-red-500"
                                  : "border-gray-200 text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                              }`}>LOSS</button>
                          </>
                        )}
                        {/* Open detailed drawer */}
                        <button onClick={() => setDrawer(user)} title="Precise win % and bet limits"
                          className="ml-1 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-400 transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-600">
                          Â·Â·Â·
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* User drawer */}
      {drawer && (
        <UserDrawer user={drawer} token={token}
          onClose={() => setDrawer(null)} onSaved={handleDrawerSaved} />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl border px-5 py-3 text-[13px] font-semibold shadow-lg ${
          toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-600"
        }`}>{toast.msg}</div>
      )}
    </div>
  );
}
