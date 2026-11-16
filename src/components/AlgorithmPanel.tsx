import { useRef, useState } from "react";
import { formatClock } from "../algorithm/clock";
import { footprint, PHONE_YEARS } from "../data/world";
import type { FeedController } from "../hooks/useFeed";
import { useMoreBelow } from "../hooks/useMoreBelow";
import type { LinkNote } from "../hooks/useLinks";
import type { Lens, Reveal } from "../hooks/useReveal";
import ContentLens from "./ContentLens";
import EngineLens from "./EngineLens";
import FeedStrip from "./FeedStrip";
import InfluenceLens from "./InfluenceLens";
import LeaveMeter from "./LeaveMeter";
import MarketLens from "./MarketLens";
import PixelIcon from "./PixelIcon";
import WorldLens from "./WorldLens";
import YouLens from "./YouLens";
import "./AlgorithmPanel.css";

const LENS_NAMES: Record<Lens, string> = {
  you: "You",
  engine: "Engine",
  content: "Content",
  market: "Market",
  influence: "Influence",
  world: "World",
};

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
  /** Notes for parts of the panel to show while a line to them is there. */
  notes: LinkNote[];
  /** How much of the machine has been shown so far. */
  reveal: Reveal;
  /** The simulation is paused by hand. */
  paused: boolean;
  onPause: () => void;
  /** Pressing Leave: the session ends. Focus comes back to the button. */
  onLeave: (button: HTMLElement) => void;
};

/**
 * The machine behind the phone. A fixed header (your time) and footer (who
 * chose your feed) frame one "lens" at a time, so nothing ever scrolls.
 * Elements with `data-link` are where lines from the phone can point to.
 */
function AlgorithmPanel({
  feed,
  notes,
  reveal,
  paused,
  onPause,
  onLeave,
}: AlgorithmPanelProps) {
  const [chosen, setChosen] = useState<Lens>("you");
  // Lenses you have opened. A new one blinks until you do.
  const [opened, setOpened] = useState<ReadonlySet<Lens>>(
    () => new Set(["you"]),
  );
  const lens = reveal.lenses.includes(chosen) ? chosen : "you";
  function open(id: Lens) {
    setChosen(id);
    setOpened((old) => new Set(old).add(id));
    setFolded(false);
  }
  const [phoneYears, setPhoneYears] = useState(PHONE_YEARS);
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
      <p className="panel-note">Simulated model</p>
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
          {started && (
            <button
              type="button"
              className={paused ? "icon-button is-on" : "icon-button"}
              aria-pressed={paused}
              aria-label={paused ? "Resume" : "Pause"}
              title={paused ? "Resume" : "Pause"}
              onClick={onPause}
            >
              <PixelIcon name={paused ? "play" : "pause"} />
            </button>
          )}
          {/* What the scroll is made of, always in view: opens World. */}
          {started && reveal.grams && (
            <button
              type="button"
              className={
                lens === "world" ? "panel-grams is-active" : "panel-grams"
              }
              title="What your scroll is made of"
              aria-label={`${(
                (sessionMs / 60_000) *
                footprint(phoneYears).total
              ).toFixed(1)} g CO2e so far. Open World`}
              onClick={() => open("world")}
            >
              <b>
                {((sessionMs / 60_000) * footprint(phoneYears).total).toFixed(
                  1,
                )}{" "}
                g
              </b>{" "}
              CO2e
            </button>
          )}
        </div>
        {started && (
          // Beside your time: the one thing the app never offers.
          <button
            type="button"
            className="leave-button"
            aria-label="Leave"
            title="Leave"
            onClick={(event) => onLeave(event.currentTarget)}
          >
            <PixelIcon name="exit" size={24} />
          </button>
        )}
        {reveal.risk && <LeaveMeter feed={feed} />}
        {started && intentMs !== null && (
          <div className="panel-time-row">{intentBar(sessionMs, intentMs)}</div>
        )}
      </header>

      {/* One lens alone needs no tabs. They come in as you keep scrolling. */}
      {reveal.lenses.length > 1 && (
        <nav className="lens-tabs" aria-label="Lenses">
          {reveal.lenses.map((id) => {
            const classes = ["lens-tab"];
            if (lens === id) classes.push("is-active");
            if (!opened.has(id)) classes.push("is-new");
            return (
              <button
                key={id}
                type="button"
                className={classes.join(" ")}
                aria-pressed={lens === id}
                data-link={`lens:${id}`}
                onClick={() => open(id)}
              >
                {LENS_NAMES[id]}
              </button>
            );
          })}
        </nav>
      )}

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
        {lens === "you" && <YouLens feed={feed} notes={notes} />}
        {lens === "engine" && <EngineLens feed={feed} />}
        {lens === "content" && <ContentLens feed={feed} />}
        {lens === "market" && <MarketLens feed={feed} />}
        {lens === "influence" && <InfluenceLens feed={feed} />}
        {lens === "world" && (
          <WorldLens feed={feed} years={phoneYears} onYears={setPhoneYears} />
        )}
      </div>

      {reveal.risk && <FeedStrip feed={feed} />}
    </div>
  );
}

/** Planned time against real time. Past the plan, the bar turns pink. */
function intentBar(sessionMs: number, intentMs: number | null) {
  if (intentMs === null) return null;
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
