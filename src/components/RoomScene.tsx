import { useRef, useState, type PointerEvent } from "react";
import { formatClock } from "../algorithm/clock";
import { watchRatio } from "../algorithm/impression";
import { CATEGORIES, CATEGORY_COLORS, type Category } from "../data/categories";
import { useFeed } from "../hooks/useFeed";
import PhoneFeed from "./PhoneFeed";
import RoomBox from "./RoomBox";
import "./RoomScene.css";

/* Everything in the room is measured from the middle of its floor: right is
   +x, up is -y, and +z is behind you. One unit is about 2.3 mm (the phone is
   64 tall), so the room in RoomScene.css is about 4.2 m square. */

/** Your eyes: sitting down, towards the back of the room. */
const EYE = { x: 0, y: -480, z: 500 };
/** How far the screen plane is from your eyes. Top to bottom you see about
    64 degrees, whatever the size of the window. */
const EYE_DEPTH = "80dvh";
/** Degrees the view turns for each px you drag. */
const LOOK_SPEED = 0.12;

/** The phone is laid out at this size, then shrunk to 64 units tall. */
const PHONE_HEIGHT = 760;
const PHONE_WIDTH = (PHONE_HEIGHT * 9) / 19.5;
const PHONE_SCALE = 64 / PHONE_HEIGHT;
/** How far from your eyes you hold it. */
const ARM = 70;
/** Degrees below eye level you hold it, and where your hand drops to once
    you look up. */
const HOLD_DEG = 22;
const REST_DEG = 48;

/** The interest pillars stand in an arc on the floor in front of you. */
const PILLAR_REACH = 1050;
const PILLAR_FIRST_DEG = 6;
const PILLAR_STEP_DEG = 10;
const PILLAR_SIZE = 90;
const PILLAR_MIN = 24;
const PILLAR_GROW = 400;
/** Videos kept on the wall; older ones drop off. */
const WALL_TILES = 48;

type Camera = {
  /** Degrees your head is turned; positive is to the right. */
  yaw: number;
  /** Degrees you look up; negative is down. */
  pitch: number;
};

const VIEWS = ["phone", "up", "left"] as const;
type View = (typeof VIEWS)[number];

const VIEW_NAMES: Record<View, string> = {
  phone: "Phone",
  up: "Look up",
  left: "Look left",
};

const VIEW_CAMERAS: Record<View, Camera> = {
  // A little above the phone, so the wall behind it shows over its top.
  phone: { yaw: 0, pitch: -20 },
  up: { yaw: 0, pitch: 0 },
  left: { yaw: -58, pitch: 2 },
};

function clampCamera(camera: Camera): Camera {
  return {
    yaw: clamp(camera.yaw, -100, 100),
    pitch: clamp(camera.pitch, -55, 40),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function gradientOf(category: Category): string {
  const [from, to] = CATEGORY_COLORS[category];
  return `linear-gradient(160deg, ${from}, ${to})`;
}

/**
 * Prototype: the feed from your own eyes. You sit in a room holding the
 * phone, which is the real feed, and you can look up from it. The room is
 * where the feed keeps what it learns: the videos it logged on the wall in
 * front of you, a pillar per interest on the floor, and to your left the
 * video it already picked for you next.
 */
function RoomScene() {
  const feed = useFeed();
  const [view, setView] = useState<View>("phone");
  // Set once you drag; a view button takes over again.
  const [free, setFree] = useState<Camera | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const camera = free ?? VIEW_CAMERAS[view];

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setFree(camera);
    setDragging(true);
  }

  // Like pulling the room: drag down and you look up.
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const from = drag.current;
    if (from === null || from.id !== event.pointerId) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    drag.current = { ...from, x: event.clientX, y: event.clientY };
    setFree((old) =>
      old === null
        ? old
        : clampCamera({
            yaw: old.yaw - dx * LOOK_SPEED,
            pitch: old.pitch + dy * LOOK_SPEED,
          }),
    );
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
  }

  function show(next: View) {
    setFree(null);
    setView(next);
  }

  // Look up and your hand drops, out of the way of the room.
  const lowered = clamp(
    (camera.pitch - VIEW_CAMERAS.phone.pitch) /
      (VIEW_CAMERAS.up.pitch - VIEW_CAMERAS.phone.pitch),
    0,
    1,
  );
  const dip = HOLD_DEG + (REST_DEG - HOLD_DEG) * lowered;
  const hand = {
    x: EYE.x,
    y: EYE.y + ARM * Math.sin(radians(dip)),
    z: EYE.z - ARM * Math.cos(radians(dip)),
  };

  const scores = new Map(feed.topicScores.map((t) => [t.name, t.score]));
  const topScore = Math.max(1, ...feed.topicScores.map((t) => t.score));
  const onScreen = feed.current.video;
  const next = feed.upNext.video;
  // Labels in the room turn with your head, so they always face you.
  const facing = {
    transform: `rotateY(${-camera.yaw}deg) rotateX(${-camera.pitch}deg)`,
  };

  return (
    <main className={dragging ? "room is-dragging" : "room"}>
      <div
        className="room-stage"
        style={{ perspective: EYE_DEPTH }}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* Turning your head turns the whole room around your eyes. */}
        <div
          className="room-world"
          style={{
            transform: `translateZ(${EYE_DEPTH}) rotateX(${camera.pitch}deg) rotateY(${camera.yaw}deg) translate3d(${-EYE.x}px, ${-EYE.y}px, ${-EYE.z}px)`,
          }}
        >
          <div className="room-floor" />
          <div className="room-ceiling" />

          <div className="room-wall is-front">
            <div className="room-log">
              <ul className="room-tiles">
                {feed.history.slice(-WALL_TILES).map(({ impression }) => (
                  <li
                    key={impression.index}
                    className="room-tile"
                    style={{
                      background: gradientOf(impression.video.category),
                      // Brighter the more of it you watched.
                      opacity: 0.3 + 0.7 * Math.min(watchRatio(impression), 1),
                    }}
                  >
                    {impression.video.emoji}
                  </li>
                ))}
              </ul>
              <p className="room-figure">
                {feed.counters.dataPoints.toLocaleString("en")}
              </p>
              <p className="room-caption">
                data points logged · {feed.history.length} videos ·{" "}
                {formatClock(feed.sessionMs)}
              </p>
            </div>
          </div>

          <div className="room-wall is-left">
            <div className="room-next">
              <p className="room-caption">Already picked for you next</p>
              <div
                className="room-poster"
                key={feed.upNext.key}
                style={{ background: gradientOf(next.category) }}
              >
                <span className="room-poster-art">{next.emoji}</span>
                <span className="room-poster-topic">{next.category}</span>
              </div>
            </div>
          </div>

          <div className="room-wall is-right" />
          <div className="room-wall is-back" />

          {CATEGORIES.map((name, i) => {
            // Left and right of straight ahead in turn, moving outwards.
            const side = i % 2 === 0 ? -1 : 1;
            const angle = radians(
              side * (PILLAR_FIRST_DEG + Math.floor(i / 2) * PILLAR_STEP_DEG),
            );
            const score = scores.get(name) ?? 0;
            return (
              <RoomBox
                key={name}
                x={EYE.x + Math.sin(angle) * PILLAR_REACH}
                z={EYE.z - Math.cos(angle) * PILLAR_REACH}
                width={PILLAR_SIZE}
                depth={PILLAR_SIZE}
                height={
                  PILLAR_MIN + (PILLAR_GROW * Math.max(score, 0)) / topScore
                }
                color={CATEGORY_COLORS[name][1]}
              >
                <p className="room-label" style={facing}>
                  {name}
                  <small>{score.toFixed(1)}</small>
                </p>
              </RoomBox>
            );
          })}

          {/* In your hand, always turned to your eyes. It keeps its own
              presses and scrolling: you only look around by dragging the
              room. */}
          <div
            className="room-phone"
            style={{
              transform: `translate3d(${hand.x}px, ${hand.y}px, ${hand.z}px) rotateX(${dip}deg) scale(${PHONE_SCALE})`,
            }}
          >
            {/* The light of the screen in the dark room. */}
            <div
              className="room-phone-halo"
              style={{ color: CATEGORY_COLORS[onScreen.category][1] }}
            />
            <div
              className="room-phone-body"
              style={{
                top: -PHONE_HEIGHT / 2,
                left: -PHONE_WIDTH / 2,
                width: PHONE_WIDTH,
                height: PHONE_HEIGHT,
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <PhoneFeed feed={feed} />
            </div>
          </div>
        </div>
      </div>

      <header className="room-hud is-top">
        <p className="room-title">Room prototype</p>
        <a className="room-back" href="#">
          Back to the split view
        </a>
      </header>

      <div className="room-hud is-bottom">
        <div className="levers" role="group" aria-label="Where you look">
          {VIEWS.map((name) => (
            <button
              key={name}
              type="button"
              className={
                free === null && view === name ? "lever is-on" : "lever"
              }
              aria-pressed={free === null && view === name}
              onClick={() => show(name)}
            >
              {VIEW_NAMES[name]}
            </button>
          ))}
        </div>
        <p className="room-hint">Drag the room to look around.</p>
      </div>
    </main>
  );
}

export default RoomScene;
