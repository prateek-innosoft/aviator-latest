// Thin client for the real platform NestJS backend. Replaces store.ts's
// in-memory wallet/user maps — every real-money operation (wallet balance,
// bet place/cancel/cashout, admin config) now goes through the platform's
// Aviator module instead of local process memory.
const NEST_API_URL = process.env.NEST_API_URL;

// Long-lived admin-role game-session token, minted once via the platform
// (SpinforgeGameSessionService.issue(systemAdminId, gameId, 'admin')) — lets
// the engine read winMode/forcedCrash without a per-player token.
export const AVIATOR_ENGINE_SESSION_TOKEN = process.env.AVIATOR_ENGINE_SESSION_TOKEN;

if (!NEST_API_URL) {
  throw new Error(
    "Missing NEST_API_URL in environment. Copy .env.example to .env and set " +
      "it to the platform NestJS backend's base URL.",
  );
}

export interface NestResult<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  reason?: string;
}

async function request<T = unknown>(
  path: string,
  method: "GET" | "POST" | "PUT",
  token: string | undefined,
  body?: unknown,
): Promise<NestResult<T>> {
  try {
    const res = await fetch(`${NEST_API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { "x-game-session-token": token } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const reason = (json as { message?: string })?.message ?? `http_${res.status}`;
      console.error(`[nestClient] ${method} ${path} -> ${res.status}: ${reason}`);
      return {
        ok: false,
        status: res.status,
        data: json as T | null,
        reason,
      };
    }
    return { ok: true, status: res.status, data: json as T };
  } catch (err) {
    console.error(`[nestClient] request failed: ${method} ${path}`, err);
    return { ok: false, status: 0, data: null, reason: "network_error" };
  }
}

/** GET, authenticated with a caller-supplied game-session token (player or engine-admin). */
export function nestGet<T = unknown>(path: string, token: string | undefined) {
  return request<T>(path, "GET", token);
}

/** POST, authenticated with a caller-supplied game-session token. */
export function nestPost<T = unknown>(
  path: string,
  token: string | undefined,
  body?: unknown,
) {
  return request<T>(path, "POST", token, body);
}

/** PUT, authenticated with a caller-supplied game-session token. */
export function nestPut<T = unknown>(
  path: string,
  token: string | undefined,
  body?: unknown,
) {
  return request<T>(path, "PUT", token, body);
}
