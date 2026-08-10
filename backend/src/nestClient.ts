// Thin client for the real platform NestJS backend. Replaces store.ts's
// in-memory wallet/user maps — every real-money operation (wallet balance,
// bet place/cancel/cashout, admin config) now goes through the platform's
// Aviator module instead of local process memory.
const NEST_API_URL = process.env.NEST_API_URL;

// Static shared secret — same value pasted into the platform's
// AVIATOR_ENGINE_API_KEY env var — that lets this engine read/write
// winMode/forcedCrash and settle rounds without a per-admin-login token.
// Server-to-server credential, not a session: no expiry, no minting flow.
export const AVIATOR_ENGINE_API_KEY = process.env.AVIATOR_ENGINE_API_KEY;

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
  headerName: "x-game-session-token" | "x-engine-api-key" = "x-game-session-token",
): Promise<NestResult<T>> {
  try {
    const res = await fetch(`${NEST_API_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { [headerName]: token } : {}),
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

/** GET, authenticated with a caller-supplied player game-session token. */
export function nestGet<T = unknown>(path: string, token: string | undefined) {
  return request<T>(path, "GET", token);
}

/** POST, authenticated with a caller-supplied player game-session token. */
export function nestPost<T = unknown>(
  path: string,
  token: string | undefined,
  body?: unknown,
) {
  return request<T>(path, "POST", token, body);
}

/** PUT, authenticated with a caller-supplied player game-session token. */
export function nestPut<T = unknown>(
  path: string,
  token: string | undefined,
  body?: unknown,
) {
  return request<T>(path, "PUT", token, body);
}

/** GET, authenticated with the engine's static AVIATOR_ENGINE_API_KEY. */
export function nestEngineGet<T = unknown>(path: string) {
  return request<T>(path, "GET", AVIATOR_ENGINE_API_KEY, undefined, "x-engine-api-key");
}

/** POST, authenticated with the engine's static AVIATOR_ENGINE_API_KEY. */
export function nestEnginePost<T = unknown>(path: string, body?: unknown) {
  return request<T>(path, "POST", AVIATOR_ENGINE_API_KEY, body, "x-engine-api-key");
}

/** PUT, authenticated with the engine's static AVIATOR_ENGINE_API_KEY. */
export function nestEnginePut<T = unknown>(path: string, body?: unknown) {
  return request<T>(path, "PUT", AVIATOR_ENGINE_API_KEY, body, "x-engine-api-key");
}
