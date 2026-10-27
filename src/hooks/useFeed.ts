import { useEffect, useReducer } from "react";
import { startImpression, type Impression } from "../algorithm/impression";
import { buildProfile } from "../algorithm/profile";
import { createRandom } from "../algorithm/random";
import { rankNext, type Ranking } from "../algorithm/ranking";
import { readSignals } from "../algorithm/signals";
import { summarizeSession } from "../algorithm/session";
import { CATEGORIES } from "../data/categories";
import { VIDEOS, type Video } from "../data/videos";

/** How often the live numbers (watch time, session time) refresh. */
const TICK_MS = 250;

export type FeedItem = { key: number; video: Video; ranking: Ranking };

export type ReactionKind =
  | "like"
  | "unlike"
  | "save"
  | "unsave"
  | "comments"
  | "comment"
  | "share"
  | "follow"
  | "notInterested";

type State = {
  /** Every video placed in the feed. Always one more than the user has seen. */
  items: FeedItem[];
  activeIndex: number;
  /** Furthest the user has scrolled. Items after this are not seen yet. */
  maxSeenIndex: number;
  /** Finished impressions, oldest first. */
  history: Impression[];
  /** The impression of the video on screen right now. */
  current: Impression;
  /** When the current video last started playing, or null while paused. */
  playingSince: number | null;
  sessionStart: number;
  now: number;
  nextKey: number;
  likedIds: string[];
  savedIds: string[];
  followedCreators: string[];
};

// Time and random seeds are passed in, so the reducer itself stays pure.
type Action =
  | { type: "tick"; now: number }
  | { type: "view"; index: number; now: number; seed: number }
  | { type: "togglePause"; now: number }
  | { type: "react"; kind: ReactionKind; now: number; seed: number };

function feedReducer(state: State, action: Action): State {
  switch (action.type) {
    case "tick":
      return { ...state, now: action.now };

    case "view": {
      const { index, now, seed } = action;
      if (index === state.activeIndex || index < 0) return state;
      if (index >= state.items.length) return state;

      const finished = { ...liveImpression(state, now), endedAt: now };
      const history = [...state.history, finished];
      const revisit = index <= state.maxSeenIndex;
      const current = startImpression(
        state.items[index].video,
        history.length + 1,
        now,
        revisit,
      );
      const next: State = {
        ...state,
        history,
        current,
        activeIndex: index,
        maxSeenIndex: Math.max(state.maxSeenIndex, index),
        playingSince: now,
        now,
      };
      return queueNextVideo(next, seed);
    }

    case "togglePause": {
      const { now } = action;
      if (state.playingSince === null) {
        return { ...state, playingSince: now, now };
      }
      const current = liveImpression(state, now);
      const interactions = {
        ...current.interactions,
        pauses: current.interactions.pauses + 1,
      };
      return {
        ...state,
        current: { ...current, interactions },
        playingSince: null,
        now,
      };
    }

    case "react":
      // Every reaction re-ranks the next video, so it reacts to you instantly.
      return queueNextVideo(
        applyReaction({ ...state, now: action.now }, action.kind),
        action.seed,
      );
  }
}

function applyReaction(state: State, kind: ReactionKind): State {
  const { video } = state.current;
  const interactions = { ...state.current.interactions };
  let { likedIds, savedIds, followedCreators } = state;

  switch (kind) {
    case "like":
      interactions.liked = true;
      likedIds = addOnce(likedIds, video.id);
      break;
    case "unlike":
      interactions.liked = false;
      likedIds = likedIds.filter((id) => id !== video.id);
      break;
    case "save":
      interactions.saved = true;
      savedIds = addOnce(savedIds, video.id);
      break;
    case "unsave":
      interactions.saved = false;
      savedIds = savedIds.filter((id) => id !== video.id);
      break;
    case "comments":
      interactions.commentsOpened = true;
      break;
    case "comment":
      interactions.commented = true;
      break;
    case "share":
      interactions.shared = true;
      break;
    case "follow":
      interactions.followed = true;
      followedCreators = addOnce(followedCreators, video.creator);
      break;
    case "notInterested":
      interactions.notInterested = true;
      break;
  }

  return {
    ...state,
    likedIds,
    savedIds,
    followedCreators,
    current: { ...state.current, interactions },
  };
}

/** Throws away the unseen next video and ranks a fresh one. */
function queueNextVideo(state: State, seed: number): State {
  const seen = state.items.slice(0, state.maxSeenIndex + 1);
  const impressions = [...state.history, liveImpression(state, state.now)];
  const session = summarizeSession(impressions, state.sessionStart, state.now);
  const ranking = rankNext({
    videos: VIDEOS,
    profile: buildProfile(impressions),
    history: seen.map((item) => item.video),
    explorationRate: session.explorationRate,
    random: createRandom(seed),
  });
  return {
    ...state,
    items: [
      ...seen,
      { key: state.nextKey, video: ranking.pick.video, ranking },
    ],
    nextKey: state.nextKey + 1,
  };
}

/** The current impression with watch time counted up to `now`. */
function liveImpression(state: State, now: number): Impression {
  if (state.playingSince === null) return state.current;
  const watchMs = state.current.watchMs + (now - state.playingSince);
  return { ...state.current, watchMs };
}

function addOnce(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}

function createInitialState(): State {
  const now = Date.now();
  const ranking = rankNext({
    videos: VIDEOS,
    profile: buildProfile([]),
    history: [],
    explorationRate: summarizeSession([], now, now).explorationRate,
    random: createRandom(Math.random()),
  });
  const first: FeedItem = { key: 0, video: ranking.pick.video, ranking };
  const state: State = {
    items: [first],
    activeIndex: 0,
    maxSeenIndex: 0,
    history: [],
    current: startImpression(first.video, 1, now, false),
    playingSince: now,
    sessionStart: now,
    now,
    nextKey: 1,
    likedIds: [],
    savedIds: [],
    followedCreators: [],
  };
  return queueNextVideo(state, Math.random());
}

/** The whole mock app: the feed, what the user does, and what the algorithm makes of it. */
export function useFeed() {
  const [state, dispatch] = useReducer(
    feedReducer,
    undefined,
    createInitialState,
  );

  useEffect(() => {
    const timer = window.setInterval(
      () => dispatch({ type: "tick", now: Date.now() }),
      TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  const current = liveImpression(state, state.now);
  const impressions = [...state.history, current];
  const profile = buildProfile(impressions);

  const topicScores = CATEGORIES.map((name) => ({
    name,
    score: profile.topics.get(name) ?? 0,
  })).sort((a, b) => b.score - a.score);

  const creatorScores = [...profile.creators]
    .map(([name, score]) => ({ name, score }))
    .filter((creator) => Math.abs(creator.score) >= 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    items: state.items,
    activeIndex: state.activeIndex,
    playing: state.playingSince !== null,
    current,
    currentSignals: readSignals(current),
    currentItem: state.items[state.activeIndex],
    /** The next video the user has not seen yet. Already ranked. */
    upNext: state.items[state.maxSeenIndex + 1],
    history: state.history.map((impression) => ({
      impression,
      signals: readSignals(impression),
    })),
    session: summarizeSession(impressions, state.sessionStart, state.now),
    topicScores,
    creatorScores,
    likedIds: state.likedIds,
    savedIds: state.savedIds,
    followedCreators: state.followedCreators,

    view: (index: number) =>
      dispatch({ type: "view", index, now: Date.now(), seed: Math.random() }),
    togglePause: () => dispatch({ type: "togglePause", now: Date.now() }),
    react: (kind: ReactionKind) =>
      dispatch({ type: "react", kind, now: Date.now(), seed: Math.random() }),
  };
}

export type FeedController = ReturnType<typeof useFeed>;
