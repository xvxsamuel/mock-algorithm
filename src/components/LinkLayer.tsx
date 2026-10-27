import type { Link } from "../hooks/useLinks";
import "./LinkLayer.css";

/** How long a dot takes to travel from the phone to the panel. */
const TRAVEL_MS = 550;
/** Gap between the dots of one link. Big changes send more dots. */
const DOT_GAP_MS = 90;

type LinkLayerProps = {
  links: Link[];
  /** Called when a link has faded out and can be removed. */
  onDone: (id: number) => void;
};

/**
 * Full-screen overlay that draws lines from the side of the phone to the
 * panel. Bigger changes are thicker, brighter, send more dots and stay longer.
 */
function LinkLayer({ links, onDone }: LinkLayerProps) {
  return (
    <svg className="links" aria-hidden="true">
      {links.map((link) => {
        const { strength, box } = link;
        const isLine = link.style === "line";
        const dots = isLine ? 1 + Math.round(strength * 2) : 1;
        const arrive = TRAVEL_MS + (dots - 1) * DOT_GAP_MS;
        const width = isLine ? 1 + strength * 2.5 : 2 + strength * 2;
        return (
          <g
            key={link.id}
            className={`link is-${link.tone} is-${link.style}`}
            style={{ animationDuration: `${arrive + 400 + strength * 1000}ms` }}
            onAnimationEnd={(event) => {
              // Ignore the inner animations bubbling up.
              if (event.target === event.currentTarget) onDone(link.id);
            }}
          >
            {isLine && (
              <path
                className="link-trail"
                d={link.d}
                pathLength={1}
                strokeWidth={Math.max(width / 2, 1)}
                strokeOpacity={0.2 + strength * 0.4}
                style={{ animationDuration: `${TRAVEL_MS}ms` }}
              />
            )}
            {Array.from({ length: dots }, (_, i) => (
              <path
                key={i}
                className="link-dot"
                d={link.d}
                pathLength={1}
                strokeWidth={width}
                style={{
                  animationDuration: `${TRAVEL_MS}ms`,
                  animationDelay: `${i * DOT_GAP_MS}ms`,
                }}
              />
            ))}
            <rect
              className="link-box"
              x={box.x}
              y={box.y}
              width={box.width}
              height={box.height}
              strokeOpacity={isLine ? 0.4 + strength * 0.6 : 0.25}
              fillOpacity={isLine ? 0.05 + strength * 0.15 : 0.06}
              style={{ animationDelay: `${TRAVEL_MS - 80}ms` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

export default LinkLayer;
