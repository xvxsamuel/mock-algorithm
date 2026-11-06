import type { Link } from "../hooks/useLinks";
import "./LinkLayer.css";

/** How long the head of a line takes to travel from the phone to the panel. */
const TRAVEL_MS = 550;
/** How long a tab glows when its lens is not open. */
const PING_MS = 900;
/** Rough width of one character of a label, for its background. */
const CHAR_PX = 6.6;

type LinkLayerProps = {
  links: Link[];
  /** Called when a link has faded out and can be removed. */
  onDone: (id: number) => void;
};

/**
 * Lines from the side of the phone to the part of the panel that changed.
 * Two layers: the lines run behind the cards, the highlights and labels sit
 * on top of them. Bigger changes are thicker, brighter and stay longer.
 */
function LinkLayer({ links, onDone }: LinkLayerProps) {
  return (
    <>
      <svg className="links is-under" aria-hidden="true">
        {links.map((link) => {
          if (link.style === "ping") return null;
          const width = 2 + link.strength * 2;
          return (
            <g
              key={link.id}
              className={`link is-${link.tone}`}
              style={{ animationDuration: `${lifetime(link)}ms` }}
            >
              <path
                className="link-trail"
                d={link.d}
                pathLength={1}
                strokeWidth={Math.max(width * 0.6, 1.5)}
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
                strokeWidth={width * 0.6}
                style={{ animationDuration: `${TRAVEL_MS}ms` }}
              />
            </g>
          );
        })}
      </svg>

      <svg className="links is-over" aria-hidden="true">
        {links.map((link) => {
          const { box, strength, label } = link;
          const isPing = link.style === "ping";
          const arrive = isPing ? 0 : TRAVEL_MS - 80;
          return (
            <g
              key={link.id}
              className={`link is-${link.tone} is-${link.style}`}
              style={{ animationDuration: `${lifetime(link)}ms` }}
              onAnimationEnd={(event) => {
                // Ignore the inner animations bubbling up.
                if (event.target === event.currentTarget) onDone(link.id);
              }}
            >
              <rect
                className="link-box"
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                rx={isPing ? box.height / 2 : 10}
                strokeOpacity={isPing ? 0.7 : 0.5 + strength * 0.5}
                fillOpacity={isPing ? 0.12 : 0.08 + strength * 0.14}
                style={{ animationDelay: `${arrive}ms` }}
              />
              {label !== null && (
                <g
                  className="link-chip"
                  transform={`translate(${box.x + box.width / 2} ${box.y - 4})`}
                  style={{ animationDelay: `${arrive}ms` }}
                >
                  <rect
                    x={-(label.length * CHAR_PX + 16) / 2}
                    y={-20}
                    width={label.length * CHAR_PX + 16}
                    height={20}
                    rx={10}
                  />
                  <text
                    x={0}
                    y={-10}
                    textAnchor="middle"
                    dominantBaseline="central"
                  >
                    {label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </>
  );
}

/** How long a link stays on screen before it is removed. */
function lifetime(link: Link): number {
  if (link.style === "ping") return PING_MS;
  const extra = link.label === null ? 0 : 500;
  return TRAVEL_MS + 700 + link.strength * 1100 + extra;
}

export default LinkLayer;
