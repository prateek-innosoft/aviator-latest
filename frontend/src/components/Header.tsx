import { Logo } from "../assets/Logo";
import { useGame } from "../store/gameStore";
import { fmt } from "../lib/format";

export function Header() {
  const balance  = useGame((s) => s.balance);
  const currency = useGame((s) => s.currency);

  return (
    <header
      data-testid="header"
      className="flex shrink-0 items-center justify-between border-b border-brand/50 bg-[#1b1d1f] px-3 py-1.5 sm:px-5"
    >
      <Logo className="h-[26px] sm:h-[30px]" />

      <div className="flex items-center gap-3">
        {/* Balance */}
        <div className="flex items-baseline gap-1">
          <span data-testid="header-balance" className="text-[14px] font-bold sm:text-[16px]">
            {fmt(balance)}
          </span>
          <span className="text-[11px] font-medium text-white/55 sm:text-[12px]">
            {currency}
          </span>
        </div>
      </div>
    </header>
  );
}
