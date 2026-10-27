import { CATEGORY_COLORS } from "../data/categories";
import { formatCount, videoStats } from "../data/stats";
import type { Video } from "../data/videos";
import type { ReactionKind } from "../hooks/useFeed";
import Icon, { type IconName } from "./Icon";
import "./ActionRail.css";

type ActionRailProps = {
  video: Video;
  playing: boolean;
  liked: boolean;
  saved: boolean;
  following: boolean;
  shared: boolean;
  /** Comments the user posted, added on top of the fake count. */
  myCommentCount: number;
  onReact: (kind: ReactionKind) => void;
  onOpenComments: () => void;
  onOpenShare: () => void;
};

type RailButton = {
  kind: string;
  icon: IconName;
  label: string;
  count: number;
  /** null for buttons that open a sheet instead of toggling. */
  on: boolean | null;
  onClick: () => void;
};

/** The like / comment / save / share buttons on the right of a video. */
function ActionRail({
  video,
  playing,
  liked,
  saved,
  following,
  shared,
  myCommentCount,
  onReact,
  onOpenComments,
  onOpenShare,
}: ActionRailProps) {
  const [, color] = CATEGORY_COLORS[video.category];
  const stats = videoStats(video);

  const buttons: RailButton[] = [
    {
      kind: "like",
      icon: "heart",
      label: liked ? "Unlike" : "Like",
      count: stats.likes + (liked ? 1 : 0),
      on: liked,
      onClick: () => onReact(liked ? "unlike" : "like"),
    },
    {
      kind: "comments",
      icon: "comment",
      label: "Comments",
      count: stats.comments + myCommentCount,
      on: null,
      onClick: onOpenComments,
    },
    {
      kind: "save",
      icon: "bookmark",
      label: saved ? "Remove from favorites" : "Add to favorites",
      count: stats.saves + (saved ? 1 : 0),
      on: saved,
      onClick: () => onReact(saved ? "unsave" : "save"),
    },
    {
      kind: "share",
      icon: "share",
      label: "Share",
      count: stats.shares + (shared ? 1 : 0),
      on: null,
      onClick: onOpenShare,
    },
  ];

  return (
    <div className="rail">
      <div className="rail-avatar" style={{ backgroundColor: color }}>
        {video.creator.charAt(0).toUpperCase()}
        {following ? (
          <span className="rail-follow is-following">
            <Icon name="check" size={12} />
          </span>
        ) : (
          <button
            type="button"
            className="rail-follow"
            aria-label={`Follow @${video.creator}`}
            onClick={() => onReact("follow")}
          >
            <Icon name="plus" size={12} />
          </button>
        )}
      </div>

      {buttons.map((button) => (
        <button
          key={button.kind}
          type="button"
          className={button.on ? "rail-button is-on" : "rail-button"}
          data-kind={button.kind}
          aria-label={button.label}
          aria-pressed={button.on ?? undefined}
          onClick={button.onClick}
        >
          <Icon name={button.icon} size={34} />
          <span>{formatCount(button.count)}</span>
        </button>
      ))}

      <div
        className={playing ? "rail-disc is-spinning" : "rail-disc"}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      >
        ♫
      </div>
    </div>
  );
}

export default ActionRail;
