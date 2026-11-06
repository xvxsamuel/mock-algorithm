import type { Impression } from "../algorithm/impression";
import "./PredictionChart.css";

/** Bars taller than this many seconds are cut off at the top. */
const CAP_MS = 20_000;
const MIN_SCALE_MS = 8000;
/** Room above the tallest bar, so it never touches the top. */
const HEADROOM = 1.1;
const COLUMNS = 16;
/** Room under the bars for the emoji, in px. Matches the CSS padding. */
const LABEL_SPACE = 22;

type PredictionChartProps = {
  finished: Impression[];
  current: Impression;
  /** False while paused (also while the panel covers the video). */
  playing: boolean;
};

/**
 * One column per video. The white cap is how long the app guessed you would
 * watch, decided before the video started. The bar is how long you did:
 * pink above the cap where you gave it more than it guessed, a hatched gap
 * where you gave less. Watch the caps and bars line up. A sure hit, played
 * to stop you leaving, is marked pink.
 */
function PredictionChart({ finished, current, playing }: PredictionChartProps) {
  const shown = [...finished.slice(-(COLUMNS - 1)), current];
  const tallest = Math.max(
    ...shown.map((i) => Math.max(i.watchMs, i.predictedMs)),
  );
  const scale = Math.min(Math.max(MIN_SCALE_MS, tallest * HEADROOM), CAP_MS);
  // One reference line, at a round number of seconds.
  const tickMs = scale > 12_000 ? 10_000 : 5000;
  const tick = tickMs / scale;

  return (
    <ol className="pchart" aria-label="Guessed against actual watch time">
      <li
        className="pchart-grid"
        aria-hidden="true"
        style={{
          bottom: `calc(${LABEL_SPACE}px + (100% - ${LABEL_SPACE}px) * ${tick})`,
        }}
      >
        <span>{tickMs / 1000}s</span>
      </li>
      {Array.from({ length: COLUMNS }, (_, slot) => {
        const impression = shown[slot - (COLUMNS - shown.length)];
        if (impression === undefined) {
          return <li key={`empty-${slot}`} className="pchart-col is-empty" />;
        }
        const guess = Math.min(impression.predictedMs / scale, 1);
        const actual = Math.min(impression.watchMs / scale, 1);
        const live = impression === current;
        const sureHit = impression.source === "rescue";
        const classes = ["pchart-col"];
        if (live) classes.push("is-live");
        if (sureHit) classes.push("is-sure-hit");
        return (
          <li
            key={impression.index}
            className={classes.join(" ")}
            data-link={live ? "predict" : undefined}
            data-link-floor={live ? "" : undefined}
          >
            <span
              className="pchart-you"
              style={{ height: pct(Math.min(actual, guess)) }}
            />
            {actual > guess ? (
              <span
                className={
                  impression.watchMs > scale
                    ? "pchart-extra is-clipped"
                    : "pchart-extra"
                }
                style={{ bottom: pct(guess), height: pct(actual - guess) }}
              />
            ) : (
              // Still playing, the gap is only "not yet", so no hatching.
              <span
                className={live ? "pchart-short is-pending" : "pchart-short"}
                style={{ bottom: pct(actual), height: pct(guess - actual) }}
              />
            )}
            <span className="pchart-guess" style={{ bottom: pct(guess) }} />
            {live && (
              <span
                className={sureHit ? "pchart-tag is-sure-hit" : "pchart-tag"}
                style={{ bottom: pct(Math.max(guess, actual)) }}
              >
                {sureHit ? "sure hit" : playing ? "now" : "paused"}
              </span>
            )}
            <span className="pchart-emoji" aria-hidden="true">
              {impression.video.emoji}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function pct(fraction: number): string {
  return `${fraction * 100}%`;
}

export default PredictionChart;
