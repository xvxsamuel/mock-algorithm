import { useEffect, useRef, useState } from "react";
import AlgorithmPanel from "./components/AlgorithmPanel";
import LinkLayer from "./components/LinkLayer";
import PhoneFeed from "./components/PhoneFeed";
import PlanBreak from "./components/PlanBreak";
import SessionEnd from "./components/SessionEnd";
import SheetHandle from "./components/SheetHandle";
import { useFeed } from "./hooks/useFeed";
import { useLinks } from "./hooks/useLinks";

/** With no limit set, the break card comes this far in. */
const OPEN_BREAK_MS = 3 * 60_000;

function App() {
  const feed = useFeed();
  // Lines from the phone to whatever part of the panel just changed.
  const { links, feedArea, trackPress, removeLink } = useLinks(feed);
  // On narrow screens the panel is a sheet that slides up over the video.
  const [sheetOpen, setSheetOpen] = useState(false);
  // The first video you swipe to past your plan (3 min in, with no limit)
  // waits under a card of what you gave so far. Once a session.
  const [breakSeen, setBreakSeen] = useState(false);
  const planBreak =
    feed.started &&
    !feed.ended &&
    !breakSeen &&
    feed.current.clockAt >= (feed.intentMs ?? OPEN_BREAK_MS);
  const { hold, end, resume } = feed;
  // Reading the panel or the card is not watching: the video and the
  // session clock wait.
  const held = sheetOpen || planBreak;
  useEffect(() => {
    hold(held);
  }, [held, hold]);
  // The Leave button, so focus goes back to it after.
  const leftFrom = useRef<HTMLElement | null>(null);
  // Leaving closes the sheet first, so the video is where you left it.
  function leave(button: HTMLElement | null) {
    leftFrom.current = button;
    setSheetOpen(false);
    setBreakSeen(true);
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
              onKeep={() => setBreakSeen(true)}
              onLeave={() => leave(null)}
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
