import "./RiskGauge.css";

/** How many blocks the meter has. */
const BLOCKS = 20;

type RiskGaugeProps = {
  /** 0-1. */
  value: number;
  /** Where the engine steps in, 0-1. */
  threshold: number;
  /** False before the session starts: the meter shows a dash, not a number. */
  live?: boolean;
  /** False when the number is shown beside the meter instead. */
  showValue?: boolean;
};

/** A row of blocks, like a game's stamina bar: how close you are to
    closing the app. The blocks past the threshold are where the engine
    steps in. */
function RiskGauge({
  value,
  threshold,
  live = true,
  showValue = true,
}: RiskGaugeProps) {
  const filled = Math.round(value * BLOCKS);
  const zone = Math.round(threshold * BLOCKS);
  // Grey until the engine steps in; pink from then on.
  const tone = value >= threshold ? "is-high" : "";
  return (
    <div
      className={`gauge ${tone}`}
      role="img"
      aria-label={live ? `${Math.round(value * 100)}%` : "not started"}
    >
      <span className="gauge-blocks">
        {Array.from({ length: BLOCKS }, (_, i) => {
          const classes = ["gauge-block"];
          if (i < filled) classes.push("is-on");
          if (i >= zone) classes.push("is-zone");
          return <span key={i} className={classes.join(" ")} />;
        })}
      </span>
      {showValue && (
        <span className="gauge-value">
          {live ? `${Math.round(value * 100)}%` : "–"}
        </span>
      )}
    </div>
  );
}

export default RiskGauge;
