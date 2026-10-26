import AlgorithmPanel from "./components/AlgorithmPanel";
import PhoneFeed from "./components/PhoneFeed";
import { useFeed } from "./hooks/useFeed";

function App() {
  const feed = useFeed();

  return (
    <main className="app">
      <section className="app-feed" aria-label="Video feed">
        <PhoneFeed feed={feed} />
      </section>
      <section className="app-panel" aria-label="What the algorithm sees">
        <AlgorithmPanel feed={feed} />
      </section>
    </main>
  );
}

export default App;
