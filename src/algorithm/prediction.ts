import type { Video } from "../data/videos";
import type { Impression } from "./impression";

/** Before it knows you, the app guesses a few seconds of attention. */
const PRIOR_MS = 4000;
/** How many "imaginary" videos the guess is worth against real data. */
const PRIOR_WEIGHT = 1.5;
/** A topic learns fast: one video of it nearly outweighs your average. */
const TOPIC_PRIOR_WEIGHT = 0.4;
/** Newer videos count more: each older one is worth this much less. */
const RECENCY = 0.85;
/** Nobody gets predicted to loop a video more than this often. */
const MAX_LOOPS = 1.6;
/** Your mood is read from your latest videos, newest first, with these weights... */
const MOOD_WEIGHTS = [1, 0.4, 0.16];
/** ...once it has seen this many. */
const MOOD_FROM = 3;
/** Watching this share of your usual or more is just normal variation. */
const MOOD_NORMAL = 0.7;
/** Restless, it guesses you will give each video as little as this share. */
const MOOD_MIN = 0.2;
/** The hit count compares your first videos with your latest ones. */
export const FIRST_WINDOW = 5;
export const RECENT_WINDOW = 10;
/** A guess this close (ms) to the real watch time counts as a hit. */
export const HIT_MS = 2000;

/**
 * Predicts how long you will watch a video before it plays: how long you
 * watched the same topic so far, scaled by your mood (are you skipping
 * everything right now?). This is the guess the feed is built on. A sure hit
 * ignores your mood: the engine expects it to land.
 */
export function predictWatchMs(
  video: Video,
  finished: readonly Impression[],
  sureHit = false,
): number {
  const mood = sureHit ? 1 : moodOf(finished);
  const guess = topicMs(video, finished) * mood;
  return Math.min(guess, video.durationSec * 1000 * MAX_LOOPS);
}

/** How long you watched this topic so far, newest counting most. */
function topicMs(video: Video, finished: readonly Impression[]): number {
  const overall = weightedMean(
    finished.map((i) => i.watchMs),
    PRIOR_MS,
    PRIOR_WEIGHT,
  );
  const sameTopic = finished
    .filter((i) => i.video.category === video.category)
    .map((i) => i.watchMs);
  return weightedMean(sameTopic, overall, TOPIC_PRIOR_WEIGHT);
}

/**
 * Your latest videos against what you usually give their topics, the newest
 * counting most. Only ever shortens a guess: skipping now means skipping next.
 */
function moodOf(finished: readonly Impression[]): number {
  if (finished.length < MOOD_FROM) return 1;
  let sum = 0;
  let weight = 0;
  MOOD_WEIGHTS.forEach((w, back) => {
    const at = finished.length - 1 - back;
    const ratio =
      finished[at].watchMs / topicMs(finished[at].video, finished.slice(0, at));
    sum += Math.min(ratio, 1) * w;
    weight += w;
  });
  return Math.min(Math.max(sum / weight / MOOD_NORMAL, MOOD_MIN), 1);
}

/** Close guesses among some videos. */
export type HitCount = { hits: number; total: number };

/**
 * How often the guess was within `HIT_MS`: on your latest videos, and on your
 * first ones once there are enough to compare. Shows it learning you.
 */
export type PredictionHits = { recent: HitCount; first: HitCount | null };

export function predictionHits(
  finished: readonly Impression[],
): PredictionHits {
  return {
    recent: countHits(finished.slice(-RECENT_WINDOW)),
    first:
      finished.length > RECENT_WINDOW
        ? countHits(finished.slice(0, FIRST_WINDOW))
        : null,
  };
}

function countHits(impressions: readonly Impression[]): HitCount {
  const hits = impressions.filter(
    (i) => Math.abs(i.watchMs - i.predictedMs) <= HIT_MS,
  ).length;
  return { hits, total: impressions.length };
}

/** Mean of `values` (oldest first), newest weighted most, pulled towards `prior`. */
function weightedMean(
  values: readonly number[],
  prior: number,
  priorWeight: number,
): number {
  let sum = prior * priorWeight;
  let weight = priorWeight;
  values.forEach((value, i) => {
    const w = RECENCY ** (values.length - 1 - i);
    sum += value * w;
    weight += w;
  });
  return sum / weight;
}
