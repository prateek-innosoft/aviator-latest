import { useEffect } from "react";
import { useGame } from "./store/gameStore";
import { socket } from "./lib/socket";
import { Header } from "./components/Header";
import { HistoryBar } from "./components/HistoryBar";
import { GameCanvas } from "./components/GameCanvas";
import { BetPanels } from "./components/BetPanels";
import { LiveBets } from "./components/LiveBets";
import { LoginScreen } from "./components/LoginScreen";
import { AdminPanel } from "./admin/AdminPanel";
import { AuthProvider, useAuth } from "./lib/authContext";

function GameApp() {
  const init    = useGame((s) => s.init);
  const setAuth = useGame((s) => s.setAuth);
  const { session, profile, loading } = useAuth();

  // Pass userId + token into the game store and identify to backend for wallet sync
  useEffect(() => {
    if (profile && session) {
      setAuth({ userId: profile.id, accessToken: session.access_token });
      // Identify to backend immediately.
      const identify = () => {
        socket.emit("auth:identify", {
          userId: profile.id,
          token: session.access_token,
        });
      };
      // Send now if already connected, and re-send on every reconnect.
      if (socket.connected) identify();
      socket.on("connect", identify);
      return () => { socket.off("connect", identify); };
    } else {
      setAuth({ userId: null, accessToken: null });
    }
  }, [profile, session, setAuth]);

  useEffect(() => {
    init();
  }, [init]);

  // Show loading spinner while session is resolving
  if (loading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-[#0d0e10]">
        <svg className="h-10 w-10 animate-spin text-[#e8173a]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  // Gate: show login if no session
  if (!session) {
    return <LoginScreen />;
  }

  return (
    <div className="flex min-h-full w-full flex-col bg-[#1b1d1f] md:h-screen md:overflow-hidden">
      <Header />

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Desktop / tablet sidebar */}
        <aside
          data-testid="sidebar-desktop"
          className="hidden w-[360px] shrink-0 md:block"
        >
          <LiveBets />
        </aside>

        <main data-testid="main-content" className="flex min-w-0 flex-1 flex-col">
          <HistoryBar />
          <div className="px-1 md:flex md:min-h-0 md:flex-1 md:flex-col">
            <GameCanvas />
          </div>
          <BetPanels />
        </main>

        {/* Mobile: live bets below main content */}
        <aside
          data-testid="sidebar-mobile"
          className="h-[78vh] shrink-0 border-t border-[#212226] md:hidden"
        >
          <LiveBets />
        </aside>
      </div>
    </div>
  );
}

export default function App() {
  const isAdminPath = window.location.pathname.startsWith("/admin");
  return (
    <AuthProvider>
      {isAdminPath ? <AdminPanel /> : <GameApp />}
    </AuthProvider>
  );
}
