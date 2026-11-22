import { useEffect, useRef, useState } from "react";
import type { FeedController } from "./useFeed";

/** With no limit set, the break card comes after this many reel pulls. */
const OPEN_BREAK_PULLS = 16;
/** Videos you watch before the "why this video" card can come. */
const WHY_AFTER = 3;

/**
 * What goes on around the feed in one session: the panel as a sheet on
 * narrow screens, the two cards that come over a video, and leaving.
 * `waiting` holds everything back, e.g. while the page is still loading.
 */
export function useSession(feed: FeedController, waiting = false) {
  // On narrow screens the panel is a sheet that slides up over the video.
  const [sheetOpen, setSheetOpen] = useState(false);
  // Two cards come over a video in the feed, each once a session and never
  // both on one video. Each remembers the video it was passed on.
  const [breakAt, setBreakAt] = useState<number | null>(null);
  const [whyAt, setWhyAt] = useState<number | null>(null);
  // Paused by hand, say to talk over it: the video, the clock and the hut
  // all wait until you go on.
  const [paused, setPaused] = useState(false);
  const { current } = feed;
  const live = feed.started && !feed.ended;
  // The first video you swipe to past your plan (or after OPEN_BREAK_PULLS
  // reels with no limit) waits under what you gave so far.
  const breakDue =
    feed.intentMs === null
      ? feed.history.length >= OPEN_BREAK_PULLS
      : current.clockAt >= feed.intentMs;
  const planBreak =
    live &&
    !current.revisit &&
    breakAt === null &&
    whyAt !== current.index &&
    breakDue;
  // The first video it picked because of what you watched waits under why.
  const cause =
    live &&
    !planBreak &&
    whyAt === null &&
    breakAt !== current.index &&
    !current.revisit &&
    feed.history.length >= WHY_AFTER
      ? feed.currentItem.cause
      : null;
  const { hold, end } = feed;
  // Reading the panel or a card is not watching: the video and the
  // session clock wait.
  const held =
    waiting || sheetOpen || planBreak || cause !== null || (live && paused);
  useEffect(() => {
    hold(held);
  }, [held, hold]);
  // The Leave button, so focus goes back to it after.
  const leftFrom = useRef<HTMLElement | null>(null);
  // Leaving closes the sheet first, so the video is where you left it.
  function leave(button: HTMLElement | null) {
    leftFrom.current = button;
    setSheetOpen(false);
    setPaused(false);
    if (breakAt === null) setBreakAt(current.index);
    if (cause !== null) setWhyAt(current.index);
    hold(false);
    end();
  }
  // Widened past the sheet layout: the panel is beside the video again.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 901px)");
    function onChange() {
      if (wide.matches) setSheetOpen(false);
    }
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return {
    sheetOpen,
    toggleSheet: () => setSheetOpen((open) => !open),
    planBreak,
    /** Swiped past the break card: the video under it plays. */
    keepBreak: () => setBreakAt(current.index),
    cause,
    /** Swiped past the "why this video" card. */
    keepWhy: () => setWhyAt(current.index),
    paused: live && paused,
    togglePause: () => setPaused((was) => !was),
    leave,
    leftFrom,
  };
}
