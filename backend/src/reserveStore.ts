/**
 * Durable storage for the company reserve (bankroll).
 *
 * The reserve used to live purely in process memory, so it snapped back to
 * ₹2,00,000 on every restart. It is real financial state, so it is persisted
 * to a small JSON file next to the backend package and reloaded on boot.
 * Writes are synchronous and atomic (write temp + rename) so a crash mid-write
 * can never leave a truncated file behind.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Resolves to backend/reserve.json from both src/ (tsx) and dist/ (compiled). */
const RESERVE_FILE = path.resolve(HERE, "..", "reserve.json");

interface ReserveFile {
  reserve: number;
  updated_at: string;
}

/** Reads the persisted reserve, or null when there is nothing usable on disk. */
export function loadReserve(): number | null {
  try {
    const raw = fs.readFileSync(RESERVE_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<ReserveFile>;
    if (typeof parsed.reserve !== "number" || !Number.isFinite(parsed.reserve)) return null;
    return Math.max(0, parsed.reserve);
  } catch {
    return null;
  }
}

/** Persists the reserve. Never throws — a failed write must not stop a round. */
export function saveReserve(reserve: number): void {
  const payload: ReserveFile = { reserve, updated_at: new Date().toISOString() };
  const tmp = `${RESERVE_FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), "utf8");
    fs.renameSync(tmp, RESERVE_FILE);
  } catch (err) {
    console.error("[ReserveStore] failed to persist reserve:", err);
  }
}
