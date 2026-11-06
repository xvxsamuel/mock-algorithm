import { useCallback, useEffect, useReducer } from "react";
import {
  startImpression,
  watchRatio,
  type Impression,
} from "../algorithm/impression";
import { inferTraits } from "../algorithm/inference";
import {
  AD_EVERY,
  adDue,
  adRanking,
  perView,
  runAuction,
  sinceLastAd,
  weaknessesOf,
  winnerOf,
  type Auction,
} from "../algorithm/market";
import { predictionMiss, predictWatchMs } from "../algorithm/prediction";
import { buildProfile } from "../algorithm/profile";
import { createRandom } from "../algorithm/random";
import { rankNext, type Ranking } from "../algorithm/ranking";
import {
  exitRisk,
  isHit,
  RESCUE_AT,
  type ExitReason,
} from "../algorithm/retention";
import { readSignals } from "../algorithm/signals";
import { summarizeSession } from "../algorithm/session";
import { paidPostOf } from "../data/ads";
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
  /** The biggest reason for the exit risk when it was picked, e.g. "skipping". */
  reasonWhenQueued: ExitReason | null;
  /** The exit risk (0-1) when it started playing; it may move after the pick. */
  riskWhenPlayed: number;
  /** An ad slot: the auction that sold it. Null for every other video. */
  auction: Auction | null;
};

/** Something in your feed that someone paid for. */
export type Sale = {
  key: number;
  /** "ad": labelled. "paid": a creator was paid, and nothing says so. */
  kind: "ad" | "paid";
  brand: string;
  emoji: string;
  /** What this view of you sold for (€), for ads. */
  price: number;
  /** What about you the winning bid paid extra for, for ads. */
  because: readonly string[];
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
  /**
   * True while the panel covers the video (the sheet on phones). It holds
   * playback, and it is not a pause: reading the panel is not watching.
   */
  held: boolean;
  /** The video was playing when it was held, so it plays again after. */
  resumeAfterHold: boolean;
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
  | { type: "tick"; now: number; seed: number }
  | { type: "view"; index: number; now: number; seed: number }
  | { type: "togglePause"; now: number }
  | { type: "hold"; held: boolean; now: number }
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
        playingSince: state.held ? null : now,
        resumeAfterHold: state.held,
        now,
      };
    }

    case "tick": {
      // The risk also climbs while you watch (e.g. past your plan). Once it
      // crosses the line, the engine swaps a sure hit in at once.
      const next = { ...state, now: action.now };
      const queued = next.items[next.maxSeenIndex + 1];
      if (queued.ranking.source === "rescue") return next;
      return rescueDue(next, riskOf(next).value)
        ? queueNextVideo(next, action.seed)
        : next;
    }

    case "view": {
      const { index, now, seed } = action;
      if (!state.started) return state;
      if (index === state.activeIndex || index < 0) return state;
      if (index >= state.items.length) return state;

      const finished = { ...liveImpression(state, now), endedAt: now };
      const history = [...state.history, finished];
      const revisit = index <= state.maxSeenIndex;
      const item = state.items[index];
      // The guess is made fresh as the video starts, so it already knows how
      // you treated the one you just left. A revisit keeps its first guess.
      const predictedMs = revisit
        ? item.predictedMs
        : predictWatchMs(item.video, history, item.ranking.source === "rescue");
      const current = startImpression(
        item.video,
        history.length + 1,
        now,
        revisit,
        predictedMs,
        item.ranking.source,
      );
      const next: State = {
        ...state,
        history,
        current,
        activeIndex: index,
        maxSeenIndex: Math.max(state.maxSeenIndex, index),
        playingSince: state.held ? null : now,
        resumeAfterHold: state.held,
        now,
      };
      if (!revisit) {
        // What it is worth is measured from here, not from when it was queued.
        const played = { ...item, riskWhenPlayed: riskOf(next).value };
        next.items = next.items.map((it, i) => (i === index ? played : it));
      }
      return queueNextVideo(next, seed);
    }

    case "hold": {
      const { held, now } = action;
      if (held === state.held) return state;
      if (held) {
        return {
          ...state,
          current: liveImpression(state, now),
          playingSince: null,
          held: true,
          resumeAfterHold: state.playingSince !== null,
          now,
        };
      }
      return {
        ...state,
        playingSince: state.resumeAfterHold ? now : state.playingSince,
        held: false,
        resumeAfterHold: false,
        now,
      };
    }

    case "togglePause": {
      const { now } = action;
      if (!state.started || state.held) return state;
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
  const rescue = rescueDue(state, risk.value);
  const profile = buildProfile(impressions);
  const sources = seen.map((item) => item.ranking.source);
  // Every few videos the slot is sold, unless you look about to leave:
  // then keeping you beats selling you.
  const auction =
    state.started && !rescue && adDue(sources)
      ? runAuction({
          topics: profile.topics,
          weaknesses: weaknessesOf(
            inferTraits(impressions, profile.topics),
            pastPlan(state),
          ),
          seen: impressions.length,
          slot: sources.filter((source) => source === "ad").length + 1,
        })
      : null;
  const ranking =
    auction === null
      ? rankNext({
          videos: VIDEOS,
          profile,
          history: seen.map((item) => item.video),
          explorationRate: session.explorationRate,
          rescue,
          holdMs: (video) => predictWatchMs(video, state.history, true),
          random: createRandom(seed),
        })
      : adRanking(auction, session.explorationRate);
  return {
    ...state,
    items: [
      ...seen,
      {
        key: state.nextKey,
        video: ranking.pick.video,
        ranking,
        predictedMs: predictWatchMs(
          ranking.pick.video,
          state.history,
          ranking.source === "rescue",
        ),
        reasonWhenQueued: risk.reason,
        riskWhenPlayed: risk.value,
        auction,
      },
    ],
    nextKey: state.nextKey + 1,
  };
}

/** You set a limit and you are past it. */
function pastPlan(state: State): boolean {
  return (
    state.started &&
    state.intentMs !== null &&
    state.now - state.sessionStart > state.intentMs
  );
}

/** Everything you have seen that someone paid for, oldest first. */
function salesOf(seen: readonly FeedItem[]): Sale[] {
  const sales: Sale[] = [];
  for (const item of seen) {
    const paid = paidPostOf(item.video);
    if (item.auction !== null) {
      const winner = winnerOf(item.auction);
      sales.push({
        key: item.key,
        kind: "ad",
        brand: winner.advertiser.brand,
        emoji: winner.advertiser.emoji,
        price: perView(winner),
        because: winner.because,
      });
    } else if (paid !== undefined) {
      sales.push({
        key: item.key,
        kind: "paid",
        ...paid,
        price: 0,
        because: [],
      });
    }
  }
  return sales;
}

/**
 * Whether the next video should be a sure hit: the risk is over the line,
 * the app knows you well enough, and the video you are on is not one already.
 */
function rescueDue(state: State, risk: number): boolean {
  return (
    state.started &&
    state.history.length >= RESCUE_AFTER &&
    risk >= RESCUE_AT &&
    state.items[state.maxSeenIndex].ranking.source !== "rescue"
  );
}

/**
 * The exit risk right now. A video that is already holding you counts at
 * once, so the risk falls while a "sure hit" plays.
 */
function riskOf(state: State) {
  const live = liveImpression(state, state.now);
  return exitRisk(
    isHit(live) ? [...state.history, live] : state.history,
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
    holdMs: (video) => predictWatchMs(video, [], true),
    random: createRandom(Math.random()),
  });
  const predictedMs = predictWatchMs(ranking.pick.video, []);
  const first: FeedItem = {
    key: 0,
    video: ranking.pick.video,
    ranking,
    predictedMs,
    reasonWhenQueued: null,
    riskWhenPlayed: 0,
    auction: null,
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
    held: false,
    resumeAfterHold: false,
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
      () => dispatch({ type: "tick", now: Date.now(), seed: Math.random() }),
      TICK_MS,
    );
    return () => window.clearInterval(timer);
  }, []);

  // Stable, so the page can hold playback from an effect.
  const hold = useCallback(
    (held: boolean) => dispatch({ type: "hold", held, now: Date.now() }),
    [],
  );

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
  const traits = inferTraits(impressions, profile.topics);

  // The market: what you were sold for, and the auction for your next ad.
  const seenItems = state.items.slice(0, state.maxSeenIndex + 1);
  const upNext = state.items[state.maxSeenIndex + 1];
  const currentItem = state.items[state.activeIndex];
  const sales = salesOf(seenItems);
  const since = sinceLastAd(seenItems.map((item) => item.ranking.source));
  const market = {
    sales,
    earned: sales.reduce((sum, sale) => sum + sale.price, 0),
    /** "now": an ad is playing. "next": the next video is sold. "open": bidding. */
    stage:
      currentItem.auction !== null
        ? ("now" as const)
        : upNext.auction !== null
          ? ("next" as const)
          : ("open" as const),
    auction:
      currentItem.auction ??
      upNext.auction ??
      runAuction({
        topics: profile.topics,
        weaknesses: weaknessesOf(traits, pastPlan(state)),
        seen: impressions.length,
        slot: sales.filter((sale) => sale.kind === "ad").length + 1,
      }),
    /** Swipes until the next ad, while the bidding is open. */
    swipesToAd: Math.max(AD_EVERY - since, 1),
  };
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
    /** Playback is held because the panel covers the video. */
    held: state.held,
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
    predictionMiss: predictionMiss(state.history),
    traits,
    market,
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
    /** Holds playback while the panel covers the video, without a pause. */
    hold,
    react: (kind: ReactionKind) =>
      dispatch({ type: "react", kind, now: Date.now(), seed: Math.random() }),
  };
}

export type FeedController = ReturnType<typeof useFeed>;
