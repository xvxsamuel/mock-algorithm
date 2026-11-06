import type { SignalCode } from "../algorithm/signals";
import { CATEGORY_COLORS } from "../data/categories";
import { USER } from "../data/user";
import type { FeedController } from "../hooks/useFeed";
import Icon, { type IconName } from "./Icon";
import InterestRadar from "./InterestRadar";
import WatchBar from "./WatchBar";
import "./YouLens.css";

/** The signals shown as icons for the live video. Watch time has its own bar. */
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

type YouLensProps = { feed: FeedController };

/** What the app has learned about you: a shape, some guesses, a live feed of signals. */
function YouLens({ feed }: YouLensProps) {
  const { current, currentSignals, counters, traits } = feed;
  const { video } = current;
  const [from, to] = CATEGORY_COLORS[video.category];

  return (
    <div className="lens">
      <section className="pane you-model">
        <header className="you-id">
          <span className="you-avatar" aria-hidden="true">
            {initials(USER.name)}
          </span>
          <div className="you-who">
            <p className="you-name">{USER.name}</p>
            <p className="tone-muted">@{USER.handle}</p>
          </div>
          {/* Switches on the moment you start scrolling. */}
          {feed.started && (
            <p className="you-rec">
              <span className="you-rec-dot" aria-hidden="true" /> profiling
            </p>
          )}
          <div className="you-points">
            <p className="figure">{counters.dataPoints.toLocaleString("en")}</p>
            <p className="eyebrow">data points</p>
          </div>
        </header>

        <div className="you-model-body">
          <div className="you-radar">
            <h2 className="eyebrow">The model of you</h2>
            <InterestRadar topics={feed.topicScores} current={video.category} />
          </div>
          <div className="you-guesses">
            <h2 className="eyebrow">Guessed, never asked</h2>
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
            <p className="you-creators" data-link="creators">
              {feed.creatorScores.length === 0
                ? "No favourite creators yet"
                : `You linger on ${feed.creatorScores
                    .slice(0, 3)
                    .map((creator) => `@${creator.name}`)
                    .join(" · ")}`}
            </p>
          </div>
        </div>
      </section>

      <section className="pane you-live">
        <div className="pane-head">
          <h2 className="eyebrow">Right now</h2>
          <p className="tone-muted">
            video {current.index} · @{video.creator}
          </p>
        </div>
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
            watchMs={current.watchMs}
            predictedMs={current.predictedMs}
            durationMs={video.durationSec * 1000}
            playing={feed.playing}
          />
        </div>
        <ul className="signals">
          {SIGNALS.map(({ code, icon, label }) => {
            const signal = currentSignals.find((s) => s.code === code);
            const tone =
              signal === undefined
                ? ""
                : signal.topic >= 0
                  ? "is-up"
                  : "is-down";
            return (
              <li
                key={code}
                className={`signal ${tone}`}
                data-link={`signal:${code}`}
                title={signal?.label ?? label}
              >
                <Icon name={icon} size={16} />
                <span>{label}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default YouLens;
