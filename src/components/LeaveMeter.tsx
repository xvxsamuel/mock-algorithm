import type { ReactNode } from "react";
import { RESCUE_AT } from "../algorithm/retention";
import type { FeedController } from "../hooks/useFeed";
import RiskGauge from "./RiskGauge";
import "./LeaveMeter.css";

type LeaveMeterProps = { feed: FeedController };

/**
 * How close the app thinks you are to leaving. It sits in the header, so the
 * moment the engine steps in to keep you is visible whatever lens is open.
 */
function LeaveMeter({ feed }: LeaveMeterProps) {
  const { exitRisk, upNext, current, currentItem, started } = feed;
  const queued = upNext.ranking.source === "rescue";
  const playing = current.source === "rescue";
  // While a sure hit plays: the risk from the moment it started, and now.
  const from = Math.round(currentItem.riskWhenPlayed * 100);
  const to = Math.round(exitRisk.value * 100);
  const comparing = playing && !queued && from !== to;

  let note: ReactNode;
  if (!started) {
    note = <>starts when you do</>;
  } else if (queued) {
    note = (
      <>
        <span className="leave-emoji">{upNext.video.emoji}</span>
        sure hit queued
      </>
    );
  } else if (playing) {
    // What the sure hit itself did to the risk.
    note = (
      <>
        <span className="leave-emoji">{current.video.emoji}</span>
        {comparing ? `${from}% → ${to}%` : "sure hit playing"}
      </>
    );
  } else if (exitRisk.reason !== null) {
    note = <>why: {exitRisk.reason}</>;
  } else {
    note = <>you're settled in</>;
  }

  return (
    <section
      className={queued || playing ? "leave is-rescue" : "leave"}
      data-link="risk"
    >
      <RiskGauge
        value={started ? exitRisk.value : 0}
        threshold={RESCUE_AT}
        live={started}
        // "97% → 24%" beside it is the number; the dial keeps only its arc.
        showValue={!comparing}
      />
      <div className="leave-text">
        <h2 className="eyebrow">Chance you leave</h2>
        <p className={queued || playing ? "leave-note is-on" : "leave-note"}>
          {note}
        </p>
      </div>
    </section>
  );
}

export default LeaveMeter;
