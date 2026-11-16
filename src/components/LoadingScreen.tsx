import "./LoadingScreen.css";

/** How many blocks the loading bar has. */
const BLOCKS = 12;

type LoadingScreenProps = { ready: boolean };

/**
 * Over everything until the hut has been drawn, so the room, the phone and
 * the feed all start together instead of popping in one by one. Then it
 * goes, in a few hard steps.
 */
function LoadingScreen({ ready }: LoadingScreenProps) {
  return (
    <div
      className={ready ? "loading is-ready" : "loading"}
      role="status"
      aria-live="polite"
      aria-busy={!ready}
    >
      {/* The site's icon, big: the eye split into cyan and pink. */}
      <img
        className="loading-eye"
        src={`${import.meta.env.BASE_URL}favicon.svg`}
        width={96}
        height={96}
        alt=""
      />
      <p className="loading-title">{"It's For You"}</p>
      <div className="loading-bar" aria-hidden="true">
        <span className="loading-fill">
          {Array.from({ length: BLOCKS }, (_, i) => (
            <span key={i} className="loading-block" />
          ))}
        </span>
      </div>
      <p className="loading-text">{ready ? "Ready" : "Loading"}</p>
    </div>
  );
}

export default LoadingScreen;
