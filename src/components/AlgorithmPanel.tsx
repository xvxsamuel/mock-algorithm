import { useState } from "react";
import type { FeedController } from "../hooks/useFeed";
import EngineLens from "./EngineLens";
import FeedStrip from "./FeedStrip";
import LeaveMeter from "./LeaveMeter";
import YouLens from "./YouLens";
import "./AlgorithmPanel.css";

export type Lens = "you" | "engine";

const LENSES: { id: Lens; label: string }[] = [
  { id: "you", label: "You" },
  { id: "engine", label: "Engine" },
];

/** Where your plan ends on the time bar. It never moves. */
const PLAN_AT = 0.4;
/** Time over your plan fills the rest of the bar more and more slowly. */
const OVER_SOFTNESS = 2;
/** The total time label shows once the pink part is this wide (%), so it
    does not sit on top of the "planned" label. */
const NOW_LABEL_FROM = 12;

type AlgorithmPanelProps = { feed: FeedController };

/**
 * The machine behind the phone. A fixed header (your time) and footer (who
 * chose your feed) frame one "lens" at a time, so nothing ever scrolls.
 * Elements with `data-link` are where lines from the phone can point to.
 */
function AlgorithmPanel({ feed }: AlgorithmPanelProps) {
  const [lens, setLens] = useState<Lens>("you");
  const { sessionMs, intentMs, started } = feed;
  const over = intentMs !== null && sessionMs > intentMs;

  return (
    <div
      className={`panel${started ? "" : " is-idle"}${over ? " is-over" : ""}`}
    >
      <header className="panel-head">
        {/* Once you pass your plan, the time over it is the headline. */}
        <div className="panel-time">
          {over && intentMs !== null ? (
            <>
              <p className="panel-kicker tone-take">Over your plan</p>
              <p className="clock is-over">+{clock(sessionMs - intentMs)}</p>
            </>
          ) : (
            <>
              <p className="panel-kicker">Time given</p>
              <p className="clock">{clock(sessionMs)}</p>
            </>
          )}
        </div>
        <LeaveMeter feed={feed} />
        {intentBar(sessionMs, intentMs, started)}
      </header>

      <nav className="lens-tabs" aria-label="Lenses">
        {LENSES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={lens === id ? "lens-tab is-active" : "lens-tab"}
            aria-pressed={lens === id}
            data-link={`lens:${id}`}
            onClick={() => setLens(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="panel-body" key={lens}>
        {lens === "you" ? <YouLens feed={feed} /> : <EngineLens feed={feed} />}
      </div>

      <FeedStrip feed={feed} />
    </div>
  );
}

/** Planned time against real time. Past the plan, the bar turns pink. */
function intentBar(
  sessionMs: number,
  intentMs: number | null,
  started: boolean,
) {
  if (!started) {
    return <p className="intent-note">Pick a time on the phone to begin.</p>;
  }
  if (intentMs === null) {
    return <p className="intent-note">No limit set. Nothing will stop you.</p>;
  }
  const under = (Math.min(sessionMs, intentMs) / intentMs) * PLAN_AT * 100;
  const extra = Math.max(sessionMs - intentMs, 0) / (intentMs * OVER_SOFTNESS);
  const over = (1 - Math.exp(-extra)) * (1 - PLAN_AT) * 100;
  const mark = PLAN_AT * 100;
  return (
    <div className="intent" aria-label={`Planned ${clock(intentMs)}`}>
      <span className="intent-track">
        <span className="intent-under" style={{ width: `${under}%` }} />
        <span
          className="intent-over"
          style={{ left: `${mark}%`, width: `${over}%` }}
        />
        <span className="intent-mark" style={{ left: `${mark}%` }} />
      </span>
      <span className="intent-label" style={{ left: `${mark}%` }}>
        planned {clock(intentMs)}
      </span>
      {over >= NOW_LABEL_FROM && (
        <span
          className="intent-label is-now"
          style={{ left: `${mark + over}%` }}
        >
          {clock(sessionMs)}
        </span>
      )}
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default AlgorithmPanel;
