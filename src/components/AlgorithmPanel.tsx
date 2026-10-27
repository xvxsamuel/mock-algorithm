import { Fragment } from "react";
import type { Ranking } from "../algorithm/ranking";
import {
  QUICK_SKIP_MS,
  type Signal,
  type SignalCode,
} from "../algorithm/signals";
import { USER } from "../data/user";
import type { FeedController } from "../hooks/useFeed";
import "./AlgorithmPanel.css";

/** How many finished videos the signal log renders. Older ones are cut off. */
const LOG_LENGTH = 20;
/** How many flags get a full line in the profile. The rest are listed by code. */
const FLAGS_SHOWN = 3;
/** How many score parts "why this video" lists, biggest first. */
const WHY_PARTS = 4;
/** Characters in an interest bar like ██████░░░░. */
const BAR_WIDTH = 10;

/** Signals shown as chips for the live video. Watch time has its own bar. */
const SIGNAL_CHIPS: SignalCode[] = [
  "LIKE",
  "COMMENTS_OPEN",
  "COMMENT",
  "SAVE",
  "SHARE",
  "FOLLOW",
  "PAUSE",
  "LOOP",
  "REVISIT",
  "NOT_INTERESTED",
];

type AlgorithmPanelProps = { feed: FeedController };

/**
 * The "behind the scenes" side: everything the algorithm records and infers.
 * Sized to fit one screen so it never scrolls and the phone stays the focus.
 * Elements with `data-link` are where lines from the phone can point to.
 */
function AlgorithmPanel({ feed }: AlgorithmPanelProps) {
  const { session, current, currentSignals, currentItem, upNext } = feed;
  const { video } = current;
  const ranking = currentItem.ranking;
  const maxTopic = Math.max(
    ...feed.topicScores.map((topic) => Math.abs(topic.score)),
  );
  const extraFlags = [
    ...new Set(session.flags.slice(FLAGS_SHOWN).map((flag) => flag.code)),
  ];
  const whyParts = ranking.pick.parts
    .filter((part) => Math.abs(part.value) >= 0.005)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, WHY_PARTS);

  const durationMs = video.durationSec * 1000;
  const ratio = current.watchMs / durationMs;
  const skipZone = current.watchMs < QUICK_SKIP_MS;
  const delta = topicDelta(currentSignals);

  return (
    <div className="panel">
      <header className="panel-head">
        <h1>Algorithm view</h1>
        <span className="panel-muted">
          goal: maximize_time_in_app · weights are made up
        </span>
      </header>

      <section className="box is-profile">
        <h2 className="box-title">User profile</h2>
        <div className="profile-id">
          <span className="profile-avatar" aria-hidden="true">
            {initials(USER.name)}
          </span>
          <div className="profile-who">
            <p className="profile-name">{USER.name}</p>
            <p className="panel-muted">
              @{USER.handle} · built from {session.videosSeen} video
              {session.videosSeen === 1 ? "" : "s"}
            </p>
          </div>
          <span className="profile-rec">
            <span className="profile-dot">●</span> tracking
          </span>
        </div>

        <p className="profile-state">
          <span className="panel-muted">inferred_state</span>{" "}
          <strong>{session.state}</strong>
        </p>
        <ul className="profile-flags">
          {session.flags.length === 0 && (
            <li className="panel-muted">no flags raised yet</li>
          )}
          {session.flags.slice(0, FLAGS_SHOWN).map((flag, i) => (
            <li key={`${flag.code}-${i}`} title={flag.detail}>
              <span className="panel-flag">[{flag.code}]</span> {flag.detail}
            </li>
          ))}
          {extraFlags.length > 0 && (
            <li className="panel-muted">+ {extraFlags.join(" ")}</li>
          )}
        </ul>

        <div className="profile-cols">
          <div>
            <h3 className="panel-label">Interests</h3>
            <ul>
              {feed.topicScores.map((topic) => (
                <li
                  key={topic.name}
                  className={
                    topic.name === video.category ? "topic is-current" : "topic"
                  }
                  data-link={`topic:${topic.name}`}
                >
                  <span>{topic.name === video.category ? "▸" : ""}</span>
                  <span>{topic.name}</span>
                  {textBar(topic.score, maxTopic)}
                  <span className={tone(topic.score)}>
                    {signed(topic.score)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="panel-muted panel-clip" data-link="creators">
              creators:{" "}
              {feed.creatorScores.length === 0
                ? "none yet"
                : feed.creatorScores
                    .map(
                      (creator) => `@${creator.name} ${signed(creator.score)}`,
                    )
                    .join(" · ")}
            </p>
          </div>

          <div data-link="why">
            <h3 className="panel-label">Why this video</h3>
            <p>
              <span className="panel-flag">[{ranking.mode.toUpperCase()}]</span>{" "}
              {shortReason(ranking)}
            </p>
            <dl className="kv">
              {whyParts.map((part) => (
                <Fragment key={part.label}>
                  <dt>{part.label}</dt>
                  <dd className={tone(part.value)}>{signed(part.value)}</dd>
                </Fragment>
              ))}
              <dt>score</dt>
              <dd>
                <strong>{ranking.pick.score.toFixed(2)}</strong>
              </dd>
            </dl>
            <p className="panel-muted">
              beat {ranking.candidates - 1} other videos
            </p>
          </div>
        </div>
      </section>

      <section className="box">
        <h2 className="box-title">Session</h2>
        <div className="tiles">
          {tile("session", clock(session.sessionMs))}
          {tile("videos", String(session.videosSeen))}
          {tile("per min", session.videosPerMinute.toFixed(1))}
          {tile("avg watch", seconds(session.avgWatchMs))}
          {tile(
            "reacted",
            percent(session.interactionRate),
            session.interactionRate,
          )}
          {tile(
            "exploring",
            percent(session.explorationRate),
            session.explorationRate,
          )}
        </div>
      </section>

      <section className="box">
        <h2 className="box-title">Now watching · #{current.index}</h2>
        <p className="live-head">
          <span className="panel-clip">
            @{video.creator} · {video.category} · intensity{" "}
            {video.intensity.toFixed(2)}
          </span>
          <span className={tone(delta)}>
            {video.category} {signed(delta)}
          </span>
        </p>
        <div
          className="watch"
          title={`Swiping away before ${QUICK_SKIP_MS / 1000}s counts as QUICK_SKIP`}
        >
          <span className={skipZone ? "watch-track is-skip" : "watch-track"}>
            <span
              key={current.index}
              className="watch-fill"
              style={{ width: `${Math.min(ratio, 1) * 100}%` }}
            />
            <span
              className="watch-mark"
              style={{
                left: `${Math.min(QUICK_SKIP_MS / durationMs, 1) * 100}%`,
              }}
            />
          </span>
          <span>
            {seconds(current.watchMs)} / {video.durationSec}s{" "}
            {feed.playing ? "▶" : "❚❚"}
          </span>
          <span className={skipZone ? "panel-down" : "panel-up"}>
            {watchStatus(current.watchMs, ratio)}
          </span>
        </div>
        <ul className="chips">
          {SIGNAL_CHIPS.map((code) => {
            const signal = currentSignals.find((s) => s.code === code);
            return (
              <li
                key={code}
                className={
                  signal === undefined
                    ? "chip"
                    : signal.topic >= 0
                      ? "chip is-up"
                      : "chip is-down"
                }
                data-link={`signal:${code}`}
              >
                {signal === undefined
                  ? code
                  : `${signal.label} ${signed(signal.topic)}`}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="box" data-link="queue">
        <h2 className="box-title">Queued next</h2>
        <p className="next">
          <span className="panel-clip">
            @{upNext.video.creator} · {upNext.video.category} · score{" "}
            {upNext.ranking.pick.score.toFixed(2)} ·{" "}
            <span className="panel-flag">
              [{upNext.ranking.mode.toUpperCase()}]
            </span>
          </span>
          <span className="panel-muted">re-ranked on every action</span>
        </p>
      </section>

      <section className="box is-log">
        <h2 className="box-title">Signal log</h2>
        {feed.history.length === 0 && (
          <p className="panel-muted">swipe to the next video to log one</p>
        )}
        <ol className="log">
          {feed.history
            .slice(-LOG_LENGTH)
            .reverse()
            .map(({ impression, signals }, i) => {
              const logged = topicDelta(signals);
              return (
                <li
                  key={impression.index}
                  data-link={i === 0 ? "log" : undefined}
                >
                  <span className="panel-clip">
                    #{impression.index} @{impression.video.creator} ·{" "}
                    {impression.video.category} · {seconds(impression.watchMs)}{" "}
                    / {impression.video.durationSec}s
                  </span>
                  <span className={tone(logged)}>
                    {impression.video.category} {signed(logged)}
                  </span>
                  <span className="log-signals panel-clip">
                    {signalList(signals)}
                  </span>
                </li>
              );
            })}
        </ol>
      </section>
    </div>
  );
}

/** One big-number stat. `meter` (0-1) adds a small fill bar underneath. */
function tile(label: string, value: string, meter?: number) {
  return (
    <div className="tile">
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
      {meter !== undefined && (
        <span className="tile-meter">
          <span style={{ width: `${Math.round(meter * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

/** A text bar like ██████░░░░, scaled to the biggest value. */
function textBar(value: number, max: number) {
  const filled = max > 0 ? Math.round((Math.abs(value) / max) * BAR_WIDTH) : 0;
  return (
    <span>
      <span className={tone(value)}>{"█".repeat(filled)}</span>
      <span className="panel-faint">{"░".repeat(BAR_WIDTH - filled)}</span>
    </span>
  );
}

function shortReason(ranking: Ranking): string {
  return ranking.mode === "explore"
    ? `testing ${ranking.pick.video.category}, you've seen little of it`
    : "best predicted engagement for you";
}

/** What swiping away right now would be logged as. */
function watchStatus(watchMs: number, ratio: number): string {
  if (watchMs < QUICK_SKIP_MS) return "QUICK_SKIP zone";
  if (ratio >= 1) return `LOOP x${Math.min(Math.floor(ratio), 3)}`;
  return `WATCH ${percent(ratio)}`;
}

function signalList(signals: Signal[]) {
  return signals.map((signal, i) => (
    <span key={signal.code}>
      {i > 0 && " · "}
      <span className={tone(signal.topic)}>{signal.label}</span>
    </span>
  ));
}

function topicDelta(signals: Signal[]): number {
  return signals.reduce((sum, signal) => sum + signal.topic, 0);
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

/** Green for values that count in favour of a video, red for against. */
function tone(value: number): string {
  if (Math.abs(value) < 0.005) return "panel-muted";
  return value > 0 ? "panel-up" : "panel-down";
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

export default AlgorithmPanel;
