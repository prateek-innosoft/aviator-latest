import { io, type Socket } from "socket.io-client";

const defaultUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:4000";

const URL = import.meta.env.VITE_SERVER_URL ?? defaultUrl;

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
});
