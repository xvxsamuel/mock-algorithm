import { useEffect, useRef } from "react";
import PixelIcon from "./PixelIcon";
import "./PauseCover.css";

type PauseCoverProps = { onResume: () => void };

/**
 * Over the phone while the simulation is paused: the feed can't be
 * scrolled under it, and a press anywhere on it goes on.
 */
function PauseCover({ onResume }: PauseCoverProps) {
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    button.current?.focus({ preventScroll: true });
  }, []);

  return (
    <button
      ref={button}
      type="button"
      className="pause-cover"
      aria-label="Paused. Resume"
      onClick={onResume}
    >
      <span className="pause-cover-box">
        <PixelIcon name="pause" size={32} />
        <span>Paused</span>
      </span>
      <span className="pause-cover-hint">Tap to go on</span>
    </button>
  );
}

export default PauseCover;
