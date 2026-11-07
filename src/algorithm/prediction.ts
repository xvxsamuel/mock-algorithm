import type { Video } from "../data/videos";
import type { Impression } from "./impression";

/** Before it knows you, the app assumes the famous 8 seconds of attention. */
export const ATTENTION_PRIOR_MS = 8000;
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
/** Right guesses are counted over this many of your latest videos. */
export const HITS_WINDOW = 10;
/** A guess is right within this many ms of what you watched... */
export const RIGHT_WITHIN_MS = 1500;
/** ...or within this share of it, so a long watch is not held to a second. */
const RIGHT_WITHIN_SHARE = 0.25;

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
  const overall = averageMs(finished);
  const sameTopic = finished
    .filter((i) => i.video.category === video.category)
    .map((i) => i.watchMs);
  return weightedMean(sameTopic, overall, TOPIC_PRIOR_WEIGHT);
}

/** Your average watch time so far, newest counting most. */
function averageMs(finished: readonly Impression[]): number {
  return weightedMean(
    finished.map((i) => i.watchMs),
    ATTENTION_PRIOR_MS,
    PRIOR_WEIGHT,
  );
}

/**
 * Your latest videos against what you usually give their topics, the newest
 * counting most. Only ever shortens a guess: skipping now means skipping next.
 * A first video of a topic says nothing about your mood (you may just not
 * like the topic), so it counts as normal.
 */
export function moodOf(finished: readonly Impression[]): number {
  if (finished.length < MOOD_FROM) return 1;
  let sum = 0;
  let weight = 0;
  MOOD_WEIGHTS.forEach((w, back) => {
    const at = finished.length - 1 - back;
    const { video, watchMs } = finished[at];
    const before = finished.slice(0, at);
    const known = before.some((i) => i.video.category === video.category);
    const ratio = known ? watchMs / topicMs(video, before) : 1;
    sum += Math.min(ratio, 1) * w;
    weight += w;
  });
  return Math.min(Math.max(sum / weight / MOOD_NORMAL, MOOD_MIN), 1);
}

/** How many of its guesses on your latest videos were right. */
export type PredictionHits = {
  right: number;
  /** How many videos it is counted over. */
  count: number;
};

export function predictionHits(
  finished: readonly Impression[],
): PredictionHits | null {
  if (finished.length === 0) return null;
  const latest = finished.slice(-HITS_WINDOW);
  const right = latest.filter(guessedRight).length;
  return { right, count: latest.length };
}

/** Whether its guess for a finished video was right. */
export function guessedRight({ watchMs, predictedMs }: Impression): boolean {
  return (
    Math.abs(watchMs - predictedMs) <=
    Math.max(RIGHT_WITHIN_MS, watchMs * RIGHT_WITHIN_SHARE)
  );
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
