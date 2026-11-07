import type { SignalCode } from "../algorithm/signals";
import { CATEGORY_COLORS } from "../data/categories";
import { useDevice } from "../hooks/useDevice";
import type { FeedController } from "../hooks/useFeed";
import Icon, { type IconName } from "./Icon";
import InterestRadar from "./InterestRadar";
import WatchBar from "./WatchBar";
import "./YouLens.css";

/** Signals that show up as chips when the live video sends them. Watch time has its own bar. */
const SIGNALS: { code: SignalCode; icon: IconName; label: string }[] = [
  { code: "LIKE", icon: "heart", label: "like" },
  { code: "COMMENTS_OPEN", icon: "comment", label: "comments" },
  { code: "SAVE", icon: "bookmark", label: "save" },
  { code: "SHARE", icon: "share", label: "share" },
  { code: "FOLLOW", icon: "userPlus", label: "follow" },
  { code: "PAUSE", icon: "pause", label: "pause" },
  { code: "LOOP", icon: "loop", label: "loop" },
  { code: "REVISIT", icon: "revisit", label: "rewatch" },
  { code: "NOT_INTERESTED", icon: "ban", label: "not for me" },
];

/** No name: the app knows you by a number. A new one each visit, 19 digits
    long like a TikTok user ID. */
const USER_ID =
  "7" +
  Array.from({ length: 18 }, () => Math.floor(Math.random() * 10)).join("");

type YouLensProps = { feed: FeedController };

/** What the app has learned about you: a shape, some guesses, a live feed of signals. */
function YouLens({ feed }: YouLensProps) {
  const { current, currentSignals, counters, traits } = feed;
  const device = useDevice();
  const { video } = current;
  const [from, to] = CATEGORY_COLORS[video.category];
  const fired = currentSignals.flatMap((signal) => {
    const shown = SIGNALS.find((s) => s.code === signal.code);
    return shown === undefined ? [] : [{ ...shown, up: signal.topic >= 0 }];
  });

  return (
    <div className="lens">
      <section className="pane you-model">
        <header className="you-id">
          <span className="you-avatar" aria-hidden="true">
            <Icon name="profile" size={22} />
          </span>
          <div className="you-who">
            <p className="you-name">You</p>
            <p className="you-number">user {USER_ID}</p>
          </div>
          {/* A recording light: on the moment you start scrolling. */}
          {feed.started && (
            <span className="you-rec" role="img" aria-label="Profiling">
              <span className="you-rec-dot" />
            </span>
          )}
          <div className="you-points">
            <p className="figure">{counters.dataPoints.toLocaleString("en")}</p>
            <p className="eyebrow">data points</p>
          </div>
        </header>

        {/* The one thing here that is not simulated. */}
        <div className="you-device">
          <p className="you-device-head">
            <span className="you-real">real</span>
            from your device
          </p>
          <ul className="you-facts">
            {device.map((fact) => (
              <li key={fact.key} className="you-fact">
                {fact.value}
              </li>
            ))}
          </ul>
        </div>

        <div className="you-model-body">
          <div className="you-radar">
            <InterestRadar topics={feed.topicScores} current={video.category} />
          </div>
          <div className="you-guesses">
            <ul className="traits">
              {traits.map((trait) => (
                <li
                  key={trait.key}
                  className="trait"
                  data-link={`trait:${trait.key}`}
                >
                  <span className="trait-label">{trait.label}</span>
                  <span className="trait-value">{trait.value}</span>
                  <span className="trait-bar">
                    <span style={{ width: `${trait.confidence * 100}%` }} />
                  </span>
                  <span className="trait-sure">
                    {Math.round(trait.confidence * 100)}% sure
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="pane you-live">
        <div className="you-now">
          <span
            className="you-thumb"
            style={{
              backgroundImage: `linear-gradient(160deg, ${from}, ${to})`,
            }}
            aria-hidden="true"
          >
            {video.emoji}
          </span>
          <WatchBar
            key={feed.currentItem.key}
            watchMs={current.watchMs}
            predictedMs={current.predictedMs}
            durationMs={video.durationSec * 1000}
            playing={feed.playing}
            started={feed.started}
          />
        </div>
        {/* Only what this video has sent so far, as it happens. */}
        <ul className="signals">
          {fired.map(({ code, icon, label, up }) => (
            <li
              key={code}
              className={up ? "signal is-up" : "signal is-down"}
              data-link={`signal:${code}`}
            >
              <Icon name={icon} size={14} />
              {label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export default YouLens;
