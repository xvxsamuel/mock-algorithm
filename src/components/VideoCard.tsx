import { useRef, useState, type MouseEvent } from "react";
import { CATEGORY_COLORS } from "../data/categories";
import type { Video } from "../data/videos";
import type { ReactionKind } from "../hooks/useFeed";
import ActionRail from "./ActionRail";
import Icon from "./Icon";
import "./VideoCard.css";

/** Wait this long after a tap to see if it becomes a double tap. */
const DOUBLE_TAP_MS = 250;

type VideoCardProps = {
  video: Video;
  active: boolean;
  playing: boolean;
  /** Changes every time the video is viewed again, restarting the progress bar. */
  impressionIndex: number;
  liked: boolean;
  saved: boolean;
  following: boolean;
  /** Shared during the current view. */
  shared: boolean;
  myCommentCount: number;
  onTogglePause: () => void;
  onReact: (kind: ReactionKind) => void;
  onOpenComments: () => void;
  onOpenShare: () => void;
};

/** One full-screen "video" in the feed. */
function VideoCard({
  video,
  active,
  playing,
  impressionIndex,
  liked,
  saved,
  following,
  shared,
  myCommentCount,
  onTogglePause,
  onReact,
  onOpenComments,
  onOpenShare,
}: VideoCardProps) {
  const [heart, setHeart] = useState<{ x: number; y: number; id: number }>();
  const tapTimer = useRef<number | undefined>(undefined);
  const [from, to] = CATEGORY_COLORS[video.category];
  const sound = video.sound ?? `original sound - ${video.creator}`;
  const isPlaying = active && playing;

  // Single tap pauses, double tap likes (like on TikTok).
  function handleTap(event: MouseEvent<HTMLButtonElement>) {
    window.clearTimeout(tapTimer.current);
    if (event.detail === 2) {
      const box = event.currentTarget.getBoundingClientRect();
      setHeart({
        x: event.clientX - box.left,
        y: event.clientY - box.top,
        id: event.timeStamp,
      });
      if (!liked) onReact("like");
    } else if (event.detail < 2) {
      tapTimer.current = window.setTimeout(onTogglePause, DOUBLE_TAP_MS);
    }
  }

  return (
    <article className={isPlaying ? "card is-playing" : "card"}>
      <div
        className="card-bg"
        style={{ backgroundImage: `linear-gradient(160deg, ${from}, ${to})` }}
      />
      <div className="card-art" aria-hidden="true">
        {video.emoji}
      </div>
      <p className="card-overlay">
        <span>{video.overlay}</span>
      </p>

      <button
        type="button"
        className="card-tap"
        aria-label={isPlaying ? "Pause video" : "Play video"}
        onClick={handleTap}
      />

      {active && !playing && (
        <div className="card-paused" aria-hidden="true">
          <Icon name="play" size={80} />
        </div>
      )}

      {heart && (
        <span
          key={heart.id}
          className="card-heart"
          style={{ left: heart.x, top: heart.y }}
          onAnimationEnd={() => setHeart(undefined)}
          aria-hidden="true"
        >
          <Icon name="heart" size={110} />
        </span>
      )}

      <div className="card-info">
        <p className="card-creator">@{video.creator}</p>
        <p className="card-caption">{video.caption}</p>
        <p className="card-sound">
          <span aria-hidden="true">♫</span>
          <span className="card-sound-window">
            <span className="card-sound-track">
              {sound}&emsp;&emsp;{sound}&emsp;&emsp;
            </span>
          </span>
        </p>
      </div>

      <ActionRail
        video={video}
        playing={isPlaying}
        liked={liked}
        saved={saved}
        following={following}
        shared={shared}
        myCommentCount={myCommentCount}
        onReact={onReact}
        onOpenComments={onOpenComments}
        onOpenShare={onOpenShare}
      />

      {active && (
        <div className="card-progress">
          <div
            key={impressionIndex}
            className="card-progress-fill"
            style={{
              animationDuration: `${video.durationSec}s`,
              animationPlayState: playing ? "running" : "paused",
            }}
          />
        </div>
      )}
    </article>
  );
}

export default VideoCard;
