export function Footer() {
  return (
    <div className="flex items-center justify-center bg-[#111315] px-4 py-2 text-white/38">
      <div className="flex items-center gap-1.5">
        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-[#19b561]" fill="currentColor">
          <path d="M12 1l9 4v6c0 5-3.8 9.4-9 11-5.2-1.6-9-6-9-11V5l9-4z" />
        </svg>
        <span className="text-[11px] font-medium">Provably Fair Game</span>
      </div>
    </div>
  );
}
