import { useRef, useState } from "react";
import { formatClock } from "../algorithm/clock";
import type { FeedController } from "../hooks/useFeed";
import { useMoreBelow } from "../hooks/useMoreBelow";
import ContentLens from "./ContentLens";
import EngineLens from "./EngineLens";
import FeedStrip from "./FeedStrip";
import InfluenceLens from "./InfluenceLens";
import LeaveMeter from "./LeaveMeter";
import MarketLens from "./MarketLens";
import YouLens from "./YouLens";
import "./AlgorithmPanel.css";

export type Lens = "you" | "engine" | "content" | "market" | "influence";

const LENSES: { id: Lens; label: string }[] = [
  { id: "you", label: "You" },
  { id: "engine", label: "Engine" },
  { id: "content", label: "Content" },
  { id: "market", label: "Market" },
  { id: "influence", label: "Influence" },
];

/** Where your plan ends on the time bar. It never moves. */
const PLAN_AT = 0.4;
/** Time over your plan fills the rest of the bar more and more slowly. */
const OVER_SOFTNESS = 2;
/** The total time label shows once the pink part is this wide (%), so it
    does not sit on top of the "planned" label. */
const NOW_LABEL_FROM = 12;
/** The now label's right edge stays this far right of the plan mark, so it
 * never runs into "planned 1:00" on a narrow bar. */
const NOW_LABEL_CLEAR_PX = 80;
/** On narrow screens, scrolling the cards this far (px) folds the header to
    one row; it unfolds back at the very top. */
const FOLD_AT = 40;
const UNFOLD_AT = 4;

type AlgorithmPanelProps = {
  feed: FeedController;
  /** Pressing Leave: the session ends. Focus comes back to the button. */
  onLeave: (button: HTMLElement) => void;
};

/**
 * The machine behind the phone. A fixed header (your time) and footer (who
 * chose your feed) frame one "lens" at a time, so nothing ever scrolls.
 * Elements with `data-link` are where lines from the phone can point to.
 */
function AlgorithmPanel({ feed, onLeave }: AlgorithmPanelProps) {
  const [lens, setLens] = useState<Lens>("you");
  const [folded, setFolded] = useState(false);
  const body = useRef<HTMLDivElement>(null);
  const moreBelow = useMoreBelow(body, lens);
  const { sessionMs, intentMs, started } = feed;
  const over = intentMs !== null && sessionMs > intentMs;
  const classes = ["panel"];
  if (!started) classes.push("is-idle");
  if (over) classes.push("is-over");
  if (folded) classes.push("is-folded");

  return (
    <div className={classes.join(" ")}>
      <header className="panel-head">
        {/* Once you pass your plan, the time over it is the headline. */}
        <div className="panel-time">
          {over && intentMs !== null ? (
            <p className="clock is-over">
              +{formatClock(sessionMs - intentMs)}
              <span className="clock-unit">{" over"}</span>
            </p>
          ) : (
            <p className="clock">{formatClock(sessionMs)}</p>
          )}
        </div>
        <LeaveMeter feed={feed} />
        {started && (
          // Your time runs toward the one thing the app never offers.
          <div className="panel-time-row">
            {intentBar(sessionMs, intentMs)}
            <button
              type="button"
              className="leave-button"
              onClick={(event) => onLeave(event.currentTarget)}
            >
              Leave
            </button>
          </div>
        )}
      </header>

      <nav className="lens-tabs" aria-label="Lenses">
        {LENSES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={lens === id ? "lens-tab is-active" : "lens-tab"}
            aria-pressed={lens === id}
            data-link={`lens:${id}`}
            onClick={() => {
              setLens(id);
              setFolded(false);
            }}
          >
            {label}
          </button>
        ))}
      </nav>

      {/* Only scrolls on narrow screens, where the header folds away. */}
      <div
        ref={body}
        className={moreBelow ? "panel-body has-more" : "panel-body"}
        key={lens}
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop;
          if (top > FOLD_AT) setFolded(true);
          else if (top < UNFOLD_AT) setFolded(false);
        }}
      >
        {lens === "you" && <YouLens feed={feed} />}
        {lens === "engine" && <EngineLens feed={feed} />}
        {lens === "content" && <ContentLens feed={feed} />}
        {lens === "market" && <MarketLens feed={feed} />}
        {lens === "influence" && <InfluenceLens feed={feed} />}
      </div>

      <FeedStrip feed={feed} />
      <p className="panel-note">Simulated model</p>
    </div>
  );
}

/** Planned time against real time. Past the plan, the bar turns pink. */
function intentBar(sessionMs: number, intentMs: number | null) {
  if (intentMs === null) {
    return <p className="intent-note">No limit</p>;
  }
  const under = (Math.min(sessionMs, intentMs) / intentMs) * PLAN_AT * 100;
  const extra = Math.max(sessionMs - intentMs, 0) / (intentMs * OVER_SOFTNESS);
  const over = (1 - Math.exp(-extra)) * (1 - PLAN_AT) * 100;
  const mark = PLAN_AT * 100;
  return (
    <div className="intent" aria-label={`Planned ${formatClock(intentMs)}`}>
      <span className="intent-track">
        <span className="intent-under" style={{ width: `${under}%` }} />
        <span
          className="intent-over"
          style={{ left: `${mark}%`, width: `${over}%` }}
        />
        <span className="intent-mark" style={{ left: `${mark}%` }} />
      </span>
      <span className="intent-label" style={{ left: `${mark}%` }}>
        planned {formatClock(intentMs)}
      </span>
      {over >= NOW_LABEL_FROM && (
        <span
          className="intent-label is-now"
          style={{
            left: `max(${mark + over}%, calc(${mark}% + ${NOW_LABEL_CLEAR_PX}px))`,
          }}
        >
          {formatClock(sessionMs)}
        </span>
      )}
    </div>
  );
}

export default AlgorithmPanel;
