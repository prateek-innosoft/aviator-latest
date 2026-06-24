import { useEffect, useState } from "react";
import { Settings, Zap, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";
import { adminApi, type AdminControls } from "../api";
import { Card, CardTitle, Button, Input, Badge, Toast, Divider } from "../ui";

type ToastState = { msg: string; type: "success" | "error" } | null;

export function GameControls({ token }: { token: string }) {
  const [controls, setControls] = useState<AdminControls | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  // Local form state
  const [winMode, setWinMode]             = useState<"normal" | "win" | "loss">("normal");
  const [nextCrash, setNextCrash]         = useState("");
  const [forcedCrash, setForcedCrash]     = useState("");
  const [minBet, setMinBet]               = useState("");
  const [maxBet, setMaxBet]               = useState("");
  const [houseEdge, setHouseEdge]         = useState("");

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const { controls } = await adminApi.getControls(token);
      setControls(controls);
      setWinMode(controls.win_mode);
      setNextCrash(controls.next_crash_point != null ? String(controls.next_crash_point) : "");
      setForcedCrash(controls.forced_crash != null ? String(controls.forced_crash) : "");
      setMinBet(String(controls.min_bet));
      setMaxBet(String(controls.max_bet));
      setHouseEdge(String(Math.round(controls.house_edge * 100)));
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Load failed", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const save = async (patch: Partial<AdminControls>) => {
    setSaving(true);
    try {
      await adminApi.patchControls(token, patch);
      showToast("Saved", "success");
      load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-white">Game Controls</h2>
        <Button variant="ghost" size="sm" onClick={load} loading={loading}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {/* Current status strip */}
      {controls && (
        <div className="flex flex-wrap gap-2">
          <Badge color={controls.win_mode === "win" ? "green" : controls.win_mode === "loss" ? "red" : "gray"}>
            Mode: {controls.win_mode}
          </Badge>
          {controls.forced_crash && <Badge color="red">Forced crash @ {controls.forced_crash}×</Badge>}
          {controls.next_crash_point && <Badge color="yellow">Next crash @ {controls.next_crash_point}×</Badge>}
          <Badge color="gray">Bets: R{controls.min_bet}–R{controls.max_bet}</Badge>
        </div>
      )}

      {/* ── Win Mode ─────────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Settings className="h-3.5 w-3.5" /> Global Win Mode
          </div>
        </CardTitle>
        <p className="mb-4 text-[12px] text-white/40">
          Control whether the house favors wins, losses, or plays provably fair.
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
              {m === "normal" ? "⚖ Normal (Provably Fair)" : m === "win" ? "✅ Force Win" : "❌ Force Loss"}
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save({ win_mode: winMode })} loading={saving}>Apply Win Mode</Button>
        </div>
      </Card>

      {/* ── Crash Point Controls ─────────────────────────────────────────── */}
      <Card>
        <CardTitle>
          <div className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5" /> Crash Point Overrides
          </div>
        </CardTitle>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Input
              label="Next Round Crash Point (one-shot)"
              type="number"
              step="0.01"
              min="1.01"
              max="130"
              value={nextCrash}
              onChange={e => setNextCrash(e.target.value)}
              placeholder="e.g. 5.00 — consumed after 1 round"
            />
            <p className="mt-1 text-[11px] text-white/30">Overrides the next round only, then resets to normal.</p>
          </div>
          <div>
            <Input
              label="Forced Crash (every round)"
              type="number"
              step="0.01"
              min="1.01"
              max="130"
              value={forcedCrash}
              onChange={e => setForcedCrash(e.target.value)}
              placeholder="e.g. 1.20 — applies permanently until cleared"
            />
            <p className="mt-1 text-[11px] text-white/30">Leave empty to disable forced crash.</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 justify-end">
          <Button variant="ghost" onClick={() => { setNextCrash(""); setForcedCrash(""); save({ next_crash_point: null, forced_crash: null }); }}>
            Clear Overrides
          </Button>
          <Button
            onClick={() => save({
              next_crash_point: nextCrash ? Number(nextCrash) : null,
              forced_crash:     forcedCrash ? Number(forcedCrash) : null,
            })}
            loading={saving}
          >
            Apply Crash Overrides
          </Button>
        </div>
      </Card>

      {/* ── Bet Limits ───────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>
          <div className="flex items-center gap-2">
            <TrendingDown className="h-3.5 w-3.5" /> Global Bet Limits
          </div>
        </CardTitle>
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Min Bet (ZAR)"
            type="number"
            min="0.01"
            value={minBet}
            onChange={e => setMinBet(e.target.value)}
          />
          <Input
            label="Max Bet (ZAR)"
            type="number"
            min="1"
            value={maxBet}
            onChange={e => setMaxBet(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={() => save({ min_bet: Number(minBet), max_bet: Number(maxBet) })} loading={saving}>
            Apply Bet Limits
          </Button>
        </div>
      </Card>

      {/* ── House Edge ───────────────────────────────────────────────────── */}
      <Card>
        <CardTitle>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" /> House Edge
          </div>
        </CardTitle>
        <div className="flex items-end gap-4">
          <div className="w-48">
            <Input
              label="House Edge (%)"
              type="number"
              min="0"
              max="50"
              step="0.5"
              value={houseEdge}
              onChange={e => setHouseEdge(e.target.value)}
            />
          </div>
          <Button onClick={() => save({ house_edge: Number(houseEdge) / 100 })} loading={saving}>
            Apply
          </Button>
        </div>
        <Divider />
        <p className="text-[11px] text-white/30">
          ⚠ House edge affects the expected value of the provably fair crash point calculation.
          Changes take effect on the next round.
        </p>
      </Card>

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
