/**
 * One chain of cause and effect the model can stand behind: you watched
 * these, so it guessed you like their topic, so it picked this video. Only
 * told when that guess tipped the pick: take it away from every video of
 * the topic, and another video ranks first.
 */

import type { Category } from "../data/categories";
import type { Impression } from "./impression";
import { MEMORY_DECAY } from "./profile";
import {
  INTENSITY_LABEL,
  interestLabel,
  type Ranking,
  type ScoredVideo,
} from "./ranking";
import { readSignals } from "./signals";

/** The most watched videos named in a chain. */
const MAX_WATCHED = 3;

export type PickCause = {
  /** The topic it guessed you like. */
  topic: Category;
  /** The videos in that topic that raised the guess most, strongest first. */
  watched: Impression[];
  /** What it would have picked without the guess. */
  instead: ScoredVideo;
};

/** Why the engine picked this video for you, or null if what you did is
    not what decided it. `history` is what played before it. */
export function causeOfPick(
  ranking: Ranking,
  history: readonly Impression[],
): PickCause | null {
  const { pick, source, runnersUp } = ranking;
  if (source !== "interest") return null;
  const topic = pick.video.category;
  // A score without the guess: a video of the topic loses its interest
  // part and the intensity boost the interest unlocks.
  const guessed = new Set([interestLabel(topic), INTENSITY_LABEL]);
  const without = (entry: ScoredVideo) =>
    entry.video.category !== topic
      ? entry.score
      : entry.parts.reduce(
          (score, part) => score - (guessed.has(part.label) ? part.value : 0),
          entry.score,
        );
  const instead = runnersUp.reduce<ScoredVideo | null>(
    (best, entry) =>
      best === null || without(entry) > without(best) ? entry : best,
    null,
  );
  const lowest = runnersUp.at(-1);
  if (instead === null || lowest === undefined) return null;
  // Only the best few runners-up are kept, and anything below them scored
  // at most the last one: below that, the real "instead" is not known.
  if (without(instead) < lowest.score) return null;
  // It tipped the pick, or the chain would claim too much.
  if (without(pick) >= without(instead)) return null;

  // What each earlier video in the topic added to the guess, as the
  // profile counts it: its signals, faded by how long ago it played.
  const last = history.length - 1;
  const watched = history
    .map((impression, i) => ({
      impression,
      added:
        readSignals(impression).reduce((sum, s) => sum + s.topic, 0) *
        MEMORY_DECAY ** (last - i),
    }))
    .filter(({ impression, added }) => {
      return impression.video.category === topic && added > 0;
    })
    .sort((a, b) => b.added - a.added)
    .slice(0, MAX_WATCHED)
    .map(({ impression }) => impression);
  return watched.length === 0 ? null : { topic, watched, instead };
}
