import type { Category } from "../data/categories";
import { hasReaction, type Impression } from "./impression";
import { QUICK_SKIP_MS } from "./signals";

/** A label the algorithm attaches to the user, e.g. RABBIT_HOLE:fitness. */
export type SessionFlag = { code: string; detail: string };

export type SessionSummary = {
  sessionMs: number;
  videosSeen: number;
  videosPerMinute: number;
  avgWatchMs: number;
  /** Share of videos the user actively reacted to. */
  interactionRate: number;
  explorationRate: number;
  /** One-line guess at what the user is doing right now. */
  state: string;
  flags: SessionFlag[];
};

const EXPLORATION_RATE = { coldStart: 0.5, bored: 0.35, normal: 0.1 };

/** Looks at the whole session and guesses the user's state and intent. */
export function summarizeSession(
  impressions: readonly Impression[],
  sessionStart: number,
  now: number,
): SessionSummary {
  const sessionMs = now - sessionStart;
  const count = impressions.length;
  const totalWatchMs = impressions.reduce((sum, i) => sum + i.watchMs, 0);
  const interactionRate =
    count === 0 ? 0 : impressions.filter(hasReaction).length / count;
  const flags: SessionFlag[] = [];

  const coldStart = count < 5;
  if (coldStart) {
    flags.push({
      code: "COLD_START",
      detail: `only ${count} video(s) so far, still guessing what you like`,
    });
  }

  const lastFour = impressions.filter((i) => i.endedAt !== null).slice(-4);
  const skips = lastFour.filter((i) => i.watchMs < QUICK_SKIP_MS).length;
  const bored = lastFour.length === 4 && skips >= 3;
  if (bored) {
    flags.push({
      code: "RAPID_SKIPPING",
      detail: `skipped ${skips} of the last 4 videos within 2s, exploration boosted`,
    });
  }

  const lastTen = impressions.slice(-10);
  const top = topTopic(lastTen);
  const hooked =
    top !== null && top.count >= 4 && top.count * 2 >= lastTen.length;
  if (hooked) {
    flags.push({
      code: `RABBIT_HOLE:${top.category}`,
      detail: `${top.count} of your last ${lastTen.length} videos were ${top.category}`,
    });
  }

  const topicsInLastTen = new Set(lastTen.map((i) => i.video.category)).size;
  if (lastTen.length === 10 && topicsInLastTen <= 3) {
    flags.push({
      code: "NARROW_FEED",
      detail: `only ${topicsInLastTen} topic(s) in your last 10 videos`,
    });
  }

  const lastFive = impressions.slice(-5);
  const avgIntensity =
    lastFive.reduce((sum, i) => sum + i.video.intensity, 0) / lastFive.length;
  if (lastFive.length === 5 && avgIntensity >= 0.6) {
    flags.push({
      code: "ESCALATING",
      detail: `recent videos are more extreme (avg intensity ${avgIntensity.toFixed(2)})`,
    });
  }

  const passive = count >= 12 && interactionRate < 0.1;
  if (passive) {
    flags.push({
      code: "PASSIVE_SCROLLING",
      detail: `${count} videos with almost no likes, saves or shares`,
    });
  }

  const engaged = count >= 5 && interactionRate >= 0.5;
  if (engaged) {
    flags.push({
      code: "HIGH_ENGAGEMENT",
      detail: `you react to ${Math.round(interactionRate * 100)}% of videos, every reaction is a strong signal`,
    });
  }

  const keepers = impressions.filter(
    (i) => i.interactions.saved || i.interactions.shared,
  );
  for (const [category, times] of countTopics(keepers)) {
    if (times >= 2) {
      flags.push({
        code: `HIGH_INTENT:${category}`,
        detail: `saved or shared ${times} ${category} videos`,
      });
    }
  }

  for (const { video, interactions } of impressions) {
    if (interactions.followed) {
      flags.push({
        code: `FOLLOWS:@${video.creator}`,
        detail: "followed this session, their videos get boosted",
      });
    }
    if (interactions.notInterested) {
      flags.push({
        code: `NOT_INTERESTED:${video.category}`,
        detail: `asked to see less ${video.category}`,
      });
    }
  }

  const minutes = Math.floor(sessionMs / 60_000);
  if (minutes >= 10) {
    flags.push({
      code: "LONG_SESSION",
      detail: `in the app for ${minutes} min without a break`,
    });
  }

  const time = new Date(now);
  const hour = time.getHours();
  if (hour >= 23 || hour < 5) {
    const clock = `${hour}:${String(time.getMinutes()).padStart(2, "0")}`;
    flags.push({
      code: "LATE_NIGHT",
      detail: `it's ${clock}, late-night sessions tend to run longer`,
    });
  }

  let state = "Browsing casually";
  if (coldStart) state = "New user: the algorithm is still guessing";
  else if (bored) state = "Bored: hunting for something to stop on";
  else if (hooked) state = `Hooked on ${top.category}`;
  else if (passive) state = "Zoned out: scrolling on autopilot";
  else if (engaged) state = "Engaged: actively reacting";

  let explorationRate = EXPLORATION_RATE.normal;
  if (coldStart) explorationRate = EXPLORATION_RATE.coldStart;
  else if (bored) explorationRate = EXPLORATION_RATE.bored;

  return {
    sessionMs,
    videosSeen: count,
    // Count at least one minute so the first seconds don't show silly rates.
    videosPerMinute: count / Math.max(sessionMs / 60_000, 1),
    avgWatchMs: count === 0 ? 0 : totalWatchMs / count,
    interactionRate,
    explorationRate,
    state,
    flags,
  };
}

function countTopics(
  impressions: readonly Impression[],
): Map<Category, number> {
  const counts = new Map<Category, number>();
  for (const { video } of impressions) {
    counts.set(video.category, (counts.get(video.category) ?? 0) + 1);
  }
  return counts;
}

function topTopic(
  impressions: readonly Impression[],
): { category: Category; count: number } | null {
  let top: { category: Category; count: number } | null = null;
  for (const [category, count] of countTopics(impressions)) {
    if (top === null || count > top.count) top = { category, count };
  }
  return top;
}
