/** A made-up A/B test of the kind every big app runs on its users all day. */
export type Experiment = {
  /** What the test changes, in plain words. */
  name: string;
  variant: "A" | "B";
  /** What the winning variant was worth, in the metric the app cares about. */
  lift: string;
};

/**
 * ByteDance said in 2023 that its A/B platform runs 30,000+ experiments at
 * once and adds ~2,000 a day (press reports on Volcano Engine DataTester).
 */
export const EXPERIMENTS_RUNNING = 30_000;

/** The ones you happen to be in. Names and numbers are invented. */
export const MY_EXPERIMENTS: readonly Experiment[] = [
  {
    name: "No pause before the next video",
    variant: "B",
    lift: "+0.8 min/day",
  },
  { name: "Loop short videos", variant: "A", lift: "+0.5 min/day" },
  { name: "Hide the clock in full screen", variant: "B", lift: "+1.1 min/day" },
  { name: "Load three videos ahead", variant: "B", lift: "+0.6 min/day" },
  { name: "Hint to swipe after 2 s", variant: "A", lift: "+0.3 min/day" },
  { name: "Sadder songs after 11 pm", variant: "B", lift: "+0.9 min/day" },
  { name: "A buzz when you like", variant: "A", lift: "+0.2 min/day" },
  { name: "Streak reminder at 8 pm", variant: "B", lift: "+1.4 min/day" },
  { name: "Show a comment early", variant: "B", lift: "+0.4 min/day" },
  { name: "Never show an end", variant: "A", lift: "+2.0 min/day" },
  { name: "Ask to watch again", variant: "A", lift: "+0.3 min/day" },
  { name: "Sound on by default", variant: "B", lift: "+0.7 min/day" },
];

/** Dekker et al. (2025): logged TikTok use with the personalised feed. */
export const MINUTES_PER_DAY = 87;
