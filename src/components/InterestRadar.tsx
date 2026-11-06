import { CATEGORIES, type Category } from "../data/categories";
import "./InterestRadar.css";

/** The shape never shrinks below this, so a new profile is a small dot. */
const CORE = 0.1;
/** Interest that fills an axis completely, until someone goes beyond it. */
const FULL = 1.5;
const SIZE = 260;
const CENTER = SIZE / 2;
const RADIUS = 92;
/** Extra room left and right so the labels stay inside the picture. */
const SIDE = 46;

type InterestRadarProps = {
  topics: { name: Category; score: number }[];
  current: Category;
};

/**
 * Your interests as a shape that grows towards what you watch. Topics you
 * reject collapse to the middle and their names turn pink.
 */
function InterestRadar({ topics, current }: InterestRadarProps) {
  const scores = new Map(topics.map((topic) => [topic.name, topic.score]));
  const max = Math.max(FULL, ...topics.map((topic) => topic.score));
  const points = CATEGORIES.map((name, i) => {
    const score = scores.get(name) ?? 0;
    const r = score > 0 ? CORE + (1 - CORE) * (score / max) : CORE * 0.5;
    return polar(i, r);
  });
  const shape = `M ${points.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z`;

  return (
    <svg
      className="radar"
      viewBox={`${-SIDE} 0 ${SIZE + SIDE * 2} ${SIZE}`}
      role="img"
      aria-label="Interest profile"
    >
      {[0.33, 0.66, 1].map((ring) => (
        <path
          key={ring}
          className="radar-ring"
          d={`M ${CATEGORIES.map((_, i) => xy(polar(i, ring))).join(" L ")} Z`}
        />
      ))}
      {CATEGORIES.map((name, i) => {
        const end = polar(i, 1);
        return (
          <line
            key={name}
            className={
              name === current ? "radar-axis is-current" : "radar-axis"
            }
            x1={CENTER}
            y1={CENTER}
            x2={end.x}
            y2={end.y}
          />
        );
      })}
      <path className="radar-shape" d={shape} />
      {points.map((point, i) => (
        <circle
          key={CATEGORIES[i]}
          className="radar-dot"
          cx={point.x}
          cy={point.y}
          r={CATEGORIES[i] === current ? 4 : 2.5}
        />
      ))}
      {CATEGORIES.map((name, i) => {
        const label = polar(i, 1.2);
        const score = scores.get(name) ?? 0;
        const tone =
          name === current ? "is-current" : score < -0.05 ? "is-down" : "";
        return (
          <text
            key={name}
            className={`radar-label ${tone}`}
            x={label.x}
            y={label.y}
            textAnchor={anchor(label.x)}
            dominantBaseline="middle"
            data-link={`topic:${name}`}
          >
            {name}
          </text>
        );
      })}
    </svg>
  );
}

function polar(i: number, r: number) {
  const angle = (i / CATEGORIES.length) * Math.PI * 2 - Math.PI / 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS * r,
    y: CENTER + Math.sin(angle) * RADIUS * r,
  };
}

function xy(point: { x: number; y: number }): string {
  return `${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
}

function anchor(x: number): "start" | "middle" | "end" {
  if (Math.abs(x - CENTER) < 8) return "middle";
  return x > CENTER ? "start" : "end";
}

export default InterestRadar;
