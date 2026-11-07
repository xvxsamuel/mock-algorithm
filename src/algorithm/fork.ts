import type { Category } from "../data/categories";
import { VIDEOS, type Video } from "../data/videos";
import { startImpression, watchRatio, type Impression } from "./impression";
import { predictWatchMs } from "./prediction";
import { buildProfile } from "./profile";
import { rankNext } from "./ranking";

/**
 * What the feed has lined up after you leave, played forward by the same
 * engine twice: once for you as you are, and once with one thing changed.
 *
 * Both futures are the same person: each video is watched as long as you
 * watched its topic this session. Chance is taken out (no random tie
 * breaks, tests at the same slots in both), so any difference comes from
 * the one change and nothing else.
 */

/** What changes in the second future. */
export type Lever = "skip" | "off";

/** Videos played forward. */
export const AHEAD = 20;
/** Every this many videos it tests you with a topic you see little of. */
const TEST_EVERY = 5;
/** Skipping is watching this long. */
const SKIP_MS = 1000;
/** A video has to have been watched this long to count as one that steered. */
const STEERED_FROM_MS = 1500;
/** Nobody in this model watches a video more than this many times through. */
const MAX_RATIO = 2;

export type Fork = {
  you: Video[];
  other: Video[];
  /** Videos in the other future that are nowhere in yours. */
  changed: number;
  /** For "skip": the video skipped, the one that steered the most. */
  pivot: Impression | null;
};

/** Both futures for a lever, from the videos you saw (oldest first). */
export function forkAhead(seen: readonly Impression[], lever: Lever): Fork {
  const taste = tasteOf(seen);
  const you = playForward(seen, taste, "as-is");

  if (lever === "skip") {
    const best = mostSteering(seen, taste, you);
    const other = best === null ? you : best.other;
    return {
      you,
      other,
      changed: notIn(other, you),
      pivot: best?.pivot ?? null,
    };
  }

  const other = playForward(seen, taste, "off");
  return { you, other, changed: notIn(other, you), pivot: null };
}

/** How many topics a run of videos covers. */
export function topicsIn(videos: readonly Video[]): number {
  return new Set(videos.map((video) => video.category)).size;
}

/** Each topic's share of a run of videos, biggest first. */
export function topicShares(
  videos: readonly Video[],
): { topic: Category; share: number }[] {
  const counts = new Map<Category, number>();
  for (const video of videos) {
    counts.set(video.category, (counts.get(video.category) ?? 0) + 1);
  }
  return [...counts]
    .map(([topic, count]) => ({ topic, share: count / videos.length }))
    .sort((a, b) => b.share - a.share);
}

type Taste = (video: Video) => number;
type Mode = "as-is" | "off";

/**
 * How long you give a video: the share of it you watched for its topic this
 * session (newer counting the same as older), or your average for a topic
 * you never saw.
 */
function tasteOf(seen: readonly Impression[]): Taste {
  const ratios = new Map<Category, number[]>();
  for (const impression of seen) {
    const list = ratios.get(impression.video.category) ?? [];
    list.push(Math.min(watchRatio(impression), MAX_RATIO));
    ratios.set(impression.video.category, list);
  }
  const all = [...ratios.values()].flat();
  const overall = all.length === 0 ? 0.5 : mean(all);
  return (video) => {
    const list = ratios.get(video.category);
    const ratio = list === undefined ? overall : mean(list);
    return ratio * video.durationSec * 1000;
  };
}

/**
 * The next AHEAD videos the engine picks.
 * - "as-is": from everything you did.
 * - "off": not based on you at all (the EU's non-personalised For You):
 *   popular videos, kept varied.
 */
function playForward(seen: readonly Impression[], taste: Taste, mode: Mode) {
  const past = seen.map((impression) => impression.video);
  const ahead: Impression[] = [];
  const picked: Video[] = [];
  for (let step = 0; step < AHEAD; step++) {
    const learned = mode === "off" ? [] : [...seen, ...ahead];
    const ranking = rankNext({
      videos: VIDEOS,
      profile: buildProfile(learned),
      history: [...past, ...picked],
      explorationRate: step % TEST_EVERY === TEST_EVERY - 1 ? 1 : 0,
      rescue: false,
      holdMs: (video) => predictWatchMs(video, learned, true),
      // No chance: the same tie breaks in every future.
      random: () => 0.5,
    });
    const video = ranking.pick.video;
    picked.push(video);
    ahead.push(watched(video, taste(video), seen.length + step + 1));
  }
  return picked;
}

/** A video in a future, watched for `watchMs`. */
function watched(video: Video, watchMs: number, index: number): Impression {
  const impression = startImpression(video, index, 0, 0, false, 0, "interest");
  return { ...impression, watchMs, endedAt: watchMs };
}

/**
 * The one video that, skipped, changes what comes next the most: first what
 * it is about (the topics), then which videos. Only a video you watched for
 * a while can steer: skipping a skip changes nothing.
 */
function mostSteering(
  seen: readonly Impression[],
  taste: Taste,
  you: readonly Video[],
): { pivot: Impression; other: Video[] } | null {
  let best: {
    pivot: Impression;
    other: Video[];
    shift: number;
    changed: number;
  } | null = null;
  for (const [i, impression] of seen.entries()) {
    if (impression.revisit || impression.watchMs < STEERED_FROM_MS) continue;
    const skipped: Impression = {
      ...impression,
      watchMs: Math.min(impression.watchMs, SKIP_MS),
      endedAt: impression.endedAt ?? impression.startedAt + SKIP_MS,
      interactions: {
        ...impression.interactions,
        liked: false,
        saved: false,
        shared: false,
        commentsOpened: false,
        commented: false,
        followed: false,
        pauses: 0,
      },
    };
    const twin = [...seen.slice(0, i), skipped, ...seen.slice(i + 1)];
    const other = playForward(twin, taste, "as-is");
    const shift = topicShift(you, other);
    const changed = notIn(other, you);
    if (
      best === null ||
      shift > best.shift ||
      (shift === best.shift && changed > best.changed)
    ) {
      best = { pivot: impression, other, shift, changed };
    }
  }
  return best;
}

/** How far apart two runs are in what they are about: 0 for the same mix
    of topics, 1 for no topic in common (half the summed share gaps). */
function topicShift(a: readonly Video[], b: readonly Video[]): number {
  const shares = (videos: readonly Video[]) =>
    new Map(topicShares(videos).map(({ topic, share }) => [topic, share]));
  const sa = shares(a);
  const sb = shares(b);
  const topics = new Set([...sa.keys(), ...sb.keys()]);
  let gap = 0;
  for (const topic of topics) {
    gap += Math.abs((sa.get(topic) ?? 0) - (sb.get(topic) ?? 0));
  }
  return gap / 2;
}

/** How many of these videos the other run never shows. Counted by video,
    not by place, so the same videos one place later count as the same. */
function notIn(videos: readonly Video[], others: readonly Video[]): number {
  const ids = new Set(others.map((video) => video.id));
  return videos.filter((video) => !ids.has(video.id)).length;
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
