import { useEffect } from "react";
import { useGame } from "./store/gameStore";
import { socket } from "./lib/socket";
import { readPlatformSession } from "./lib/platformSession";
import { Header } from "./components/Header";
import { HistoryBar } from "./components/HistoryBar";
import { GameCanvas } from "./components/GameCanvas";
import { BetPanels } from "./components/BetPanels";
import { LiveBets } from "./components/LiveBets";
import { BetErrorToast } from "./components/BetErrorToast";
import { AdminPanel } from "./admin/AdminPanel";
import { AuthProvider } from "./lib/authContext";
import { LoadingScreen } from "./components/LoadingScreen";

// A real player arrives with a platform session token in the URL
// (?token=... — minted by casino.service.ts's createCasinoSession when the
// platform launches this game). If present, we identify to the socket with
// it so bets hit the real platform wallet; otherwise we fall back to the
// shared demo wallet. (Admin auth lives entirely on the /admin route.)
function GameApp() {
  const init    = useGame((s) => s.init);
  const setAuth = useGame((s) => s.setAuth);
  const connected = useGame((s) => s.connected);
  const roundId  = useGame((s) => s.roundId);

  useEffect(() => {
    const session = readPlatformSession();
    if (!session) {
      setAuth({ userId: null, accessToken: null });
      return;
    }

    setAuth({ userId: session.userId, accessToken: session.token });
    const identify = () => {
      socket.emit("auth:identify", { userId: session.userId, token: session.token });
    };
    if (socket.connected) identify();
    socket.on("connect", identify);

    // Strip the token from the visible URL/history now that the socket has it.
    window.history.replaceState({}, "", window.location.pathname);

    return () => { socket.off("connect", identify); };
  }, [setAuth]);

  useEffect(() => {
    init();
  }, [init]);

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
  const p = window.location.pathname;
  const isAdminPath = p === "/admin" || p.startsWith("/admin/");
  return (
    <AuthProvider>
      {isAdminPath ? <AdminPanel /> : <GameApp />}
    </AuthProvider>
  );
}
