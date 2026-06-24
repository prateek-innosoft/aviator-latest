import { useState } from "react";
import { ChevronLeft, Save, Trash2 } from "lucide-react";
import { adminApi, type AdminUser, type WinControl } from "../api";
import { Card, CardTitle, Button, Input, Badge, Toast, Divider } from "../ui";

type ToastState = { msg: string; type: "success" | "error" } | null;

export function WinControls({ user, token, onBack }: { user: AdminUser; token: string; onBack: () => void }) {
  const existing = user.win_control;

  const [winMode, setWinMode]       = useState<"normal" | "win" | "loss">(existing?.win_mode ?? "normal");
  const [winRate, setWinRate]       = useState(String(Math.round((existing?.win_rate ?? 0.5) * 100)));
  const [minCashout, setMinCashout] = useState(existing?.min_cashout != null ? String(existing.min_cashout) : "");
  const [maxCashout, setMaxCashout] = useState(existing?.max_cashout != null ? String(existing.max_cashout) : "");
  const [minBet, setMinBet]         = useState(existing?.min_bet != null ? String(existing.min_bet) : "");
  const [maxBet, setMaxBet]         = useState(existing?.max_bet != null ? String(existing.max_bet) : "");
  const [notes, setNotes]           = useState(existing?.notes ?? "");
  const [saving, setSaving]         = useState(false);
  const [toast, setToast]           = useState<ToastState>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Omit<WinControl, "user_id"> = {
        win_mode:    winMode,
        win_rate:    Number(winRate) / 100,
        min_cashout: minCashout ? Number(minCashout) : null,
        max_cashout: maxCashout ? Number(maxCashout) : null,
        min_bet:     minBet ? Number(minBet) : null,
        max_bet:     maxBet ? Number(maxBet) : null,
        notes:       notes || null,
      };
      await adminApi.putWinControl(token, user.id, body);
      showToast("Win control saved", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    if (!confirm("Remove all win controls for this user?")) return;
    setSaving(true);
    try {
      await adminApi.deleteWinControl(token, user.id);
      showToast("Controls removed", "success");
      setTimeout(onBack, 800);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h2 className="text-[18px] font-bold text-white">Win Controls</h2>
          <p className="text-[12px] text-white/40">{user.display_name ?? user.username ?? user.email}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge color={winMode === "win" ? "green" : winMode === "loss" ? "red" : "gray"}>
            {winMode}
          </Badge>
        </div>
      </div>

      {/* ── Win Mode ───────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Win / Loss Mode</CardTitle>
        <p className="mb-4 text-[12px] text-white/40">
          Override this user's outcome. "Win" forces high crash points; "Loss" forces low.
        </p>
        <div className="flex flex-wrap gap-2">
          {(["normal", "win", "loss"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setWinMode(m)}
              className={`rounded-lg border px-4 py-2.5 text-[13px] font-semibold capitalize transition ${
                winMode === m
                  ? m === "win"
                    ? "border-green-500/40 bg-green-500/15 text-green-400"
                    : m === "loss"
                    ? "border-red-500/40 bg-red-500/15 text-red-400"
                    : "border-white/20 bg-white/10 text-white"
                  : "border-white/8 bg-transparent text-white/40 hover:bg-white/5"
              }`}
            >
              {m === "normal" ? "⚖ Normal" : m === "win" ? "✅ Force Win" : "❌ Force Loss"}
            </button>
          ))}
        </div>

        <Divider />

        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-medium text-white/50">
            Win Rate — {winRate}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={winRate}
            onChange={e => setWinRate(e.target.value)}
            className="w-full accent-[#e8173a]"
          />
          <div className="flex justify-between text-[10px] text-white/25">
            <span>0% (always lose)</span>
            <span>50% (fair)</span>
            <span>100% (always win)</span>
          </div>
          <p className="mt-1 text-[11px] text-white/30">
            Probability of the crash happening above their cashout target. Only effective in "Normal" mode.
          </p>
        </div>
      </Card>

      {/* ── Cashout Range ──────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Cashout Multiplier Clamps</CardTitle>
        <p className="mb-4 text-[12px] text-white/40">
          Force the crash point to always land within a range so the user can (or cannot) cash out.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Min Crash Point (×)"
            type="number"
            step="0.01"
            min="1.01"
            max="130"
            value={minCashout}
            onChange={e => setMinCashout(e.target.value)}
            placeholder="e.g. 2.00 — crash never below 2×"
          />
          <Input
            label="Max Crash Point (×)"
            type="number"
            step="0.01"
            min="1.01"
            max="130"
            value={maxCashout}
            onChange={e => setMaxCashout(e.target.value)}
            placeholder="e.g. 1.50 — crash never above 1.5×"
          />
        </div>
      </Card>

      {/* ── Per-user Bet Limits ────────────────────────────────────────── */}
      <Card>
        <CardTitle>Per-User Bet Limits</CardTitle>
        <p className="mb-4 text-[12px] text-white/40">
          Override global bet limits for this user. Leave blank to use global defaults.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Min Bet (ZAR)"
            type="number"
            min="0.01"
            value={minBet}
            onChange={e => setMinBet(e.target.value)}
            placeholder="Inherit global"
          />
          <Input
            label="Max Bet (ZAR)"
            type="number"
            min="1"
            value={maxBet}
            onChange={e => setMaxBet(e.target.value)}
            placeholder="Inherit global"
          />
        </div>
      </Card>

      {/* ── Notes ─────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>Admin Notes</CardTitle>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="Internal notes about this user's controls…"
          className="w-full rounded-lg border border-white/10 bg-[#0f1012] px-3 py-2 text-[13px] text-white placeholder-white/25 outline-none transition focus:border-[#e8173a]/60 resize-none"
        />
      </Card>

      {/* ── Actions ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="danger" onClick={clear} loading={saving}>
          <Trash2 className="h-3.5 w-3.5" /> Remove Controls
        </Button>
        <Button onClick={save} loading={saving}>
          <Save className="h-3.5 w-3.5" /> Save Controls
        </Button>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
