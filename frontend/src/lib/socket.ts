import { io, type Socket } from "socket.io-client";

const defaultUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : "http://localhost:4000";

const URL = import.meta.env.VITE_SERVER_URL ?? defaultUrl;

export const socket: Socket = io(URL, {
  autoConnect: true,
  transports: ["websocket"],
});
