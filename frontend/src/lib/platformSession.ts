// Reads the platform-issued SpinForge game-session token that the NestJS
// backend attaches as `?token=` when a real player launches Aviator from the
// platform (see casino.service.ts's createCasinoSession → AVIATOR_GAME_URL).
// The token is a JWT signed by the platform; we only decode (never verify)
// it here to pull out `subjectId` for local bookkeeping — every wallet/bet
// call still gets verified server-side on the platform for every request.

export interface PlatformSession {
  userId: string;
  token: string;
}

interface SpinforgeGameSessionPayload {
  purpose?: string;
  role?: string;
  subjectId?: string;
  gameId?: number;
}

function decodeJwtPayload(token: string): SpinforgeGameSessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64)) as SpinforgeGameSessionPayload;
  } catch {
    return null;
  }
}

/** Reads and decodes the platform session token from the current URL, if present. */
export function readPlatformSession(): PlatformSession | null {
  if (typeof window === "undefined") return null;
  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.subjectId !== "string") return null;

  return { userId: payload.subjectId, token };
}
