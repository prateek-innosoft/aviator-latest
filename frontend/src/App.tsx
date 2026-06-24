import { useEffect } from "react";
import { useGame } from "./store/gameStore";
import { socket } from "./lib/socket";
import { Header } from "./components/Header";
import { HistoryBar } from "./components/HistoryBar";
import { GameCanvas } from "./components/GameCanvas";
import { BetPanels } from "./components/BetPanels";
import { LiveBets } from "./components/LiveBets";
import { BetErrorToast } from "./components/BetErrorToast";
import { AdminPanel } from "./admin/AdminPanel";
import { AuthProvider, useAuth } from "./lib/authContext";
import { LoadingScreen } from "./components/LoadingScreen";

function GameApp() {
  const init    = useGame((s) => s.init);
  const setAuth = useGame((s) => s.setAuth);
  const connected = useGame((s) => s.connected);
  const roundId  = useGame((s) => s.roundId);
  const { session, profile } = useAuth();

  // For demo/testing mode: work without user authentication
  // If logged in, identify to backend; otherwise use demo mode
  useEffect(() => {
    if (profile && session) {
      setAuth({ userId: profile.id, accessToken: session.access_token });
      const identify = () => {
        socket.emit("auth:identify", {
          userId: profile.id,
          token: session.access_token,
        });
      };
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

  // Show game UI directly in demo/testing mode (no login required)
  const ready = connected && roundId !== "";

  return (
    <div className="flex min-h-full w-full flex-col bg-[#1b1d1f] md:h-screen md:overflow-hidden">
      <LoadingScreen done={ready} />
      <BetErrorToast />
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
