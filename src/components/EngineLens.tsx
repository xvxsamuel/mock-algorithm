import type { ScorePart } from "../algorithm/ranking";
import { SOURCE_LABELS } from "../algorithm/sources";
import type { FeedController } from "../hooks/useFeed";
import ExperimentField from "./ExperimentField";
import PredictionChart from "./PredictionChart";
import "./EngineLens.css";

/** Its typical miss turns cyan only when it is at most this share of the
    average's: clearly closer, not noise. */
const CLEARLY_CLOSER = 0.8;
/** Beside a sure hit's reason, the other bars use at most this share of
    the half track, so the pink one clearly outweighs them. */
const UNDER_RESCUE = 0.6;
/** Score parts shown in "why this video", biggest first. */
const WHY_PARTS = 3;
/** The thinnest a bar is drawn when its part is not zero, in px. */
const MIN_BAR_PX = 6;

type EngineLensProps = { feed: FeedController };

/**
 * How the machine works on you. One big picture (it predicts you), one
 * explanation (why this video), and the tests it runs while you watch.
 */
function EngineLens({ feed }: EngineLensProps) {
  const { current, currentItem, upNext } = feed;
  const miss = feed.predictionMiss;
  // Only a real edge gets the accent: clearly closer than your average.
  const knowsYou = miss !== null && miss.model <= miss.average * CLEARLY_CLOSER;
  const finished = feed.history.map((entry) => entry.impression);

  // A sure hit's first reason is that you were about to leave.
  const sureHit = current.source === "rescue";
  const parts = whyParts(
    currentItem.ranking.pick.parts,
    sureHit ? WHY_PARTS - 1 : WHY_PARTS,
    current.source !== "explore",
  );
  const widest =
    Math.max(0.5, ...parts.map((part) => Math.abs(part.value))) /
    (sureHit ? UNDER_RESCUE : 1);

  return (
    <div className="lens">
      <section className="pane eng-predict">
        <div className="pane-head">
          <div className="eng-title">
            <h2 className="eyebrow">Watch time</h2>
            <p className="eng-legend">
              <span>
                <span className="eng-key is-guess" /> its guess
              </span>
              <span>
                <span className="eng-key is-actual" /> you
              </span>
              <span>
                <span className="eng-key is-over" /> over
              </span>
              <span>
                <span className="eng-key is-under" /> under
              </span>
            </p>
          </div>
          {/* "1.1s vs 2.9s": what knowing you is worth. Not knowing you is
              a blind guess of your average. Over your latest videos. */}
          <p
            className="eng-hits"
            title={
              miss === null
                ? undefined
                : `Median over your last ${miss.count} videos`
            }
          >
            <span className="unit">typical miss</span>
            <span className={knowsYou ? "eng-hit" : "eng-hit is-baseline"}>
              <b className={knowsYou ? "tone-you" : undefined}>
                {miss === null ? "–" : seconds(miss.model)}
              </b>
              <small>knowing you</small>
            </span>
            <span className="eng-vs">vs</span>
            <span className="eng-hit is-baseline">
              <b>{miss === null ? "–" : seconds(miss.average)}</b>
              <small>not knowing you</small>
            </span>
          </p>
        </div>
        <PredictionChart
          finished={finished}
          current={current}
          playing={feed.playing}
        />
      </section>

      <div className="row">
        <section className="pane eng-why">
          {/* Who chose the video playing now; pink while a sure hit plays. */}
          <div className="pane-head">
            <h2 className="eyebrow">Why this video</h2>
            <span className={`why-source is-${current.source}`}>
              {SOURCE_LABELS[current.source]}
            </span>
          </div>
          <ul className="why" data-link="why">
            {sureHit && (
              <li className="why-part is-rescue">
                {/* The chain: what you did → you were leaving. The dial
                    above carries the numbers. */}
                <span className="why-label">
                  {currentItem.reasonWhenQueued !== null &&
                    `${currentItem.reasonWhenQueued} → `}
                  about to leave
                </span>
                <span className="why-track">
                  <span className="why-bar is-rescue" />
                </span>
              </li>
            )}
            {parts.map((part) => (
              <li key={part.label} className="why-part">
                <span className="why-label">{part.label}</span>
                <span className="why-track">
                  <span
                    className={`why-bar ${barClass(part)}`}
                    style={{
                      width:
                        part.value === 0
                          ? 0
                          : `max(${MIN_BAR_PX}px, ${(Math.abs(part.value) / widest) * 50}%)`,
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
    </div>
  );
}

/**
 * The biggest parts, biggest first, and on an ad or a push what bought it
 * first. A pick
 * made for you (not a test) always names the part of you it used, even when
 * the engine's own rules weigh more.
 */
function whyParts(
  all: readonly ScorePart[],
  count: number,
  forYou: boolean,
): ScorePart[] {
  const sorted = [...all].sort(
    (a, b) =>
      Number(bought(b)) - Number(bought(a)) ||
      Math.abs(b.value) - Math.abs(a.value),
  );
  const shown = sorted.slice(0, count);
  const yours = sorted.find((part) => part.from === "you" && part.value > 0);
  if (!forYou || yours === undefined || shown.includes(yours)) return shown;
  return [...shown.slice(0, count - 1), yours];
}

/** Paid for, or pushed by fake accounts: shown first, it outranks the rest. */
function bought(part: ScorePart): boolean {
  return part.from === "paid" || part.from === "pushed";
}

/**
 * Right for, left against; cyan from you, amber bought, violet pushed by
 * outsiders, grey the engine's.
 */
function barClass(part: ScorePart): string {
  if (part.value < 0) return "is-down";
  if (part.from === "paid") return "is-up is-paid";
  if (part.from === "pushed") return "is-up is-pushed";
  return part.from === "you" ? "is-up" : "is-up is-engine";
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export default EngineLens;
