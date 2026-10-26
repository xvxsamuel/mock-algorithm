import { watchRatio, type Impression } from "./impression";

export type SignalCode =
  | "QUICK_SKIP"
  | "WATCH"
  | "LOOP"
  | "PAUSE"
  | "REVISIT"
  | "LIKE"
  | "COMMENTS_OPEN"
  | "COMMENT"
  | "SHARE"
  | "SAVE"
  | "FOLLOW"
  | "NOT_INTERESTED";

/** A single thing the algorithm learns from an impression. */
export type Signal = {
  code: SignalCode;
  /** Short human-readable version, e.g. "WATCH 83%". */
  label: string;
  /** How much this moves interest in the video's topic. */
  topic: number;
  /** How much this moves interest in the video's creator. */
  creator: number;
};

/** Swiping away faster than this counts as a skip. */
export const QUICK_SKIP_MS = 2000;

/**
 * Turns raw behaviour into weighted signals. The weights are made up, but the
 * order is realistic: watch time and rewatches matter a lot, shares and saves
 * matter more than likes.
 */
export function readSignals(impression: Impression): Signal[] {
  const { interactions } = impression;
  const ratio = watchRatio(impression);
  const signals: Signal[] = [];

  const skipped =
    impression.endedAt !== null && impression.watchMs < QUICK_SKIP_MS;
  if (skipped) {
    const seconds = (impression.watchMs / 1000).toFixed(1);
    signals.push({
      code: "QUICK_SKIP",
      label: `QUICK_SKIP ${seconds}s`,
      topic: -0.4,
      creator: -0.1,
    });
  } else {
    const percent = Math.round(Math.min(ratio, 1) * 100);
    signals.push({
      code: "WATCH",
      label: `WATCH ${percent}%`,
      topic: 0.6 * Math.min(ratio, 1),
      creator: 0,
    });
  }

  const loops = Math.min(Math.floor(ratio), 3);
  if (loops > 0) {
    signals.push({
      code: "LOOP",
      label: `LOOP x${loops}`,
      topic: 0.3 * loops,
      creator: 0.2 * loops,
    });
  }
  if (interactions.pauses > 0) {
    signals.push({ code: "PAUSE", label: "PAUSE", topic: 0.15, creator: 0 });
  }
  if (impression.revisit) {
    signals.push({
      code: "REVISIT",
      label: "REVISIT",
      topic: 0.5,
      creator: 0.3,
    });
  }
  if (interactions.liked) {
    signals.push({ code: "LIKE", label: "LIKE", topic: 0.6, creator: 0.3 });
  }
  if (interactions.commentsOpened) {
    signals.push({
      code: "COMMENTS_OPEN",
      label: "COMMENTS_OPEN",
      topic: 0.4,
      creator: 0.2,
    });
  }
  if (interactions.commented) {
    signals.push({
      code: "COMMENT",
      label: "COMMENT",
      topic: 0.8,
      creator: 0.4,
    });
  }
  if (interactions.shared) {
    signals.push({ code: "SHARE", label: "SHARE", topic: 1, creator: 0.4 });
  }
  if (interactions.saved) {
    signals.push({ code: "SAVE", label: "SAVE", topic: 1, creator: 0.3 });
  }
  if (interactions.followed) {
    signals.push({ code: "FOLLOW", label: "FOLLOW", topic: 0.5, creator: 2 });
  }
  if (interactions.notInterested) {
    signals.push({
      code: "NOT_INTERESTED",
      label: "NOT_INTERESTED",
      topic: -2,
      creator: -3,
    });
  }
  return signals;
}
