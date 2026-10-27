import { SHARE_FRIENDS } from "../data/comments";
import Icon, { type IconName } from "./Icon";
import "./ShareSheet.css";

const AVATAR_COLORS = ["#06b6d4", "#ec4899", "#f97316", "#8b5cf6", "#22c55e"];

type ShareTarget = { label: string; icon: IconName; color: string };

const SHARE_TARGETS: ShareTarget[] = [
  { label: "Copy link", icon: "link", color: "#1d9bf0" },
  { label: "Message", icon: "inbox", color: "#25d366" },
  { label: "Email", icon: "mail", color: "#8b8b8b" },
  { label: "More", icon: "more", color: "#3a3a3a" },
];

type ShareSheetProps = {
  /** The user shared the video. `message` describes how, e.g. "Sent to mia". */
  onShare: (message: string) => void;
  onNotInterested: () => void;
  /** Placeholder actions that only show a message. */
  onPlaceholder: (message: string) => void;
  onClose: () => void;
};

/** TikTok-style share sheet. Nothing is really sent anywhere. */
function ShareSheet({
  onShare,
  onNotInterested,
  onPlaceholder,
  onClose,
}: ShareSheetProps) {
  return (
    <div className="share" role="dialog" aria-label="Share">
      <header className="share-header">
        <span>Send to</span>
        <button
          type="button"
          className="share-close"
          aria-label="Close share menu"
          onClick={onClose}
        >
          <Icon name="close" size={20} />
        </button>
      </header>

      <div className="share-row">
        {SHARE_FRIENDS.map((friend, i) => (
          <button
            key={friend}
            type="button"
            className="share-item"
            onClick={() => onShare(`Sent to ${friend}`)}
          >
            <span
              className="share-circle"
              style={{
                backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
              }}
            >
              {friend.charAt(0).toUpperCase()}
            </span>
            {friend}
          </button>
        ))}
      </div>

      <div className="share-row">
        {SHARE_TARGETS.map((target) => (
          <button
            key={target.label}
            type="button"
            className="share-item"
            onClick={() =>
              onShare(
                target.label === "Copy link"
                  ? "Link copied"
                  : `Shared via ${target.label}`,
              )
            }
          >
            <span
              className="share-circle"
              style={{ backgroundColor: target.color }}
            >
              <Icon name={target.icon} size={22} />
            </span>
            {target.label}
          </button>
        ))}
      </div>

      <div className="share-row">
        <button type="button" className="share-item" onClick={onNotInterested}>
          <span className="share-circle share-circle-plain">
            <Icon name="brokenHeart" size={22} />
          </span>
          Not interested
        </button>
        <button
          type="button"
          className="share-item"
          onClick={() => onPlaceholder("Thanks for reporting")}
        >
          <span className="share-circle share-circle-plain">
            <Icon name="flag" size={22} />
          </span>
          Report
        </button>
        <button
          type="button"
          className="share-item"
          onClick={() => onPlaceholder("Video saved")}
        >
          <span className="share-circle share-circle-plain">
            <Icon name="download" size={22} />
          </span>
          Save video
        </button>
      </div>

      <button type="button" className="share-cancel" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}

export default ShareSheet;
