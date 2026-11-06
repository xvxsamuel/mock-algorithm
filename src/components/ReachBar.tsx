import { FOLLOWERS_ONLY } from "../algorithm/appearance";
import "./ReachBar.css";

/** The bar runs from nothing to this many times an ordinary video's reach. */
const SCALE = 1.6;

type ReachBarProps = {
  /** 1 = an ordinary video's For You reach. */
  reach: number;
};

/**
 * How many people the engine shows a video to, against an ordinary video
 * (the tick). Kept out of For You, only a pink sliver is left.
 */
function ReachBar({ reach }: ReachBarProps) {
  const cut = reach <= FOLLOWERS_ONLY;
  return (
    <span className={cut ? "reach is-cut" : "reach"}>
      <span className="reach-track">
        <span
          className="reach-fill"
          style={{ width: `${(Math.min(reach, SCALE) / SCALE) * 100}%` }}
        />
        <span className="reach-tick" style={{ left: `${100 / SCALE}%` }} />
      </span>
      <span className="reach-value">
        {cut ? "followers only" : `×${reach.toFixed(1)}`}
      </span>
    </span>
  );
}

export default ReachBar;
