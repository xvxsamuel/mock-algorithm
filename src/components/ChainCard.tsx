import type { CSSProperties } from "react";
import type { PickCause } from "../algorithm/cause";
import { CATEGORY_COLORS, type Category } from "../data/categories";
import type { Video } from "../data/videos";
import FeedCard from "./FeedCard";
import "./ChainCard.css";

type ChainCardProps = {
  cause: PickCause;
  /** The video under the card: the one it picked. */
  video: Video;
  onKeep: () => void;
};

/**
 * Once, early, over a video picked for you: the chain that put it here,
 * one step at a time. What you did, what it guessed, what it picked.
 */
function ChainCard({ cause, video, onKeep }: ChainCardProps) {
  return (
    <FeedCard labelledBy="chain-title" onKeep={onKeep}>
      <h2 id="chain-title" className="fcard-title">
        Why this video
      </h2>
      <ol className="chain">
        <li className="chain-step">
          <span className="chain-kicker">You watched</span>
          <span className="chain-watched">
            {cause.watched.map((impression) => (
              <span key={impression.index} className="chain-clip">
                <span
                  className="chain-tile"
                  style={paint(impression.video.category)}
                >
                  {impression.video.emoji}
                </span>
                <span className="chain-secs">
                  {(impression.watchMs / 1000).toFixed(1)}s
                </span>
              </span>
            ))}
          </span>
        </li>
        <li className="chain-step">
          <span className="chain-kicker">It guessed</span>
          <span className="chain-guess">
            you like{" "}
            <span className="chain-topic" style={paint(cause.topic)}>
              {cause.topic}
            </span>
          </span>
        </li>
        <li className="chain-step">
          <span className="chain-kicker">So it picked</span>
          <span className="chain-tile is-picked" style={paint(video.category)}>
            {video.emoji}
          </span>
        </li>
      </ol>
    </FeedCard>
  );
}

/** A topic's own colours, as on the video. */
function paint(category: Category): CSSProperties {
  const [from, to] = CATEGORY_COLORS[category];
  return { backgroundImage: `linear-gradient(160deg, ${from}, ${to})` };
}

export default ChainCard;
