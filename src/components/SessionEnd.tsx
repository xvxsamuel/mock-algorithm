import { useEffect, useEffectEvent, useRef, type RefObject } from "react";
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
/** After the time bar has grown (pink last), the tiles come in one after
    another, all within TILES_MS; then the year fills. */
const TILES_AT_MS = 1200;
const TILES_MS = 600;
const YEAR_AT_MS = 2300;
/** Fewer videos than this: bigger tiles. */
const FEW = 25;

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
  /** Where focus goes when the dialog closes: the Leave button. */
  returnTo: RefObject<HTMLElement | null>;
};

/**
 * When you put the phone down: what you gave it, who chose what you saw,
 * what it keeps of you, and what a year of it looks like.
 */
function SessionEnd({ feed, onBack, onRestart, returnTo }: SessionEndProps) {
  const { sessionMs, intentMs, market, influence, traits } = feed;
  const dialog = useRef<HTMLDivElement>(null);

  // A dialog over an inert app: focus starts on the dialog itself (a stray
  // Enter must not wipe the session), Escape goes back, and focus returns
  // to Leave when it closes.
  const goBack = useEffectEvent(onBack);
  useEffect(() => {
    const back = returnTo.current;
    dialog.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") goBack();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      back?.focus({ preventScroll: true });
    };
  }, [returnTo]);

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
  const sponsors = seen.flatMap((i) => paidPostOf(i.video) ?? []);

  return (
    <div
      ref={dialog}
      className="end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="end-title"
      tabIndex={-1}
    >
      <div className="end-inner">
        <div className="end-head">
          <h2 id="end-title" className="end-title">
            What you gave
          </h2>
          <p className="end-note">Simulated model</p>
        </div>

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
              <p className="end-open">No limit</p>
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
          {intentMs !== null && (
            <div className="end-bar" aria-hidden="true">
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
              <span className="end-bar-mark" style={{ left: `${planned}%` }} />
            </div>
          )}
        </section>

        {/* Every video, coloured by who chose it. None by you. */}
        <section className="pane end-pane end-feed">
          <h3 className="end-verdict">All {seen.length} chosen for you</h3>
          <ol className={seen.length < FEW ? "end-tiles is-few" : "end-tiles"}>
            {seen.map((impression, i) => {
              const classes = ["end-tile", `is-${impression.source}`];
              if (overFrom !== -1 && i >= overFrom) classes.push("is-late");
              const sponsor = paidPostOf(impression.video);
              if (sponsor !== undefined) classes.push("is-paid");
              return (
                <li
                  key={impression.index}
                  className={classes.join(" ")}
                  style={{
                    animationDelay: `${Math.round(TILES_AT_MS + i * step)}ms`,
                  }}
                  title={`${impression.video.category}, ${SOURCE_LABELS[impression.source]}${sponsor === undefined ? "" : `, secretly paid by ${sponsor.brand}`}`}
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
                  <>
                    {" "}
                    for{" "}
                    <span className="end-price">
                      €{market.earned.toFixed(4)}
                    </span>
                  </>
                )}
              </li>
            ))}
            {sponsors.length > 0 && (
              <li className="is-paid">
                <b>{sponsors.length}</b> secretly paid
                {sponsors.length === 1 && ` by ${sponsors[0].brand}`}
              </li>
            )}
            {overFrom !== -1 && (
              <li className="is-late">
                <b>{seen.length - overFrom}</b> over your plan
              </li>
            )}
          </ul>
        </section>

        <div className="end-row">
          {/* The model of you stays when you go. */}
          <section className="pane end-pane end-keeps">
            <h3 className="eyebrow">What it keeps and guesses</h3>
            <p className="end-points">
              {feed.counters.dataPoints.toLocaleString("en")}
              <span>data points</span>
            </p>
            <ul className="end-chips">
              {traits.map((trait) => (
                <li key={trait.key} className="end-chip">
                  {chipOf(trait)}
                </li>
              ))}
              <li className="end-chip is-pushed">
                {Math.round(influence.persuadable.score * 100)}% persuadable
              </li>
            </ul>
          </section>

          {/* Not your year: the average teen's, even with the limit on. */}
          <section className="pane end-pane end-year">
            <div className="end-year-head">
              <h3 className="eyebrow">A year at the teen average</h3>
              <span className="end-year-key">
                <span className="end-year-square" aria-hidden="true" />1 day
              </span>
            </div>
            <YearGrid filled={YEAR_DAYS} delayMs={YEAR_AT_MS} />
            <p className="end-days">
              <b>{YEAR_DAYS} days</b>
              <span>
                {TEEN_MINUTES_A_DAY} min a day, even with TikTok&apos;s time
                limit on
              </span>
            </p>
          </section>
        </div>

        <div className="end-actions">
          <button
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
