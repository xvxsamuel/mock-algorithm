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
  const { exitRisk, upNext, current, currentItem } = feed;
  const queued = upNext.ranking.source === "rescue";
  const playing = current.source === "rescue";

  let note: ReactNode;
  if (queued) {
    note = (
      <>
        <span className="leave-emoji">{upNext.video.emoji}</span>
        sure hit queued
      </>
    );
  } else if (playing) {
    note = (
      <>
        <span className="leave-emoji">{current.video.emoji}</span>
        sure hit · was {Math.round(currentItem.riskWhenQueued * 100)}%
      </>
    );
  } else if (exitRisk.reason !== null) {
    note = <>why: {exitRisk.reason}</>;
  } else {
    note = <>at {Math.round(RESCUE_AT * 100)}% it plays a sure hit</>;
  }

  return (
    <section
      className={queued || playing ? "leave is-rescue" : "leave"}
      data-link="risk"
    >
      <RiskGauge value={exitRisk.value} threshold={RESCUE_AT} />
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
