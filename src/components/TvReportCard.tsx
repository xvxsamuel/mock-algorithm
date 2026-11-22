import { NEWS_REPORTS, type NewsReport } from "../data/news";
import "./TvReportCard.css";

type TvReportCardProps = {
  /** Report currently shown on the CRT television. */
  report: NewsReport;
  /** Index of `report` in NEWS_REPORTS. */
  index: number;
  /** How many reports have aired so far from reel pulls. */
  unlocked: number;
  /** Total reel pulls so far, to tell when the next report airs. */
  pulls: number;
  onSelect: (index: number) => void;
};

/**
 * Compact pixel-styled broadcast caption card shown when looking at the TV.
 * Lets the reader inspect the full study summary, open primary sources, and
 * flip through reports already unlocked by scrolling.
 */
function TvReportCard({
  report,
  index,
  unlocked,
  pulls,
  onSelect,
}: TvReportCardProps) {
  const nextReport = NEWS_REPORTS[unlocked];
  const pullsLeft =
    nextReport === undefined ? null : Math.max(nextReport.atPull - pulls, 1);
  const tone =
    report.severity < 0.35
      ? "is-cool"
      : report.severity < 0.7
        ? "is-warn"
        : "is-bleak";

  return (
    <aside
      className={`tv-card ${tone}`}
      aria-label="Television news report"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="tv-card-head">
        <span className="tv-card-station">CH 4 NEWS</span>
        <span className="tv-card-tag">{report.tag}</span>
        <span className="tv-card-desk">{report.desk}</span>
        <div className="tv-card-nav" role="group" aria-label="Broadcasts">
          <button
            type="button"
            className="tv-card-step"
            disabled={index <= 0}
            aria-label="Previous report"
            onClick={() => onSelect(index - 1)}
          >
            ‹
          </button>
          <span className="tv-card-count">
            {index + 1}/{unlocked}
          </span>
          <button
            type="button"
            className="tv-card-step"
            disabled={index >= unlocked - 1}
            aria-label="Next report"
            onClick={() => onSelect(index + 1)}
          >
            ›
          </button>
        </div>
      </div>

      <div className="tv-card-main">
        <div className="tv-card-stat">
          <strong>{report.stat}</strong>
          <span>{report.statSub}</span>
        </div>
        <div className="tv-card-copy">
          <h2 className="tv-card-title">{report.headline}</h2>
          <p className="tv-card-summary">{report.summary}</p>
        </div>
      </div>

      <div className="tv-card-foot">
        <span className="tv-card-sources">
          <span className="tv-card-sources-label">Sources: </span>
          {report.sources.map((source, i) => (
            <span key={`${source.name}-${source.url}`}>
              {i > 0 && " · "}
              <a
                className="tv-card-source"
                href={source.url}
                target="_blank"
                rel="noreferrer"
              >
                {source.name}
              </a>
            </span>
          ))}
        </span>
        <span className="tv-card-next">
          {pullsLeft === null
            ? "Final broadcast on air"
            : `Next broadcast in ${pullsLeft} ${pullsLeft === 1 ? "reel" : "reels"}`}
        </span>
      </div>
    </aside>
  );
}

export default TvReportCard;
