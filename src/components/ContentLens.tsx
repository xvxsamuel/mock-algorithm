import { faceReach, faceRule } from "../algorithm/appearance";
import { CATEGORY_COLORS } from "../data/categories";
import { scanOf } from "../data/scans";
import type { FeedController } from "../hooks/useFeed";
import FaceSwap from "./FaceSwap";
import ReachBar from "./ReachBar";
import "./ContentLens.css";

type ContentLensProps = { feed: FeedController };

/**
 * What the engine reads in the video itself: what it shows, the text on
 * it, the face of whoever posted it, and how far that face lets it travel.
 */
function ContentLens({ feed }: ContentLensProps) {
  const { current, currentItem } = feed;
  const { video } = current;
  const scan = scanOf(video);
  const { face } = scan;
  const rule = face === null ? null : faceRule(face);
  const [from, to] = CATEGORY_COLORS[video.category];

  return (
    <div className="lens">
      <section className="pane con-scan">
        <div className="pane-head">
          <h2 className="eyebrow">It reads every video</h2>
          <p className="con-note">simulated scores</p>
        </div>
        <div className="con-body">
          {/* The video playing now, scanned again each time it changes. */}
          <div
            key={currentItem.key}
            className="con-mini"
            data-link="scan"
            style={{
              backgroundImage: `linear-gradient(160deg, ${from}, ${to})`,
            }}
          >
            <p className="con-mini-text">
              <span className="con-box is-text">{video.overlay}</span>
            </p>
            <span className="con-box is-subject">
              <span className="con-tag">
                {scan.sees} {percent(scan.sure)}
              </span>
              <span className="con-mini-art" aria-hidden="true">
                {video.emoji}
              </span>
            </span>
            {face !== null && (
              <span
                className={
                  rule === null ? "con-box is-face" : "con-box is-face is-cut"
                }
              >
                <span className="con-tag">face</span>
                <span className="con-face" aria-hidden="true">
                  {face.emoji}
                </span>
              </span>
            )}
            <span className="con-sweep" aria-hidden="true" />
          </div>

          {/* What the face says, then how far that lets the video go. */}
          <div key={`read-${currentItem.key}`} className="con-read">
            {face === null ? (
              <p className="con-who is-none">nobody on camera</p>
            ) : rule === null ? (
              <p className="con-who">
                <span className="con-who-big">
                  {face.looks.toFixed(1)}
                  <span className="con-who-of">/10</span>
                </span>
                <span className="con-who-small">looks · age {face.age}</span>
              </p>
            ) : (
              <p className="con-who is-cut">
                <span className="con-who-big">{face.age}</span>
                <q className="con-who-small">{rule}</q>
              </p>
            )}
            <div className="con-reach">
              <p className="eyebrow">For You reach</p>
              <ReachBar reach={faceReach(face)} tickLabel />
            </div>
          </div>
        </div>
      </section>

      <FaceSwap video={video} scanKey={currentItem.key} />
    </div>
  );
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export default ContentLens;
