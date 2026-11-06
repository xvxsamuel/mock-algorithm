import { RESCUE_AT } from "../algorithm/retention";
import { SOURCE_LABELS } from "../algorithm/sources";
import {
  EXPERIMENTS_RUNNING,
  MINUTES_PER_DAY,
  MY_EXPERIMENTS,
} from "../data/experiments";
import type { FeedController } from "../hooks/useFeed";
import ExperimentField from "./ExperimentField";
import Icon, { type IconName } from "./Icon";
import PredictionChart from "./PredictionChart";
import RiskGauge from "./RiskGauge";
import YearGrid from "./YearGrid";
import "./EngineLens.css";

/** Score parts shown in "why this video", biggest first. */
const WHY_PARTS = 4;
/** Videos the phone renders ahead of the one you are watching. */
const PRELOADED = 2;

type EngineLensProps = { feed: FeedController };

/** How the machine works on you: it predicts, it notices, it experiments. */
function EngineLens({ feed }: EngineLensProps) {
  const { current, currentItem, upNext, exitRisk, counters } = feed;
  const finished = feed.history.map((entry) => entry.impression);
  const daysPerYear = Math.round((MINUTES_PER_DAY * 365) / (24 * 60));

  const parts = [...currentItem.ranking.pick.parts]
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, WHY_PARTS);
  const widest = Math.max(0.5, ...parts.map((part) => Math.abs(part.value)));
  const rescueQueued = upNext.ranking.source === "rescue";
  const rescuePlaying = current.source === "rescue";

  const friction: { icon: IconName; value: string; label: string }[] = [
    { icon: "play", value: String(counters.autoplays), label: "auto-played" },
    { icon: "loop", value: String(counters.loops), label: "looped" },
    { icon: "layers", value: String(PRELOADED), label: "preloaded" },
    { icon: "infinity", value: "∞", label: "feed end" },
    { icon: "clockOff", value: "0", label: "clocks shown" },
  ];

  return (
    <div className="lens">
      <section className="pane eng-predict" data-link="predict">
        <div className="pane-head">
          <div className="eng-title">
            <h2 className="eyebrow">It predicts you</h2>
            <p className="eng-legend">
              <span className="eng-key is-predicted" /> its guess
              <span className="eng-key is-actual" /> you
            </p>
          </div>
          <p>
            <span className="figure tone-you">
              {Math.round(feed.accuracy * 100)}%
            </span>
            <span className="unit">accurate</span>
          </p>
        </div>
        <PredictionChart finished={finished} current={current} />
      </section>

      <div className="row eng-middle">
        <section className="pane eng-risk" data-link="risk">
          <h2 className="eyebrow">Chance you leave</h2>
          <RiskGauge value={exitRisk.value} threshold={RESCUE_AT} />
          <p
            className={
              rescueQueued || rescuePlaying ? "eng-rescue is-on" : "eng-rescue"
            }
          >
            {rescueQueued ? (
              <>
                <span className="eng-rescue-emoji">{upNext.video.emoji}</span>
                sure hit queued
              </>
            ) : rescuePlaying ? (
              <>
                <span className="eng-rescue-emoji">{current.video.emoji}</span>
                sure hit playing
              </>
            ) : (
              (exitRisk.reason ?? "you're hooked")
            )}
          </p>
        </section>

        <section className="pane eng-why" data-link="why">
          <h2 className="eyebrow">Why this video</h2>
          <ul className="why">
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
      </div>

      <ul className="pane eng-friction">
        {friction.map((item) => (
          <li key={item.label}>
            <Icon name={item.icon} size={18} />
            <span className="eng-friction-value">{item.value}</span>
            <span className="eng-friction-label">{item.label}</span>
          </li>
        ))}
      </ul>

      <div className="row eng-bottom">
        <section className="pane">
          <div className="pane-head">
            <h2 className="eyebrow">Tests running on you</h2>
            <p>
              <span className="figure">{MY_EXPERIMENTS.length}</span>
              <span className="unit">
                of {EXPERIMENTS_RUNNING.toLocaleString("en")}
              </span>
            </p>
          </div>
          <ExperimentField sessionMs={feed.sessionMs} />
        </section>

        <section className="pane">
          <div className="pane-head">
            <h2 className="eyebrow">A year of this</h2>
            <p>
              <span className="figure tone-take">{daysPerYear}</span>
              <span className="unit">days</span>
            </p>
          </div>
          <YearGrid filled={daysPerYear} />
          <p className="eng-foot">
            at {MINUTES_PER_DAY} min a day, the average
          </p>
        </section>
      </div>
    </div>
  );
}

export default EngineLens;
