import { formatClock } from "../algorithm/clock";
import { SOURCE_LABELS } from "../algorithm/sources";
import type { FeedController } from "../hooks/useFeed";
import FeedCard from "./FeedCard";
import "./PlanBreak.css";

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
  const seen = [...feed.history.map((entry) => entry.impression), feed.current];
  const over = intentMs === null ? 0 : sessionMs - intentMs;
  const total = Math.max(sessionMs, intentMs ?? 0, 1);
  const planned = intentMs === null ? 0 : (intentMs / total) * 100;
  const sold = seen.filter((impression) => impression.source === "ad").length;

  return (
    <FeedCard
      labelledBy="brk-title"
      onKeep={onKeep}
      more={
        <button
          type="button"
          className="fcard-button is-leave"
          onClick={onLeave}
        >
          Leave
        </button>
      }
    >
      <h2 id="brk-title" className="fcard-title">
        What you gave so far
      </h2>

      <div className="brk-times">
        {intentMs !== null && (
          <p className="brk-stat">
            <span className="brk-kicker">You meant</span>
            <span className="brk-clock is-meant">{formatClock(intentMs)}</span>
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
    </FeedCard>
  );
}

export default PlanBreak;
