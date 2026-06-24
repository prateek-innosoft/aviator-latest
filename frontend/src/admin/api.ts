/** Thin typed wrapper around the admin API endpoints. */

export interface AdminControls {
  id: number;
  house_edge: number;
  min_bet: number;
  max_bet: number;
  next_crash_point: number | null;
  win_mode: "normal" | "win" | "loss";
  forced_crash: number | null;
  updated_at: string;
}

export interface AdminStats {
  rounds_today: number;
  avg_crash: number;
  recent_rounds: { id: string; crash_point: number; status: string; ended_at: string }[];
}

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
    // If Zod validation failed, build a readable message from field errors
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
    req<{ ok: true }>("/api/admin/controls", "PATCH", token, body),

  getStats: (token: string) =>
    req<{ ok: true; stats: AdminStats }>("/api/admin/stats", "GET", token),
};
