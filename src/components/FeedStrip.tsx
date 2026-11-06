import type { Impression } from "../algorithm/impression";
import {
  SOURCE_LABELS,
  SOURCE_ORDER,
  type FeedSource,
} from "../algorithm/sources";
import type { FeedController } from "../hooks/useFeed";
import "./FeedStrip.css";

/** How many tiles fit in the strip. Older videos fold into a "+N" tile. */
const CELLS = 22;
/** The same on narrow screens, where CSS hides the older tiles. */
const NARROW_CELLS = 11;
/** Tiles after the ones you have seen: now, next, and the endless rest. */
const TAIL = 3;

type FeedStripProps = { feed: FeedController };

/**
 * Every video you have seen, as one tile, coloured by who chose it, then
 * the one already lined up before you swipe, then no end.
 */
function FeedStrip({ feed }: FeedStripProps) {
  // When the strip is full, the first tile counts the videos before it.
  const full = feed.history.length > CELLS - TAIL;
  const earlier = full ? feed.history.length - (CELLS - TAIL - 1) : 0;
  const past = feed.history
    .slice(full ? -(CELLS - TAIL - 1) : -(CELLS - TAIL))
    .map((entry) => entry.impression);
  // Narrow screens show fewer tiles, so their "+N" counts more videos.
  const narrowFull = feed.history.length > NARROW_CELLS - TAIL;
  const narrowEarlier = narrowFull
    ? feed.history.length - (NARROW_CELLS - TAIL - 1)
    : 0;
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
      <ol
        className={narrowFull ? "strip-cells is-narrow-full" : "strip-cells"}
        data-link="strip"
      >
        {earlier > 0 && (
          <li
            className="strip-earlier is-wide"
            title={`${earlier} earlier videos`}
          >
            +{earlier}
          </li>
        )}
        {narrowEarlier > 0 && (
          <li
            className="strip-earlier is-narrow"
            title={`${narrowEarlier} earlier videos`}
          >
            +{narrowEarlier}
          </li>
        )}
        {past.map((impression) => cell(impression))}
        {cell(feed.current, "is-now", "now")}
        <li
          className={`strip-cell is-next is-${feed.upNext.ranking.source}`}
          title={`Up next, already chosen: ${SOURCE_LABELS[feed.upNext.ranking.source]}`}
          data-link="queue-cell"
          data-tag="next"
        >
          <span className="strip-emoji">{feed.upNext.video.emoji}</span>
        </li>
        {/* And after that, more: the feed has no last video. */}
        <li className="strip-end" title="No end to the feed">
          ∞
        </li>
      </ol>
    </footer>
  );
}

function cell(impression: Impression, extra = "", tag?: string) {
  const source: FeedSource = impression.source;
  return (
    <li
      key={impression.index}
      className={`strip-cell is-${source} ${extra}`}
      title={`#${impression.index} ${impression.video.category}, ${SOURCE_LABELS[source]}`}
      data-tag={tag}
    >
      <span className="strip-emoji">{impression.video.emoji}</span>
    </li>
  );
}

export default FeedStrip;
