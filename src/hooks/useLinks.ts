import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import type { Signal } from "../algorithm/signals";
import type { FeedSource } from "../algorithm/sources";
import type { Category } from "../data/categories";
import type { FeedController } from "./useFeed";

/** A press this recent counts as the cause of a change, so lines start where it was. */
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
/** Lines leave the phone this far (px, at the phone's own size) out from
    its right edge, clear of the rim. */
const EDGE_OUT = 4;
/** And no nearer its top or bottom than this share of its height, where
    the corners round off. */
const EDGE_CLEAR = 0.07;
/** With no press to start from, lines leave from half way down. */
const SIDE: Point = { x: 1, y: 0.5 };

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
  /** Where on the phone the line starts: 0-1 across it and 0-1 down it,
      so it stays on the same spot however the phone moves. */
  spot: Point;
  /** It starts on a button you pressed, not on the phone's edge. */
  fromButton: boolean;
  /** The line, from the phone to where it enters the card, as it was
      when the link was made. `pathOf` gives it as it is now. */
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
 * With `enabled` off (the panel is put away), no lines are sent or shown.
 */
export function useLinks(feed: FeedController, enabled = true) {
  const [links, setLinks] = useState<Link[]>([]);
  const on = useRef(enabled);
  useEffect(() => {
    on.current = enabled;
  });
  const nextId = useRef(0);
  const feedArea = useRef<HTMLElement>(null);
  const lastPress = useRef<{
    spot: Point;
    onButton: boolean;
    time: number;
  } | null>(null);
  const previous = useRef<Snapshot | null>(null);
  const timers = useRef(new Set<number>());

  /** Remembers where on the phone the user pressed. */
  function trackPress(event: PointerEvent) {
    let point: Point = { x: event.clientX, y: event.clientY };
    let onButton = false;
    const button =
      event.target instanceof Element ? event.target.closest("button") : null;
    if (button !== null) {
      const rect = button.getBoundingClientRect();
      if (rect.width <= SNAP_MAX_WIDTH) {
        point = middleOf(button);
        onButton = true;
      }
    }
    const phone = phoneOf(feedArea.current);
    if (phone === null) return;
    lastPress.current = {
      spot: phone.toSpot(point),
      onButton,
      time: performance.now(),
    };
  }

  /** A link's line as it is now, from wherever the phone has moved to. */
  const pathOf = useCallback((link: Link): string | null => {
    const phone = phoneOf(feedArea.current);
    if (phone === null) return null;
    return route(phone, link.spot, link.fromButton, link.entry);
  }, []);

  function send({ target, change, delay, label, tone }: Pulse) {
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      if (!on.current) return;
      // The phone is the only element inside the feed area.
      const phone = feedArea.current?.firstElementChild;
      // A card over the video: a line would seem to come from it.
      if (phone?.querySelector("[data-feed-card]")) return;
      const shown = document.querySelector(`[data-link="${target}"]`);
      // Scrolled out of its lens's view: a line would point off the panel.
      if (shown !== null && !inView(shown)) return;
      // Every swipe is scanned; only worth a line when you are looking.
      if (shown === null && QUIET.has(target)) return;
      // Targets on a hidden lens only make that lens's tab glow.
      const element =
        shown ?? document.querySelector(`[data-link="lens:${lensOf(target)}"]`);
      if (!phone || element === null) return;

      const shape = phoneOf(feedArea.current);
      if (shape === null) return;
      const press = lastPress.current;
      const recent =
        press !== null &&
        performance.now() - press.time < PRESS_MEMORY_MS + delay;
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
      const spot = recent ? press.spot : SIDE;
      const fromButton = recent && press.onButton;
      // Only draw when the panel is beside the phone, not stacked below it.
      const d = route(shape, spot, fromButton, entry);
      if (d === null) return;

      const link: Link = {
        id: nextId.current++,
        tone: tone ?? (change >= 0 ? "up" : "down"),
        strength: Math.min(Math.sqrt(Math.abs(change) / FULL_CHANGE), 1),
        style: shown === null ? "ping" : "line",
        label: shown === null ? null : (label ?? null),
        spot,
        fromButton,
        d,
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
    links: enabled ? links : [],
    /** Drops every line, shown or still to come: the panel went away. */
    clear: () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
      timers.current.clear();
      setLinks([]);
    },
    /** Attach to the element around the phone. */
    feedArea,
    trackPress,
    pathOf,
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

/** How the phone lies on the page. A spot on it is 0-1 across and 0-1
    down; `toPage` finds where that is on the page, and `toSpot` goes back.
    It holds however the phone is turned, tilted or far away. */
type PhoneShape = {
  toPage: (spot: Point) => Point;
  toSpot: (point: Point) => Point;
  /** The phone's width at its own size, in px. */
  width: number;
};

/**
 * Measures the phone. Turned in 3D (in the hut), it carries four empty
 * markers at its corners (`data-phone-corner`), which the page puts where
 * the corners are drawn. Flat, its own box is enough.
 */
function phoneOf(area: HTMLElement | null): PhoneShape | null {
  const phone = area?.firstElementChild;
  if (!(area && phone instanceof HTMLElement)) return null;
  const corners: Point[] = [];
  for (const corner of ["tl", "tr", "br", "bl"]) {
    const marker = area.querySelector(`[data-phone-corner="${corner}"]`);
    if (marker === null) break;
    const rect = marker.getBoundingClientRect();
    corners.push({ x: rect.left, y: rect.top });
  }
  if (corners.length < 4) {
    const rect = phone.getBoundingClientRect();
    corners.splice(
      0,
      corners.length,
      { x: rect.left, y: rect.top },
      { x: rect.right, y: rect.top },
      { x: rect.right, y: rect.bottom },
      { x: rect.left, y: rect.bottom },
    );
  }
  const forward = squareTo(corners);
  const back = forward === null ? null : invert(forward);
  if (forward === null || back === null) return null;
  return {
    toPage: (spot) => apply(forward, spot),
    toSpot: (point) => apply(back, point),
    width: Math.max(phone.offsetWidth, 1),
  };
}

/** The line from a spot on the phone: out of the button you pressed (or
    straight from the phone's edge), then over to the panel. Null when the
    panel is not to the right of the phone. */
function route(
  phone: PhoneShape,
  spot: Point,
  fromButton: boolean,
  entry: Point,
): string | null {
  const edge = phone.toPage({
    x: 1 + EDGE_OUT / phone.width,
    y: clamp(spot.y, EDGE_CLEAR, 1 - EDGE_CLEAR),
  });
  if (entry.x <= edge.x) return null;
  const start = fromButton ? phone.toPage(spot) : edge;
  const lead = fromButton ? ` L ${px(edge.x)} ${px(edge.y)}` : "";
  return `M ${px(start.x)} ${px(start.y)}${lead} ${trace(edge, entry)}`;
}

/** A 3x3 matrix, row by row, that takes x, y, 1 to a point on the page. */
type Projection = readonly number[];

/** The projection that takes the corners of a 1x1 square to `corners`
    (top left, top right, bottom right, bottom left). */
function squareTo([p0, p1, p2, p3]: Point[]): Projection | null {
  const sx = p0.x - p1.x + p2.x - p3.x;
  const sy = p0.y - p1.y + p2.y - p3.y;
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const den = dx1 * dy2 - dx2 * dy1;
  if (Math.abs(den) < 1e-9) return null;
  const g = (sx * dy2 - dx2 * sy) / den;
  const h = (dx1 * sy - sx * dy1) / den;
  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ];
}

function invert(m: Projection): Projection | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;
  return [
    A / det,
    (c * h - b * i) / det,
    (b * f - c * e) / det,
    B / det,
    (a * i - c * g) / det,
    (c * d - a * f) / det,
    C / det,
    (b * g - a * h) / det,
    (a * e - b * d) / det,
  ];
}

function apply(m: Projection, { x, y }: Point): Point {
  const w = m[6] * x + m[7] * y + m[8];
  return {
    x: (m[0] * x + m[1] * y + m[2]) / w,
    y: (m[3] * x + m[4] * y + m[5]) / w,
  };
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

/** On from `from`, where the path already is: across, up or down, and
    across again, in square steps like the pixels around it. */
function trace(from: Point, to: Point): string {
  const turn = px((from.x + to.x) / 2);
  return `H ${turn} V ${px(to.y)} H ${px(to.x)}`;
}

/** Whole pixels, so the lines stay crisp. */
function px(value: number): number {
  return Math.round(value);
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
