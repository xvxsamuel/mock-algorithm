import "./RiskGauge.css";

type RiskGaugeProps = {
  /** 0-1. */
  value: number;
  /** Where the engine steps in, 0-1. */
  threshold: number;
  /** False before the session starts: the dial shows a dash, not a number. */
  live?: boolean;
};

/** A half dial: how close you are to closing the app. */
function RiskGauge({ value, threshold, live = true }: RiskGaugeProps) {
  // A notch splits off the "sure hit" zone at the end of the track.
  const angle = Math.PI - threshold * Math.PI;
  const notch = {
    x1: 60 + Math.cos(angle) * 41,
    y1: 60 - Math.sin(angle) * 41,
    x2: 60 + Math.cos(angle) * 55,
    y2: 60 - Math.sin(angle) * 55,
  };
  // Grey until the engine steps in; pink from then on.
  const tone = value >= threshold ? "is-high" : "";

  return (
    <svg
      className={`gauge ${tone}`}
      viewBox="0 0 120 68"
      role="img"
      aria-label={live ? `${Math.round(value * 100)}%` : "not started"}
    >
      <path
        className="gauge-track"
        d="M 12 60 A 48 48 0 0 1 108 60"
        pathLength={100}
      />
      <path
        className="gauge-zone"
        d="M 12 60 A 48 48 0 0 1 108 60"
        pathLength={100}
        strokeDasharray={`0 ${threshold * 100} 100`}
      />
      <path
        className="gauge-glow"
        d="M 12 60 A 48 48 0 0 1 108 60"
        pathLength={100}
        strokeDasharray={`${value * 100} 100`}
      />
      <path
        className="gauge-fill"
        d="M 12 60 A 48 48 0 0 1 108 60"
        pathLength={100}
        strokeDasharray={`${value * 100} 100`}
      />
      <line className="gauge-notch" {...notch} />
      <text className="gauge-value" x={60} y={56} textAnchor="middle">
        {live ? `${Math.round(value * 100)}%` : "–"}
      </text>
    </svg>
  );
}

export default RiskGauge;
