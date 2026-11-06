import { faceReach, faceRule } from "../algorithm/appearance";
import { CATEGORY_COLORS } from "../data/categories";
import { FACE_SWAPS } from "../data/scans";
import type { Video } from "../data/videos";
import { useUserCam, type CamStatus } from "../hooks/useUserCam";
import Icon from "./Icon";
import ReachBar from "./ReachBar";
import "./FaceSwap.css";

type FaceSwapProps = {
  video: Video;
  /** Changes with every new video, so the bars grow in again. */
  scanKey: number;
};

/**
 * The same video with someone else on camera, and how far each one travels.
 * The last tile is you: turn on the camera and it scores your frame as if you
 * had posted this video. Frames are scored on this device and thrown away.
 */
function FaceSwap({ video, scanKey }: FaceSwapProps) {
  // Destructured: the linter treats any object holding a ref as a ref.
  const { videoRef, status, reading, start, stop } = useUserCam();
  const [from, to] = CATEGORY_COLORS[video.category];
  const background = `linear-gradient(160deg, ${from}, ${to})`;
  const on = status === "on";
  const score = on && reading !== null && reading.scorable ? reading : null;

  return (
    <section className="pane con-swap">
      <div className="pane-head">
        <h2 className="eyebrow">Same video, different face</h2>
      </div>
      <ul className="swap">
        {FACE_SWAPS.map((face) => {
          const rule = faceRule(face);
          return (
            <li
              key={face.emoji}
              className={rule === null ? "swap-tile" : "swap-tile is-cut"}
            >
              <span
                className="swap-thumb"
                style={{ backgroundImage: background }}
              >
                <span className="swap-art" aria-hidden="true">
                  {video.emoji}
                </span>
                <span className="swap-face" aria-hidden="true">
                  {face.emoji}
                </span>
              </span>
              <span className="swap-looks">
                {rule === null ? (
                  <>
                    looks <b>{face.looks.toFixed(1)}</b>
                  </>
                ) : (
                  <>
                    <q className="swap-rule">{rule}</q>
                    <span className="swap-age">
                      age <b>{face.age}</b>
                    </span>
                  </>
                )}
              </span>
              <ReachBar key={scanKey} reach={faceReach(face)} />
            </li>
          );
        })}

        {/* You, if you posted this. Off until you ask for it. */}
        <li
          className={
            score === null ? "swap-tile is-you" : "swap-tile is-you is-scored"
          }
        >
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
                <Icon name="camera" />
              </button>
            )}
            {on && (
              <>
                <button
                  type="button"
                  className="swap-off"
                  onClick={stop}
                  aria-label="Turn off the camera"
                >
                  ×
                </button>
                <span className="swap-local">
                  <span className="swap-local-long">stays </span>on device
                </span>
              </>
            )}
          </span>
          <span className="swap-looks">
            {score === null ? (
              <span className="tone-you">
                {youNote(status, reading === null)}
              </span>
            ) : (
              <>
                your frame <b>{score.score.toFixed(1)}</b>
              </>
            )}
          </span>
          {score === null ? (
            <span className="swap-private">stays on this device</span>
          ) : (
            <ReachBar key={scanKey} reach={score.reach} you />
          )}
        </li>
      </ul>
      <p className="swap-source">
        <q>too many wrinkles</q>: leaked TikTok moderation rules, 2019–20
        (TikTok says no longer used)
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
  return "if you posted it";
}

export default FaceSwap;
