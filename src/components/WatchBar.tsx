import { QUICK_SKIP_MS } from "../algorithm/signals";
import "./WatchBar.css";

type WatchBarProps = {
  watchMs: number;
  predictedMs: number;
  durationMs: number;
  playing: boolean;
  /** Held because the panel covers the video, not paused by the user. */
  held: boolean;
  /** False before the session starts: only the guess is shown. */
  started: boolean;
};

/** The track is this many times the guess, so the guess sits mid-way... */
const GUESS_ROOM = 2;
/** ...and grows ahead of what you watched once you pass that. */
const WATCH_ROOM = 1.15;

/**
 * How long you have watched, against how long the app predicted you would.
 * The track is scaled to the guess, so the comparison is big enough to feel;
 * watching far past it pushes the guess mark back. The first two seconds are
 * the skip zone: leaving there counts against the video.
 */
function WatchBar({
  watchMs,
  predictedMs,
  durationMs,
  playing,
  held,
  started,
}: WatchBarProps) {
  const scale = Math.max(
    predictedMs * GUESS_ROOM,
    watchMs * WATCH_ROOM,
    QUICK_SKIP_MS * GUESS_ROOM,
  );
  const fill = watchMs / scale;
  const loops = Math.min(Math.floor(watchMs / durationMs), 3);
  const predicted = predictedMs / scale;
  const skip = QUICK_SKIP_MS / scale;
  const passed = watchMs >= predictedMs;

  return (
    <div className="watchbar">
      <div className="watchbar-numbers">
        {started ? (
          <span>
            <span className="watchbar-big">{seconds(watchMs)}</span>
            <span className="tone-muted">
              {" "}
              watched{" "}
              {playing ? "" : held ? "· paused while you read" : "· paused"}
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
