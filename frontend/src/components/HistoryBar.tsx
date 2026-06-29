import { useState } from "react";
import { useGame } from "../store/gameStore";
import { multTier } from "../lib/format";

const tierColor: Record<string, string> = {
  crash: "text-[#ff4444]", // sub-1x house win — distinct red
  low: "text-low",
  mid: "text-mid",
  high: "text-high",
};

export function HistoryBar() {
  const history = useGame((s) => s.history);
  const [open, setOpen] = useState(false);

  return (
    <div data-testid="history-bar" className="relative z-50 px-1 py-1">
      <div className="flex items-center gap-2 rounded-xl bg-black px-2.5 py-1.5">
        <div className="no-scrollbar flex flex-1 items-center gap-3 overflow-x-auto">
          {history.map((h) => (
            <span
              key={h.id}
              className={`shrink-0 text-[11px] font-bold sm:text-[12px] ${
                tierColor[multTier(h.multiplier)]
              }`}
            >
              {h.multiplier.toFixed(2)}x
            </span>
          ))}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="History"
          className="flex h-5 w-8 shrink-0 items-center justify-center rounded-full bg-[#303136] text-white/45 transition hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="absolute right-1 top-9 z-[60] w-[280px] rounded-lg border border-[#2a2b2f] bg-[#1b1c20] p-3 shadow-2xl sm:w-[340px]">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-white/50">
            Round history
          </p>
          <div className="flex flex-wrap gap-1.5">
            {history.map((h) => (
              <span
                key={`p-${h.id}`}
                className={`rounded-full bg-black/40 px-2 py-0.5 text-[12px] font-bold ${
                  tierColor[multTier(h.multiplier)]
                }`}
              >
                {h.multiplier.toFixed(2)}x
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
