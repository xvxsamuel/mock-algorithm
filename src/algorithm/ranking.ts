import { CATEGORIES, type Category } from "../data/categories";
import type { Video } from "../data/videos";
import type { InterestProfile } from "./profile";
import type { FeedSource } from "./sources";

/** Made-up weights. Real apps learn thousands of these from data. */
const WEIGHTS = {
  interest: 1,
  creator: 0.8,
  popularity: 0.6,
  intensity: 0.5,
  seenRecently: -1.5,
  sameTopicInARow: -0.3,
  jitter: 0.3,
};

/** Videos shown within this many slots are not even considered. */
const HARD_REPEAT_WINDOW = 8;
/** Videos shown within this many slots get a penalty. */
const SOFT_REPEAT_WINDOW = 24;

export type ScorePart = {
  label: string;
  value: number;
  /**
   * "you": it follows from what you watched. "engine": the engine's own
   * rule. "paid": an advertiser bought it. "pushed": fake accounts did.
   */
  from: "you" | "engine" | "paid" | "pushed";
};

export type ScoredVideo = {
  video: Video;
  score: number;
  parts: ScorePart[];
};

export type Ranking = {
  pick: ScoredVideo;
  /** Why the engine picked it: best match, a test, or a rescue. */
  source: FeedSource;
  reason: string;
  explorationRate: number;
  candidates: number;
  filteredOut: number;
  runnersUp: ScoredVideo[];
};

export type RankingInput = {
  videos: readonly Video[];
  profile: InterestProfile;
  /** Videos already in the feed, oldest first. */
  history: readonly Video[];
  /** Chance (0-1) of picking an exploration video instead of the best one. */
  explorationRate: number;
  /** You look about to leave: skip the tests and play the surest hit. */
  rescue: boolean;
  /** How long it expects you to watch a video played as a sure hit. */
  holdMs: (video: Video) => number;
  random: () => number;
};

/** Picks the next video for the feed and explains why. */
export function rankNext(input: RankingInput): Ranking {
  const { videos, profile, history, explorationRate, rescue, holdMs, random } =
    input;

  // 1. Candidate generation: drop what was just shown.
  const blocked = new Set(
    history.slice(-HARD_REPEAT_WINDOW).map((video) => video.id),
  );
  const pool = videos.filter((video) => !blocked.has(video.id));
  const candidates = pool.length > 0 ? pool : [...videos];

  // 2. Scoring: predict how engaging each candidate will be for this user.
  const scored = candidates
    .map((video) => scoreVideo(video, profile, history, random))
    .sort((a, b) => b.score - a.score);

  // 3a. Rescue: about to lose you, so play what it expects to hold you
  //     longest instead of testing anything new.
  if (rescue) {
    const pick = surestHit(scored, profile, history, holdMs);
    return {
      pick,
      source: "rescue",
      reason: `You looked about to leave, so it played what it expects to hold you longest: ${pick.video.category}.`,
      explorationRate,
      candidates: candidates.length,
      filteredOut: videos.length - candidates.length,
      runnersUp: scored.filter((entry) => entry !== pick).slice(0, 3),
    };
  }

  // 3b. Exploration: sometimes show something unexpected to learn more.
  const exploring = random() < explorationRate;
  const topic = exploring ? leastShownTopic(profile, history, random) : null;
  const pick =
    scored.find((entry) => entry.video.category === topic) ?? scored[0];

  return {
    pick,
    source: exploring ? "explore" : "interest",
    reason: exploring
      ? `Exploring: you have seen little ${pick.video.category} lately, so the app tests whether it hooks you.`
      : `Highest predicted engagement. Biggest boost: ${biggestBoost(pick)}.`,
    explorationRate,
    candidates: candidates.length,
    filteredOut: videos.length - candidates.length,
    runnersUp: scored.filter((entry) => entry !== pick).slice(0, 3),
  };
}

function scoreVideo(
  video: Video,
  profile: InterestProfile,
  history: readonly Video[],
  random: () => number,
): ScoredVideo {
  const topicInterest = profile.topics.get(video.category) ?? 0;
  const creatorInterest = profile.creators.get(video.creator) ?? 0;
  const seenRecently = history
    .slice(-SOFT_REPEAT_WINDOW)
    .some((seen) => seen.id === video.id);
  const sameTopicInARow = history
    .slice(-3)
    .filter((seen) => seen.category === video.category).length;

  const parts: ScorePart[] = [
    {
      label: interestLabel(video.category),
      value: topicInterest * WEIGHTS.interest,
      from: "you",
    },
    {
      label: `interest in @${video.creator}`,
      value: creatorInterest * WEIGHTS.creator,
      from: "you",
    },
    {
      label: "popularity",
      value: popularity(video) * WEIGHTS.popularity,
      from: "engine",
    },
    {
      // The more you like a topic, the more extreme versions of it you get.
      label: INTENSITY_LABEL,
      value: Math.max(topicInterest, 0) * video.intensity * WEIGHTS.intensity,
      from: "engine",
    },
    {
      label: "seen recently",
      value: seenRecently ? WEIGHTS.seenRecently : 0,
      from: "engine",
    },
    {
      label: "same topic in a row",
      value: sameTopicInARow * WEIGHTS.sameTopicInARow,
      from: "engine",
    },
    {
      label: "a bit of chance",
      value: random() * WEIGHTS.jitter,
      from: "engine",
    },
  ];

  const score = parts.reduce((sum, part) => sum + part.value, 0);
  return { video, score, parts };
}

/** The score part a liked topic unlocks: more extreme videos of it. */
export const INTENSITY_LABEL = "intensity boost";

/** The score part for how much you like a topic. */
export function interestLabel(category: Category): string {
  return `interest in ${category}`;
}

/** 0 for ~100K likes, 1 for ~6M likes. */
function popularity(video: Video): number {
  const value = (Math.log10(video.likes) - 5) / 1.8;
  return Math.min(Math.max(value, 0), 1);
}

/** In a topic you like, the video it expects you to watch longest; on a
    tie, the most intense, best-scoring one. A rerun only when nothing new
    in a topic you like is left. */
function surestHit(
  scored: readonly ScoredVideo[],
  profile: InterestProfile,
  history: readonly Video[],
  holdMs: (video: Video) => number,
): ScoredVideo {
  const recent = new Set(
    history.slice(-SOFT_REPEAT_WINDOW).map((video) => video.id),
  );
  const liked = scored.filter(
    (entry) => (profile.topics.get(entry.video.category) ?? 0) > 0,
  );
  const fresh = liked.filter((entry) => !recent.has(entry.video.id));
  const pool = [fresh, liked, scored].find((list) => list.length > 0) ?? scored;
  const strength = (entry: ScoredVideo) => entry.score + entry.video.intensity;
  return pool.reduce((a, b) => {
    const longer = holdMs(b.video) - holdMs(a.video);
    if (longer !== 0) return longer > 0 ? b : a;
    return strength(b) > strength(a) ? b : a;
  });
}

function leastShownTopic(
  profile: InterestProfile,
  history: readonly Video[],
  random: () => number,
): Category {
  const recent = history.slice(-SOFT_REPEAT_WINDOW);
  const timesShown = (topic: Category) =>
    recent.filter((video) => video.category === topic).length;

  // Topics the user clearly rejected are not worth exploring.
  const allowed = CATEGORIES.filter(
    (topic) => (profile.topics.get(topic) ?? 0) > -1,
  );
  const options = allowed.length > 0 ? allowed : [...CATEGORIES];
  const fewest = Math.min(...options.map(timesShown));
  const tied = options.filter((topic) => timesShown(topic) === fewest);
  return tied[Math.floor(random() * tied.length)];
}

function biggestBoost(entry: ScoredVideo): string {
  const best = entry.parts.reduce((a, b) => (b.value > a.value ? b : a));
  return best.label;
}
