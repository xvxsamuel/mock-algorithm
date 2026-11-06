import { useState } from "react";
import type { FeedController } from "../hooks/useFeed";
import EngineLens from "./EngineLens";
import FeedStrip from "./FeedStrip";
import YouLens from "./YouLens";
import "./AlgorithmPanel.css";

export type Lens = "you" | "engine";

const LENSES: { id: Lens; label: string }[] = [
  { id: "you", label: "You" },
  { id: "engine", label: "Engine" },
];

/** The intent bar spans at least this much more than the planned time. */
const INTENT_SPAN = 1.6;

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
    <div className={started ? "panel" : "panel is-idle"}>
      <header className="panel-head">
        <div className="panel-time">
          <p className="panel-kicker">Time given</p>
          <p className={over ? "clock is-over" : "clock"}>{clock(sessionMs)}</p>
        </div>
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
        {intentBar(sessionMs, intentMs, started)}
      </header>

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
  const span = Math.max(intentMs * INTENT_SPAN, sessionMs * 1.08);
  const under = (Math.min(sessionMs, intentMs) / span) * 100;
  const over = (Math.max(sessionMs - intentMs, 0) / span) * 100;
  const mark = (intentMs / span) * 100;
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
    </div>
  );
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export default AlgorithmPanel;
