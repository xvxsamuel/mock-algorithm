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
          </div>
        </div>
        {/* The hut and your hand, drawn over the phone with a hole in the
            picture where its screen is. */}
        <canvas className="room-canvas" ref={canvas} aria-hidden="true" />
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
        <p className="room-hint">Drag to look up from your phone.</p>
      </div>
    </main>
  );
}

export default RoomScene;
