import type { Category } from "../data/categories";
import { hasReaction, type Impression } from "./impression";
import { QUICK_SKIP_MS } from "./signals";

/** The attention span it assumes before you have watched anything. */
const SPAN_PRIOR_MS = 8000;

/** A guess about you that you never told the app. */
export type Trait = {
  key: "age" | "mood" | "attention" | "spending";
  label: string;
  value: string;
  /** 0-1: how sure the model claims to be. */
  confidence: number;
};

/** Crude stereotypes, the way ad models use them: who watches what. */
const AGE_LEAN: Record<Category, number> = {
  gaming: -1,
  comedy: -0.5,
  beauty: -0.3,
  fitness: -0.2,
  pets: 0,
  travel: 0.3,
  cooking: 0.6,
  finance: 0.8,
};

const SHOPPING: readonly Category[] = [
  "beauty",
  "fitness",
  "cooking",
  "finance",
];

/** Turns viewing behaviour into the traits an ad profile is made of. */
export function inferTraits(
  impressions: readonly Impression[],
  topics: ReadonlyMap<Category, number>,
): Trait[] {
  const count = impressions.length;
  const growing = Math.min(0.25 + count * 0.035, 0.92);

  let lean = 0;
  let weight = 0;
  for (const [topic, score] of topics) {
    if (score <= 0) continue;
    lean += AGE_LEAN[topic] * score;
    weight += score;
  }
  const age = weight === 0 ? 0 : lean / weight;
  const ageBand = age < -0.25 ? "16–24" : age < 0.3 ? "25–34" : "35–44";

  const recent = impressions.slice(-6);
  const skips = recent.filter(
    (i) => i.endedAt !== null && i.watchMs < QUICK_SKIP_MS,
  ).length;
  const long = recent.filter(
    (i) => i.watchMs >= i.video.durationSec * 800,
  ).length;
  const mood = skips >= 3 ? "restless" : long >= 2 ? "absorbed" : "drifting";

  // Before you watch anything it assumes the famous 8 seconds.
  const watched = impressions.slice(-8);
  const watchedMs = watched.reduce((sum, i) => sum + i.watchMs, 0);
  const span = watchedMs === 0 ? SPAN_PRIOR_MS : watchedMs / watched.length;

  const shopping = SHOPPING.reduce(
    (sum, topic) => sum + Math.max(topics.get(topic) ?? 0, 0),
    0,
  );
  const keeps = impressions.filter(
    (i) =>
      SHOPPING.includes(i.video.category) &&
      (hasReaction(i) || i.interactions.saved),
  ).length;
  const buying = shopping + keeps * 0.4;
  const spending =
    buying > 1.2 ? "ready to buy" : buying > 0.4 ? "browsing" : "low";

  return [
    { key: "age", label: "Age", value: ageBand, confidence: growing * 0.85 },
    { key: "mood", label: "Mood", value: mood, confidence: growing * 0.7 },
    {
      key: "attention",
      label: "Attention span",
      value: `${(span / 1000).toFixed(1)}s`,
      confidence: Math.min(0.4 + count * 0.06, 0.97),
    },
    {
      key: "spending",
      label: "Spending",
      value: spending,
      confidence: growing * 0.75,
    },
  ];
}
