import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { advertiserOf } from "../data/ads";
import type { FeedController } from "../hooks/useFeed";
import CommentsSheet from "./CommentsSheet";
import Icon from "./Icon";
import ShareSheet from "./ShareSheet";
import VideoCard from "./VideoCard";
import "./PhoneFeed.css";

/** Only cards this close to the one on screen are actually rendered. */
const RENDER_DISTANCE = 2;
/** How long a message like "Link copied" stays on screen. */
const TOAST_MS = 1800;
/** A mouse that moves this far while pressed, in page pixels, is swiping. */
const DRAG_START_PX = 8;
/** Dragging this share of a card moves to the next one when you let go. */
const SWIPE_SHARE = 0.2;
/** Or flicking this fast, in page pixels per millisecond. */
const FLICK_SPEED = 0.4;
/** How long a swipe may take to land before the cards snap again anyway. */
const LAND_MS = 800;

/** A mouse press on the feed, which may turn into a swipe. */
type Drag = {
  pointer: number;
  /** The card on screen when the press began. */
  from: number;
  startY: number;
  startTop: number;
  /** Feed pixels per page pixel: the phone in the hut may be scaled. */
  scale: number;
  lastY: number;
  lastTime: number;
  /** Page pixels per millisecond; positive is down. */
  speed: number;
  swiping: boolean;
};

type Sheet = "comments" | "share" | null;

type PhoneFeedProps = {
  feed: FeedController;
  /** Told how far the feed is scrolled, in videos, whenever that changes:
      1.5 is half way from the second video to the third. */
  onScrolled?: (videos: number) => void;
  /** Laid over the screen, like the cards that come over a video. */
  children?: ReactNode;
};

/** The TikTok-like side: a phone with an endless vertical feed. */
function PhoneFeed({ feed, onScrolled, children }: PhoneFeedProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  // Comments the user posted, per video id. Kept only in this page.
  const [myComments, setMyComments] = useState<Record<string, string[]>>({});
  const { items, activeIndex, view } = feed;
  const activeVideo = items[activeIndex].video;
  // The card height when the feed last settled, and the video on screen.
  // A resize changes the height: the same video should stay on screen.
  const cardHeight = useRef(0);
  const shownIndex = useRef(activeIndex);
  // Mouse swipes: touch scrolls the feed by itself, a mouse only clicks.
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  // The click that ends a swipe is not a tap on the video.
  const swallowClick = useRef(false);

  useEffect(() => {
    shownIndex.current = activeIndex;
  }, [activeIndex]);

  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    cardHeight.current = element.clientHeight;
    const observer = new ResizeObserver(() => keepCard(element));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /** After a resize, puts the video that was on screen back on screen. */
  function keepCard(element: HTMLElement): boolean {
    if (element.clientHeight === cardHeight.current) return false;
    cardHeight.current = element.clientHeight;
    element.scrollTo({
      top: shownIndex.current * element.clientHeight,
      behavior: "instant",
    });
    return true;
  }

  // Arrow keys move between videos, like TikTok on desktop.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (sheet !== null) {
        if (event.key === "Escape") setSheet(null);
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      if (!feed.started || feed.ended || feed.held) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      scrollToCard(scroller.current, activeIndex + step);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, sheet, feed.started, feed.ended, feed.held]);

  useEffect(() => {
    if (toast === null) return;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function handleScroll() {
    const element = scroller.current;
    if (!element) return;
    // A resize moved the cards, not a swipe.
    if (keepCard(element)) return;
    const videos = element.scrollTop / element.clientHeight;
    onScrolled?.(videos);
    const index = Math.round(videos);
    if (index !== activeIndex) view(index);
  }

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    swallowClick.current = false;
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if (!feed.started || feed.ended || feed.held || sheet !== null) return;
    const element = event.currentTarget;
    const height = element.getBoundingClientRect().height;
    drag.current = {
      pointer: event.pointerId,
      from: Math.round(element.scrollTop / element.clientHeight),
      startY: event.clientY,
      startTop: element.scrollTop,
      scale: height > 0 ? element.clientHeight / height : 1,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      speed: 0,
      swiping: false,
    };
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const press = drag.current;
    if (press === null || press.pointer !== event.pointerId) return;
    const moved = event.clientY - press.startY;
    if (!press.swiping) {
      if (Math.abs(moved) < DRAG_START_PX) return;
      press.swiping = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      window.getSelection()?.removeAllRanges();
      setDragging(true);
    }
    const time = event.timeStamp - press.lastTime;
    if (time > 0) press.speed = (event.clientY - press.lastY) / time;
    press.lastY = event.clientY;
    press.lastTime = event.timeStamp;
    event.currentTarget.scrollTop = press.startTop - moved * press.scale;
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const press = drag.current;
    if (press === null || press.pointer !== event.pointerId) return;
    drag.current = null;
    if (!press.swiping) return;
    swallowClick.current = true;
    const element = event.currentTarget;
    // In cards, positive when the feed moved on to later videos.
    const travel =
      ((press.startY - event.clientY) * press.scale) / element.clientHeight;
    let target = press.from;
    if (travel > SWIPE_SHARE || press.speed < -FLICK_SPEED) target += 1;
    else if (travel < -SWIPE_SHARE || press.speed > FLICK_SPEED) target -= 1;
    target = Math.max(0, Math.min(target, items.length - 1));
    // Snapping stays off until the feed lands, so it cannot pull the cards
    // back half way.
    const land = () => {
      window.clearTimeout(fallback);
      element.removeEventListener("scrollend", land);
      setDragging(false);
    };
    const fallback = window.setTimeout(land, LAND_MS);
    element.addEventListener("scrollend", land);
    scrollToCard(element, target);
  }

  function swallowSwipeClick(event: MouseEvent<HTMLDivElement>) {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  }

  function openComments() {
    setSheet("comments");
    feed.react("comments");
  }

  function postComment(text: string) {
    const id = activeVideo.id;
    setMyComments((all) => ({ ...all, [id]: [text, ...(all[id] ?? [])] }));
    feed.react("comment");
  }

  function share(message: string) {
    setSheet(null);
    setToast(message);
    feed.react("share");
  }

  function notInterested() {
    setSheet(null);
    feed.react("notInterested");
    scrollToCard(scroller.current, activeIndex + 1);
  }

  function placeholder(message: string) {
    setSheet(null);
    setToast(message);
  }

  return (
    <div className="phone">
      <div className="phone-top">
        <span className="phone-tab">Following</span>
        <span className="phone-tab is-active">For You</span>
        <span className="phone-search">
          <Icon name="search" size={22} />
        </span>
      </div>

      <div
        className={[
          "phone-feed",
          feed.started ? "" : "is-locked",
          dragging ? "is-dragging" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        ref={scroller}
        onScroll={handleScroll}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={swallowSwipeClick}
        onDragStart={(event) => event.preventDefault()}
      >
        {items.map((item, index) => (
          <div className="phone-slot" key={item.key}>
            {Math.abs(index - activeIndex) <= RENDER_DISTANCE && (
              <VideoCard
                video={item.video}
                sponsor={advertiserOf(item.video)}
                active={index === activeIndex}
                playing={feed.playing}
                impressionIndex={feed.current.index}
                liked={feed.likedIds.includes(item.video.id)}
                saved={feed.savedIds.includes(item.video.id)}
                following={feed.followedCreators.includes(item.video.creator)}
                shared={
                  index === activeIndex && feed.current.interactions.shared
                }
                myCommentCount={myComments[item.video.id]?.length ?? 0}
                onTogglePause={feed.togglePause}
                onReact={feed.react}
                onOpenComments={openComments}
                onOpenShare={() => setSheet("share")}
              />
            )}
          </div>
        ))}
      </div>

      <nav className="phone-nav" aria-label="App navigation (decorative)">
        <span className="phone-nav-item is-active">
          <Icon name="home" size={22} />
          Home
        </span>
        <span className="phone-nav-item">
          <Icon name="friends" size={22} />
          Friends
        </span>
        <span className="phone-nav-create">
          <Icon name="plus" size={18} />
        </span>
        <span className="phone-nav-item">
          <Icon name="inbox" size={22} />
          Inbox
        </span>
        <span className="phone-nav-item">
          <Icon name="profile" size={22} />
          Profile
        </span>
      </nav>

      {sheet !== null && (
        <>
          <button
            type="button"
            className="phone-backdrop"
            aria-label="Close"
            onClick={() => setSheet(null)}
          />
          <div
            className={
              sheet === "comments" ? "phone-sheet is-tall" : "phone-sheet"
            }
          >
            {sheet === "comments" ? (
              <CommentsSheet
                video={activeVideo}
                myComments={myComments[activeVideo.id] ?? []}
                onPost={postComment}
                onClose={() => setSheet(null)}
              />
            ) : (
              <ShareSheet
                onShare={share}
                onNotInterested={notInterested}
                onPlaceholder={placeholder}
                onClose={() => setSheet(null)}
              />
            )}
          </div>
        </>
      )}

      {children}

      {toast !== null && (
        <div className="phone-toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function scrollToCard(element: HTMLElement | null, index: number) {
  if (!element || index < 0) return;
  element.scrollTo({ top: index * element.clientHeight, behavior: "smooth" });
}

export default PhoneFeed;
