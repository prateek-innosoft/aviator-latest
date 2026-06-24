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
    if (r < 0.55) target = 1.1 + Math.random() * 0.9;
    else if (r < 0.85) target = 2 + Math.random() * 3;
    else if (r < 0.97) target = 5 + Math.random() * 10;
    else target = 15 + Math.random() * 85;

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
