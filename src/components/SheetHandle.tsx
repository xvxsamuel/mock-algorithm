import { formatClock } from "../algorithm/clock";
import type { FeedController } from "../hooks/useFeed";
import "./SheetHandle.css";

type SheetHandleProps = {
  feed: FeedController;
  open: boolean;
  onToggle: () => void;
};

/**
 * The grip of the panel sheet on narrow screens. Closed, it invites you in
 * and still shows the two numbers that matter, live, under the video.
 */
function SheetHandle({ feed, open, onToggle }: SheetHandleProps) {
  const { sessionMs, intentMs, exitRisk } = feed;
  const over = intentMs !== null && sessionMs > intentMs;

  return (
    <button
      type="button"
      className="sheet-handle"
      aria-expanded={open}
      aria-label={open ? "Back to the feed" : undefined}
      onClick={onToggle}
    >
      {open ? (
        <span className="sheet-grip" aria-hidden="true" />
      ) : (
        <>
          <span className="sheet-invite">
            See the algorithm <span aria-hidden="true">↑</span>
          </span>
          <span className="sheet-peek">
            <span className={over ? "tone-take" : undefined}>
              {over && intentMs !== null
                ? `+${formatClock(sessionMs - intentMs)} over`
                : formatClock(sessionMs)}
            </span>
            {Math.round(exitRisk.value * 100)}% chance you leave
          </span>
        </>
      )}
    </button>
  );
}

export default SheetHandle;
