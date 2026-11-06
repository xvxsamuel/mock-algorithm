import type { Category } from "../data/categories";
import type { Video } from "../data/videos";
import { watchRatio, type Impression } from "./impression";
import type { Trait } from "./inference";
import type { Ranking } from "./ranking";
import type { FeedSource } from "./sources";

/** Times one campaign gets into your feed. */
export const PUSHES = 3;
/** Videos between two pushes, so it never looks planned. */
const PUSH_GAP = 2;
/** Watched to this share or more: it held you. */
const HELD = 0.9;
/** A video this intense or more counts as heated. */
const HEATED = 0.6;
/** Below this average watch time (ms), your attention counts as short. */
const SHORT_ATTENTION_MS = 4000;

/** How easy to move it guesses you are, and what it reads that from. */
export type Persuadable = { score: number; reasons: string[] };

/**
 * A crude "persuadable" guess, the way targeting models read moments of
 * weakness off behaviour: tired, restless, young, held by heated videos.
 */
export function persuadableOf(
  impressions: readonly Impression[],
  traits: readonly Trait[],
  pastPlan: boolean,
  hour: number,
): Persuadable {
  const reasons: string[] = [];
  let score = 0.34;
  const add = (reason: string, weight: number) => {
    reasons.push(reason);
    score += weight;
  };
  const trait = (key: Trait["key"]) =>
    traits.find((entry) => entry.key === key)?.value;

  if (
    impressions.some(
      (i) => i.video.intensity >= HEATED && watchRatio(i) >= HELD,
    )
  ) {
    add("heated videos", 0.14);
  }
  if (trait("mood") === "restless") add("restless", 0.14);
  if (pastPlan) add("past your plan", 0.12);
  if (hour >= 23 || hour < 5) add("late at night", 0.1);
  if (trait("age") === "16–24") add("16–24", 0.1);
  const recent = impressions.slice(-8);
  const average =
    recent.reduce((sum, i) => sum + i.watchMs, 0) / Math.max(recent.length, 1);
  if (recent.length >= 4 && average < SHORT_ATTENTION_MS) {
    add("short attention", 0.08);
  }
  if (impressions.some((i) => i.interactions.shared)) add("you share", 0.08);

  return { score: Math.min(score, 0.95), reasons };
}

/** Pushes of the campaign released at `start` that you have seen. */
export function pushesSince(
  sources: readonly FeedSource[],
  start: number | null,
): number {
  if (start === null) return 0;
  return sources.slice(start).filter((source) => source === "pushed").length;
}

/** A campaign is running, has pushes left, and the last one is far enough back. */
export function pushDue(
  sources: readonly FeedSource[],
  start: number | null,
): boolean {
  if (start === null || pushesSince(sources, start) >= PUSHES) return false;
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
