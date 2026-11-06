import type { Impression } from "../algorithm/impression";
import "./PredictionChart.css";

/** Bars taller than this many seconds are cut off at the top. */
const CAP_MS = 20_000;
const MIN_SCALE_MS = 8000;
const COLUMNS = 16;

type PredictionChartProps = {
  finished: Impression[];
  current: Impression;
};

/**
 * One column per video: the outline is how long the app predicted you would
 * watch, the solid bar is how long you did. Watch them line up.
 */
function PredictionChart({ finished, current }: PredictionChartProps) {
  const shown = [...finished.slice(-(COLUMNS - 1)), current];
  const scale = Math.min(
    Math.max(
      MIN_SCALE_MS,
      ...shown.map((i) => Math.max(i.watchMs, i.predictedMs)),
    ),
    CAP_MS,
  );

  return (
    <ol className="pchart" aria-label="Predicted against actual watch time">
      {Array.from({ length: COLUMNS }, (_, slot) => {
        const impression = shown[slot - (COLUMNS - shown.length)];
        if (impression === undefined) {
          return <li key={`empty-${slot}`} className="pchart-col is-empty" />;
        }
        const predicted = Math.min(impression.predictedMs / scale, 1);
        const actual = Math.min(impression.watchMs / scale, 1);
        const live = impression === current;
        return (
          <li
            key={impression.index}
            className={live ? "pchart-col is-live" : "pchart-col"}
          >
            <span
              className="pchart-predicted"
              style={{ height: `${predicted * 100}%` }}
            />
            <span
              className="pchart-actual"
              style={{ height: `${actual * 100}%` }}
            />
            <span className="pchart-emoji" aria-hidden="true">
              {impression.video.emoji}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default PredictionChart;
