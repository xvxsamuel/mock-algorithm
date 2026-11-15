import { useRef, useState, type PointerEvent } from "react";
import { CATEGORY_COLORS } from "../data/categories";
import { useFeed } from "../hooks/useFeed";
import { useHutScene, type Look } from "../hooks/useHutScene";
import { useLinks } from "../hooks/useLinks";
import { useMedia } from "../hooks/useMedia";
import { useSession } from "../hooks/useSession";
import { PHONE, PHONE_PIXELS } from "../scene/layout";
import AlgorithmPanel from "./AlgorithmPanel";
import ChainCard from "./ChainCard";
import LinkLayer from "./LinkLayer";
import PhoneFeed from "./PhoneFeed";
import PlanBreak from "./PlanBreak";
import SessionEnd from "./SessionEnd";
import SheetHandle from "./SheetHandle";
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

const CORNERS = ["tl", "tr", "br", "bl"] as const;

const VIEWS = ["phone", "room"] as const;
type View = (typeof VIEWS)[number];

const VIEW_NAMES: Record<View, string> = {
  phone: "Phone",
  room: "Room",
};

const VIEW_LOOKS: Record<View, Look> = {
  // A little above the phone, so the wall behind it shows over its top.
  phone: { yaw: 0, pitch: -20 },
  room: { yaw: -5, pitch: 6 },
};

function clampLook(look: Look): Look {
  return {
    yaw: Math.min(Math.max(look.yaw, -100), 100),
    pitch: Math.min(Math.max(look.pitch, -55), 40),
  };
}

/**
 * The feed from your own eyes. You sit in a hut on a bright afternoon,
 * holding the phone, which is the real feed. While you look at it, time in
 * the hut runs away: the daylight goes, the walls stain and peel, and the
 * hand that holds the phone stops being yours. You only notice when you
 * look up. What the algorithm sees floats over the hut, beside the phone
 * (on narrow screens, in a sheet under it).
 */
function RoomScene() {
  const feed = useFeed();
  // Lines from the phone to whatever part of the panel just changed.
  const { links, feedArea, trackPress, pathOf, removeLink } = useLinks(feed);
  const session = useSession(feed);
  // Wide screens: the panel floats beside the phone, until you put it away.
  const wide = useMedia("(min-width: 901px)");
  const [panelShown, setPanelShown] = useState(true);
  const aside = wide && panelShown;
  const [view, setView] = useState<View>("phone");
  // Set once you drag; a view button takes over again.
  const [free, setFree] = useState<Look | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const look = free ?? VIEW_LOOKS[view];

  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const phone = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  // How far the feed is scrolled, in videos. The hut reads it every frame,
  // so it is kept out of the page's state.
  const scrolled = useRef(0);
  useHutScene(stage, canvas, phone, panel, scrolled, {
    look,
    dragging,
    // Like the session clock, the hut waits while a card or the sheet is
    // over the video.
    running: feed.started && !feed.ended && !feed.held,
    videos: feed.history.length,
    glow: CATEGORY_COLORS[feed.current.video.category][1],
    aside,
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

  const classes = ["room"];
  if (dragging) classes.push("is-dragging");
  if (!panelShown) classes.push("is-bare");

  return (
    <main className={classes.join(" ")}>
      <div
        className="room-stage"
        ref={stage}
        inert={feed.ended}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {/* In your hand. The hut moves it there every frame. It keeps its
            own presses and scrolling: you only look around by dragging the
            room. */}
        <div className="room-phone" ref={phone}>
          <section
            className="room-phone-body"
            aria-label="Video feed"
            ref={feedArea}
            style={{
              top: -PHONE_PIXELS / 2,
              left: -PHONE_WIDTH / 2,
              width: PHONE_WIDTH,
              height: PHONE_PIXELS,
            }}
            onPointerDownCapture={trackPress}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <PhoneFeed
              feed={feed}
              onScrolled={(videos) => {
                scrolled.current = videos;
              }}
            >
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
                  video={feed.current.video}
                  onKeep={session.keepWhy}
                />
              )}
            </PhoneFeed>
            {/* The dots: laid over the screen this faintly, they push each
                colour up by less than one shade, and the filter below then
                rounds it down to a whole one. */}
            <div
              className="room-phone-dots"
              style={{ backgroundImage: DOTS, opacity: 1 / SHADES }}
            />
            {/* Empty markers at the corners: the page puts them where the
                hut has turned the phone's corners to, so the lines from the
                phone know where it is. */}
            {CORNERS.map((corner) => (
              <span
                key={corner}
                className="room-phone-corner"
                data-phone-corner={corner}
              />
            ))}
          </section>
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

      {/* The panel's own dark glass, as a layer under it: the lines from
          the phone run over the glass and behind the panel's cards. */}
      <div className="room-glass" />
      <section
        id="room-panel"
        className={session.sheetOpen ? "app-panel is-open" : "app-panel"}
        aria-label="What the algorithm sees"
        inert={feed.ended || (wide && !panelShown)}
        ref={panel}
      >
        <SheetHandle
          feed={feed}
          open={session.sheetOpen}
          onToggle={session.toggleSheet}
        />
        <AlgorithmPanel feed={feed} onLeave={session.leave} />
      </section>
      <button
        type="button"
        className="room-tab"
        aria-expanded={panelShown}
        aria-controls="room-panel"
        aria-label={panelShown ? "Hide the algorithm" : undefined}
        inert={feed.ended}
        onClick={() => setPanelShown(!panelShown)}
      >
        {panelShown ? (
          <span aria-hidden="true">›</span>
        ) : (
          <>
            <span aria-hidden="true">‹</span> See the algorithm
          </>
        )}
      </button>
      <LinkLayer links={links} onDone={removeLink} pathOf={pathOf} />

      <div className="room-looks" inert={feed.ended}>
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
      </div>

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

export default RoomScene;
