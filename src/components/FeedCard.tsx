import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from "react";
import "./FeedCard.css";

/** A wheel swipe lets the card go once the wheel has been still this long,
    so the rest of a trackpad fling doesn't skip the video under it too. */
const WHEEL_SETTLE_MS = 220;
/** A touch swipe up at least this far keeps scrolling. */
const SWIPE_PX = 40;

type FeedCardProps = {
  /** The id of the card's heading, which names it. */
  labelledBy: string;
  /** Swiped past or "Keep scrolling": the video under it plays. */
  onKeep: () => void;
  /** More buttons, after "Keep scrolling". */
  more?: ReactNode;
  children: ReactNode;
};

/**
 * A card laid over the next video in the feed. A swipe, the arrow down or
 * "Keep scrolling" goes past it to the video.
 */
function FeedCard({ labelledBy, onKeep, more, children }: FeedCardProps) {
  const card = useRef<HTMLDivElement>(null);
  const [going, setGoing] = useState(false);
  const settle = useRef(0);
  const touchFrom = useRef<number | null>(null);

  // The arrow that moves the feed moves past the card.
  const keep = useEffectEvent(onKeep);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "PageDown") return;
      event.preventDefault();
      keep();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(settle.current);
    };
  }, []);

  function onWheel(event: WheelEvent) {
    if (!going && event.deltaY <= 0) return;
    setGoing(true);
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(onKeep, WHEEL_SETTLE_MS);
  }

  function onTouchStart(event: TouchEvent) {
    touchFrom.current = event.touches.item(0)?.clientY ?? null;
  }

  function onTouchEnd(event: TouchEvent) {
    const from = touchFrom.current;
    const to = event.changedTouches.item(0)?.clientY;
    touchFrom.current = null;
    if (from === null || to === undefined) return;
    if (from - to >= SWIPE_PX) onKeep();
  }

  return (
    <div
      ref={card}
      className={going ? "fcard is-going" : "fcard"}
      role="dialog"
      aria-labelledby={labelledBy}
      tabIndex={-1}
      onWheel={onWheel}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="fcard-inner">
        {children}
        <div className="fcard-actions">
          <button
            type="button"
            className="fcard-button is-keep"
            onClick={onKeep}
          >
            Keep scrolling
          </button>
          {more}
        </div>
      </div>
    </div>
  );
}

export default FeedCard;
