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
        <p className="gate-kicker">Before you start</p>
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
        <p className="gate-note">The clock starts when you choose.</p>
      </div>
    </div>
  );
}

export default StartGate;
