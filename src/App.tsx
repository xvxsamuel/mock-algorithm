import AlgorithmPanel from "./components/AlgorithmPanel";
import ChainCard from "./components/ChainCard";
import LinkLayer from "./components/LinkLayer";
import PauseCover from "./components/PauseCover";
import PhoneFeed from "./components/PhoneFeed";
import PlanBreak from "./components/PlanBreak";
import RoomScene from "./components/RoomScene";
import SessionEnd from "./components/SessionEnd";
import SheetHandle from "./components/SheetHandle";
import { useFeed } from "./hooks/useFeed";
import { useHash } from "./hooks/useHash";
import { useLinks } from "./hooks/useLinks";
import { useReveal } from "./hooks/useReveal";
import { useSession } from "./hooks/useSession";

function App() {
  // The feed from your own eyes, in a 3D room. The flat view it grew out of
  // is still at #split.
  return useHash() === "#split" ? <SplitView /> : <RoomScene />;
}

/** The phone on the left, what the algorithm sees on the right. */
function SplitView() {
  const feed = useFeed();
  // Lines from the phone to whatever part of the panel just changed.
  const { links, feedArea, trackPress, pathOf, removeLink } = useLinks(feed);
  const session = useSession(feed);
  const reveal = useReveal(feed);
  const { current } = feed;

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
          {session.planBreak && (
            <PlanBreak
              feed={feed}
              onKeep={session.keepBreak}
              onLeave={() => session.leave(null)}
            />
          )}
          {session.cause !== null && (
            <ChainCard
              cause={session.cause}
              video={current.video}
              onKeep={session.keepWhy}
            />
          )}
          {session.paused && <PauseCover onResume={session.togglePause} />}
        </PhoneFeed>
      </section>
      <section
        className={session.sheetOpen ? "app-panel is-open" : "app-panel"}
        aria-label="What the algorithm sees"
        inert={feed.ended}
      >
        <SheetHandle
          feed={feed}
          open={session.sheetOpen}
          onToggle={session.toggleSheet}
        />
        <AlgorithmPanel
          feed={feed}
          reveal={reveal}
          paused={session.paused}
          onPause={session.togglePause}
          onLeave={session.leave}
        />
      </section>
      <LinkLayer links={links} onDone={removeLink} pathOf={pathOf} />
      {feed.ended && (
        <SessionEnd
          feed={feed}
          onBack={feed.resume}
          returnTo={session.leftFrom}
          onRestart={() => window.location.reload()}
        />
      )}
    </main>
  );
}

export default App;
