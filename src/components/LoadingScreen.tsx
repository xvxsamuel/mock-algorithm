import { useEffect, useRef } from "react";
import "./LoadingScreen.css";

/** How many blocks the loading bar has. */
const BLOCKS = 12;
/** Never stall startup if the logo image takes too long or fails to load. */
const LOGO_TIMEOUT_MS = 1500;

type LoadingScreenProps = {
  /** Real loading progress, from 0 to 1. */
  progress: number;
  ready: boolean;
  /** Called once the logo image has decoded (or timed out) so heavy WebGL
      setup does not block the page before the logo paints. */
  onLogoReady?: () => void;
};

/**
 * Over everything until the hut has been drawn, so the room, the phone and
 * the feed all start together instead of popping in one by one. Then it
 * goes, in a few hard steps.
 */
function LoadingScreen({ progress, ready, onLogoReady }: LoadingScreenProps) {
  const eyeRef = useRef<HTMLImageElement>(null);
  const onLogoReadyRef = useRef(onLogoReady);
  useEffect(() => {
    onLogoReadyRef.current = onLogoReady;
  });

  useEffect(() => {
    const img = eyeRef.current;
    if (img === null) {
      onLogoReadyRef.current?.();
      return;
    }

    let cancelled = false;
    let settled = false;
    const finish = () => {
      if (cancelled || settled) return;
      settled = true;
      window.clearTimeout(timer);
      onLogoReadyRef.current?.();
    };
    const decodeAndFinish = () => {
      if (typeof img.decode === "function") {
        img.decode().then(finish, finish);
      } else {
        finish();
      }
    };

    const timer = window.setTimeout(finish, LOGO_TIMEOUT_MS);

    if (img.complete) {
      if (img.naturalWidth > 0) {
        decodeAndFinish();
      } else {
        finish();
      }
    } else {
      img.addEventListener("load", decodeAndFinish, { once: true });
      img.addEventListener("error", finish, { once: true });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      img.removeEventListener("load", decodeAndFinish);
      img.removeEventListener("error", finish);
    };
  }, []);

  const clamped = ready ? 1 : Math.min(Math.max(progress, 0), 1);
  const percent = Math.round(clamped * 100);
  const filled = ready
    ? BLOCKS
    : Math.min(BLOCKS - 1, Math.floor(clamped * BLOCKS + 1e-6));

  return (
    <div
      className={ready ? "loading is-ready" : "loading"}
      role="status"
      aria-live="polite"
      aria-busy={!ready}
    >
      {/* The site's eye, drawn finer than the favicon so its pixels match
          the title type's: cyan and pink split behind it like the title. */}
      <img
        ref={eyeRef}
        className="loading-eye"
        src={`${import.meta.env.BASE_URL}eye.svg`}
        width={96}
        height={96}
        decoding="sync"
        fetchPriority="high"
        alt=""
      />
      <p className="loading-title">{"It's For You"}</p>
      <div
        className="loading-bar"
        role="progressbar"
        aria-label="Loading scene"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <span className="loading-fill" aria-hidden="true">
          {Array.from({ length: BLOCKS }, (_, i) => (
            <span
              key={i}
              className={
                i < filled ? "loading-block is-filled" : "loading-block"
              }
            />
          ))}
        </span>
      </div>
      <p className="loading-text">{ready ? "Ready" : `Loading ${percent}%`}</p>
    </div>
  );
}

export default LoadingScreen;
