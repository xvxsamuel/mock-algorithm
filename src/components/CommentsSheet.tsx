import { useState, type FormEvent } from "react";
import { PLACEHOLDER_COMMENTS } from "../data/comments";
import { formatCount, videoStats } from "../data/stats";
import type { Video } from "../data/videos";
import Icon from "./Icon";
import "./CommentsSheet.css";

/** How many placeholder comments to show under each video. */
const COMMENTS_SHOWN = 8;

const AVATAR_COLORS = ["#f97316", "#8b5cf6", "#06b6d4", "#ec4899", "#22c55e"];

type CommentsSheetProps = {
  video: Video;
  /** Comments the user posted on this video. */
  myComments: string[];
  onPost: (text: string) => void;
  onClose: () => void;
};

/** TikTok-style comment section. The comments are placeholders. */
function CommentsSheet({
  video,
  myComments,
  onPost,
  onClose,
}: CommentsSheetProps) {
  const [draft, setDraft] = useState("");
  const [likedComments, setLikedComments] = useState<string[]>([]);
  const total = videoStats(video).comments + myComments.length;

  // Each video gets its own slice of the placeholder list.
  const offset = video.id.length + video.likes;
  const comments = Array.from({ length: COMMENTS_SHOWN }, (_, i) => {
    const index = (offset + i) % PLACEHOLDER_COMMENTS.length;
    return PLACEHOLDER_COMMENTS[index];
  }).sort((a, b) => b.likes - a.likes);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = draft.trim();
    if (text === "") return;
    onPost(text);
    setDraft("");
  }

  function toggleLike(key: string) {
    setLikedComments((liked) =>
      liked.includes(key) ? liked.filter((k) => k !== key) : [...liked, key],
    );
  }

  return (
    <div className="comments" role="dialog" aria-label="Comments">
      <header className="comments-header">
        <span>{formatCount(total)} comments</span>
        <button
          type="button"
          className="comments-close"
          aria-label="Close comments"
          onClick={onClose}
        >
          <Icon name="close" size={20} />
        </button>
      </header>

      <ul className="comments-list">
        {myComments.map((text, i) => (
          <li key={`mine-${i}`} className="comment">
            <span className="comment-avatar comment-avatar-me">Y</span>
            <div className="comment-body">
              <span className="comment-user">you</span>
              <p className="comment-text">{text}</p>
              <span className="comment-meta">now · Reply</span>
            </div>
          </li>
        ))}
        {comments.map((comment, i) => {
          const liked = likedComments.includes(comment.user);
          return (
            <li key={comment.user} className="comment">
              <span
                className="comment-avatar"
                style={{
                  backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length],
                }}
              >
                {comment.user.charAt(0).toUpperCase()}
              </span>
              <div className="comment-body">
                <span className="comment-user">{comment.user}</span>
                <p className="comment-text">{comment.text}</p>
                <span className="comment-meta">{comment.age} · Reply</span>
              </div>
              <button
                type="button"
                className={liked ? "comment-like is-liked" : "comment-like"}
                aria-label={liked ? "Unlike comment" : "Like comment"}
                aria-pressed={liked}
                onClick={() => toggleLike(comment.user)}
              >
                <Icon name={liked ? "heart" : "heartOutline"} size={16} />
                <span>{formatCount(comment.likes + (liked ? 1 : 0))}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <form className="comments-input" onSubmit={handleSubmit}>
        <span className="comment-avatar comment-avatar-me">Y</span>
        <input
          type="text"
          placeholder="Add comment..."
          aria-label="Add comment"
          value={draft}
          maxLength={150}
          onChange={(event) => setDraft(event.target.value)}
        />
        {draft.trim() !== "" && (
          <button type="submit" className="comments-send" aria-label="Post">
            <Icon name="arrowUp" size={16} />
          </button>
        )}
      </form>
    </div>
  );
}

export default CommentsSheet;
