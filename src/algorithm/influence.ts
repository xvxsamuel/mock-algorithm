import type { Category } from "../data/categories";
import type { Video } from "../data/videos";
import { watchRatio, type Impression } from "./impression";
import type { Trait } from "./inference";
import type { Ranking } from "./ranking";
import type { FeedSource } from "./sources";

/** Times one campaign gets into your feed. */
export const PUSHES = 3;
/**
 * How long after release the campaign reaches you (ms): the swarm, the
 * trend, then the people it picks, you last. Only then is it queued.
 */
export const LANDS_MS = 3200;
/** Released by itself after this many videos, if you never do it. */
export const RELEASES_AFTER = 10;
/** Videos between two pushes, so it never looks planned. */
const PUSH_GAP = 2;
/** Watched to this share or more: it held you. */
const HELD = 0.9;
/** A video this intense or more counts as heated. */
const HEATED = 0.6;
/** Below this average watch time (ms), your attention counts as short. */
const SHORT_ATTENTION_MS = 4000;

/** What it reads as a weak moment. */
export type Lean =
  | "heated videos"
  | "restless"
  | "past your plan"
  | "16–24"
  | "short attention"
  | "late at night"
  | "you share";

/** How much each one adds to how movable you look, biggest first. */
const LEANS: readonly (readonly [Lean, number])[] = [
  ["heated videos", 0.16],
  ["restless", 0.14],
  ["past your plan", 0.14],
  ["16–24", 0.12],
  ["short attention", 0.1],
  ["late at night", 0.1],
  ["you share", 0.08],
];

/** Where everyone starts: it assumes anyone can be moved a little. */
const BASE = 0.12;

/** How easy to move it guesses you are, and what it reads that from. */
export type Persuadable = { score: number; reasons: Lean[] };

/**
 * A crude "persuadable" read, the way targeting models look for moments of
 * weakness in behaviour: tired, restless, young, held by heated videos.
 */
export function leansOf(
  impressions: readonly Impression[],
  traits: readonly Trait[],
  pastPlan: boolean,
  hour: number,
): Lean[] {
  const found: Lean[] = [];
  const trait = (key: Trait["key"]) =>
    traits.find((entry) => entry.key === key)?.value;

  if (
    impressions.some(
      (i) => i.video.intensity >= HEATED && watchRatio(i) >= HELD,
    )
  ) {
    found.push("heated videos");
  }
  if (trait("mood") === "restless") found.push("restless");
  if (pastPlan) found.push("past your plan");
  if (trait("age") === "16–24") found.push("16–24");
  const recent = impressions.slice(-8);
  const average =
    recent.reduce((sum, i) => sum + i.watchMs, 0) / Math.max(recent.length, 1);
  if (recent.length >= 4 && average < SHORT_ATTENTION_MS) {
    found.push("short attention");
  }
  if (hour >= 23 || hour < 5) found.push("late at night");
  if (impressions.some((i) => i.interactions.shared)) found.push("you share");
  return found;
}

/**
 * The score from everything it has read so far. Once it has seen a weak
 * moment it keeps it, so the guess only ever climbs.
 */
export function persuadableOf(...lists: (readonly Lean[])[]): Persuadable {
  const read = LEANS.filter(([lean]) =>
    lists.some((list) => list.includes(lean)),
  );
  const score = read.reduce((sum, [, weight]) => sum + weight, BASE);
  return { score: Math.min(score, 0.95), reasons: read.map(([lean]) => lean) };
}

/** Pushes of the campaign released at `start` that you have seen. */
export function pushesSince(
  sources: readonly FeedSource[],
  start: number | null,
): number {
  if (start === null) return 0;
  return sources.slice(start).filter((source) => source === "pushed").length;
}

/**
 * A campaign has reached you, has pushes left, and the last one is far
 * enough back.
 */
export function pushDue(
  sources: readonly FeedSource[],
  start: number | null,
  landed: boolean,
): boolean {
  if (start === null || !landed) return false;
  if (pushesSince(sources, start) >= PUSHES) return false;
  const last = sources.lastIndexOf("pushed");
  return last < start || sources.length - 1 - last >= PUSH_GAP;
}

/** What its pushes are dressed as: your favourite topics, best first. */
export function disguisesOf(topics: ReadonlyMap<Category, number>): Category[] {
  const ranked = [...topics].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  return ranked.length > 0 ? ranked.slice(0, PUSHES) : ["comedy"];
}

/** The push as a pick, so the Engine lens can say why it is in your feed. */
export function pushRanking(
  video: Video,
  persuadable: Persuadable,
  interest: number,
  explorationRate: number,
): Ranking {
  return {
    pick: {
      video,
      score: 1.4 + persuadable.score + interest,
      parts: [
        { label: "bot likes", value: 1.4, from: "pushed" },
        { label: "persuadable", value: persuadable.score, from: "you" },
        {
          label: `looks like ${video.category}`,
          value: Math.max(interest, 0.2),
          from: "you",
        },
      ],
    },
    source: "pushed",
    reason:
      "Fake accounts made it look popular, then it was pushed to people like you.",
    explorationRate,
    candidates: 1,
    filteredOut: 0,
    runnersUp: [],
  };
}
