import type { Video } from "../data/videos";

/** What the user did while a video was on screen. */
export type Interactions = {
  liked: boolean;
  saved: boolean;
  shared: boolean;
  commentsOpened: boolean;
  commented: boolean;
  followed: boolean;
  notInterested: boolean;
  pauses: number;
};

/** One video being on screen once. This is the raw data the app logs. */
export type Impression = {
  /** Position in the session: the 1st, 2nd, 3rd... video watched. */
  index: number;
  video: Video;
  startedAt: number;
  /** null while the video is still on screen. */
  endedAt: number | null;
  /** Time actually spent watching (pauses not included). */
  watchMs: number;
  /** The user scrolled back up to watch this again. */
  revisit: boolean;
  interactions: Interactions;
};

export function startImpression(
  video: Video,
  index: number,
  now: number,
  revisit: boolean,
): Impression {
  return {
    index,
    video,
    startedAt: now,
    endedAt: null,
    watchMs: 0,
    revisit,
    interactions: {
      liked: false,
      saved: false,
      shared: false,
      commentsOpened: false,
      commented: false,
      followed: false,
      notInterested: false,
      pauses: 0,
    },
  };
}

/** 1 = watched once fully, 2.5 = watched it two and a half times. */
export function watchRatio(impression: Impression): number {
  return impression.watchMs / (impression.video.durationSec * 1000);
}

/** Did the user actively react (not just watch)? */
export function hasReaction(impression: Impression): boolean {
  const { liked, saved, shared, commentsOpened, commented, followed } =
    impression.interactions;
  return liked || saved || shared || commentsOpened || commented || followed;
}
