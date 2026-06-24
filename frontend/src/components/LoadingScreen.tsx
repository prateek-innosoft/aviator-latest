import { useEffect, useState } from "react";
import { Logo } from "../assets/Logo";

/**
 * Branded Aviator loading screen.
 * Shows while the socket connects and the first game state arrives,
 * then fades out smoothly.
 */
export function LoadingScreen({ done }: { done: boolean }) {
  const [hidden, setHidden] = useState(false);

  // After `done` flips true, wait for the fade-out animation then unmount.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setHidden(true), 600);
    return () => clearTimeout(t);
  }, [done]);

  if (hidden) return null;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-[#0e0e10] transition-opacity duration-500 ${
        done ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Logo */}
      <div className="relative flex flex-col items-center">
        <Logo className="h-[120px] w-auto" />

        {/* Loading bar */}
        <div className="mt-8 h-[3px] w-[180px] overflow-hidden rounded-full bg-[#1b1c20]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#e50539] to-[#ff6b35]"
            style={{
              animation: "loading-sweep 1.2s ease-in-out infinite",
            }}
          />
        </div>

        {/* Loading text */}
        <div className="mt-4 text-[12px] font-medium tracking-wide text-white/40">
          Loading game
          <span className="loading-dot">.</span>
          <span className="loading-dot" style={{ animationDelay: "0.2s" }}>.</span>
          <span className="loading-dot" style={{ animationDelay: "0.4s" }}>.</span>
        </div>
      </div>
    </div>
  );
}
