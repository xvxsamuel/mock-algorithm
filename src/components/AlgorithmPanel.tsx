import { Fragment } from "react";
import type { Signal } from "../algorithm/signals";
import type { FeedController } from "../hooks/useFeed";
import "./AlgorithmPanel.css";

/** How many finished videos the signal log shows. */
const LOG_LENGTH = 40;

type AlgorithmPanelProps = { feed: FeedController };

/** The "behind the scenes" side: everything the algorithm records and infers. */
function AlgorithmPanel({ feed }: AlgorithmPanelProps) {
  const { session, current, currentSignals, currentItem, upNext } = feed;
  const { video, interactions } = current;
  const ranking = currentItem.ranking;
  const maxTopic = Math.max(...feed.topicScores.map((topic) => topic.score));

  return (
    <div className="panel">
      <header>
        <h1>Algorithm view</h1>
        <p className="panel-muted">
          What the app records and infers while you scroll. Goal:
          maximize_time_in_app. All weights are made up.
        </p>
      </header>

      <section className="panel-section">
        <h2>Session</h2>
        <dl className="kv">
          <dt>session_time</dt>
          <dd>{clock(session.sessionMs)}</dd>
          <dt>videos_seen</dt>
          <dd>{session.videosSeen}</dd>
          <dt>videos_per_min</dt>
          <dd>{session.videosPerMinute.toFixed(1)}</dd>
          <dt>avg_watch_time</dt>
          <dd>{seconds(session.avgWatchMs)}</dd>
          <dt>interaction_rate</dt>
          <dd>{percent(session.interactionRate)}</dd>
          <dt>exploration_rate</dt>
          <dd>{percent(session.explorationRate)}</dd>
        </dl>
      </section>

      <section className="panel-section">
        <h2>Inferred state</h2>
        <p className="panel-state">“{session.state}”</p>
        {session.flags.length === 0 && (
          <p className="panel-muted">no flags raised yet</p>
        )}
        <ul className="panel-list">
          {session.flags.map((flag) => (
            <li key={flag.code}>
              <span className="panel-flag">[{flag.code}]</span> {flag.detail}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel-section">
        <h2>Live impression #{current.index}</h2>
        <dl className="kv">
          <dt>video_id</dt>
          <dd>{video.id}</dd>
          <dt>creator</dt>
          <dd>@{video.creator}</dd>
          <dt>topic</dt>
          <dd>{video.category}</dd>
          <dt>intensity</dt>
          <dd>{video.intensity.toFixed(2)}</dd>
          <dt>watch_ms</dt>
          <dd>
            {Math.round(current.watchMs)} / {video.durationSec * 1000}
          </dd>
          <dt>watch_ratio</dt>
          <dd>{(current.watchMs / (video.durationSec * 1000)).toFixed(2)}</dd>
          <dt>is_playing</dt>
          <dd>{bool(feed.playing)}</dd>
          <dt>pauses</dt>
          <dd>{interactions.pauses}</dd>
          <dt>revisit</dt>
          <dd>{bool(current.revisit)}</dd>
          <dt>liked</dt>
          <dd>{bool(interactions.liked)}</dd>
          <dt>comments_open</dt>
          <dd>{bool(interactions.commentsOpened)}</dd>
          <dt>commented</dt>
          <dd>{bool(interactions.commented)}</dd>
          <dt>shared</dt>
          <dd>{bool(interactions.shared)}</dd>
          <dt>saved</dt>
          <dd>{bool(interactions.saved)}</dd>
          <dt>followed</dt>
          <dd>{bool(interactions.followed)}</dd>
          <dt>not_interested</dt>
          <dd>{bool(interactions.notInterested)}</dd>
        </dl>
        <p>
          signals so far: {signalList(currentSignals)}
          <br />
          <span className="panel-muted">
            → {video.category} {signed(topicDelta(currentSignals))}
          </span>
        </p>
      </section>

      <section className="panel-section">
        <h2>Why you are seeing this</h2>
        <p>
          <span className="panel-flag">[{ranking.mode.toUpperCase()}]</span>{" "}
          {ranking.reason}
        </p>
        <dl className="kv">
          {ranking.pick.parts
            .filter((part) => Math.abs(part.value) >= 0.005)
            .map((part) => scoreRow(part.label, part.value))}
          <dt>total_score</dt>
          <dd>
            <strong>{ranking.pick.score.toFixed(2)}</strong>
          </dd>
        </dl>
        <p className="panel-muted">
          {ranking.candidates} candidates scored ({ranking.filteredOut} recently
          shown filtered out). Exploration chance was{" "}
          {percent(ranking.explorationRate)}.
          <br />
          runners-up:{" "}
          {ranking.runnersUp
            .map(
              (entry) =>
                `@${entry.video.creator} (${entry.video.category}) ${entry.score.toFixed(2)}`,
            )
            .join(" · ")}
        </p>
      </section>

      <section className="panel-section">
        <h2>Queued next (already ranked)</h2>
        <p>
          @{upNext.video.creator} · {upNext.video.category} · score{" "}
          {upNext.ranking.pick.score.toFixed(2)} ·{" "}
          {upNext.ranking.mode.toUpperCase()}
          <br />
          <span className="panel-muted">
            re-ranked every time you swipe or react
          </span>
        </p>
      </section>

      <section className="panel-section">
        <h2>Interest profile</h2>
        <dl className="kv">
          {feed.topicScores.map((topic) =>
            barRow(topic.name, topic.score, maxTopic),
          )}
        </dl>
        <p className="panel-muted">
          creators:{" "}
          {feed.creatorScores.length === 0
            ? "none yet"
            : feed.creatorScores
                .map((creator) => `@${creator.name} ${signed(creator.score)}`)
                .join(" · ")}
        </p>
      </section>

      <section className="panel-section">
        <h2>Signal log</h2>
        {feed.history.length === 0 && (
          <p className="panel-muted">swipe to the next video to log one</p>
        )}
        <ol className="panel-list">
          {feed.history
            .slice(-LOG_LENGTH)
            .reverse()
            .map(({ impression, signals }) => (
              <li key={impression.index} className="panel-log">
                #{impression.index} @{impression.video.creator} ·{" "}
                {impression.video.category} · {seconds(impression.watchMs)} /{" "}
                {impression.video.durationSec}s
                <br />
                <span className="panel-indent">
                  {signalList(signals)} → {impression.video.category}{" "}
                  {signed(topicDelta(signals))}
                </span>
              </li>
            ))}
        </ol>
      </section>
    </div>
  );
}

function scoreRow(label: string, value: number) {
  return (
    <Fragment key={label}>
      <dt>{label}</dt>
      <dd className={value >= 0 ? "panel-up" : "panel-down"}>
        {signed(value)}
      </dd>
    </Fragment>
  );
}

/** A text progress bar like ██████░░░░, scaled to the biggest value. */
function barRow(label: string, value: number, max: number) {
  const width = 16;
  const filled = max > 0 ? Math.round((Math.max(value, 0) / max) * width) : 0;
  return (
    <Fragment key={label}>
      <dt>{label}</dt>
      <dd>
        <span className="panel-bar">
          {"█".repeat(filled)}
          {"░".repeat(width - filled)}
        </span>{" "}
        <span className={value >= 0 ? "panel-up" : "panel-down"}>
          {signed(value)}
        </span>
      </dd>
    </Fragment>
  );
}

function signalList(signals: Signal[]) {
  return signals.map((signal, i) => (
    <span key={signal.code}>
      {i > 0 && " · "}
      <span className={signal.topic >= 0 ? "panel-up" : "panel-down"}>
        {signal.label}
      </span>
    </span>
  ));
}

function topicDelta(signals: Signal[]): number {
  return signals.reduce((sum, signal) => sum + signal.topic, 0);
}

function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function signed(value: number): string {
  return `${value < 0 ? "−" : "+"}${Math.abs(value).toFixed(2)}`;
}

function bool(value: boolean) {
  return (
    <span className={value ? "panel-true" : "panel-muted"}>
      {String(value)}
    </span>
  );
}

export default AlgorithmPanel;
