import { useEffect, useRef, useState } from "react";
import AlgorithmPanel from "./components/AlgorithmPanel";
import ChainCard from "./components/ChainCard";
import LinkLayer from "./components/LinkLayer";
import PhoneFeed from "./components/PhoneFeed";
import PlanBreak from "./components/PlanBreak";
import RoomScene from "./components/RoomScene";
import SessionEnd from "./components/SessionEnd";
import SheetHandle from "./components/SheetHandle";
import { useFeed } from "./hooks/useFeed";
import { useHash } from "./hooks/useHash";
import { useLinks } from "./hooks/useLinks";

/** With no limit set, the break card comes this far in. */
const OPEN_BREAK_MS = 3 * 60_000;
/** Videos you watch before the "why this video" card can come. */
const WHY_AFTER = 3;

function App() {
  // A prototype lives at #room: the feed from your own eyes, in a 3D room.
  return useHash() === "#room" ? <RoomScene /> : <SplitView />;
}

/** The phone on the left, what the algorithm sees on the right. */
function SplitView() {
  const feed = useFeed();
  // Lines from the phone to whatever part of the panel just changed.
  const { links, feedArea, trackPress, removeLink } = useLinks(feed);
  // On narrow screens the panel is a sheet that slides up over the video.
  const [sheetOpen, setSheetOpen] = useState(false);
  // Two cards come over a video in the feed, each once a session and never
  // both on one video. Each remembers the video it was passed on.
  const [breakAt, setBreakAt] = useState<number | null>(null);
  const [whyAt, setWhyAt] = useState<number | null>(null);
  const { current } = feed;
  const live = feed.started && !feed.ended;
  // The first video you swipe to past your plan (3 min in, with no limit)
  // waits under what you gave so far.
  const planBreak =
    live &&
    !current.revisit &&
    breakAt === null &&
    whyAt !== current.index &&
    current.clockAt >= (feed.intentMs ?? OPEN_BREAK_MS);
  // The first video it picked because of what you watched waits under why.
  const cause =
    live &&
    !planBreak &&
    whyAt === null &&
    breakAt !== current.index &&
    !current.revisit &&
    feed.history.length >= WHY_AFTER
      ? feed.currentItem.cause
      : null;
  const { hold, end, resume } = feed;
  // Reading the panel or a card is not watching: the video and the
  // session clock wait.
  const held = sheetOpen || planBreak || cause !== null;
  useEffect(() => {
    hold(held);
  }, [held, hold]);
  // The Leave button, so focus goes back to it after.
  const leftFrom = useRef<HTMLElement | null>(null);
  // Leaving closes the sheet first, so the video is where you left it.
  function leave(button: HTMLElement | null) {
    leftFrom.current = button;
    setSheetOpen(false);
    if (breakAt === null) setBreakAt(current.index);
    if (cause !== null) setWhyAt(current.index);
    hold(false);
    end();
  }
  // Widened past the sheet layout: the panel is beside the video again.
  useEffect(() => {
    const wide = window.matchMedia("(min-width: 901px)");
    function onChange() {
      if (wide.matches) setSheetOpen(false);
    }
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return (
    <main className="app">
      <section
        className="app-feed"
        aria-label="Video feed"
        inert={feed.ended}
        ref={feedArea}
        onPointerDownCapture={trackPress}
      >
        <PhoneFeed feed={feed}>
          {planBreak && (
            <PlanBreak
              feed={feed}
              onKeep={() => setBreakAt(current.index)}
              onLeave={() => leave(null)}
            />
          )}
          {cause !== null && (
            <ChainCard
              cause={cause}
              video={current.video}
              onKeep={() => setWhyAt(current.index)}
            />
          )}
        </PhoneFeed>
      </section>
      <section
        className={sheetOpen ? "app-panel is-open" : "app-panel"}
        aria-label="What the algorithm sees"
        inert={feed.ended}
      >
        <SheetHandle
          feed={feed}
          open={sheetOpen}
          onToggle={() => setSheetOpen(!sheetOpen)}
        />
        <AlgorithmPanel feed={feed} onLeave={leave} />
      </section>
      <LinkLayer links={links} onDone={removeLink} />
      {feed.ended && (
        <SessionEnd
          feed={feed}
          onBack={resume}
          returnTo={leftFrom}
          onRestart={() => window.location.reload()}
        />
      )}
    </main>
  );
}

export default App;
