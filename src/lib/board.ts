// Pure helpers for the live squad board (unit tested).
import { MAX_CASE_COUNT } from "./validation/case-count.ts";

/** Applies a +/- tap, keeping the total within 0..MAX_CASE_COUNT. */
export function applyTap(total: number, delta: number): number {
  return Math.min(MAX_CASE_COUNT, Math.max(0, total + delta));
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
