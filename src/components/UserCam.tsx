import {
  FACE_BOX,
  type AppearanceReading,
  type FactorReading,
} from "../algorithm/appearance";
import { useUserCam } from "../hooks/useUserCam";
import "./UserCam.css";

/** Characters in a factor bar like ██████░░░░. */
const BAR_WIDTH = 10;

/**
 * A small webcam window in the bottom-right corner with a mock "predicted
 * attractiveness" score. It treats the camera as a video you are about to
 * post, because that is where TikTok's documented face analysis happens.
 */
function UserCam() {
  const { videoRef, status, reading, start, stop } = useUserCam();
  const on = status === "on";

  return (
    <aside className="cam" aria-label="User cam">
      <header className="cam-head">
        <h2 className="cam-title">User cam</h2>
        {on ? (
          <span className="cam-live">
            <span className="cam-dot" aria-hidden="true">
              ●
            </span>{" "}
            camera on
          </span>
        ) : (
          <span className="cam-muted">off</span>
        )}
        {on && (
          <button type="button" className="cam-button" onClick={stop}>
            Turn off
          </button>
        )}
      </header>

      {on ? (
        <>
          <div className="cam-view">
            <video
              ref={videoRef}
              aria-label="Your camera, mirrored"
              autoPlay
              muted
              playsInline
            />
            <span
              className="cam-box"
              style={{
                left: `${FACE_BOX.left * 100}%`,
                right: `${(1 - FACE_BOX.right) * 100}%`,
                top: `${FACE_BOX.top * 100}%`,
                bottom: `${(1 - FACE_BOX.bottom) * 100}%`,
              }}
            >
              <span className="cam-tag">{boxLabel(reading)}</span>
            </span>
          </div>
          {prediction(reading)}
        </>
      ) : (
        <div className="cam-intro">
          <p>
            What would an appearance model make of you, if this were a video you
            posted?
          </p>
          <button
            type="button"
            className="cam-button is-primary"
            onClick={() => void start()}
            disabled={status === "starting"}
          >
            {status === "starting"
              ? "Waiting for permission…"
              : "Turn on camera"}
          </button>
          {status === "blocked" && (
            <p className="cam-warn">
              Camera access was blocked. Allow it in the address bar, then try
              again.
            </p>
          )}
          {status === "unavailable" && (
            <p className="cam-warn">
              No camera found, or this browser can't use one here.
            </p>
          )}
        </div>
      )}

      <p className="cam-muted">
        Runs on your device. Nothing is sent or saved.
      </p>

      <details className="cam-why">
        <summary>Why is this here?</summary>
        <p>
          <strong>This score is a mock.</strong> It only measures light,
          contrast, sharpness and symmetry, so it rates your lamp and camera,
          not your looks. Real beauty-score models react to the same things and
          show skin-tone bias.
        </p>
        <p>
          TikTok is not known to scan viewers through the camera. It does
          analyse faces in posted videos to estimate age and gender (
          <a
            href="https://www.priv.gc.ca/en/opc-actions-and-decisions/investigations/investigations-into-businesses/2025/pipeda-2025-003"
            target="_blank"
            rel="noreferrer"
          >
            Canadian regulators, 2025
          </a>
          ). Leaked 2019–20 rules kept "ugly" or fat users out of For You (
          <a
            href="https://theintercept.com/2020/03/16/tiktok-app-moderators-users-discrimination/"
            target="_blank"
            rel="noreferrer"
          >
            The Intercept
          </a>
          ), and a 2024 lawsuit alleges TikTok changed its algorithm to show
          fewer "not attractive subjects" (
          <a
            href="https://www.ksl.com/article/51153439/tiktok-was-aware-of-risks-kids-and-teens-face-on-its-platform-legal-document-alleges"
            target="_blank"
            rel="noreferrer"
          >
            AP
          </a>
          ). TikTok disputes both.
        </p>
      </details>
    </aside>
  );
}

/** The score, its four factors and what it would do to a video's reach. */
function prediction(reading: AppearanceReading | null) {
  if (reading === null) {
    return <p className="cam-muted">scanning…</p>;
  }
  if (!reading.scorable) {
    return <p className="cam-warn">Nothing to score. Is the camera covered?</p>;
  }
  const change = Math.round((reading.reach - 1) * 100);
  return (
    <div className="cam-result">
      <p className="cam-score">
        <span className="cam-muted">predicted_attractiveness</span>{" "}
        <strong>{reading.score.toFixed(1)}</strong>
        <span className="cam-muted">/10</span>{" "}
        <span className="cam-badge">MOCK</span>
      </p>
      <ul className="cam-factors">
        {reading.factors.map((factor) => (
          <li key={factor.factor}>
            <span>{factor.factor}</span>
            {factorBar(factor)}
          </li>
        ))}
      </ul>
      <p>
        <span className="cam-muted">if you posted this: For You reach</span>{" "}
        <strong className={change >= 0 ? "cam-up" : "cam-down"}>
          ×{reading.reach.toFixed(2)}
        </strong>{" "}
        <span className="cam-muted">
          ({change >= 0 ? "+" : "−"}
          {Math.abs(change)}% viewers)
        </span>
      </p>
    </div>
  );
}

function boxLabel(reading: AppearanceReading | null): string {
  if (reading === null) return "scanning…";
  if (!reading.scorable) return "no face?";
  return `attractiveness ${reading.score.toFixed(1)}`;
}

function factorBar({ value }: FactorReading) {
  const filled = Math.round(value * BAR_WIDTH);
  return (
    <span aria-label={`${Math.round(value * 100)}%`}>
      <span className="cam-fill">{"█".repeat(filled)}</span>
      <span className="cam-empty">{"░".repeat(BAR_WIDTH - filled)}</span>
    </span>
  );
}

export default UserCam;
