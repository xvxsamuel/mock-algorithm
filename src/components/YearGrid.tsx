import "./YearGrid.css";

const DAYS = 365;

type YearGridProps = {
  filled: number;
  /** When the first day starts to fill, in ms. */
  delayMs?: number;
};

/** A year as 365 squares. The pink ones are whole days spent scrolling. */
function YearGrid({ filled, delayMs = 0 }: YearGridProps) {
  return (
    <ol className="year" aria-label={`${filled} of ${DAYS} days`}>
      {Array.from({ length: DAYS }, (_, day) => (
        <li
          key={day}
          className={day < filled ? "year-day is-gone" : "year-day"}
          style={
            day < filled
              ? { animationDelay: `${delayMs + day * 45}ms` }
              : undefined
          }
        />
      ))}
    </ol>
  );
}

export default YearGrid;
