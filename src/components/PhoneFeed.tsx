import { useEffect, useRef, useState } from "react";
import { advertiserOf } from "../data/ads";
import type { FeedController } from "../hooks/useFeed";
import CommentsSheet from "./CommentsSheet";
import Icon from "./Icon";
import ShareSheet from "./ShareSheet";
import StartGate from "./StartGate";
import VideoCard from "./VideoCard";
import "./PhoneFeed.css";

/** Only cards this close to the one on screen are actually rendered. */
const RENDER_DISTANCE = 2;
/** How long a message like "Link copied" stays on screen. */
const TOAST_MS = 1800;

type Sheet = "comments" | "share" | null;

type PhoneFeedProps = { feed: FeedController };

/** The TikTok-like side: a phone with an endless vertical feed. */
function PhoneFeed({ feed }: PhoneFeedProps) {
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
      if (!feed.started || feed.ended) return;
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      scrollToCard(scroller.current, activeIndex + step);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeIndex, sheet, feed.started, feed.ended]);

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
    const index = Math.round(element.scrollTop / element.clientHeight);
    if (index !== activeIndex) view(index);
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
        className={feed.started ? "phone-feed" : "phone-feed is-locked"}
        ref={scroller}
        onScroll={handleScroll}
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

      {!feed.started && <StartGate onStart={feed.begin} />}

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
