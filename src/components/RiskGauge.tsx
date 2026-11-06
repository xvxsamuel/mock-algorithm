import "./RiskGauge.css";

type RiskGaugeProps = {
  /** 0-1. */
  value: number;
  /** Where the engine steps in, 0-1. */
  threshold: number;
};

/** A half dial: how close you are to closing the app. */
function RiskGauge({ value, threshold }: RiskGaugeProps) {
  const angle = Math.PI - threshold * Math.PI;
  const tick = {
    x1: 60 + Math.cos(angle) * 40,
    y1: 60 - Math.sin(angle) * 40,
    x2: 60 + Math.cos(angle) * 56,
    y2: 60 - Math.sin(angle) * 56,
  };
  const tone = value >= threshold ? "is-high" : value >= 0.3 ? "is-mid" : "";

  return (
    <svg
      className={`gauge ${tone}`}
      viewBox="0 0 120 68"
      role="img"
      aria-label={`${Math.round(value * 100)}%`}
    >
      <path
        className="gauge-track"
        d="M 12 60 A 48 48 0 0 1 108 60"
        pathLength={100}
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
      <line className="gauge-tick" {...tick} />
      <text className="gauge-value" x={60} y={56} textAnchor="middle">
        {Math.round(value * 100)}%
      </text>
    </svg>
  );
}

export default RiskGauge;
