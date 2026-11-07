import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Signal } from "../algorithm/signals";
import type { FeedSource } from "../algorithm/sources";
import type { Category } from "../data/categories";
import type { FeedController } from "./useFeed";

/** A press this recent counts as the cause of a change, so lines start at its height. */
const PRESS_MEMORY_MS = 1000;
/** Pressed buttons up to this wide snap to their centre (not the whole video). */
const SNAP_MAX_WIDTH = 120;
/** Pause between the steps of one chain: signal → interest → re-rank. */
const STEP_MS = 220;
/** A change this big (or bigger) gets the strongest animation. */
const FULL_CHANGE = 2;
/** Changes smaller than this are not worth a line. */
const MIN_CHANGE = 0.05;
/** How strong the lines to "why this video" and the prediction are after a swipe. */
const SWIPE_CHANGE = 0.5;
/** Targets that never make a hidden lens's tab glow: they change too often. */
const QUIET = new Set(["scan"]);
/** Safety cap, in case a finished link never reports back. */
const MAX_LINKS = 24;
/** Lines enter the card around a target; these hold a whole card. */
const CARD = ".pane, .leave, .lens-tabs";
/** A target this far (px) inside its card gets a trace from the card edge. */
const TRACE_FROM = 24;
/** Through a hub, the way in stays at least this far (px) from its centre's
    height, so it passes between the labels on the near side. */
const HUB_CLEAR = 40;

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };

/** One animated line from the side of the phone to an element in the panel. */
export type Link = {
  id: number;
  /**
   * up = the algorithm now likes this more, down = less,
   * keep = the engine acting to keep you in the app, sold = money changing
   * hands, pushed = outsiders getting something into your feed.
   */
  tone: "up" | "down" | "keep" | "sold" | "pushed";
  /** 0-1: how big the change was. Sets thickness, brightness and lifetime. */
  strength: number;
  /**
   * "line" runs from the phone to the target. "ping" only makes a lens tab
   * glow, for a target on a lens that is not open.
   */
  style: "line" | "ping";
  /** A short note shown where the line lands, e.g. "more". */
  label: string | null;
  from: Point;
  /** The line, from the phone to where it enters the card. */
  d: string;
  /** Inside the card: from the entry point to the target, or null. */
  trace: string | null;
  /** Where the line enters the card. */
  entry: Point;
  box: Box;
};

/** A link waiting to be sent. `target` matches a `data-link` in the panel. */
type Pulse = {
  target: string;
  change: number;
  delay: number;
  label?: string;
  /** Overrides the tone that follows from the sign of `change`. */
  tone?: Link["tone"];
};

/** What the panel showed at the previous render. */
type Snapshot = {
  index: number;
  signals: Signal[];
  queueKey: number;
};

/**
 * Watches the feed and sends an animated line from the phone to every part
 * of the panel that just changed, sized by how big the change was.
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

  function send({ target, change, delay, label, tone }: Pulse) {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      // The phone is the only element inside the feed area.
      const phone = feedArea.current?.firstElementChild;
      const shown = document.querySelector(`[data-link="${target}"]`);
      // Scrolled out of its lens's view: a line would point off the panel.
      if (shown !== null && !inView(shown)) return;
      // Every swipe is scanned; only worth a line when you are looking.
      if (shown === null && QUIET.has(target)) return;
      // Targets on a hidden lens only make that lens's tab glow.
      const element =
        shown ?? document.querySelector(`[data-link="lens:${lensOf(target)}"]`);
      if (!phone || element === null) return;

      const press = lastPress.current;
      const recent =
        press !== null &&
        performance.now() - press.time < PRESS_MEMORY_MS + delay;
      const from = sideOf(
        phone.getBoundingClientRect(),
        recent ? press.y : null,
      );
      // A ping marks the tab's label (a dot goes after it), not the tab.
      const box = outset(
        shown === null ? textRect(element) : element.getBoundingClientRect(),
        3,
      );
      const aim = { x: box.x, y: box.y + box.height / 2 };
      // Lines run behind the cards, so a target deep inside a card gets the
      // line to the card's edge at the target's height, then a trace inside.
      const card = element.closest(CARD);
      let entry = aim;
      let trace: string | null = null;
      // A ping only lights its tab: no line, so no trace either.
      if (shown !== null && card !== null && card !== element) {
        const edge = card.getBoundingClientRect();
        if (aim.x - edge.left > TRACE_FROM) {
          const hub = element.closest("[data-link-hub]");
          const centre = hub === null ? null : middleOf(hub);
          if (element.matches("[data-link-floor]")) {
            // Charts: run along the bottom of the card, not through the bars.
            entry = { x: edge.left, y: edge.bottom - 8 };
            trace = `M ${entry.x} ${entry.y} H ${box.x + box.width / 2}`;
          } else if (centre !== null && box.x > centre.x) {
            // The far side of the radar: in through its centre, then out
            // along the topic's spoke, so no other label is crossed.
            const off = aim.y - centre.y;
            const y =
              Math.abs(off) < HUB_CLEAR
                ? centre.y + (off < 0 ? -HUB_CLEAR : HUB_CLEAR)
                : aim.y;
            entry = { x: edge.left, y };
            const end = {
              x: clamp(centre.x, box.x, box.x + box.width),
              y: clamp(centre.y, box.y, box.y + box.height),
            };
            trace = `M ${entry.x} ${y} L ${centre.x} ${centre.y} L ${end.x} ${end.y}`;
          } else {
            const y = Math.min(
              Math.max(aim.y, edge.top + 12),
              edge.bottom - 12,
            );
            entry = { x: edge.left, y };
            trace = `M ${entry.x} ${y} L ${aim.x} ${aim.y}`;
          }
        }
      }
      // Only draw when the panel is beside the phone, not stacked below it.
      if (entry.x <= from.x) return;

      const link: Link = {
        id: nextId.current++,
        tone: tone ?? (change >= 0 ? "up" : "down"),
        strength: Math.min(Math.sqrt(Math.abs(change) / FULL_CHANGE), 1),
        style: shown === null ? "ping" : "line",
        label: shown === null ? null : (label ?? null),
        from,
        d: curve(from, entry),
        trace,
        entry,
        box,
      };
      setLinks((all) => {
        // One glow per tab at a time is enough.
        if (link.style === "ping" && all.some((l) => l.style === "ping")) {
          return all;
        }
        return [...all.slice(-(MAX_LINKS - 1)), link];
      });
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
    };
    const before = previous.current;
    previous.current = now;
    if (before === null) return;

    const pulses =
      before.index === now.index
        ? changesWhileWatching(
            before,
            now,
            feed.current.video.category,
            feed.upNext.ranking.source,
          )
        : changesOnSwipe(before, feed);
    pulses.forEach(send);
  });

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  // A line drawn for the old layout would point at nothing after a resize.
  useEffect(() => {
    const clear = () => setLinks([]);
    window.addEventListener("resize", clear);
    return () => window.removeEventListener("resize", clear);
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

/** Same video still on screen: the user reacted (liked, saved, looped...). */
function changesWhileWatching(
  before: Snapshot,
  now: Snapshot,
  category: Category,
  queued: FeedSource,
): Pulse[] {
  const pulses: Pulse[] = [];
  const topic = `topic:${category}`;

  // Plain watching moves the radar by itself; only reactions get lines.
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
      { target: `signal:${code}`, change, delay: 0 },
      {
        target: topic,
        change,
        delay: STEP_MS,
        label: delta(change),
      },
    );
  }

  // Reacting re-ranks the queued video. So does the risk crossing the
  // line mid-video: then a sure hit is swapped in, in pink. A bot campaign
  // that just reached you puts its video next: violet.
  if (now.queueKey !== before.queueKey) {
    pulses.push(
      queued === "rescue"
        ? { target: "queue", change: FULL_CHANGE, delay: 0, tone: "keep" }
        : queued === "pushed"
          ? {
              target: "network",
              change: FULL_CHANGE,
              delay: 0,
              tone: "pushed",
            }
          : { target: "queue", change: total, delay: 2 * STEP_MS },
    );
  }
  return pulses;
}

/**
 * The user swiped: what they did to the old video settles, and the new one
 * is explained. (The strip logs the old one by itself, so it needs no line.)
 */
function changesOnSwipe(before: Snapshot, feed: FeedController): Pulse[] {
  const finished = feed.history.at(-1);
  if (finished === undefined) return [];
  // Swiping can still change the score, e.g. a quick skip replaces WATCH.
  const settled = topicDelta(finished.signals) - topicDelta(before.signals);
  const category = finished.impression.video.category;

  const pulses: Pulse[] = [];
  if (Math.abs(settled) >= MIN_CHANGE) {
    pulses.push({
      target: `topic:${category}`,
      change: settled,
      delay: STEP_MS,
      label: delta(settled),
    });
  }
  pulses.push(
    { target: "why", change: SWIPE_CHANGE, delay: 2 * STEP_MS },
    { target: "predict", change: SWIPE_CHANGE, delay: 3 * STEP_MS },
    { target: "scan", change: SWIPE_CHANGE, delay: STEP_MS },
  );
  // The next slot was just sold, or what you are watching was paid for.
  if (feed.upNext.ranking.source === "ad") {
    pulses.push({
      target: "auction",
      change: FULL_CHANGE,
      delay: 3 * STEP_MS,
      tone: "sold",
    });
  }
  if (feed.market.sales.at(-1)?.key === feed.currentItem.key) {
    pulses.push({
      target: "sold",
      change: FULL_CHANGE,
      delay: STEP_MS,
      tone: "sold",
    });
  }
  // Fake accounts got their video in: next, or on your phone now.
  if (feed.upNext.ranking.source === "pushed") {
    pulses.push({
      target: "network",
      change: FULL_CHANGE,
      delay: 3 * STEP_MS,
      tone: "pushed",
    });
  }
  if (feed.currentItem.ranking.source === "pushed") {
    pulses.push({
      target: "pushed",
      change: FULL_CHANGE,
      delay: STEP_MS,
      tone: "pushed",
    });
  }
  // About to lose you: the engine swaps a sure hit into the queue.
  if (feed.upNext.ranking.source === "rescue") {
    pulses.push({
      target: "queue",
      change: FULL_CHANGE,
      delay: 3 * STEP_MS,
      tone: "keep",
    });
  }
  if (feed.current.revisit) {
    pulses.push({
      target: "signal:REVISIT",
      change: SWIPE_CHANGE,
      delay: 2 * STEP_MS,
    });
  }
  return pulses;
}

/** Shown above the topic's own label on the radar, so it reads "more cooking". */
function delta(change: number): string {
  return change >= 0 ? "more" : "less";
}

/** Which lens shows a target, for when that lens is not on screen. */
function lensOf(target: string): string {
  const [kind] = target.split(":");
  if (["topic", "signal", "trait"].includes(kind)) return "you";
  if (kind === "auction" || kind === "sold") return "market";
  if (kind === "network" || kind === "pushed") return "influence";
  return kind === "scan" ? "content" : "engine";
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

/** Whether an element's middle is inside the window of the scrolling
    lens it sits in. */
function inView(element: Element): boolean {
  const scroller = element.closest(".panel-body");
  if (scroller === null) return true;
  const box = scroller.getBoundingClientRect();
  const { y } = middleOf(element);
  return y >= box.top && y <= box.bottom;
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

/** Where the text inside an element is, e.g. a tab's label. */
function textRect(element: Element): DOMRect {
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect();
}

function middleOf(element: Element): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
