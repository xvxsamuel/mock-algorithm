import "./YearGrid.css";

const DAYS = 365;
/** Drawn as 52 whole weeks, so no lone day sticks out of the calendar. */
const CELLS = 52 * 7;

type YearGridProps = {
  filled: number;
  /** When the first day starts to fill, in ms. */
  delayMs?: number;
};

/** A year as a calendar, a column a week. The pink ones are whole days
    spent scrolling. */
function YearGrid({ filled, delayMs = 0 }: YearGridProps) {
  return (
    <ol className="year" aria-label={`${filled} of ${DAYS} days`}>
      {Array.from({ length: CELLS }, (_, day) => (
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
