import { useRef, useEffect, useState } from "react";
import { gsap } from "gsap";
import { useGame } from "../store/gameStore";
import { fmt } from "../lib/format";

const CHIPS = [10, 20, 50, 100];

export function BetPanel({
  index,
  canRemove = false,
  canAdd = false,
  onRemove,
  onAdd,
}: {
  index: 0 | 1;
  canRemove?: boolean;
  canAdd?: boolean;
  onRemove?: () => void;
  onAdd?: () => void;
}) {
  const panel = useGame((s) => s.panels[index]);
  const phase = useGame((s) => s.phase);
  const multiplier = useGame((s) => s.multiplier);
  const balance = useGame((s) => s.balance);
  const betLimits = useGame((s) => s.betLimits);
  const setPanel = useGame((s) => s.setPanel);
  const placeBet = useGame((s) => s.placeBet);
  const cancelBet = useGame((s) => s.cancelBet);
  const cashOut = useGame((s) => s.cashOut);

  const btnRef = useRef<HTMLButtonElement>(null);

  // Local text drafts so the user can type freely (e.g. intermediate states
  // like "1." or deleting decimals) without the controlled value snapping
  // back on every keystroke. Committed on blur / Enter.
  const [amountDraft, setAmountDraft] = useState<string | null>(null);
  const [acoDraft, setAcoDraft] = useState<string | null>(null);

  const sanitizeDecimal = (raw: string) => {
    let s = raw.replace(/[^0-9.]/g, "");
    const dot = s.indexOf(".");
    if (dot !== -1) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
    return s;
  };

  const commitAco = () => {
    const v = parseFloat(acoDraft ?? "");
    setPanel(index, {
      autoCashOutValue: Number.isNaN(v)
        ? panel.autoCashOutValue
        : Math.max(1.01, Math.round(v * 100) / 100),
    });
    setAcoDraft(null);
  };

  const clamp = (v: number) => Math.max(betLimits.minBet, Math.min(betLimits.maxBet, Math.round(v * 100) / 100));
  const setAmount = (v: number) => setPanel(index, { amount: clamp(v) });

  const commitAmount = () => {
    if (amountDraft === null) return;
    const v = parseFloat(amountDraft);
    if (!Number.isNaN(v) && v > 0) setAmount(v);
    setAmountDraft(null);
  };

  // Pulse the cash-out button as the multiplier climbs.
  useEffect(() => {
    if (panel.active && phase === "flying" && !panel.cashedOut && btnRef.current) {
      gsap.fromTo(
        btnRef.current,
        { scale: 1 },
        { scale: 1.015, duration: 0.18, yoyo: true, repeat: 1, ease: "power1.inOut" },
      );
    }
  }, [Math.floor(multiplier * 10), panel.active, phase, panel.cashedOut]);

  type ActionKind = "bet" | "cancel" | "cancelQueued" | "cashout" | "waiting";
  let action: ActionKind = "bet";
  if (panel.active && phase === "flying" && !panel.cashedOut) action = "cashout";
  else if (panel.active && phase === "betting") action = "cancel";
  else if (panel.queued) action = "cancelQueued";
  else if (panel.cashedOut) action = "waiting";

  const potentialWin = panel.amount * multiplier;
  const insufficient = panel.amount > balance;
  // When auto-bet is on, betting is handled automatically each round, so the
  // manual button is locked to prevent double bets.
  const autoLocked = panel.mode === "auto" && panel.autoBet;

  const onAction = () => {
    if (action === "bet") {
      if (insufficient || autoLocked) return;
      gsap.fromTo(
        btnRef.current,
        { scale: 0.96 },
        { scale: 1, duration: 0.25, ease: "back.out(2)" },
      );
      placeBet(index);
    } else if (action === "cashout") {
      cashOut(index);
    } else if (action === "cancel" || action === "cancelQueued") {
      cancelBet(index);
    }
  };

  const disabled =
    action === "waiting" || (action === "bet" && (insufficient || autoLocked));

  return (
    <div
      data-testid={`bet-panel-${index}`}
      className="rounded-[18px] border border-[#242629] bg-[#1b1d1f] p-2"
    >
      {/* Mode tabs + add/remove panel control */}
      <div className="relative mb-2 flex items-center justify-center">
        <div className="flex min-w-[156px] rounded-full bg-[#101113] p-0.5 max-[380px]:min-w-[132px]">
          {(["bet", "auto"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setPanel(index, { mode: m })}
              className={`flex-1 rounded-full px-4 py-1 text-[12px] font-medium capitalize transition max-[380px]:px-2 ${
                panel.mode === m
                  ? "bg-[#2c2d30] text-white"
                  : "text-white/55 hover:text-white/80"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        {canRemove && (
          <button
            onClick={onRemove}
            aria-label="Merge into single panel"
            className="absolute right-0 flex h-7 w-7 items-center justify-center rounded-md border border-[#34353a] text-white/55 transition hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <rect x="4" y="5.5" width="16" height="13" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}

        {canAdd && (
          <button
            onClick={onAdd}
            aria-label="Add second panel"
            className="absolute right-0 flex h-7 w-7 items-center justify-center rounded-md border border-[#2f9e3f] text-[#43c352] transition hover:bg-[#143019]"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <rect x="4" y="5.5" width="16" height="13" rx="2.2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 9v6M9 12h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.22fr)] gap-2">
        {/* Left: amount controls */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between rounded-full bg-[#0f1112] px-1 py-1">
            <button
              onClick={() => setAmount(panel.amount - 1)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2c2d30] text-white/60 transition hover:bg-[#3a3b40] max-[380px]:h-6 max-[380px]:w-6"
              aria-label="Decrease"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                <path d="M6 12h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
            <input
              value={amountDraft ?? panel.amount.toFixed(2)}
              onFocus={() => setAmountDraft(panel.amount.toFixed(2))}
              onChange={(e) => setAmountDraft(sanitizeDecimal(e.target.value))}
              onBlur={commitAmount}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              inputMode="decimal"
              className="w-full min-w-0 bg-transparent text-center text-[15px] font-bold text-white/55 outline-none max-[380px]:text-[13px]"
            />
            <button
              onClick={() => setAmount(panel.amount + 1)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2c2d30] text-white/60 transition hover:bg-[#3a3b40] max-[380px]:h-6 max-[380px]:w-6"
              aria-label="Increase"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none">
                <path d="M12 6v12M6 12h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {CHIPS.map((c) => (
              <button
                key={c}
                onClick={() => setAmount(c)}
                className="rounded-full bg-[#0f1112] py-1 text-[12px] font-medium text-white/48 transition hover:bg-[#26272b] hover:text-white max-[380px]:text-[11px]"
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Right: action button */}
        <button
          ref={btnRef}
          onClick={onAction}
          disabled={disabled}
          className={`relative flex min-h-[66px] flex-col items-center justify-center rounded-xl border text-center font-bold leading-tight transition active:translate-y-[1px] sm:min-h-[72px] ${
            action === "cashout"
              ? "border-[#ffb24d] bg-gradient-to-b from-[#ffaf3a] to-[#f08a1c] text-black shadow-[0_4px_0_#b9670f]"
              : action === "cancel" || action === "cancelQueued"
                ? "border-[#d6433f] bg-gradient-to-b from-[#e0524d] to-[#c2403c] text-white shadow-[0_4px_0_#8f2a27]"
                : action === "waiting"
                  ? "border-[#2c2d30] bg-[#23242a] text-white/50"
                  : panel.cashedOut
                    ? "border-[#3fd13f] bg-gradient-to-b from-[#2a4a32] to-[#1a3324] text-white"
                    : insufficient || autoLocked
                    ? "border-[#2c2d30] bg-[#23242a] text-white/40"
                    : "border-[#3fd13f] bg-gradient-to-b from-[#3fc94a] to-[#1f9e2c] text-white shadow-[0_4px_0_#147a1f]"
          }`}
        >
          {action === "cashout" ? (
            <>
              <span className="text-[17px] sm:text-[18px]">Cash Out</span>
              <span className="text-[15px] sm:text-[16px]">
                {fmt(potentialWin)} ZAR
              </span>
            </>
          ) : action === "cancel" ? (
            <>
              <span className="text-[17px] sm:text-[18px]">Cancel</span>
              <span className="text-[12px] font-medium opacity-80">
                {fmt(panel.amount)} ZAR
              </span>
            </>
          ) : action === "cancelQueued" ? (
            <>
              <span className="text-[16px]">Cancel</span>
              <span className="text-[11px] font-medium opacity-80">
                Waiting for next round
              </span>
            </>
          ) : panel.cashedOut && panel.cashedOutAt != null ? (
            <>
              <span className="mb-1 rounded-full bg-[#1a3d24] px-3 py-0.5 text-[14px] font-extrabold text-green-2">
                {panel.cashedOutAt.toFixed(2)}x
              </span>
              <span className="text-[12px] font-medium text-white/70">You have cashed out</span>
            </>
          ) : action === "waiting" ? (
            <span className="flex items-center gap-1 text-[13px]">
              Waiting
              <span className="loading-dot">.</span>
              <span className="loading-dot" style={{ animationDelay: "0.2s" }}>.</span>
              <span className="loading-dot" style={{ animationDelay: "0.4s" }}>.</span>
            </span>
          ) : (
            <>
              <span className="text-[18px] sm:text-[20px]">Bet</span>
              <span className="text-[14px] sm:text-[16px]">
                {fmt(panel.amount)} ZAR
              </span>
            </>
          )}
        </button>
      </div>

      {/* Auto controls */}
      {panel.mode === "auto" && (
        <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-[#26272b] pt-2.5 text-[12px]">
          <label className="flex items-center gap-2">
            <span className="text-white/70">Auto bet</span>
            <Toggle
              label="Auto bet"
              on={panel.autoBet}
              onChange={(v) => {
                setPanel(index, { autoBet: v });
                if (
                  v &&
                  phase === "betting" &&
                  !panel.active &&
                  !panel.queued &&
                  panel.amount <= balance
                ) {
                  placeBet(index);
                }
              }}
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-white/70">Auto Cash Out</span>
            <Toggle
              label="Auto cash out"
              on={panel.autoCashOut}
              onChange={(v) => setPanel(index, { autoCashOut: v })}
            />
            <div
              className={`flex items-center gap-1 rounded-full px-2 py-1 transition ${
                panel.autoCashOut ? "bg-[#0d0e10]" : "bg-[#0d0e10]/50 opacity-50"
              }`}
            >
              <input
                value={acoDraft ?? panel.autoCashOutValue.toFixed(2)}
                disabled={!panel.autoCashOut}
                onChange={(e) => setAcoDraft(sanitizeDecimal(e.target.value))}
                onBlur={commitAco}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                inputMode="decimal"
                className="w-11 bg-transparent text-right text-[12px] font-bold text-white outline-none disabled:cursor-not-allowed"
              />
              <button
                onClick={() =>
                  setPanel(index, { autoCashOut: false, autoCashOutValue: 1.1 })
                }
                disabled={!panel.autoCashOut}
                aria-label="Clear auto cash out"
                className="flex h-4 w-4 items-center justify-center text-white/40 transition hover:text-white disabled:opacity-30"
              >
                <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none">
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onChange, label = "Toggle" }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 rounded-full transition ${
        on ? "bg-green-2" : "bg-[#3a3b40]"
      }`}
      aria-pressed={on}
      aria-label={label}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
          on ? "left-[18px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
