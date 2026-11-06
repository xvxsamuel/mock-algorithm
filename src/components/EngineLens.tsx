import { HIT_MS } from "../algorithm/prediction";
import { SOURCE_LABELS } from "../algorithm/sources";
import type { FeedController } from "../hooks/useFeed";
import ExperimentField from "./ExperimentField";
import PredictionChart from "./PredictionChart";
import "./EngineLens.css";

/** Score parts shown in "why this video", biggest first. */
const WHY_PARTS = 3;
/** Videos the phone renders ahead of the one you are watching. */
const PRELOADED = 2;

type EngineLensProps = { feed: FeedController };

/**
 * How the machine works on you. One big picture (it predicts you), one
 * explanation (why this video), and the tests it runs while you watch.
 */
function EngineLens({ feed }: EngineLensProps) {
  const { current, currentItem, upNext, counters } = feed;
  const finished = feed.history.map((entry) => entry.impression);

  const parts = [...currentItem.ranking.pick.parts]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, WHY_PARTS);
  const widest = Math.max(0.5, ...parts.map((part) => Math.abs(part.value)));

  return (
    <div className="lens">
      <section className="pane eng-predict">
        <div className="pane-head">
          <div className="eng-title">
            <h2 className="eyebrow">It predicts your watch time</h2>
            {/* The legend doubles as a readout for the video playing now. */}
            <p className="eng-legend">
              <span className="eng-key is-guess" /> its guess
              <b>{seconds(current.predictedMs)}</b>
              <span className="eng-key is-actual" /> you
              <b className="tone-you">{seconds(current.watchMs)}</b>
            </p>
          </div>
          <p>
            <span className="figure tone-you">
              {feed.predictionHits.hits}
              <span className="eng-of">/{feed.predictionHits.total}</span>
            </span>
            <span className="unit">within {HIT_MS / 1000} s</span>
          </p>
        </div>
        <PredictionChart finished={finished} current={current} />
      </section>

      <div className="row">
        <section className="pane eng-why">
          <h2 className="eyebrow">Why this video</h2>
          <ul className="why" data-link="why">
            {parts.map((part) => (
              <li key={part.label} className="why-part">
                <span className="why-label">{part.label}</span>
                <span className="why-track">
                  <span
                    className={
                      part.value >= 0 ? "why-bar is-up" : "why-bar is-down"
                    }
                    style={{
                      width: `${(Math.abs(part.value) / widest) * 50}%`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
          <p className="why-next" data-link="queue">
            <span className="tone-muted">next</span>
            <span className="why-next-emoji">{upNext.video.emoji}</span>
            <span className={`why-source is-${upNext.ranking.source}`}>
              {SOURCE_LABELS[upNext.ranking.source]}
            </span>
          </p>
        </section>

        <section className="pane eng-tests">
          <ExperimentField sessionMs={feed.sessionMs} />
        </section>
      </div>

      {/* Built in, never shown: the quiet parts of the design. */}
      <ul className="eng-built">
        <li>
          <span className="eng-built-value">{counters.autoplays}</span>
          auto-played
        </li>
        <li>
          <span className="eng-built-value">{PRELOADED}</span>
          loaded ahead
        </li>
        <li>
          <span className="eng-built-value">∞</span>
          no end to the feed
        </li>
      </ul>
    </div>
  );
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export default EngineLens;
