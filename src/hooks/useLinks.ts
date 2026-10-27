import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Signal } from "../algorithm/signals";
import type { Category } from "../data/categories";
import type { FeedController } from "./useFeed";

/** A press this recent counts as the cause of a change, so lines start at its height. */
const PRESS_MEMORY_MS = 1000;
/** Pressed buttons up to this wide snap to their centre (not the whole video). */
const SNAP_MAX_WIDTH = 120;
/** Pause between the steps of one chain: signal → interest → re-rank. */
const STEP_MS = 220;
/** While watching, a dot is sent every time topic interest grows by this much. */
const WATCH_STEP = 0.1;
/** A change this big (or bigger) gets the strongest animation. */
const FULL_CHANGE = 2;
/** Changes smaller than this are not worth a line. */
const MIN_CHANGE = 0.05;
/** How strong the line to "why this video" is after a swipe. */
const WHY_CHANGE = 0.5;
/** Safety cap, in case a finished link never reports back. */
const MAX_LINKS = 24;

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };

/** One animated line from the side of the phone to an element in the panel. */
export type Link = {
  id: number;
  /** up = the algorithm now likes this more, down = less. */
  tone: "up" | "down";
  /** 0-1: how big the change was. Sets thickness, brightness and lifetime. */
  strength: number;
  /** "line" for things the user did, "dot" for small passive updates. */
  style: "line" | "dot";
  from: Point;
  d: string;
  box: Box;
};

/** A link waiting to be sent. `target` matches a `data-link` in the panel. */
type Pulse = {
  target: string;
  change: number;
  style: Link["style"];
  delay: number;
};

/** What the panel showed at the previous render. */
type Snapshot = {
  index: number;
  signals: Signal[];
  queueKey: number;
  watchLevel: number;
};

/**
 * Watches the feed and sends a small animated line from the phone to every
 * part of the panel that just changed, sized by how big the change was.
 */
export function useLinks(feed: FeedController) {
  const [links, setLinks] = useState<Link[]>([]);
  const nextId = useRef(0);
  const feedArea = useRef<HTMLElement>(null);
  const lastPress = useRef<{ y: number; time: number } | null>(null);
  const previous = useRef<Snapshot | null>(null);
  const timers = useRef(new Set<number>());

  /** Remembers how high up the phone the user pressed. */
  function trackPress(event: PointerEvent) {
    let y = event.clientY;
    const button =
      event.target instanceof Element ? event.target.closest("button") : null;
    if (button !== null) {
      const rect = button.getBoundingClientRect();
      if (rect.width <= SNAP_MAX_WIDTH) y = rect.top + rect.height / 2;
    }
    lastPress.current = { y, time: performance.now() };
  }

  function send({ target, change, style, delay }: Pulse) {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      // The phone is the only element inside the feed area.
      const phone = feedArea.current?.firstElementChild;
      const element = document.querySelector(`[data-link="${target}"]`);
      if (!phone || element === null) return;

      const press = lastPress.current;
      const recent =
        style === "line" &&
        press !== null &&
        performance.now() - press.time < PRESS_MEMORY_MS + delay;
      const from = sideOf(
        phone.getBoundingClientRect(),
        recent ? press.y : null,
      );
      const box = outset(element.getBoundingClientRect(), 3);
      const to = { x: box.x, y: box.y + box.height / 2 };
      // Only draw when the panel is beside the phone, not stacked below it.
      if (to.x <= from.x) return;

      const link: Link = {
        id: nextId.current++,
        tone: change >= 0 ? "up" : "down",
        strength: Math.min(Math.sqrt(Math.abs(change) / FULL_CHANGE), 1),
        style,
        from,
        d: curve(from, to),
        box,
      };
      setLinks((all) => [...all.slice(-(MAX_LINKS - 1)), link]);
    }, delay);
    timers.current.add(timer);
  }

  // Runs after every render (each tick and each action) and compares the
  // signals with the previous render to find what the algorithm just learned.
  useEffect(() => {
    const now: Snapshot = {
      index: feed.current.index,
      signals: feed.currentSignals,
      queueKey: feed.upNext.key,
      watchLevel: watchLevel(feed.currentSignals),
    };
    const before = previous.current;
    previous.current = now;
    if (before === null) return;

    const pulses =
      before.index === now.index
        ? changesWhileWatching(before, now, feed.current.video.category)
        : changesOnSwipe(before, feed);
    pulses.forEach(send);
  });

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  return {
    links,
    /** Attach to the element around the phone. */
    feedArea,
    trackPress,
    removeLink: (id: number) =>
      setLinks((all) => all.filter((link) => link.id !== id)),
  };
}

/** Same video still on screen: watch time grew, or the user reacted. */
function changesWhileWatching(
  before: Snapshot,
  now: Snapshot,
  category: Category,
): Pulse[] {
  const pulses: Pulse[] = [];
  const topic = `topic:${category}`;

  // Watching: faint dots, more often on short videos (interest grows faster).
  const watched = now.watchLevel - before.watchLevel;
  if (watched > 0) {
    pulses.push({
      target: topic,
      change: watched * WATCH_STEP,
      style: "dot",
      delay: 0,
    });
  }

  // Everything else (likes, saves, loops...): signal, then interest.
  let total = 0;
  const codes = new Set([...before.signals, ...now.signals].map((s) => s.code));
  codes.delete("WATCH");
  for (const code of codes) {
    const old = before.signals.find((signal) => signal.code === code);
    const next = now.signals.find((signal) => signal.code === code);
    const change = (next?.topic ?? 0) - (old?.topic ?? 0);
    const creator = (next?.creator ?? 0) - (old?.creator ?? 0);
    if (Math.abs(change) < MIN_CHANGE && Math.abs(creator) < MIN_CHANGE) {
      continue;
    }
    total += change;
    pulses.push(
      { target: `signal:${code}`, change, style: "line", delay: 0 },
      { target: topic, change, style: "line", delay: STEP_MS },
    );
    if (Math.abs(creator) >= 1) {
      pulses.push({
        target: "creators",
        change: creator,
        style: "line",
        delay: STEP_MS,
      });
    }
  }

  // Reacting re-ranks the queued video.
  if (now.queueKey !== before.queueKey) {
    pulses.push({
      target: "queue",
      change: total,
      style: "line",
      delay: 2 * STEP_MS,
    });
  }
  return pulses;
}

/** The user swiped: the old video is logged and a new one is explained. */
function changesOnSwipe(before: Snapshot, feed: FeedController): Pulse[] {
  const finished = feed.history.at(-1);
  if (finished === undefined) return [];
  const total = topicDelta(finished.signals);
  // Swiping can still change the score, e.g. a quick skip replaces WATCH.
  const settled = total - topicDelta(before.signals);

  const pulses: Pulse[] = [
    { target: "log", change: total, style: "line", delay: 0 },
  ];
  if (Math.abs(settled) >= MIN_CHANGE) {
    pulses.push({
      target: `topic:${finished.impression.video.category}`,
      change: settled,
      style: "line",
      delay: STEP_MS,
    });
  }
  pulses.push({
    target: "why",
    change: WHY_CHANGE,
    style: "line",
    delay: 2 * STEP_MS,
  });
  if (feed.current.revisit) {
    pulses.push({
      target: "signal:REVISIT",
      change: WHY_CHANGE,
      style: "line",
      delay: 2 * STEP_MS,
    });
  }
  return pulses;
}

/** How many watch steps the live video has earned so far. */
function watchLevel(signals: Signal[]): number {
  const watch = signals.find((signal) => signal.code === "WATCH");
  return watch === undefined ? 0 : Math.floor(watch.topic / WATCH_STEP);
}

function topicDelta(signals: Signal[]): number {
  return signals.reduce((sum, signal) => sum + signal.topic, 0);
}

/** A point just outside the phone's right edge, at `y` or half way down. */
function sideOf(phone: DOMRect, y: number | null): Point {
  const margin = 24;
  const middle = phone.top + phone.height / 2;
  const clamped = Math.min(
    Math.max(y ?? middle, phone.top + margin),
    phone.bottom - margin,
  );
  return { x: phone.right + 4, y: clamped };
}

function outset(rect: DOMRect, by: number): Box {
  return {
    x: rect.left - by,
    y: rect.top - by,
    width: rect.width + by * 2,
    height: rect.height + by * 2,
  };
}

/** An S-curve that leaves and arrives horizontally. */
function curve(from: Point, to: Point): string {
  const bend = (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`;
}
