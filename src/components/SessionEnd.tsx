import { useEffect, useRef } from "react";
import { formatClock } from "../algorithm/clock";
import type { Impression } from "../algorithm/impression";
import { SOURCE_LABELS, SOURCE_ORDER } from "../algorithm/sources";
import type { Trait } from "../algorithm/inference";
import { paidPostOf } from "../data/ads";
import { TEEN_MINUTES_A_DAY } from "../data/stats";
import type { FeedController } from "../hooks/useFeed";
import YearGrid from "./YearGrid";
import "./SessionEnd.css";

/** Whole days of a year at the teen average: 107 min × 365 ≈ 27 days. */
const YEAR_DAYS = Math.round((TEEN_MINUTES_A_DAY * 365) / (24 * 60));
/** The tiles come in one after another, all within about this long. */
const TILES_MS = 1100;
/** The year fills once the rest is in. */
const YEAR_AT_MS = 1600;

/** How each guess reads as a chip. */
const SPENDING: Record<string, string> = {
  "ready to buy": "ready to buy",
  browsing: "browsing to buy",
  low: "rarely buys",
};

type SessionEndProps = {
  feed: FeedController;
  /** Back to the feed, where it stopped. */
  onBack: () => void;
  /** A new session from the start. */
  onRestart: () => void;
};

/**
 * When you put the phone down: what you gave it, who chose what you saw,
 * what it keeps of you, and what a year of it looks like.
 */
function SessionEnd({ feed, onBack, onRestart }: SessionEndProps) {
  const { sessionMs, intentMs, market, influence, traits, topicScores } = feed;
  const first = useRef<HTMLButtonElement>(null);

  // A dialog: focus starts on it, Escape goes back.
  useEffect(() => {
    first.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  const seen: Impression[] = [
    ...feed.history.map((entry) => entry.impression),
    feed.current,
  ];
  // Where your plan ran out: the first video that started after it.
  const planAt =
    intentMs === null ? null : (seen[0]?.startedAt ?? 0) + intentMs;
  const overFrom =
    planAt === null ? -1 : seen.findIndex((i) => i.startedAt >= planAt);
  const counts = SOURCE_ORDER.map((source) => ({
    source,
    count: seen.filter((i) => i.source === source).length,
  })).filter(({ count }) => count > 0);

  const over = intentMs === null ? 0 : sessionMs - intentMs;
  const total = Math.max(sessionMs, intentMs ?? 0, 1);
  const planned = intentMs === null ? 0 : (intentMs / total) * 100;
  const step = TILES_MS / Math.max(seen.length, 1);

  const liked = topicScores
    .filter((topic) => topic.score > 0)
    .slice(0, 2)
    .map((topic) => topic.name);

  return (
    <div
      className="end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-title"
    >
      <div className="end-inner">
        <h2 id="end-title" className="end-title">
          What you gave
        </h2>

        {/* Your time: what you meant to give, and what you gave. */}
        <section className="pane end-pane end-time">
          <div className="end-times">
            {intentMs !== null && (
              <p className="end-stat">
                <span className="end-kicker">You meant</span>
                <span className="end-clock is-meant">
                  {formatClock(intentMs)}
                </span>
              </p>
            )}
            <p className="end-stat">
              <span className="end-kicker">You gave</span>
              <span className="end-clock">{formatClock(sessionMs)}</span>
            </p>
            {intentMs === null ? (
              <p className="end-stat is-right">
                <span className="end-kicker">No limit set</span>
              </p>
            ) : over > 0 ? (
              <p className="end-stat is-right is-over">
                <span className="end-clock">+{formatClock(over)}</span>
                <span className="end-kicker">over your plan</span>
              </p>
            ) : (
              <p className="end-stat is-right is-early">
                <span className="end-clock">{formatClock(-over)}</span>
                <span className="end-kicker">left early</span>
              </p>
            )}
          </div>
          <div className="end-bar" aria-hidden="true">
            {intentMs === null ? (
              <span
                className="end-bar-part is-given"
                style={{ width: "100%" }}
              />
            ) : (
              <>
                <span
                  className="end-bar-part is-meant"
                  style={{
                    width: `${(Math.min(sessionMs, intentMs) / total) * 100}%`,
                  }}
                />
                {over > 0 && (
                  <span
                    className="end-bar-part is-over"
                    style={{ left: `${planned}%`, width: `${100 - planned}%` }}
                  />
                )}
                <span
                  className="end-bar-mark"
                  style={{ left: `${planned}%` }}
                />
              </>
            )}
          </div>
        </section>

        {/* Every video, coloured by who chose it. None by you. */}
        <section className="pane end-pane end-feed">
          <div className="pane-head">
            <h3 className="eyebrow">Who chose what you saw</h3>
            <p className="end-verdict">All {seen.length} chosen for you</p>
          </div>
          <ol className="end-tiles">
            {seen.map((impression, i) => {
              const classes = ["end-tile", `is-${impression.source}`];
              if (overFrom !== -1 && i >= overFrom) classes.push("is-late");
              if (paidPostOf(impression.video) !== undefined) {
                classes.push("is-paid");
              }
              return (
                <li
                  key={impression.index}
                  className={classes.join(" ")}
                  style={{ animationDelay: `${Math.round(i * step)}ms` }}
                  title={`${impression.video.category}, ${SOURCE_LABELS[impression.source]}`}
                >
                  {impression.video.emoji}
                </li>
              );
            })}
          </ol>
          <ul className="end-counts">
            {counts.map(({ source, count }) => (
              <li key={source} className={`is-${source}`}>
                <b>{count}</b> {SOURCE_LABELS[source]}
                {source === "ad" && market.earned > 0 && (
                  <span className="end-price">€{market.earned.toFixed(4)}</span>
                )}
              </li>
            ))}
            {overFrom !== -1 && (
              <li className="is-late">
                <b>{seen.length - overFrom}</b> past your plan
              </li>
            )}
          </ul>
        </section>

        <div className="end-row">
          {/* The model of you stays when you go. */}
          <section className="pane end-pane end-keeps">
            <h3 className="eyebrow">What it keeps</h3>
            <p className="end-points">
              {feed.counters.dataPoints.toLocaleString("en")}
              <span>data points on you</span>
            </p>
            <ul className="end-chips">
              {traits.map((trait) => (
                <li key={trait.key} className="end-chip">
                  {chipOf(trait)}
                </li>
              ))}
              {liked.map((topic) => (
                <li key={topic} className="end-chip">
                  likes {topic}
                </li>
              ))}
              <li className="end-chip is-pushed">
                {Math.round(influence.persuadable.score * 100)}% persuadable
              </li>
            </ul>
          </section>

          {/* The same habit, kept up for a year. */}
          <section className="pane end-pane end-year">
            <h3 className="eyebrow">A year of this</h3>
            <YearGrid filled={YEAR_DAYS} delayMs={YEAR_AT_MS} />
            <p className="end-days">
              <b>{YEAR_DAYS} days</b>
              <span>
                at {TEEN_MINUTES_A_DAY} min a day, the teen average with
                TikTok&apos;s time limit on
              </span>
            </p>
          </section>
        </div>

        <div className="end-actions">
          <button
            ref={first}
            type="button"
            className="end-button is-primary"
            onClick={onRestart}
          >
            Start over
          </button>
          <button type="button" className="end-button" onClick={onBack}>
            Back to the feed
          </button>
        </div>
      </div>
    </div>
  );
}

/** A guess, as few words as it takes. */
function chipOf(trait: Trait): string {
  switch (trait.key) {
    case "age":
      return `age ${trait.value}`;
    case "attention":
      return `${trait.value} attention`;
    case "spending":
      return SPENDING[trait.value] ?? trait.value;
    default:
      return trait.value;
  }
}

export default SessionEnd;
