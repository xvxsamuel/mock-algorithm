import { useRef, useState, type PointerEvent } from "react";
import { CATEGORY_COLORS } from "../data/categories";
import { useFeed } from "../hooks/useFeed";
import { useHutScene, type Look } from "../hooks/useHutScene";
import { PHONE, PHONE_PIXELS } from "../scene/layout";
import PhoneFeed from "./PhoneFeed";
import "./RoomScene.css";

/** Degrees the view turns for each px you drag. */
const LOOK_SPEED = 0.12;

/** The phone is laid out at this size; the hut shrinks it into your hand. */
const PHONE_WIDTH = (PHONE_PIXELS * PHONE.width) / PHONE.height;

/** The phone's screen gets the hut's look as well: this many shades of red,
    of green and of blue, with a pattern of dots to make up the ones
    between. Few enough to see, enough for a video to stay easy to watch. */
const SHADES = 8;
const STEPS = Array.from({ length: SHADES }, (_, i) =>
  (i / (SHADES - 1)).toFixed(4),
).join(" ");

/** The classic 4x4 pattern of dots, the same one the hut is drawn with, as
    a small picture to tile over the screen. Each dot is a grey that says
    how soon it tips a colour over into the next shade up. */
const DOT_ORDER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const DOTS = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4" shape-rendering="crispEdges">${DOT_ORDER.map(
    (order, i) => {
      // Not quite from black to white, so that black stays black and white
      // stays white however the browser rounds.
      const grey = Math.round(255 * (0.06 + (0.88 * (order + 0.5)) / 16));
      return `<rect x="${i % 4}" y="${Math.floor(i / 4)}" width="1" height="1" fill="rgb(${grey},${grey},${grey})"/>`;
    },
  ).join("")}</svg>`,
)}")`;

const VIEWS = ["phone", "up", "left"] as const;
type View = (typeof VIEWS)[number];

const VIEW_NAMES: Record<View, string> = {
  phone: "Phone",
  up: "Look up",
  left: "Look left",
};

const VIEW_LOOKS: Record<View, Look> = {
  // A little above the phone, so the wall behind it shows over its top.
  phone: { yaw: 0, pitch: -20 },
  up: { yaw: -5, pitch: 6 },
  left: { yaw: -52, pitch: 2 },
};

function clampLook(look: Look): Look {
  return {
    yaw: Math.min(Math.max(look.yaw, -100), 100),
    pitch: Math.min(Math.max(look.pitch, -55), 40),
  };
}

/**
 * Prototype: the feed from your own eyes. You sit in a hut on a bright
 * afternoon, holding the phone, which is the real feed. While you look at
 * it, time in the hut runs away: the daylight goes, the walls stain and
 * peel, and the hand that holds the phone stops being yours. You only
 * notice when you look up.
 */
function RoomScene() {
  const feed = useFeed();
  const [view, setView] = useState<View>("phone");
  // Set once you drag; a view button takes over again.
  const [free, setFree] = useState<Look | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const look = free ?? VIEW_LOOKS[view];

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  useHutScene(stage, canvas, phone, {
    look,
    dragging,
    running: feed.started && !feed.ended,
    videos: feed.history.length,
    glow: CATEGORY_COLORS[feed.current.video.category][1],
  });

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setFree(look);
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
        : clampLook({
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

  return (
    <main className={dragging ? "room is-dragging" : "room"}>
      <div
        className="room-stage"
        ref={stage}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* In your hand. The hut moves it there every frame. It keeps its
            own presses and scrolling: you only look around by dragging the
            room. */}
        <div className="room-phone" ref={phone}>
          <div
            className="room-phone-body"
            style={{
              top: -PHONE_PIXELS / 2,
              left: -PHONE_WIDTH / 2,
              width: PHONE_WIDTH,
              height: PHONE_PIXELS,
            }}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <PhoneFeed feed={feed} />
            {/* The dots: laid over the screen this faintly, they push each
                colour up by less than one shade, and the filter below then
                rounds it down to a whole one. */}
            <div
              className="room-phone-dots"
              style={{ backgroundImage: DOTS, opacity: 1 / SHADES }}
            />
          </div>
        </div>
        {/* The hut and your hand, drawn over the phone with a hole in the
            picture where its screen is. */}
        <canvas className="room-canvas" ref={canvas} aria-hidden="true" />
      </div>

      {/* Rounds every colour on the phone down to one of a few shades. */}
      <svg className="room-filters" aria-hidden="true">
        <filter
          id="room-shades"
          x="0"
          y="0"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues={STEPS} />
            <feFuncG type="discrete" tableValues={STEPS} />
            <feFuncB type="discrete" tableValues={STEPS} />
          </feComponentTransfer>
        </filter>
      </svg>

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
        <p className="room-hint">Drag to look up from your phone.</p>
      </div>
    </main>
  );
}

export default RoomScene;
