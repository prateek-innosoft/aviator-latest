import { useEffect, useState } from "react";
import { useGame } from "../store/gameStore";

export function BetErrorToast() {
  const betErrorToast = useGame((s) => s.betErrorToast);
  const [visible, setVisible] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (betErrorToast) {
      setMsg(betErrorToast.msg);
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [betErrorToast]);

  if (!visible) return null;

  return (
    <div
      className="fixed left-1/2 top-20 z-[200] -translate-x-1/2 animate-[fadeSlide_0.3s_ease-out] rounded-xl border border-red-400/40 bg-[#2a1215] px-5 py-3 text-[14px] font-semibold text-red-300 shadow-[0_4px_20px_rgba(0,0,0,0.5)]"
      style={{ animation: "fadeSlide 0.3s ease-out" }}
    >
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 fill-none stroke-current" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </svg>
        {msg}
      </div>
    </div>
  );
}
