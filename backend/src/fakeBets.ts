import crypto from "node:crypto";
import type { LiveBet } from "./types.js";
import { PLAYER_NAMES } from "./playerNames.js";

const AVATAR_COUNT = 12;

const BET_TIERS = [
  10, 20, 25, 50, 75, 100, 150, 200, 250, 300, 500, 750, 1000,
  1500, 2000, 2500, 3000, 5000, 7500, 10000,
];

function randomBet(): number {
  return BET_TIERS[Math.floor(Math.random() * BET_TIERS.length)];
}

function avatarFor(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % AVATAR_COUNT;
  return h;
}

/**
 * Generate a fresh batch of bots for a round. Each bot is assigned a target
 * cashout multiplier; the engine resolves it once the live multiplier passes it
 * (and the round has not yet crashed).
 */
export function generateBots(count: number): Array<LiveBet & { target: number }> {
  const shuffled = [...PLAYER_NAMES].sort(() => Math.random() - 0.5);
  const bots: Array<LiveBet & { target: number }> = [];

  for (let i = 0; i < count; i++) {
    const r = Math.random();
    let target: number;
    // Targets aligned with new crash ranges (1.00x–1.10x normal, 100x–130x win).
    // Most bots aim for small profits just above break-even to look realistic.
    if      (r < 0.45) target = 1.01 + Math.random() * 0.05; // 1.01–1.06 (bulk of normal rounds)
    else if (r < 0.75) target = 1.01 + Math.random() * 0.07; // 1.01–1.08
    else if (r < 0.90) target = 1.01 + Math.random() * 0.09; // 1.01–1.10
    else if (r < 0.97) target = 1.05 + Math.random() * 0.05; // 1.05–1.10
    else               target = 100  + Math.random() * 30;    // 100–130 (win mode)

    const name = shuffled[i % shuffled.length];
    bots.push({
      id: crypto.randomUUID(),
      name,
      avatar: avatarFor(name),
      bet: randomBet(),
      cashedOutAt: null,
      win: null,
      cashedOut: false,
      target: Math.round(target * 100) / 100,
    });
  }

  bots.sort((a, b) => b.bet - a.bet);
  return bots;
}
