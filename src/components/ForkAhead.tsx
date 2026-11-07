import type { CSSProperties } from "react";
import { AHEAD, topicShares, type Fork, type Lever } from "../algorithm/fork";
import { CATEGORY_COLORS, type Category } from "../data/categories";
import type { Video } from "../data/videos";
import "./ForkAhead.css";

const LEVERS: { id: Lever; label: string }[] = [
  { id: "skip", label: "Skip one" },
  { id: "off", label: "For You off" },
];

/** Dekker, Baumgartner & Sumter (2025): 88 Dutch users, a week each way. */
const OFF_STUDY =
  "Dekker, Baumgartner and Sumter, 2025: 88 TikTok users, one week with the personalised feed, one with it off";

type ForkAheadProps = {
  fork: Fork;
  lever: Lever;
  onLever: (lever: Lever) => void;
};

/**
 * The next videos it has lined up for you, beside the same feed with one
 * thing changed: one video skipped, or the feed not based on you.
 */
function ForkAhead({ fork, lever, onLever }: ForkAheadProps) {
  const { you, other, pivot } = fork;
  const otherLabel =
    lever === "skip"
      ? pivot === null
        ? "Skipped one"
        : `Skipped ${pivot.video.emoji}`
      : "For You off";

  return (
    <section className="pane end-pane fork" aria-labelledby="fork-title">
      <div className="fork-head">
        <h3 id="fork-title" className="eyebrow">
          Your next {AHEAD}
        </h3>
        <div className="fork-levers" role="group" aria-label="Change one thing">
          {LEVERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className={id === lever ? "fork-lever is-on" : "fork-lever"}
              aria-pressed={id === lever}
              onClick={() => onLever(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="fork-rows">
        <Row label="You" videos={you} />
        <Row
          key={lever}
          label={otherLabel}
          videos={other}
          against={you}
          className="is-other"
        />
      </div>

      <p className="fork-says">{sayOf(fork, lever)}</p>
      {lever === "off" && (
        <ul className="fork-study" title={OFF_STUDY}>
          <li className="fork-study-who">88 people, a week with it off</li>
          <li>
            <b>−46%</b> time on TikTok
          </li>
          <li>
            <b>79 of 88</b> wanted it back on
          </li>
        </ul>
      )}
    </section>
  );
}

type RowProps = {
  label: string;
  videos: readonly Video[];
  /** The row it is set against: its videos at the same place are faded. */
  against?: readonly Video[];
  className?: string;
};

/** One future: its videos in order, and what they are about. */
function Row({ label, videos, against, className }: RowProps) {
  const shares = topicShares(videos);
  const top = shares[0];
  return (
    <div
      className={className === undefined ? "fork-row" : `fork-row ${className}`}
    >
      <p className="fork-label">{label}</p>
      <ol className="fork-tiles">
        {videos.map((video, i) => {
          const same = against?.[i]?.id === video.id;
          return (
            <li
              key={i}
              className={same ? "fork-tile is-same" : "fork-tile"}
              style={{
                ...paint(video.category),
                animationDelay: `${i * 25}ms`,
              }}
              title={video.category}
            >
              {video.emoji}
            </li>
          );
        })}
      </ol>
      <div className="fork-mix">
        <span className="fork-bar" aria-hidden="true">
          {shares.map(({ topic, share }) => (
            <span
              key={topic}
              style={{ ...paint(topic), width: `${share * 100}%` }}
            />
          ))}
        </span>
        {top !== undefined && (
          <span className="fork-top">
            <b>{Math.round(top.share * 100)}%</b> {top.topic}
          </span>
        )}
      </div>
    </div>
  );
}

/** What changing that one thing did, in a line. */
function sayOf(fork: Fork, lever: Lever): string {
  const yourTop = topicShares(fork.you)[0]?.topic;
  const otherShares = topicShares(fork.other);
  const otherTop = otherShares[0]?.topic;
  if (lever === "skip") {
    if (fork.pivot === null) return "Nothing you watched has steered it yet.";
    const turn =
      otherTop !== yourTop && otherTop !== undefined && yourTop !== undefined
        ? ` Mostly ${otherTop}, not ${yourTop}.`
        : "";
    return `Skip ${fork.pivot.video.emoji} and ${fork.changed} of the next ${AHEAD} change.${turn}`;
  }
  const most = Math.round((otherShares[0]?.share ?? 0) * 100);
  return `Not based on you: no topic over ${most}%. EU law makes TikTok offer it.`;
}

function paint(category: Category): CSSProperties {
  const [from, to] = CATEGORY_COLORS[category];
  return { backgroundImage: `linear-gradient(160deg, ${from}, ${to})` };
}

export default ForkAhead;
