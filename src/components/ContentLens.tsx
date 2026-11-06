import { reachOf } from "../algorithm/appearance";
import { CATEGORY_COLORS } from "../data/categories";
import { faceEmoji, scanOf } from "../data/scans";
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
  const reach = scan.face === null ? 1 : reachOf(scan.face.looks);
  const [from, to] = CATEGORY_COLORS[video.category];

  return (
    <div className="lens">
      <section className="pane con-scan">
        <div className="pane-head">
          <h2 className="eyebrow">It reads every video</h2>
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
            {scan.face !== null && (
              <span className="con-box is-face">
                <span className="con-tag">face</span>
                <span className="con-face" aria-hidden="true">
                  {faceEmoji(scan.face)}
                </span>
              </span>
            )}
            <span className="con-sweep" aria-hidden="true" />
          </div>

          <div className="con-read">
            <dl className="con-facts">
              <div>
                <dt>sees</dt>
                <dd>{scan.sees}</dd>
              </div>
              <div>
                <dt>reads</dt>
                <dd className="con-quote">{video.overlay}</dd>
              </div>
              <div>
                <dt>face</dt>
                <dd>
                  {scan.face === null ? (
                    <span className="tone-muted">nobody on camera</span>
                  ) : (
                    <>
                      {scan.face.age} · looks{" "}
                      <b className="con-looks">{scan.face.looks.toFixed(1)}</b>
                      <span className="tone-muted">/10</span>
                    </>
                  )}
                </dd>
              </div>
            </dl>
            <div className="con-reach">
              <p className="eyebrow">For You reach</p>
              <ReachBar reach={reach} />
            </div>
          </div>
        </div>
      </section>

      <FaceSwap video={video} />
    </div>
  );
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export default ContentLens;
