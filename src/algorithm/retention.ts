import { hasReaction, watchRatio, type Impression } from "./impression";
import { QUICK_SKIP_MS } from "./signals";

/** Above this risk the engine stops exploring and plays a sure hit. */
export const RESCUE_AT = 0.55;

export type ExitReason =
  "skipping" | "nothing held you" | "over your plan" | "it's late";

export type ExitRisk = {
  /** 0-1: the predicted chance you close the app within a few videos. */
  value: number;
  /** The biggest reason, or null while the risk is low. */
  reason: ExitReason | null;
};

/** Held this long, a short video did its job, however long it runs. */
const HELD_MS = 6000;

/** A video that held you: mostly watched, watched a while, or reacted to. */
export function isHit(impression: Impression): boolean {
  return (
    watchRatio(impression) >= 0.6 ||
    impression.watchMs >= HELD_MS ||
    hasReaction(impression)
  );
}

/**
 * Guesses how close you are to closing the app. Made-up weights, but real
 * apps model exactly this ("session end prediction") and act on it.
 */
export function exitRisk(
  finished: readonly Impression[],
  sessionMs: number,
  intentMs: number | null,
  hour: number,
): ExitRisk {
  const parts: [ExitReason, number][] = [];

  let streak = 0;
  for (let i = finished.length - 1; i >= 0; i--) {
    if (finished[i].watchMs >= QUICK_SKIP_MS) break;
    streak++;
  }
  parts.push(["skipping", Math.min(streak * 0.2, 0.6)]);

  const lastHit = finished.findLastIndex(isHit);
  const sinceHit = finished.length - 1 - lastHit;
  parts.push([
    "nothing held you",
    Math.min(Math.max(sinceHit - 2, 0) * 0.08, 0.4),
  ]);

  const over = intentMs !== null && sessionMs > intentMs;
  parts.push(["over your plan", over ? 0.18 : 0]);
  parts.push(["it's late", hour >= 23 || hour < 5 ? 0.08 : 0]);

  const total = parts.reduce((sum, [, value]) => sum + value, 0.06);
  const [reason, biggest] = parts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return {
    value: Math.min(total, 0.97),
    reason: biggest >= 0.1 ? reason : null,
  };
}
