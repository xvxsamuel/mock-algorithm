import { FOLLOWERS_ONLY, reachOf } from "../algorithm/appearance";
import { CATEGORY_COLORS } from "../data/categories";
import { FACE_SWAPS } from "../data/scans";
import type { Video } from "../data/videos";
import { useUserCam, type CamStatus } from "../hooks/useUserCam";
import ReachBar from "./ReachBar";
import "./FaceSwap.css";

type FaceSwapProps = { video: Video };

/**
 * The same video with someone else on camera, and how far each one travels.
 * The last tile is you: turn on the camera and it scores your frame as if you
 * had posted this video. Frames are scored on this device and thrown away.
 */
function FaceSwap({ video }: FaceSwapProps) {
  // Destructured: the linter treats any object holding a ref as a ref.
  const { videoRef, status, reading, start, stop } = useUserCam();
  const [from, to] = CATEGORY_COLORS[video.category];
  const background = `linear-gradient(160deg, ${from}, ${to})`;
  const on = status === "on";
  const scored = on && reading !== null && reading.scorable;

  return (
    <section className="pane con-swap">
      <div className="pane-head">
        <h2 className="eyebrow">Same video, different face</h2>
      </div>
      <ul className="swap">
        {FACE_SWAPS.map((swap) => (
          <li
            key={swap.face}
            className={swap.rule === null ? "swap-tile" : "swap-tile is-cut"}
          >
            <span
              className="swap-thumb"
              style={{ backgroundImage: background }}
            >
              <span className="swap-art" aria-hidden="true">
                {video.emoji}
              </span>
              <span className="swap-face" aria-hidden="true">
                {swap.face}
              </span>
            </span>
            <span className="swap-looks">
              {swap.looks === null ? (
                <q>{swap.rule}</q>
              ) : (
                <>
                  looks <b>{swap.looks.toFixed(1)}</b>
                </>
              )}
            </span>
            <ReachBar
              reach={swap.looks === null ? FOLLOWERS_ONLY : reachOf(swap.looks)}
            />
          </li>
        ))}

        {/* You, if you posted this. Off until you ask for it. */}
        <li className="swap-tile is-you">
          <span className="swap-thumb" style={{ backgroundImage: background }}>
            <span className="swap-art" aria-hidden="true">
              {video.emoji}
            </span>
            {on ? (
              <span className="swap-face is-cam">
                <video
                  ref={videoRef}
                  aria-label="Your camera, mirrored"
                  autoPlay
                  muted
                  playsInline
                />
              </span>
            ) : (
              <button
                type="button"
                className="swap-face is-empty"
                onClick={() => void start()}
                disabled={status === "starting"}
                aria-label="Put your face in: turn on the camera"
              >
                +
              </button>
            )}
            {on && (
              <button
                type="button"
                className="swap-off"
                onClick={stop}
                aria-label="Turn off the camera"
              >
                ×
              </button>
            )}
          </span>
          <span className="swap-looks">
            {scored && reading !== null ? (
              <>
                you <b>{reading.score.toFixed(1)}</b>
              </>
            ) : (
              <span className="tone-you">
                {youNote(status, reading === null)}
              </span>
            )}
          </span>
          {scored && reading !== null ? (
            <ReachBar reach={reading.reach} />
          ) : (
            <span className="swap-private">stays on this device</span>
          )}
        </li>
      </ul>
      <p className="swap-source">
        <q>too many wrinkles</q>: leaked TikTok moderation rules, 2019–20
      </p>
    </section>
  );
}

/** What the "you" tile says until it has a score. */
function youNote(status: CamStatus, waiting: boolean): string {
  if (status === "on") return waiting ? "scanning…" : "no face?";
  if (status === "starting") return "allow camera…";
  if (status === "blocked") return "camera blocked";
  if (status === "unavailable") return "no camera";
  return "you?";
}

export default FaceSwap;
