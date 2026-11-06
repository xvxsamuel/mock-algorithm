/** A made-up A/B test of the kind every big app runs on its users all day. */
export type Experiment = {
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
  { name: "autoplay_delay_0ms", variant: "B", lift: "+0.8 min/day" },
  { name: "loop_short_videos", variant: "A", lift: "+0.5 min/day" },
  { name: "hide_clock_fullscreen", variant: "B", lift: "+1.1 min/day" },
  { name: "preload_3_ahead", variant: "B", lift: "+0.6 min/day" },
  { name: "swipe_hint_after_2s", variant: "A", lift: "+0.3 min/day" },
  { name: "sad_audio_after_23h", variant: "B", lift: "+0.9 min/day" },
  { name: "like_burst_haptics", variant: "A", lift: "+0.2 min/day" },
  { name: "streak_push_20h", variant: "B", lift: "+1.4 min/day" },
  { name: "comment_peek_bubble", variant: "B", lift: "+0.4 min/day" },
  { name: "no_end_of_feed", variant: "A", lift: "+2.0 min/day" },
  { name: "rewatch_prompt", variant: "A", lift: "+0.3 min/day" },
  { name: "sound_on_default", variant: "B", lift: "+0.7 min/day" },
];

/** Dekker et al. (2025): logged TikTok use with the personalised feed. */
export const MINUTES_PER_DAY = 87;
