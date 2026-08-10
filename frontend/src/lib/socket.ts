import { io, type Socket } from "socket.io-client";

const defaultUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:4000";

const URL = import.meta.env.VITE_SERVER_URL ?? defaultUrl;

const CLIENT_ID_KEY = "aviator_client_id";

/**
 * A stable identity for this browser tab. Socket.IO connection ids change
 * after an unrecoverable reconnect; bets must not become unreachable merely
 * because the transport briefly dropped. sessionStorage intentionally keeps
 * separate tabs independent while surviving reloads/reconnects in one tab.
 */
function getClientSessionId(): string {
  if (typeof window === "undefined") return "server-render";
  try {
    const existing = window.sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(CLIENT_ID_KEY, created);
    return created;
  } catch {
    return crypto.randomUUID();
  }
}

export const clientSessionId = getClientSessionId();

/** Free tunnels often block or break WebSocket upgrades — polling is reliable. */
function tunnelTransports(): ("polling" | "websocket")[] {
  if (typeof window === "undefined") return ["websocket", "polling"];
  const h = window.location.hostname;
  const isTunnel =
    h.endsWith(".trycloudflare.com") ||
    h.endsWith(".tunnelmole.net") ||
    h.endsWith(".lhr.life") ||
    h.endsWith(".ngrok-free.app") ||
    h.endsWith(".ngrok.io");
  return isTunnel ? ["polling"] : ["websocket", "polling"];
}

const viaTunnel = tunnelTransports().length === 1;

export const socket: Socket = io(URL, {
  autoConnect: true,
  transports: tunnelTransports(),
  upgrade: !viaTunnel,
  // Faster recovery from transient WS drops (e.g. Vite proxy hiccupping when another tab reconnects)
  reconnection: true,
  reconnectionDelay: 250,
  reconnectionDelayMax: 2000,
  reconnectionAttempts: Infinity,
  timeout: 10000,
});

socket.on("connect", () => {
  socket.emit("player:identify", { clientId: clientSessionId });
});
