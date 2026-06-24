import { useEffect, useState, useCallback, useRef } from "react";
import { LogOut, RefreshCw, X, Check, ChevronUp, ChevronDown, Pencil, Trash2, UserPlus } from "lucide-react";
import { useAuth } from "../lib/authContext";
import { adminApi, type AdminUser, type AdminControls, type WinControl } from "./api";
import { useGame } from "../store/gameStore";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
type Mode = "normal" | "win" | "loss";
type Toast = { msg: string; ok: boolean } | null;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

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

// Stepper: label / ▼ value ▲
function NumStepper({ label, value, onChange, min = 1, max = 100, step = 0.1, suffix = "×", hint }: {
  label: string; value: string; onChange: (v: string) => void;
  min?: number; max?: number; step?: number; suffix?: string; hint?: string;
}) {
  const nudge = (dir: 1 | -1) => {
    const next = Math.max(min, Math.min(max, +(+value + step * dir).toFixed(2)));
    onChange(String(next));
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
        <button onClick={() => nudge(-1)}
          className="flex h-9 w-8 shrink-0 items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-95">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <div className="flex flex-1 items-center justify-center gap-0.5">
          <input type="number" value={value} min={min} max={max} step={step}
            onChange={e => onChange(e.target.value)}
            className="w-16 bg-transparent text-center text-[15px] font-bold text-gray-800 outline-none tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
          <span className="text-[12px] font-semibold text-gray-400">{suffix}</span>
        </div>
        <button onClick={() => nudge(1)}
          className="flex h-9 w-8 shrink-0 items-center justify-center text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-95">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
      {hint && <span className="text-[10px] text-gray-400">{hint}</span>}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// Modal base
// ─────────────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-[60] w-full max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <p className="text-[14px] font-bold text-gray-900">{title}</p>
          <button onClick={onClose} className="text-gray-300 transition hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Create User Modal
// ─────────────────────────────────────────────────────────────────────────────
function CreateUserModal({ token, onClose, onCreated }: {
  token: string; onClose: () => void; onCreated: () => void;
}) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [balance, setBalance]   = useState("50000");
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    // Client-side validation matching server rules
    if (password.length < 8) { setErr("Password must be at least 8 characters"); return; }
    if (!/[A-Z]/.test(password)) { setErr("Password must contain at least one uppercase letter"); return; }
    if (!/[a-z]/.test(password)) { setErr("Password must contain at least one lowercase letter"); return; }
    if (!/\d/.test(password))    { setErr("Password must contain at least one number"); return; }
    setSaving(true);
    try {
      await adminApi.createUser(token, {
        email: email.trim().toLowerCase(),
        password,
        display_name: displayName.trim() || undefined,
        role: "user",
        balance: Number(balance) || 50000,
      });
      onCreated();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 outline-none transition focus:border-gray-300 focus:bg-white";

  return (
    <Modal title="Create Player" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 px-5 py-4">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">Email</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="player@example.com" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">Password</label>
          <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Min 8 chars, upper + lower + number" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">Display Name <span className="normal-case text-gray-300">(optional)</span></label>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="John Doe" className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">Starting Balance (R)</label>
          <input type="number" value={balance} onChange={e => setBalance(e.target.value)} min={0} className={field} />
        </div>
        {err && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-600">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-500 transition hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-[#e8173a] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#c9122f] disabled:opacity-50">
            {saving ? <Spinner /> : <UserPlus className="h-3.5 w-3.5" />}
            Create Player
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Edit User Modal
// ─────────────────────────────────────────────────────────────────────────────
function EditUserModal({ user, token, onClose, onSaved }: {
  user: AdminUser; token: string; onClose: () => void; onSaved: (u: AdminUser) => void;
}) {
  const [displayName, setDisplayName] = useState(user.display_name ?? "");
  const [balance, setBalance]   = useState(String(user.balance));
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setSaving(true);
    try {
      await adminApi.patchUser(token, user.id, {
        display_name: displayName.trim() || undefined,
        balance: Number(balance),
      });
      onSaved({ ...user, display_name: displayName.trim() || user.display_name, balance: Number(balance) });
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const field = "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-[13px] text-gray-800 placeholder-gray-300 outline-none transition focus:border-gray-300 focus:bg-white";

  return (
    <Modal title="Edit Player" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3 px-5 py-4">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">Email</label>
          <input type="text" disabled value={user.email} className={`${field} cursor-not-allowed opacity-50`} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">Display Name</label>
          <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={user.username ?? ""} className={field} />
        </div>
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">Balance (R)</label>
          <input type="number" value={balance} onChange={e => setBalance(e.target.value)} min={0} className={field} />
        </div>
        {err && <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12px] text-red-600">{err}</p>}
        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-500 transition hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={saving} className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-gray-800 py-2.5 text-[13px] font-bold text-white transition hover:bg-gray-900 disabled:opacity-50">
            {saving ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// User drawer — per-user win rate + crash range + bet limits (no mode picker)
// ─────────────────────────────────────────────────────────────────────────────
function UserDrawer({ user, token, onClose, onSaved }: {
  user: AdminUser; token: string; onClose: () => void; onSaved: (u: AdminUser) => void;
}) {
  const ex = user.win_control;
  // Derive mode from win_rate: ≥80 = win, ≤20 = loss, else normal
  const rateToMode = (r: number): Mode => r >= 80 ? "win" : r <= 20 ? "loss" : "normal";

  const [winRate, setWinRate]   = useState(Math.round((ex?.win_rate ?? 0.5) * 100));
  const [minCrash, setMinCrash] = useState(ex?.min_cashout != null ? String(ex.min_cashout) : "1.10");
  const [maxCrash, setMaxCrash] = useState(ex?.max_cashout != null ? String(ex.max_cashout) : "50.00");
  const [minBet, setMinBet]     = useState(ex?.min_bet != null ? String(ex.min_bet) : "1");
  const [maxBet, setMaxBet]     = useState(ex?.max_bet != null ? String(ex.max_bet) : "50000");
  const [saving, setSaving]     = useState(false);
  const [toast, setToast]       = useState<Toast>(null);

  const mode = rateToMode(winRate);
  const show = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2200); };

  const save = async () => {
    setSaving(true);
    try {
      const body: Omit<WinControl, "user_id"> = {
        win_mode:    mode,
        win_rate:    winRate / 100,
        min_cashout: Number(minCrash) || null,
        max_cashout: Number(maxCrash) || null,
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

  // color of the rate bar — gradient green→red as rate changes
  const barColor = mode === "win" ? "#10b981" : mode === "loss" ? "#ef4444" : "#6366f1";

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

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-7">

          {/* Win Rate — the single outcome control */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Win Chance</p>
              <span className={`text-[26px] font-black tabular-nums leading-none ${
                mode === "win" ? "text-emerald-500" : mode === "loss" ? "text-red-500" : "text-gray-700"
              }`}>
                {winRate}<span className="text-[14px] font-bold opacity-40">%</span>
              </span>
            </div>

            {/* Custom gradient track */}
            <div className="relative h-3 rounded-full bg-gray-200">
              <div className="absolute left-0 top-0 h-3 rounded-full transition-all" style={{ width: `${winRate}%`, background: barColor }} />
              <input type="range" min={0} max={100} value={winRate}
                onChange={e => setWinRate(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
            </div>

            {/* Zone markers */}
            <div className="mt-2 grid grid-cols-3 text-[10px]">
              <div className="text-red-400">← Always Lose</div>
              <div className="text-center text-gray-400">Fair (50%)</div>
              <div className="text-right text-emerald-500">Always Win →</div>
            </div>

            {/* Quick preset pills */}
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

          {/* Crash Multiplier Range */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Crash Point Range</p>
            <p className="mb-3 text-[11px] text-gray-400">The plane will crash between these two multipliers for this user.</p>
            <div className="grid grid-cols-2 gap-3">
              <NumStepper label="Minimum ×" value={minCrash} onChange={setMinCrash} min={1.01} max={15} step={0.1}
                hint="crash always at or above" />
              <NumStepper label="Maximum ×" value={maxCrash} onChange={setMaxCrash} min={1.01} max={15} step={0.1}
                hint="crash always at or below" />
            </div>
          </div>

          {/* Bet Limits */}
          <div>
            <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-gray-400">Bet Amount Limits</p>
            <p className="mb-3 text-[11px] text-gray-400">Leave at defaults to use the global limits.</p>
            <div className="grid grid-cols-2 gap-3">
              <NumStepper label="Min Bet" value={minBet} onChange={setMinBet} min={1} max={999999} step={10} suffix="R" />
              <NumStepper label="Max Bet" value={maxBet} onChange={setMaxBet} min={1} max={9999999} step={500} suffix="R" />
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

// ─────────────────────────────────────────────────────────────────────────────
// Main panel
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Live game ticker — sits in the top bar
// ─────────────────────────────────────────────────────────────────────────────
function LiveTicker() {
  const phase      = useGame(s => s.phase);
  const multiplier = useGame(s => s.multiplier);
  const countdown  = useGame(s => s.countdown);
  const history    = useGame(s => s.history);

  const isFlying  = phase === "flying";
  const isCrashed = phase === "crashed";
  const isBetting = phase === "betting";

  // colour of the live multiplier display
  const multColor = isFlying  ? "text-emerald-600"
                  : isCrashed ? "text-red-500"
                               : "text-gray-400";

  const dotColor  = isFlying  ? "bg-emerald-500 animate-pulse"
                  : isCrashed ? "bg-red-500"
                               : "bg-amber-400 animate-pulse";

  const phaseLabel = isFlying  ? "LIVE"
                   : isCrashed ? "CRASHED"
                                : `${(countdown / 1000).toFixed(1)}s`;

  // colour-code history pill by crash point value
  const pillColor = (cp: number): string =>
    cp >= 10 ? "bg-emerald-100 text-emerald-700"
  : cp >= 3  ? "bg-sky-100 text-sky-600"
  : cp >= 2  ? "bg-gray-100 text-gray-500"
             : "bg-red-100 text-red-500";

  return (
    <div className="ml-4 flex items-center gap-3">
      {/* Live multiplier badge */}
      <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{phaseLabel}</span>
        <span className={`min-w-[3.2rem] text-right text-[17px] font-black tabular-nums leading-none ${multColor}`}>
          {isBetting ? "—" : `${multiplier.toFixed(2)}×`}
        </span>
      </div>

      {/* Last 8 rounds strip */}
      {history.length > 0 && (
        <div className="hidden items-center gap-1 xl:flex">
          {history.slice(0, 8).map((r, i) => (
            <span key={r.id ?? i}
              className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${pillColor(r.multiplier)}`}>
              {r.multiplier.toFixed(2)}×
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RateControlPanel({ token }: { token: string }) {
  const { profile, logout } = useAuth();
  const init = useGame(s => s.init);

  // Initialise socket so LiveTicker gets live data
  useEffect(() => { init(); }, [init]);

  // Global settings
  const [, setRawControls]        = useState<AdminControls | null>(null);
  const [globalWinRate, setGlobalWinRate] = useState(50);  // 0-100%
  const [minBet, setMinBet]       = useState("1");
  const [maxBet, setMaxBet]       = useState("50000");
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savedGlobal, setSavedGlobal]   = useState(false); // brief tick flash

  // Users
  const [users, setUsers]         = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch]       = useState("");
  const [drawer, setDrawer]       = useState<AdminUser | null>(null);
  const [rowSaving, setRowSaving] = useState<Record<string, boolean>>({});
  const [toast, setToast]         = useState<Toast>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editUser, setEditUser]     = useState<AdminUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AdminUser | null>(null);
  const [deleting, setDeleting]     = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = (msg: string, ok: boolean) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 2200); };

  // ── Load ───────────────────────────────────────────────────────────────
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const { users } = await adminApi.getUsers(token);
      setUsers(users);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Load failed", false);
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

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

  // ── Save global — debounced so sliders feel realtime ──────────────────
  const commitGlobal = useCallback(async (
    rate: number, minB: string, maxB: string,
  ) => {
    setSavingGlobal(true);
    try {
      await adminApi.patchControls(token, {
        win_mode:   "normal",     // game mode is always normal; win rate drives bias
        house_edge: rate / 100,   // store global win rate (0-1) in house_edge field
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

  // Debounced auto-save whenever any global field changes
  const scheduleGlobalSave = (rate: number, minB: string, maxB: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => commitGlobal(rate, minB, maxB), 600);
  };

  const handleRateChange = (r: number) => {
    setGlobalWinRate(r);
    scheduleGlobalSave(r, minBet, maxBet);
  };
  const handleMinBetChange = (v: string) => {
    setMinBet(v);
    scheduleGlobalSave(globalWinRate, v, maxBet);
  };
  const handleMaxBetChange = (v: string) => {
    setMaxBet(v);
    scheduleGlobalSave(globalWinRate, minBet, v);
  };

  // ── Quick assign per user ──────────────────────────────────────────────
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

  const handleEditSaved = (updated: AdminUser) => {
    setUsers(us => us.map(u => u.id === updated.id ? updated : u));
  };

  const handleDelete = async (user: AdminUser) => {
    setDeleting(true);
    try {
      await adminApi.deleteUser(token, user.id);
      setUsers(us => us.filter(u => u.id !== user.id));
      setDeleteConfirm(null);
      show(`${user.display_name ?? user.email} deleted`, true);
    } catch (e: unknown) {
      show(e instanceof Error ? e.message : "Delete failed", false);
    } finally {
      setDeleting(false);
    }
  };

  // Only show regular players — hide admins/superadmins
  const players = users.filter(u => u.role === "user");
  const filtered = players.filter(u =>
    !search || [u.email, u.username, u.display_name].some(v => v?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f6f8] text-gray-900">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
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

        {/* Live game ticker */}
        <LiveTicker />

        <div className="ml-auto flex items-center gap-2">
          {/* Save status indicator */}
          <div className={`flex items-center gap-1 text-[11px] transition-opacity duration-200 ${savingGlobal || savedGlobal ? "opacity-100" : "opacity-0"}`}>
            {savingGlobal ? (
              <><Spinner /><span className="text-gray-400">Saving…</span></>
            ) : (
              <><Check className="h-3 w-3 text-emerald-500" /><span className="text-emerald-600">Saved</span></>
            )}
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

        {/* ── Left sidebar: Global controls ──────────────────────────── */}
        <aside className="flex w-[292px] shrink-0 flex-col border-r border-gray-200 bg-white overflow-y-auto">

          {/* 1. Global win rate */}
          <div className="border-b border-gray-100 px-5 py-5">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="text-[12px] font-bold text-gray-800">Global Win Rate</p>
              {/* Live badge showing current value + zone */}
              <span className={`rounded-lg px-2 py-0.5 text-[11px] font-black tabular-nums ${
                globalWinRate >= 75 ? "bg-emerald-100 text-emerald-700"
                : globalWinRate <= 25 ? "bg-red-100 text-red-600"
                : "bg-gray-100 text-gray-600"
              }`}>{globalWinRate}%</span>
            </div>

            {/* Zone labels above slider */}
            <div className="mb-1.5 flex justify-between">
              <span className="text-[9px] font-semibold uppercase tracking-wider text-red-400">House wins</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Fair</span>
              <span className="text-[9px] font-semibold uppercase tracking-wider text-emerald-500">Players win</span>
            </div>

            {/* Gradient track slider */}
            <div className="relative h-8">
              {/* Gradient track */}
              <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full"
                style={{ background: "linear-gradient(to right, #ef4444, #f59e0b 50%, #10b981)" }} />
              {/* Filled overlay (white left of thumb to show unselected) */}
              <div className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-l-full bg-white/60"
                style={{ left: 0, width: `${globalWinRate}%` }} />
              {/* Native range input */}
              <input type="range" min={0} max={100} value={globalWinRate}
                onChange={e => handleRateChange(Number(e.target.value))}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
              {/* Thumb indicator */}
              <div className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition-colors"
                style={{
                  left: `${globalWinRate}%`,
                  background: globalWinRate >= 75 ? "#10b981" : globalWinRate <= 25 ? "#ef4444" : "#6b7280"
                }} />
            </div>

            {/* Preset buttons */}
            <div className="mt-3 grid grid-cols-5 gap-1">
              {([
                { label: "0%",   v: 0,   color: "text-red-500"     },
                { label: "25%",  v: 25,  color: "text-orange-400"  },
                { label: "50%",  v: 50,  color: "text-gray-500"    },
                { label: "75%",  v: 75,  color: "text-emerald-500" },
                { label: "100%", v: 100, color: "text-emerald-600" },
              ] as const).map(p => (
                <button key={p.v} onClick={() => handleRateChange(p.v)}
                  className={`rounded-lg border py-1.5 text-[10px] font-bold transition ${
                    globalWinRate === p.v
                      ? "border-gray-300 bg-gray-100 " + p.color
                      : "border-gray-200 text-gray-300 hover:bg-gray-50 hover:" + p.color
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>

            {/* Description text */}
            <p className="mt-3 text-[10px] leading-relaxed text-gray-400">
              {globalWinRate >= 90 ? "Players will win almost every round with large multipliers."
              : globalWinRate >= 65 ? "Players win more often than they lose — house edge is negative."
              : globalWinRate >= 35 ? "Balanced — crash points are statistically fair."
              : globalWinRate >= 10 ? "House wins more often — players lose most bets."
              : "Players will crash almost every round before cashing out."}
            </p>
          </div>

          {/* 2. Bet limits */}
          <div className="px-5 py-5">
            <p className="mb-1 text-[12px] font-bold text-gray-800">Bet Limits</p>
            <p className="mb-4 text-[11px] text-gray-400">Min and max bet amount for all players.</p>
            <div className="space-y-3">
              <NumStepper label="Minimum bet" value={minBet} onChange={handleMinBetChange}
                min={1} max={99999} step={10} suffix="R" />
              <NumStepper label="Maximum bet" value={maxBet} onChange={handleMaxBetChange}
                min={1} max={9999999} step={500} suffix="R" />
            </div>
          </div>

          {/* Auto-save hint */}
          <div className="mt-auto border-t border-gray-100 px-5 py-3">
            <p className="text-[10px] text-gray-300">Auto-saved · changes apply next round</p>
          </div>
        </aside>

        {/* ── Right: Users list ───────────────────────────────────────── */}
        <main className="flex min-w-0 flex-1 flex-col">

          {/* Search + Create */}
          <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-300"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search players…"
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-[13px] text-gray-700 placeholder-gray-300 outline-none transition focus:border-gray-300 focus:bg-white" />
            </div>
            <button onClick={() => setShowCreate(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-[#e8173a] px-3.5 py-2.5 text-[12px] font-bold text-white transition hover:bg-[#c9122f] active:scale-[0.98]">
              <UserPlus className="h-3.5 w-3.5" />
              New Player
            </button>
          </div>

          {/* Column header */}
          <div className="grid grid-cols-[1fr_auto] items-center border-b border-gray-100 bg-gray-50/80 px-5 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Player — {filtered.length}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Outcome Control</span>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <div className="flex items-center justify-center gap-2 py-20 text-gray-300">
                <Spinner /><span className="text-[13px]">Loading users…</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-20 text-center text-[13px] text-gray-300">No users found</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filtered.map(user => {
                  const ctrl  = user.win_control;
                  const mode: Mode = ctrl?.win_mode ?? "normal";
                  const rate  = ctrl ? Math.round(ctrl.win_rate * 100) : null;
                  const isBusy = rowSaving[user.id];

                  return (
                    <div key={user.id} className="flex items-center gap-4 bg-white px-5 py-3 transition hover:bg-gray-50">

                      {/* Avatar + name */}
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                          mode === "win"  ? "bg-emerald-100 text-emerald-600"
                          : mode === "loss" ? "bg-red-100 text-red-500"
                                           : "bg-gray-100 text-gray-500"
                        }`}>
                          {(user.display_name ?? user.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-gray-800">
                              {user.display_name ?? user.username ?? user.email.split("@")[0]}
                            </span>
                            <ModePill mode={mode} />
                          </div>
                          {/* Inline win rate bar */}
                          {rate !== null && (
                            <div className="mt-1 flex items-center gap-2">
                              <div className="h-1 w-20 rounded-full bg-gray-200">
                                <div className={`h-1 rounded-full transition-all ${
                                  mode === "win" ? "bg-emerald-500" : mode === "loss" ? "bg-red-500" : "bg-indigo-400"
                                }`} style={{ width: `${rate}%` }} />
                              </div>
                              <span className="text-[10px] tabular-nums text-gray-400">{rate}%</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Crash range chip */}
                      {ctrl?.min_cashout != null && (
                        <div className="hidden shrink-0 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-400 lg:block">
                          {ctrl.min_cashout}–{ctrl.max_cashout ?? "∞"}×
                        </div>
                      )}

                      {/* WIN / AUTO / LOSS quick-buttons + edit/delete */}
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
                        {/* Precise win control */}
                        <button onClick={() => setDrawer(user)}
                          title="Set precise win % and crash range"
                          className="ml-0.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[13px] text-gray-400 transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-600">
                          ···
                        </button>
                        {/* Divider */}
                        <div className="mx-1 h-5 w-px bg-gray-200" />
                        {/* Edit */}
                        <button onClick={() => setEditUser(user)}
                          title="Edit player"
                          className="rounded-lg border border-gray-200 p-1.5 text-gray-400 transition hover:border-gray-300 hover:bg-gray-100 hover:text-gray-700">
                          <Pencil className="h-3 w-3" />
                        </button>
                        {/* Delete */}
                        <button onClick={() => setDeleteConfirm(user)}
                          title="Delete player"
                          className="rounded-lg border border-gray-200 p-1.5 text-gray-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-500">
                          <Trash2 className="h-3 w-3" />
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

      {/* Win control drawer */}
      {drawer && (
        <UserDrawer user={drawer} token={token}
          onClose={() => setDrawer(null)} onSaved={handleDrawerSaved} />
      )}

      {/* Create user modal */}
      {showCreate && (
        <CreateUserModal token={token} onClose={() => setShowCreate(false)} onCreated={loadUsers} />
      )}

      {/* Edit user modal */}
      {editUser && (
        <EditUserModal user={editUser} token={token}
          onClose={() => setEditUser(null)} onSaved={handleEditSaved} />
      )}

      {/* Delete confirm modal */}
      {deleteConfirm && (
        <Modal title="Delete Player" onClose={() => setDeleteConfirm(null)}>
          <div className="px-5 py-4">
            <p className="text-[13px] text-gray-600">
              Permanently delete <span className="font-bold text-gray-900">{deleteConfirm.display_name ?? deleteConfirm.email}</span>? This cannot be undone.
            </p>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-[13px] font-semibold text-gray-500 transition hover:bg-gray-50">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} disabled={deleting}
                className="flex-[2] flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 text-[13px] font-bold text-white transition hover:bg-red-600 disabled:opacity-50">
                {deleting ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />}
                Delete Player
              </button>
            </div>
          </div>
        </Modal>
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
