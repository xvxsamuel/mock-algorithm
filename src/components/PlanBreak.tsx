import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type TouchEvent,
  type WheelEvent,
} from "react";
import { formatClock } from "../algorithm/clock";
import { SOURCE_LABELS } from "../algorithm/sources";
import type { FeedController } from "../hooks/useFeed";
import "./PlanBreak.css";

/** A wheel swipe lets the card go once the wheel has been still this long,
    so the rest of a trackpad fling doesn't skip the video under it too. */
const WHEEL_SETTLE_MS = 220;
/** A touch swipe up at least this far keeps scrolling. */
const SWIPE_PX = 40;
/** Fewer videos than this: bigger tiles. */
const FEW = 24;

type PlanBreakProps = {
  feed: FeedController;
  /** Swiped past or "Keep scrolling": the video under it plays. */
  onKeep: () => void;
  /** To "What you gave": the whole session. */
  onLeave: () => void;
};

/**
 * The first swipe after your plan ran out lands here, before the next
 * video: what you have given so far. The clock waits while it is up.
 */
function PlanBreak({ feed, onKeep, onLeave }: PlanBreakProps) {
  const { sessionMs, intentMs, market, influence } = feed;
  const card = useRef<HTMLDivElement>(null);
  const [going, setGoing] = useState(false);
  const settle = useRef(0);
  const touchFrom = useRef<number | null>(null);

  // The arrow that moves the feed moves past the card.
  const keep = useEffectEvent(onKeep);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "PageDown") return;
      event.preventDefault();
      keep();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(settle.current);
    };
  }, []);

  function onWheel(event: WheelEvent) {
    if (!going && event.deltaY <= 0) return;
    setGoing(true);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(onKeep, WHEEL_SETTLE_MS);
  }

  function onTouchStart(event: TouchEvent) {
    touchFrom.current = event.touches.item(0)?.clientY ?? null;
  }

  function onTouchEnd(event: TouchEvent) {
    const from = touchFrom.current;
    const to = event.changedTouches.item(0)?.clientY;
    touchFrom.current = null;
    if (from === null || to === undefined) return;
    if (from - to >= SWIPE_PX) onKeep();
  }

  const seen = [...feed.history.map((entry) => entry.impression), feed.current];
  const over = intentMs === null ? 0 : sessionMs - intentMs;
  const total = Math.max(sessionMs, intentMs ?? 0, 1);
  const planned = intentMs === null ? 0 : (intentMs / total) * 100;
  const sold = seen.filter((impression) => impression.source === "ad").length;

  return (
    <div
      ref={card}
      className={going ? "brk is-going" : "brk"}
      role="dialog"
      aria-labelledby="brk-title"
      tabIndex={-1}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="brk-inner">
        <h2 id="brk-title" className="brk-title">
          What you gave so far
        </h2>

        <div className="brk-times">
          {intentMs !== null && (
            <p className="brk-stat">
              <span className="brk-kicker">You meant</span>
              <span className="brk-clock is-meant">
                {formatClock(intentMs)}
              </span>
            </p>
          )}
          <p className={over > 0 ? "brk-stat is-over" : "brk-stat"}>
            <span className="brk-kicker">You gave</span>
            <span className="brk-clock">{formatClock(sessionMs)}</span>
          </p>
        </div>
        {intentMs !== null && (
          <div className="brk-bar" aria-hidden="true">
            <span className="brk-bar-part" style={{ width: `${planned}%` }} />
            <span
              className="brk-bar-part is-over"
              style={{ left: `${planned}%`, width: `${100 - planned}%` }}
            />
          </div>
        )}

        <h3 className="brk-label">All {seen.length} chosen for you</h3>
        <ol className={seen.length < FEW ? "brk-tiles is-few" : "brk-tiles"}>
          {seen.map((impression, i) => (
            <li
              key={impression.index}
              className={`brk-tile is-${impression.source}`}
              style={{ animationDelay: `${Math.round(200 + i * 18)}ms` }}
              title={`${impression.video.category}, ${SOURCE_LABELS[impression.source]}`}
            >
              {impression.video.emoji}
            </li>
          ))}
        </ol>

        <ul className="brk-chips">
          <li className="is-you">
            {feed.counters.dataPoints.toLocaleString("en")} data points
          </li>
          {sold > 0 && (
            <li className="is-ad">
              sold {sold === 1 ? "once" : `${sold} times`} for €
              {market.earned.toFixed(4)}
            </li>
          )}
          <li className="is-pushed">
            {Math.round(influence.persuadable.score * 100)}% persuadable
          </li>
        </ul>

        <div className="brk-actions">
          <button type="button" className="brk-button is-keep" onClick={onKeep}>
            Keep scrolling
          </button>
          <button
            type="button"
            className="brk-button is-leave"
            onClick={onLeave}
          >
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

export default PlanBreak;
