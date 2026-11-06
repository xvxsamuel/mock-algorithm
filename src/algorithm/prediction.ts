import type { Video } from "../data/videos";
import type { Impression } from "./impression";

/** Before it knows you, the app guesses a few seconds of attention. */
const PRIOR_MS = 4000;
/** How many "imaginary" videos the guess is worth against real data. */
const PRIOR_WEIGHT = 1.5;
/** Newer videos count more: each older one is worth this much less. */
const RECENCY = 0.85;
/** Nobody gets predicted to loop a video more than this often. */
const MAX_LOOPS = 1.6;
/** How many recent videos the accuracy figure looks at. */
const ACCURACY_WINDOW = 6;

/**
 * Predicts how long you will watch a video before it plays, from how long you
 * watched the same topic so far. This is the guess the feed is built on.
 */
export function predictWatchMs(
  video: Video,
  finished: readonly Impression[],
): number {
  const overall = weightedMean(
    finished.map((i) => i.watchMs),
    PRIOR_MS,
  );
  const sameTopic = finished
    .filter((i) => i.video.category === video.category)
    .map((i) => i.watchMs);
  const topic = weightedMean(sameTopic, overall);
  return Math.min(topic, video.durationSec * 1000 * MAX_LOOPS);
}

/** 0-1: how close the guesses were for the last few videos. */
export function predictionAccuracy(finished: readonly Impression[]): number {
  const recent = finished.slice(-ACCURACY_WINDOW);
  if (recent.length === 0) return 0;
  const errors = recent.map((i) => {
    const scale = Math.max(i.watchMs, i.predictedMs, 1000);
    return Math.abs(i.watchMs - i.predictedMs) / scale;
  });
  const mean = errors.reduce((sum, e) => sum + e, 0) / errors.length;
  return Math.max(0, 1 - mean);
}

/** Mean of `values` (oldest first), newest weighted most, pulled towards `prior`. */
function weightedMean(values: readonly number[], prior: number): number {
  let sum = prior * PRIOR_WEIGHT;
  let weight = PRIOR_WEIGHT;
  values.forEach((value, i) => {
    const w = RECENCY ** (values.length - 1 - i);
    sum += value * w;
    weight += w;
  });
  return sum / weight;
}
