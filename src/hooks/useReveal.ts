import type { FeedController } from "./useFeed";

/** The views of the machine the panel switches between. */
export type Lens =
  "you" | "engine" | "content" | "market" | "influence" | "world";

/**
 * How much of the machine you have been shown. At first there is only the
 * phone, and you just scroll. Each step adds a little more of what the app
 * was doing all along, so the panel builds up while you watch.
 */
export type Reveal = {
  /** 0 is the phone alone; each step shows more. */
  step: number;
  /** The panel is there at all: your time, pause and leave. */
  panel: boolean;
  /** The chance you leave, and what is queued up next. */
  risk: boolean;
  /** The lenses you can switch between, in order. One alone has no tabs. */
  lenses: Lens[];
  /** The CO2e of the scroll, in the header. */
  grams: boolean;
};

/** Videos you swipe past before each step shows. */
const STEPS = [2, 5, 8, 12, 16] as const;

const LENSES_AT: Lens[][] = [
  [],
  ["you"],
  ["you"],
  ["you", "engine", "content"],
  ["you", "engine", "content", "market", "influence"],
  ["you", "engine", "content", "market", "influence", "world"],
];

export function useReveal(feed: FeedController): Reveal {
  const seen = feed.history.length;
  const step = STEPS.filter((at) => seen >= at).length;
  return {
    step,
    panel: step >= 1,
    risk: step >= 2,
    lenses: LENSES_AT[step] ?? [],
    grams: step >= 5,
  };
}
