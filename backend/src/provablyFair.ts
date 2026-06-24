import crypto from "node:crypto";

/**
 * Provably-fair crash point generation.
 *
 * The server commits to a random seed by publishing its SHA-256 hash before the
 * round. After the round the seed is revealed so anyone can recompute the crash
 * multiplier and verify it was not changed mid-round.
 *
 * The distribution mirrors the classic crash curve: a ~3% instant-bust chance
 * (1.00x) and an inverse distribution giving a house edge, capped for sanity.
 */

const HOUSE_EDGE = 0.01; // 1%
const MAX_MULTIPLIER = 130;  // hard cap — cannot exceed 130×

export interface RoundSeed {
  seed: string;
  hashedSeed: string;
}

export function generateSeed(): RoundSeed {
  const seed = crypto.randomBytes(32).toString("hex");
  const hashedSeed = crypto.createHash("sha256").update(seed).digest("hex");
  return { seed, hashedSeed };
}

export function crashPointFromSeed(seed: string): number {
  const hash = crypto.createHash("sha256").update(seed).digest("hex");

  // Use the first 52 bits of the hash as a uniform value in [0, 1).
  const h = parseInt(hash.slice(0, 13), 16);
  const e = Math.pow(2, 52);
  const r = h / e;

  // ~3% chance of an instant 1.00x bust.
  if (r < 0.03) return 1.0;

  // Inverse distribution with house edge.
  const raw = (1 - HOUSE_EDGE) / (1 - r);
  const crash = Math.max(1.0, Math.min(raw, MAX_MULTIPLIER));

  // Floor to 2 decimals.
  return Math.floor(crash * 100) / 100;
}
