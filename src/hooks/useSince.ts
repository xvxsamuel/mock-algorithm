import { useEffect, useState } from "react";

/**
 * Milliseconds since `start` (an epoch time), redrawn every frame for
 * `forMs` after it, so an animation can be driven from one clock. Null
 * while `start` is null. With reduced motion it jumps straight to the end.
 */
export function useSince(start: number | null, forMs: number): number | null {
  // Starts at mount time, so a lens opened mid-animation does not replay it.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (start === null) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const step = () => {
      const time = still ? start + forMs : Date.now();
      setNow(time);
      if (time - start < forMs) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [start, forMs]);

  return start === null ? null : Math.max(now - start, 0);
}
