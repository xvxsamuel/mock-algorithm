/**
 * One chain of cause and effect the model can stand behind: you watched
 * these, so it guessed you like their topic, so it picked this video. Only
 * told when that guess tipped the pick: without it, another video would
 * have ranked first.
 */

import type { Category } from "../data/categories";
import type { Impression } from "./impression";
import { MEMORY_DECAY } from "./profile";
import { interestLabel, type Ranking } from "./ranking";
import { readSignals } from "./signals";

/** The most watched videos named in a chain. */
const MAX_WATCHED = 3;

export type PickCause = {
  /** The topic it guessed you like. */
  topic: Category;
  /** The videos in that topic that raised the guess most, strongest first. */
  watched: Impression[];
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
  const interest = pick.parts.find(
    (part) => part.label === interestLabel(topic),
  );
  if (interest === undefined || interest.value <= 0) return null;
  // It tipped the pick, or the chain would claim too much.
  const next = runnersUp[0];
  if (next !== undefined && pick.score - interest.value >= next.score) {
    return null;
  }

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
  return watched.length === 0 ? null : { topic, watched };
}
