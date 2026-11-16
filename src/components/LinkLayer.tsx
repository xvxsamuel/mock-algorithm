import { useEffect, useRef } from "react";
import {
  arrivalOf,
  lifetimeOf,
  TRACE_MS,
  TRAVEL_MS,
  type Link,
  type LiveLink,
} from "../hooks/useLinks";
import "./LinkLayer.css";

/** Targets bigger than this (px²) are whole cards: outline only, no fill. */
const CARD_AREA = 30_000;
/** Targets taller than this (px), like a chart column, get a quieter box. */
const TALL_PX = 100;

type LinkLayerProps = {
  links: Link[];
  /** Called when a link has faded out and can be removed. */
  onDone: (id: number) => void;
  /** A link as it is now, or null to hide it. The phone can move (in the
      hut, with your hand and your head) and so can its target (a chart
      that animates, a panel that slides in): the lines keep to both. */
  liveOf: (link: Link) => LiveLink | null;
};

/**
 * Lines from the side of the phone to the part of the panel that changed.
 * Two layers: the lines run behind the cards, the highlights sit on top of
 * them. Bigger changes are thicker, brighter and stay longer. A note like
 * "more" is not drawn here: the target shows it itself (see notesOf), so
 * it sits exactly where it belongs.
 */
function LinkLayer({ links, onDone, liveOf }: LinkLayerProps) {
  const under = useRef<SVGSVGElement>(null);
  const over = useRef<SVGSVGElement>(null);

  // Every frame while there are lines, measure both ends again and move
  // every part of each line to where they are now.
  useEffect(() => {
    const below = under.current;
    const above = over.current;
    if (below === null || above === null || links.length === 0) return;
    const byId = new Map(links.map((link) => [String(link.id), link]));
    let request = 0;
    const frame = () => {
      request = requestAnimationFrame(frame);
      const live = new Map<string, LiveLink | null>();
      for (const [id, link] of byId) live.set(id, liveOf(link));
      for (const group of below.querySelectorAll<SVGGElement>("[data-id]")) {
        const now = live.get(group.dataset.id ?? "");
        if (now === undefined) continue;
        group.style.visibility = now === null ? "hidden" : "";
        if (now === null) continue;
        for (const path of group.querySelectorAll("path")) {
          if (path.getAttribute("d") !== now.d) path.setAttribute("d", now.d);
        }
      }
      for (const group of above.querySelectorAll<SVGGElement>("[data-id]")) {
        const now = live.get(group.dataset.id ?? "");
        if (now === undefined) continue;
        group.style.visibility = now === null ? "hidden" : "";
        if (now === null) continue;
        const { box, entry, trace } = now;
        const rect = group.querySelector(".link-box");
        if (rect !== null) {
          rect.setAttribute("x", String(box.x));
          rect.setAttribute("y", String(box.y));
          rect.setAttribute("width", String(box.width));
          rect.setAttribute("height", String(box.height));
        }
        const dot = group.querySelector(".link-dot");
        if (dot !== null) {
          dot.setAttribute("x", String(Math.round(box.x + box.width + 2)));
          dot.setAttribute("y", String(Math.round(box.y + box.height / 2 - 4)));
        }
        const notch = group.querySelector(".link-notch");
        if (notch !== null) {
          notch.setAttribute("x1", String(entry.x));
          notch.setAttribute("x2", String(entry.x));
          notch.setAttribute("y1", String(entry.y - 7));
          notch.setAttribute("y2", String(entry.y + 7));
        }
        const path = group.querySelector(".link-trace");
        if (path !== null && trace !== null) path.setAttribute("d", trace);
      }
    };
    request = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(request);
  }, [links, liveOf]);

  return (
    <>
      <svg className="links is-under" aria-hidden="true" ref={under}>
        {links.map((link) => {
          if (link.style === "ping") return null;
          const width = Math.round(2 + link.strength * 2);
          return (
            <g
              key={link.id}
              data-id={link.id}
              className={`link is-${link.tone}`}
              style={{ animationDuration: `${lifetimeOf(link)}ms` }}
            >
              <path
                className="link-trail"
                d={link.d}
                pathLength={1}
                strokeWidth={Math.max(Math.round(width * 0.6), 2)}
                strokeOpacity={0.35 + link.strength * 0.45}
                style={{ animationDuration: `${TRAVEL_MS}ms` }}
              />
              <path
                className="link-head"
                d={link.d}
                pathLength={1}
                strokeWidth={width + 4}
                style={{ animationDuration: `${TRAVEL_MS}ms` }}
              />
              <path
                className="link-head is-core"
                d={link.d}
                pathLength={1}
                strokeWidth={Math.max(Math.round(width * 0.5), 1)}
                style={{ animationDuration: `${TRAVEL_MS}ms` }}
              />
            </g>
          );
        })}
      </svg>

      <svg className="links is-over" aria-hidden="true" ref={over}>
        {links.map((link) => {
          const { box, strength } = link;
          const isPing = link.style === "ping";
          const isCard = box.width * box.height > CARD_AREA;
          const isTall = box.height > TALL_PX;
          const enter = TRAVEL_MS - 80;
          const arrive = arrivalOf(link);
          return (
            <g
              key={link.id}
              data-id={link.id}
              className={`link is-${link.tone} is-${link.style}`}
              style={{ animationDuration: `${lifetimeOf(link)}ms` }}
              onAnimationEnd={(event) => {
                // Ignore the inner animations bubbling up.
                if (event.target === event.currentTarget) onDone(link.id);
              }}
            >
              {link.trace !== null && (
                <>
                  <line
                    className="link-notch"
                    x1={link.entry.x}
                    y1={link.entry.y - 7}
                    x2={link.entry.x}
                    y2={link.entry.y + 7}
                    style={{ animationDelay: `${enter}ms` }}
                  />
                  <path
                    className="link-trace"
                    d={link.trace}
                    pathLength={1}
                    style={{
                      animationDelay: `${enter}ms`,
                      animationDuration: `${TRACE_MS}ms`,
                    }}
                  />
                </>
              )}
              {isPing ? (
                // A dot after the tab's label: "something changed in here".
                <rect
                  className="link-dot"
                  x={Math.round(box.x + box.width + 2)}
                  y={Math.round(box.y + box.height / 2 - 4)}
                  width={8}
                  height={8}
                />
              ) : (
                <rect
                  className="link-box"
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  strokeOpacity={isCard || isTall ? 0.4 : 0.5 + strength * 0.5}
                  fillOpacity={
                    isCard ? 0 : isTall ? 0.05 : 0.08 + strength * 0.14
                  }
                  style={{ animationDelay: `${arrive}ms` }}
                />
              )}
            </g>
          );
        })}
      </svg>
    </>
  );
}

export default LinkLayer;
