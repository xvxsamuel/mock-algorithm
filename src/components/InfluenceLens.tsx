import { LANDS_MS, PUSHES } from "../algorithm/influence";
import { createRandom } from "../algorithm/random";
import { BOTS, COST, LIKES_AFTER, LIKES_BEFORE } from "../data/campaign";
import { CATEGORY_COLORS } from "../data/categories";
import { formatCount } from "../data/stats";
import type { FeedController } from "../hooks/useFeed";
import { useSince } from "../hooks/useSince";
import "./InfluenceLens.css";

/** Fake accounts drawn; each stands for about a hundred. */
const DOTS = 40;
/** The swarm, in ms after release: each dot sets off a little later. */
const STAGGER_MS = 18;
const FLY_MS = 700;
/** The likes climb while the swarm lands. */
const COUNT_FROM = 250;
const COUNT_MS = 1600;
/** Then it counts as trending, and goes out to the people it picks. */
const TRENDING_AT = 1700;
const PICK_STAGGER = 110;
const PICK_MS = 380;
/** The accounts come back, spent but still there for the next one. */
const BACK_AT = LANDS_MS;
const BACK_MS = 700;
const DONE_MS = BACK_AT + BACK_MS;

type Point = { x: number; y: number };

/** The swarm, in % of the stage: a sunflower spiral, so it looks organic. */
const CLOUD: readonly Point[] = Array.from({ length: DOTS }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / DOTS);
  const turn = i * 2.39996;
  return { x: 17 + 12 * r * Math.cos(turn), y: 48 + 30 * r * Math.sin(turn) };
});

/** People the campaign could reach: 5 by 4, and you among them. */
const COLUMNS = 5;
const PEOPLE: readonly Point[] = Array.from({ length: 20 }, (_, i) => ({
  x: 75 + (i % COLUMNS) * 5,
  y: 28 + Math.floor(i / COLUMNS) * 15,
}));
const YOU = 17;
/** How many others it picks, besides you. */
const PICKS = 7;
/** The rays reach you last, the moment the campaign lands (LANDS_MS). */
const PICK_AT = LANDS_MS - PICK_MS - PICKS * PICK_STAGGER;
/** How bright a person is drawn (white alpha): the ones it would not pick
    stay dim, the ones it picks are rated easier and drawn bright. */
const DIM = [0.1, 0.2] as const;
const BRIGHT = [0.55, 0.9] as const;

type InfluenceLensProps = { feed: FeedController };

/**
 * How an outside group games the feed: fake accounts make one video look
 * popular, the engine believes it, and pushes it to the people it guesses
 * are easiest to move. You among them.
 */
function InfluenceLens({ feed }: InfluenceLensProps) {
  const { influence, currentItem, started } = feed;
  const { releasedAt, left, pushed, boosted, persuadable } = influence;
  const t = useSince(releasedAt, DONE_MS);
  const running = left > 0;
  const [from, to] = CATEGORY_COLORS[boosted.category];
  const yours = Math.round(persuadable.score * 100);
  // How movable it rates everyone; it picks the ones at least as easy as
  // you. The same crowd from before Release until the next campaign.
  const crowd = crowdOf(influence.round);

  const likes =
    t === null
      ? LIKES_BEFORE
      : LIKES_BEFORE +
        (LIKES_AFTER - LIKES_BEFORE) *
          easeOut(progress(t, COUNT_FROM, COUNT_MS));
  const trending = t !== null && t >= TRENDING_AT;
  // The people it picks, you last, each reached a little after the one before.
  const reached = [...crowd.picked, YOU].map((person, i) => ({
    person,
    p: t === null ? 0 : progress(t, PICK_AT + i * PICK_STAGGER, PICK_MS),
  }));
  const reach = (person: number) =>
    reached.find((entry) => entry.person === person)?.p ?? 0;

  // Newest first, as in Market, so a line from the phone lands on it
  // without crossing the others.
  const shownPushes = pushed.slice(-(PUSHES * 2)).reverse();
  const empty = running ? left : pushed.length === 0 ? PUSHES : 0;
  const now = pushed.find((push) => push.key === currentItem.key);
  const order = pushed.findIndex((push) => push.key === currentItem.key);

  return (
    <div className="lens">
      <section className="pane inf-network">
        <div className="pane-head">
          <h2 className="eyebrow">Bot network</h2>
        </div>
        <div className="inf-stage">
          <p className="inf-label is-bots">
            {BOTS.toLocaleString("en")} fake accounts
          </p>
          <p className="inf-label is-people">most persuadable</p>

          {/* Fan-out: the boosted video goes to the people it picked. */}
          <svg
            className="inf-fan"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {reached.map(({ person, p }) => {
              if (p === 0) return null;
              const end = PEOPLE[person];
              const x = 50 + (end.x - 50) * p;
              const y = 50 + (end.y - 50) * p;
              return (
                <line
                  key={person}
                  className={person === YOU ? "inf-ray is-you" : "inf-ray"}
                  x1={50}
                  y1={50}
                  x2={x}
                  y2={y}
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          {CLOUD.map((home, i) => {
            const dot = botAt(home, i, t);
            return (
              <span
                key={i}
                className="inf-bot"
                style={{
                  left: `${dot.x}%`,
                  top: `${dot.y}%`,
                  opacity: dot.opacity,
                  transform: `translate(-50%, -50%) scale(${dot.scale})`,
                }}
              >
                <span style={{ animationDelay: `${-(i % 7) * 0.6}s` }} />
              </span>
            );
          })}

          <div
            className={trending ? "inf-card is-trending" : "inf-card"}
            data-link="network"
            style={{ background: `linear-gradient(160deg, ${from}, ${to})` }}
          >
            {/* The engine takes the fake likes for a real trend. */}
            {trending && <span className="inf-trending">trending</span>}
            <span className="inf-emoji" aria-hidden="true">
              {boosted.emoji}
            </span>
            <p className="inf-overlay">
              <span className="inf-sticker">{boosted.overlay}</span>
            </p>
            <span className="inf-likes">
              <span aria-hidden="true">♥</span> {formatCount(Math.round(likes))}
            </span>
          </div>

          {PEOPLE.map((at, i) => {
            const lit = reach(i) >= 1;
            const classes = ["inf-person"];
            if (lit) classes.push("is-lit");
            if (i === YOU) classes.push("is-you");
            // Brighter: rated easier to move. You sit at the bottom of the
            // bright ones: picked, but not the easiest.
            const shade = i === YOU ? BRIGHT[0] : crowd.shades[i];
            return (
              <span
                key={i}
                className={classes.join(" ")}
                style={{
                  left: `${at.x}%`,
                  top: `${at.y}%`,
                  color: lit ? undefined : `rgb(255 255 255 / ${shade})`,
                }}
              />
            );
          })}
          <span
            className="inf-you-label"
            style={{ left: `${PEOPLE[YOU].x}%`, top: `${PEOPLE[YOU].y + 9}%` }}
          >
            you<span className="inf-you-pct">{yours}%</span>
          </span>

          <button
            type="button"
            className="inf-release"
            disabled={!started || running}
            onClick={feed.release}
          >
            {running ? (
              "Released"
            ) : (
              <>
                {releasedAt === null ? "Release" : "Again"}
                <span className="inf-cost">€{COST}</span>
              </>
            )}
          </button>
        </div>
      </section>

      <section className="pane inf-pushed">
        <div className="pane-head">
          <h2 className="eyebrow">Pushed to you</h2>
        </div>
        <div className="inf-pushed-body">
          <div className="inf-tiles-wrap">
            <div className="inf-tiles-row">
              <ol className="inf-tiles">
                {shownPushes.map((push, i) => (
                  <li
                    key={push.key}
                    data-link={i === 0 ? "pushed" : undefined}
                    className={
                      push.key === currentItem.key
                        ? "inf-tile is-now"
                        : "inf-tile"
                    }
                    title={`Dressed as ${push.video.category}: "${push.video.overlay}"`}
                  >
                    {push.video.emoji}
                  </li>
                ))}
                {Array.from({ length: empty }, (_, i) => (
                  <li key={`empty-${i}`} className="inf-tile is-empty" />
                ))}
              </ol>
              {now !== undefined ? (
                <p key={now.key} className="inf-now">
                  {order === 0 ? "Dressed as " : "Same message, as "}
                  <b>{now.video.category}</b>
                </p>
              ) : (
                !running &&
                pushed.length > 0 && (
                  <p className="inf-now">
                    One message, <b>{PUSHES} disguises</b>
                  </p>
                )
              )}
            </div>
            <p className="inf-why">
              {persuadable.reasons.length === 0 ? (
                <span className="inf-none">not enough signals yet</span>
              ) : (
                persuadable.reasons.map((reason) => (
                  <span key={reason} className="inf-chip">
                    {reason}
                  </span>
                ))
              )}
            </p>
          </div>
          <div className="inf-score">
            <p className="inf-kicker">persuadable</p>
            <p
              className={
                persuadable.reasons.length === 0
                  ? "inf-figure is-guess"
                  : "inf-figure"
              }
            >
              {yours}
              <span className="inf-pct">%</span>
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/**
 * The people a campaign picks (always PICKS of them, besides you) and how
 * bright each is drawn: the picked ones are rated at least as easy to move
 * as you, the rest less. Each campaign of the session has its own crowd.
 */
function crowdOf(round: number) {
  const random = createRandom(((round + 1) * 0.618034) % 1);
  const others = PEOPLE.map((_, i) => i).filter((i) => i !== YOU);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const picked = others.slice(0, PICKS).sort((a, b) => a - b);
  const shades = PEOPLE.map((_, i) => {
    const [low, high] = picked.includes(i) ? BRIGHT : DIM;
    return low + random() * (high - low);
  });
  return { picked, shades };
}

/** Where a fake account is `t` ms after release (null: not yet released). */
function botAt(home: Point, i: number, t: number | null) {
  if (t === null) return { ...home, opacity: 1, scale: 1 };
  // Spent, then back in the cloud, fainter, for the next campaign.
  if (t >= BACK_AT) {
    return { ...home, opacity: 0.2 * progress(t, BACK_AT, BACK_MS), scale: 1 };
  }
  const p = easeInOut(progress(t, i * STAGGER_MS, FLY_MS));
  // Into the middle of the video, in a slight arc.
  const target = {
    x: 50 + (home.x - 17) * 0.15,
    y: 50 + (home.y - 48) * 0.3,
  };
  return {
    x: home.x + (target.x - home.x) * p,
    y: home.y + (target.y - home.y) * p - Math.sin(Math.PI * p) * 8,
    opacity: p < 0.8 ? 1 : (1 - p) * 5,
    scale: 1 - p * 0.5,
  };
}

/** 0-1: how far `t` is through a step that starts at `from` and lasts `ms`. */
function progress(t: number, from: number, ms: number): number {
  return Math.min(Math.max((t - from) / ms, 0), 1);
}

function easeOut(p: number): number {
  return 1 - (1 - p) ** 3;
}

function easeInOut(p: number): number {
  return p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
}

export default InfluenceLens;
