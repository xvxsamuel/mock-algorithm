/**
 * Who put a video in your feed.
 * - interest: your own past behaviour (the "best match")
 * - explore: the engine testing you with something new
 * - rescue: the engine noticed you were about to leave and played a sure hit
 * - ad: an advertiser bought the slot
 */
export type FeedSource = "interest" | "explore" | "rescue" | "ad";

/** Short names for the legend and tooltips. */
export const SOURCE_LABELS: Record<FeedSource, string> = {
  interest: "your interests",
  explore: "testing you",
  rescue: "keeping you",
  ad: "sold",
};

export const SOURCE_ORDER: readonly FeedSource[] = [
  "interest",
  "explore",
  "rescue",
  "ad",
];
