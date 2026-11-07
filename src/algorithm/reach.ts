/**
 * How far the video playing now travels: to how many people the app shows
 * it, drawn as a crowd. Made up, in the shape of what is reported:
 *
 * - Its face. Leaked 2019-20 TikTok moderation rules kept "ugly facial
 *   looks" and "senior people with too many wrinkles" out of For You (The
 *   Intercept, 2020); TikTok says they are no longer used. Here the mock
 *   looks score scales reach, and the wrinkles rule keeps it to followers.
 * - How extreme it is. Engagement-ranked feeds spread what provokes.
 * - Money and bots: an ad's reach is bought; a pushed video's is faked.
 * - Your watching. Watch time is the strongest signal a video gets: every
 *   second you stay tells the app to show it to more people.
 */

import type { FaceReading } from "../data/scans";
import type { Video } from "../data/videos";
import { faceReach, faceRule } from "./appearance";
import type { FeedSource } from "./sources";

/** People an ordinary video reaches: one row of the crowd. */
export const ORDINARY = 16;
/** The whole crowd: three rows. */
export const CROWD = ORDINARY * 3;
/** Above this intensity a video gains from being extreme... */
const EXTREME_FROM = 0.4;
/** ...up to ×1.6 at intensity 1. */
const EXTREME_GAIN = 1;
/** People an ad slot buys. */
const PAID_PEOPLE = ORDINARY;
/** People the bots' fake likes add. */
const PUSHED_PEOPLE = ORDINARY;
/** The most your watching adds: ×1.5... */
const WATCH_GAIN = 0.5;
/** ...once you have watched it this many times through. */
const WATCH_FULL = 1.5;

export type VideoReach = {
  /** People it reaches, out of CROWD. */
  people: number;
  /** Kept out of For You by its face: only followers see it. */
  followersOnly: boolean;
  /** What each part adds (below 0: takes), in people. They sum to
      `people - ORDINARY`. */
  face: number;
  extreme: number;
  paid: number;
  pushed: number;
  watch: number;
};

/** The reach of a video, given who is on camera, who put it in the feed
    and how long you have watched it so far. */
export function videoReach(
  video: Video,
  face: FaceReading | null,
  source: FeedSource,
  watchMs: number,
): VideoReach {
  const followersOnly = face !== null && faceRule(face) !== null;
  const byFace = ORDINARY * faceReach(face);
  // Kept out of For You: nothing else can carry it further.
  const byContent = followersOnly
    ? byFace
    : byFace * (1 + Math.max(video.intensity - EXTREME_FROM, 0) * EXTREME_GAIN);
  const paid = source === "ad" ? PAID_PEOPLE : 0;
  const pushed = source === "pushed" ? PUSHED_PEOPLE : 0;
  const before = byContent + paid + pushed;
  const watched = watchMs / (video.durationSec * 1000);
  const byWatch = followersOnly
    ? 0
    : before * WATCH_GAIN * Math.min(watched / WATCH_FULL, 1);

  // Rounded step by step, so the parts add up to the whole.
  const [a, b, c, d, e] = [
    byFace,
    byContent,
    byContent + paid,
    before,
    before + byWatch,
  ].map((value) => Math.min(Math.round(value), CROWD));
  return {
    people: e,
    followersOnly,
    face: a - ORDINARY,
    extreme: b - a,
    paid: c - b,
    pushed: d - c,
    watch: e - d,
  };
}
