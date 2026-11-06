import { useState } from "react";
import AlgorithmPanel from "./components/AlgorithmPanel";
import LinkLayer from "./components/LinkLayer";
import PhoneFeed from "./components/PhoneFeed";
import { useFeed } from "./hooks/useFeed";
import { useLinks } from "./hooks/useLinks";

function App() {
  const feed = useFeed();
  // Lines from the phone to whatever part of the panel just changed.
  const { links, feedArea, trackPress, removeLink } = useLinks(feed);
  // On narrow screens the panel is a sheet that slides up over the video.
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <main className="app">
      <section
        className="app-feed"
        aria-label="Video feed"
        ref={feedArea}
        onPointerDownCapture={trackPress}
      >
        <PhoneFeed feed={feed} />
      </section>
      <section
        className={sheetOpen ? "app-panel is-open" : "app-panel"}
        aria-label="What the algorithm sees"
      >
        <button
          type="button"
          className="sheet-handle"
          aria-expanded={sheetOpen}
          onClick={() => setSheetOpen((open) => !open)}
        >
          <span className="sheet-grip" aria-hidden="true" />
          {sheetOpen ? "Back to the feed" : "Behind your feed"}
        </button>
        <AlgorithmPanel feed={feed} />
      </section>
      <LinkLayer links={links} onDone={removeLink} />
    </main>
  );
}

export default App;
