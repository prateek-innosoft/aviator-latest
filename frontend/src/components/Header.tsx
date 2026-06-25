import { Logo } from "../assets/Logo";
import { useGame } from "../store/gameStore";
import { fmt } from "../lib/format";

export function Header() {
  const balance = useGame((s) => s.balance);
  const currency = useGame((s) => s.currency);

  return (
    <header
      data-testid="header"
      className="flex shrink-0 items-center justify-between border-b border-brand/50 bg-[#1b1d1f] px-3 py-1.5 sm:px-5"
    >
      <Logo className="h-[26px] sm:h-[30px]" />
      <div
        data-testid="balance-display"
        className="flex items-center gap-1.5 rounded-full bg-[#0f1112] px-3 py-1 sm:px-4"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-[#43c352]" fill="none">
          <path
            d="M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7z"
            stroke="currentColor"
            strokeWidth="1.6"
          />
          <path d="M3 7l2-3h14l2 3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <span className="text-[14px] font-bold text-white sm:text-[15px]">
          {fmt(balance)}
        </span>
        <span className="text-[12px] font-medium text-white/50 sm:text-[13px]">
          {currency}
        </span>
      </div>
    </header>
  );
}
