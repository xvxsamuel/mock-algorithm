import { QUICK_SKIP_MS } from "../algorithm/signals";
import "./WatchBar.css";

type WatchBarProps = {
  watchMs: number;
  predictedMs: number;
  durationMs: number;
  playing: boolean;
  /** False before the session starts: only the guess is shown. */
  started: boolean;
};

/**
 * How long you have watched, against how long the app predicted you would.
 * The first two seconds are the skip zone: leaving there counts against the video.
 */
function WatchBar({
  watchMs,
  predictedMs,
  durationMs,
  playing,
  started,
}: WatchBarProps) {
  const ratio = watchMs / durationMs;
  const fill = Math.min(ratio, 1);
  const loops = Math.min(Math.floor(ratio), 3);
  const predicted = Math.min(predictedMs / durationMs, 1);
  const skip = Math.min(QUICK_SKIP_MS / durationMs, 1);
  const passed = watchMs >= predictedMs;

  return (
    <div className="watchbar">
      <div className="watchbar-numbers">
        {started ? (
          <span>
            <span className="watchbar-big">{seconds(watchMs)}</span>
            <span className="tone-muted">
              {" "}
              watched {playing ? "" : "· paused"}
            </span>
          </span>
        ) : (
          <span />
        )}
        <span className={passed ? "tone-you" : "tone-muted"}>
          predicted {seconds(predictedMs)}
          {passed ? " ✓" : ""}
        </span>
      </div>
      <div className="watchbar-track">
        {started && (
          <span className="watchbar-skip" style={{ width: `${skip * 100}%` }} />
        )}
        <span className="watchbar-fill" style={{ width: `${fill * 100}%` }} />
        <span
          className={passed ? "watchbar-mark is-passed" : "watchbar-mark"}
          style={{ left: `${predicted * 100}%` }}
        />
        {loops > 0 && <span className="watchbar-loops">×{loops + 1}</span>}
      </div>
    </div>
  );
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export default WatchBar;
