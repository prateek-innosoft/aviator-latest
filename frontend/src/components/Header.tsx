import { Logo } from "../assets/Logo";

export function Header() {
  return (
    <header
      data-testid="header"
      className="flex shrink-0 items-center justify-between border-b border-brand/50 bg-[#1b1d1f] px-3 py-1.5 sm:px-5"
    >
      <Logo className="h-[26px] sm:h-[30px]" />
    </header>
  );
}
