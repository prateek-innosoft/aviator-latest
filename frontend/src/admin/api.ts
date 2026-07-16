/** Thin typed wrapper around the admin API endpoints. */

export interface AdminControls {
  id: number;
  min_bet: number;
  max_bet: number;
  /** "normal" = Fair (reserve-driven tables), "protect" = fixed conservative table. */
  win_mode: "normal" | "protect";
  forced_crash: number | null;
  updated_at: string;
}

export interface AdminRoundEconomyEvent {
  roundId: string;
  realStake: number;
  /** Per-round payout ceiling = reserve + this round's stake. */
  maxPayout: number;
  paidOut: number;
  economyActive: boolean;
  reserve: number;
  fairSubMode: "tight" | "normal" | "bonus" | null;
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-IN");
}

export const adminFmt = { fmt };

async function req<T>(
  path: string,
  method: string,
  token: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ reason: "unknown" }));
    if (err.reason === "validation" && err.errors?.fieldErrors) {
      const fields = err.errors.fieldErrors as Record<string, string[]>;
      const msgs = Object.entries(fields)
        .filter(([, v]) => v?.length)
        .map(([k, v]) => `${k}: ${v[0]}`)
        .join("; ");
      throw new Error(msgs || "Validation failed");
    }
    throw new Error(err.reason ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const adminApi = {
  getControls: (token: string) =>
    req<{ ok: true; controls: AdminControls }>("/api/admin/controls", "GET", token),

  patchControls: (token: string, body: Partial<AdminControls>) =>
    req<{ ok: true; controls: AdminControls }>(
      "/api/admin/controls", "PATCH", token, body,
    ),

  getReserve: (token: string) =>
    req<{ ok: true; reserve: number }>("/api/admin/reserve", "GET", token),

  setReserve: (token: string, amount: number) =>
    req<{ ok: true; reserve: number }>("/api/admin/reserve", "PATCH", token, { amount }),
};
