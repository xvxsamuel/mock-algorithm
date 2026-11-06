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
/** Its typical miss compares your first videos with your latest ones. */
export const FIRST_WINDOW = 5;
export const RECENT_WINDOW = 10;

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
    ATTENTION_PRIOR_MS,
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
export function moodOf(finished: readonly Impression[]): number {
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

/** How far off the guess usually was over some videos. */
export type Miss = {
  /** The median gap between guess and real watch time, in ms. */
  ms: number;
  /** How many videos it is taken over. */
  count: number;
};

/**
 * How far off its guess usually is: on your latest videos, and on your first
 * ones once there are enough to compare. Shows it learning you. The median,
 * so one odd video (a sudden binge, a skip) does not swing it.
 */
export type PredictionMiss = { recent: Miss | null; first: Miss | null };

export function predictionMiss(
  finished: readonly Impression[],
): PredictionMiss {
  return {
    recent: medianMiss(finished.slice(-RECENT_WINDOW)),
    first:
      finished.length > RECENT_WINDOW
        ? medianMiss(finished.slice(0, FIRST_WINDOW))
        : null,
  };
}

function medianMiss(impressions: readonly Impression[]): Miss | null {
  if (impressions.length === 0) return null;
  const misses = impressions
    .map((i) => Math.abs(i.watchMs - i.predictedMs))
    .sort((a, b) => a - b);
  const middle = Math.floor(misses.length / 2);
  const ms =
    misses.length % 2 === 1
      ? misses[middle]
      : (misses[middle - 1] + misses[middle]) / 2;
  return { ms, count: impressions.length };
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
