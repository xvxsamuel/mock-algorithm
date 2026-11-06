import { formatClock } from "../algorithm/clock";
import type { FeedController } from "../hooks/useFeed";
import "./SheetHandle.css";

type SheetHandleProps = {
  feed: FeedController;
  open: boolean;
  onToggle: () => void;
};

/**
 * The grip of the panel sheet on narrow screens. Closed, it still shows
 * the two numbers that matter, live, over the bottom of the video.
 */
function SheetHandle({ feed, open, onToggle }: SheetHandleProps) {
  const { sessionMs, intentMs, exitRisk } = feed;
  const over = intentMs !== null && sessionMs > intentMs;

  return (
    <button
      type="button"
      className="sheet-handle"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span className="sheet-grip" aria-hidden="true" />
      {open ? (
        "Back to the feed"
      ) : (
        <span className="sheet-peek">
          <span className={over ? "tone-take" : undefined}>
            {over && intentMs !== null
              ? `+${formatClock(sessionMs - intentMs)} over`
              : formatClock(sessionMs)}
          </span>
          <span className="sheet-dot" aria-hidden="true" />
          {Math.round(exitRisk.value * 100)}% chance you leave
          <span className="sheet-more">
            <span className="sheet-dot" aria-hidden="true" />
            behind your feed ↑
          </span>
        </span>
      )}
    </button>
  );
}

export default SheetHandle;
