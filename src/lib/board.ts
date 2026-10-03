// Pure helpers for the live squad board (unit tested).
import { MAX_CASE_COUNT } from "./validation/case-count.ts";

/** Applies a +/- tap, keeping the total within 0..MAX_CASE_COUNT. */
export function applyTap(total: number, delta: number): number {
  return Math.min(MAX_CASE_COUNT, Math.max(0, total + delta));
}

/**
 * After a save conflict (another phone changed the total first and nothing was
 * written), keep this phone's unsaved change on top of the newer total: taps
 * are additive, so +2 here and +3 elsewhere from 0 means 5.
 */
export function rebaseTaps(shown: number, confirmed: number, current: number): number {
  return applyTap(current, shown - confirmed);
}

/** Team-wide cheers shown on + taps: positive, never comparative. */
export const CHEERS = ["Let's go!", "Nice!", "Boom!", "On fire!", "Keep it up!", "Every case counts!", "Momentum!", "Yes!"];

/** Deterministic cheer for the n-th tap (no Math.random: same on server and client). */
export function cheerFor(tap: number): string {
  return CHEERS[((tap % CHEERS.length) + CHEERS.length) % CHEERS.length];
}

/**
 * Squad totals with local (optimistic) changes applied: the server values plus
 * what this screen has changed on top of them.
 */
export function withLocalChanges(
  server: Record<string, number>,
  local: Record<string, number>,
): { counts: Record<string, number>; delta: number; total: number } {
  const counts: Record<string, number> = { ...server };
  let delta = 0;
  for (const [id, value] of Object.entries(local)) {
    if (!(id in server)) continue;
    delta += value - server[id];
    counts[id] = value;
  }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  return { counts, delta, total };
}

/**
 * Each member's net cases this week, live: the server's weekly figure plus
 * whatever this screen has changed for them since that figure was loaded.
 */
export function liveMemberWeek(
  serverWeek: Record<string, number>,
  serverCounts: Record<string, number>,
  counts: Record<string, number>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(serverCounts)) {
    out[id] = (serverWeek[id] ?? 0) + ((counts[id] ?? serverCounts[id]) - serverCounts[id]);
  }
  return out;
}
