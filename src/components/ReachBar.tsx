import { FOLLOWERS_ONLY } from "../algorithm/appearance";
import "./ReachBar.css";

/** The bar runs from nothing to this many times an ordinary video's reach. */
const SCALE = 1.6;

type ReachBarProps = {
  /** 1 = an ordinary video's For You reach. */
  reach: number;
  /** Cyan: your own reach. */
  you?: boolean;
  /** Name the tick: "×1", an ordinary video. */
  tickLabel?: boolean;
  /** A word over the bar ("reach"). Hidden keeps its room, so bars in a
      row line up when only the first is named. */
  label?: { text: string; hidden?: boolean };
};

/**
 * How many people the engine shows a video to, against an ordinary video
 * (the tick). Kept out of For You, only a pink sliver is left.
 */
function ReachBar({
  reach,
  you = false,
  tickLabel = false,
  label,
}: ReachBarProps) {
  const cut = reach <= FOLLOWERS_ONLY;
  const tone = cut ? " is-cut" : you ? " is-you" : "";
  return (
    <span className={`reach${tone}`}>
      {label !== undefined && (
        <span
          className={label.hidden ? "reach-label is-hidden" : "reach-label"}
          aria-hidden={label.hidden}
        >
          {label.text}
        </span>
      )}
      <span className="reach-track">
        <span
          className="reach-fill"
          style={{ width: `${(Math.min(reach, SCALE) / SCALE) * 100}%` }}
        />
        <span className="reach-tick" style={{ left: `${100 / SCALE}%` }}>
          {tickLabel && <span className="reach-tick-label">×1</span>}
        </span>
      </span>
      <span className="reach-value">
        {cut ? (
          <>
            followers<span className="reach-only"> only</span>
          </>
        ) : (
          `×${reach.toFixed(1)}`
        )}
      </span>
    </span>
  );
}

export default ReachBar;
