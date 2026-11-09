import { EXPERIMENTS_RUNNING, MY_EXPERIMENTS } from "../data/experiments";
import "./ExperimentField.css";

/** How long each of your experiments stays highlighted. */
const CYCLE_MS = 2600;

/** Where your experiments sit in the field, in %. Scattered by hand. */
const SPOTS: readonly [number, number][] = [
  [8, 34],
  [21, 74],
  [30, 20],
  [41, 58],
  [50, 86],
  [58, 26],
  [67, 64],
  [76, 16],
  [85, 78],
  [13, 88],
  [36, 92],
  [93, 42],
];

type ExperimentFieldProps = { sessionMs: number };

/**
 * A field of faint dots stands for every experiment running at once; the
 * bright ones are the ones running on you, one named at a time.
 */
function ExperimentField({ sessionMs }: ExperimentFieldProps) {
  const active = Math.floor(sessionMs / CYCLE_MS) % MY_EXPERIMENTS.length;
  const experiment = MY_EXPERIMENTS[active];

  return (
    <div className="xfield">
      <div className="pane-head">
        <h2 className="eyebrow">Tests on you</h2>
        <p>
          <span className="figure">{MY_EXPERIMENTS.length}</span>
          <span className="unit">
            of {EXPERIMENTS_RUNNING.toLocaleString("en")}
          </span>
        </p>
      </div>
      <div className="xfield-dots" aria-hidden="true">
        {MY_EXPERIMENTS.map((item, i) => (
          <span
            key={item.name}
            className={i === active ? "xfield-dot is-active" : "xfield-dot"}
            style={{
              left: `${SPOTS[i % SPOTS.length][0]}%`,
              top: `${SPOTS[i % SPOTS.length][1]}%`,
            }}
          />
        ))}
      </div>
      <p className="xfield-name" key={experiment.name}>
        <span className="xfield-text">{experiment.name}</span>
        <span className="tone-take">{experiment.lift}</span>
      </p>
    </div>
  );
}

export default ExperimentField;
