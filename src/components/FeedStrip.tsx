import { watchRatio, type Impression } from "../algorithm/impression";
import {
  SOURCE_LABELS,
  SOURCE_ORDER,
  type FeedSource,
} from "../algorithm/sources";
import type { FeedController } from "../hooks/useFeed";
import "./FeedStrip.css";

/** How many past videos fit in the strip. Older ones scroll out. */
const CELLS = 22;

type FeedStripProps = { feed: FeedController };

/**
 * Every video you have seen, as one tile, coloured by who chose it.
 * The last tile is the one already lined up before you swipe.
 */
function FeedStrip({ feed }: FeedStripProps) {
  const past = feed.history
    .slice(-(CELLS - 2))
    .map((entry) => entry.impression);
  const seen = new Set(
    [...past, feed.current].map((impression) => impression.source),
  );
  seen.add(feed.upNext.ranking.source);

  return (
    <footer className="strip">
      <div className="strip-head">
        <h2 className="eyebrow">Who chose your feed</h2>
        <ul className="strip-legend">
          {SOURCE_ORDER.filter((source) => seen.has(source)).map((source) => (
            <li key={source} className={`is-${source}`}>
              {SOURCE_LABELS[source]}
            </li>
          ))}
        </ul>
      </div>
      <ol className="strip-cells" data-link="strip">
        {past.map((impression) => cell(impression))}
        {cell(feed.current, "is-now")}
        <li
          className={`strip-cell is-next is-${feed.upNext.ranking.source}`}
          title={`Up next, already chosen: ${SOURCE_LABELS[feed.upNext.ranking.source]}`}
          data-link="queue-cell"
        >
          <span className="strip-emoji">{feed.upNext.video.emoji}</span>
        </li>
      </ol>
    </footer>
  );
}

function cell(impression: Impression, extra = "") {
  const source: FeedSource = impression.source;
  const ratio = Math.min(watchRatio(impression), 1);
  return (
    <li
      key={impression.index}
      className={`strip-cell is-${source} ${extra}`}
      title={`#${impression.index} ${impression.video.category}, ${SOURCE_LABELS[source]}`}
    >
      <span className="strip-emoji">{impression.video.emoji}</span>
      <span className="strip-watch" style={{ width: `${ratio * 100}%` }} />
    </li>
  );
}

export default FeedStrip;
