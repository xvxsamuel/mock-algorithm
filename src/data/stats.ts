import type { Video } from "./videos";

/** Only likes are in the video data; the other counts are made up from them. */
export function videoStats(video: Video) {
  return {
    likes: video.likes,
    comments: Math.round(video.likes * 0.013),
    saves: Math.round(video.likes * 0.07),
    shares: Math.round(video.likes * 0.03),
  };
}

/** 1234567 → "1.2M", 58488 → "58.5K", like TikTok shows counts. */
export function formatCount(count: number): string {
  if (count >= 1_000_000) return `${trim(count / 1_000_000)}M`;
  if (count >= 1_000) return `${trim(count / 1_000)}K`;
  return String(count);
}

function trim(value: number): string {
  return value.toFixed(1).replace(/\.0$/, "");
}
