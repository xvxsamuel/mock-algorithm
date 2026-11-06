import "./StartGate.css";

const OPTIONS: { label: string; ms: number | null }[] = [
  { label: "1 min", ms: 60_000 },
  { label: "3 min", ms: 180_000 },
  { label: "5 min", ms: 300_000 },
  { label: "No limit", ms: null },
];

type StartGateProps = { onStart: (intentMs: number | null) => void };

/** Before the feed starts: you set a limit. The panel will hold you to it. */
function StartGate({ onStart }: StartGateProps) {
  return (
    <div className="gate">
      <div className="gate-inner">
        <h2 className="gate-title">How long will you scroll?</h2>
        <div className="gate-options">
          {OPTIONS.map(({ label, ms }) => (
            <button
              key={label}
              type="button"
              className={ms === null ? "gate-option is-open" : "gate-option"}
              onClick={() => onStart(ms)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default StartGate;
