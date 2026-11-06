import { useEffect, useReducer } from "react";
import {
  startImpression,
  watchRatio,
  type Impression,
} from "../algorithm/impression";
import { inferTraits } from "../algorithm/inference";
import { predictionAccuracy, predictWatchMs } from "../algorithm/prediction";
import { buildProfile } from "../algorithm/profile";
import { createRandom } from "../algorithm/random";
import { rankNext, type Ranking } from "../algorithm/ranking";
import { exitRisk, RESCUE_AT } from "../algorithm/retention";
import { readSignals } from "../algorithm/signals";
import { summarizeSession } from "../algorithm/session";
import { CATEGORIES } from "../data/categories";
import { VIDEOS, type Video } from "../data/videos";

/** How often the live numbers (watch time, session time) refresh. */
const TICK_MS = 250;
/** No rescue while the app is still getting to know you. */
const RESCUE_AFTER = 5;
/** Data points logged per second of watching (dwell, position, volume...). */
const POINTS_PER_SECOND = 24;
/** Data points logged when a video starts (device, network, time, place...). */
const POINTS_PER_VIDEO = 38;

export type FeedItem = {
  key: number;
  video: Video;
  ranking: Ranking;
  /** How long the app expects you to watch it, decided before it plays. */
  predictedMs: number;
};

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
  /** False until the user picks how long they want to scroll. */
  started: boolean;
  /** The time the user said they would scroll for, or null for no limit. */
  intentMs: number | null;
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
  | { type: "begin"; intentMs: number | null; now: number }
  | { type: "tick"; now: number }
  | { type: "view"; index: number; now: number; seed: number }
  | { type: "togglePause"; now: number }
  | { type: "react"; kind: ReactionKind; now: number; seed: number };

function feedReducer(state: State, action: Action): State {
  switch (action.type) {
    case "begin": {
      if (state.started) return state;
      const { now } = action;
      return {
        ...state,
        started: true,
        intentMs: action.intentMs,
        sessionStart: now,
        current: { ...state.current, startedAt: now },
        playingSince: now,
        now,
      };
    }

    case "tick":
      return { ...state, now: action.now };

    case "view": {
      const { index, now, seed } = action;
      if (!state.started) return state;
      if (index === state.activeIndex || index < 0) return state;
      if (index >= state.items.length) return state;

      const finished = { ...liveImpression(state, now), endedAt: now };
      const history = [...state.history, finished];
      const revisit = index <= state.maxSeenIndex;
      const item = state.items[index];
      const current = startImpression(
        item.video,
        history.length + 1,
        now,
        revisit,
        item.predictedMs,
        item.ranking.source,
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
      if (!state.started) return state;
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
  const risk = riskOf(state);
  const lastSource = seen.at(-1)?.ranking.source;
  const rescue =
    state.history.length >= RESCUE_AFTER &&
    risk.value >= RESCUE_AT &&
    lastSource !== "rescue";
  const ranking = rankNext({
    videos: VIDEOS,
    profile: buildProfile(impressions),
    history: seen.map((item) => item.video),
    explorationRate: session.explorationRate,
    rescue,
    random: createRandom(seed),
  });
  return {
    ...state,
    items: [
      ...seen,
      {
        key: state.nextKey,
        video: ranking.pick.video,
        ranking,
        predictedMs: predictWatchMs(ranking.pick.video, state.history),
      },
    ],
    nextKey: state.nextKey + 1,
  };
}

function riskOf(state: State) {
  return exitRisk(
    state.history,
    state.now - state.sessionStart,
    state.intentMs,
    new Date(state.now).getHours(),
  );
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
    rescue: false,
    random: createRandom(Math.random()),
  });
  const predictedMs = predictWatchMs(ranking.pick.video, []);
  const first: FeedItem = {
    key: 0,
    video: ranking.pick.video,
    ranking,
    predictedMs,
  };
  const state: State = {
    started: false,
    intentMs: null,
    items: [first],
    activeIndex: 0,
    maxSeenIndex: 0,
    history: [],
    current: startImpression(
      first.video,
      1,
      now,
      false,
      predictedMs,
      ranking.source,
    ),
    playingSince: null,
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
  const sessionMs = state.started ? state.now - state.sessionStart : 0;

  const topicScores = CATEGORIES.map((name) => ({
    name,
    score: profile.topics.get(name) ?? 0,
  })).sort((a, b) => b.score - a.score);

  const creatorScores = [...profile.creators]
    .map(([name, score]) => ({ name, score }))
    .filter((creator) => Math.abs(creator.score) >= 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const watchedMs = impressions.reduce((sum, i) => sum + i.watchMs, 0);
  const loops = impressions.reduce(
    (sum, i) => sum + Math.min(Math.floor(watchRatio(i)), 3),
    0,
  );

  return {
    started: state.started,
    intentMs: state.intentMs,
    sessionMs,
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
    exitRisk: riskOf(state),
    accuracy: predictionAccuracy(state.history),
    traits: inferTraits(impressions, profile.topics),
    counters: {
      autoplays: state.started ? impressions.length : 0,
      loops,
      dataPoints: state.started
        ? Math.round(
            (watchedMs / 1000) * POINTS_PER_SECOND +
              impressions.length * POINTS_PER_VIDEO,
          )
        : 0,
    },
    topicScores,
    creatorScores,
    likedIds: state.likedIds,
    savedIds: state.savedIds,
    followedCreators: state.followedCreators,

    begin: (intentMs: number | null) =>
      dispatch({ type: "begin", intentMs, now: Date.now() }),
    view: (index: number) =>
      dispatch({ type: "view", index, now: Date.now(), seed: Math.random() }),
    togglePause: () => dispatch({ type: "togglePause", now: Date.now() }),
    react: (kind: ReactionKind) =>
      dispatch({ type: "react", kind, now: Date.now(), seed: Math.random() }),
  };
}

export type FeedController = ReturnType<typeof useFeed>;
