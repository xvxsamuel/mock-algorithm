export type IconName =
  | "heart"
  | "comment"
  | "bookmark"
  | "share"
  | "more"
  | "play"
  | "plus"
  | "check"
  | "search"
  | "home"
  | "friends"
  | "inbox"
  | "profile"
  | "heartOutline"
  | "brokenHeart"
  | "close"
  | "link"
  | "mail"
  | "flag"
  | "download"
  | "arrowUp";

const ICONS: Record<IconName, { path: string; filled: boolean }> = {
  heart: {
    path: "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.1c2.2-.2 4 .9 5.4 2.8 1.4-1.9 3.2-3 5.4-2.8 3.7.4 5.7 4.3 4.2 7.7C19.5 16.4 12 21 12 21z",
    filled: true,
  },
  comment: {
    path: "M12 3C6.5 3 2 6.8 2 11.5c0 2.4 1.2 4.6 3.1 6.1L4.5 21l4-1.9c1.1.3 2.3.4 3.5.4 5.5 0 10-3.8 10-8.5S17.5 3 12 3z",
    filled: true,
  },
  bookmark: {
    path: "M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z",
    filled: true,
  },
  share: {
    path: "M14 4l8 7.5-8 7.5v-4.5c-5.5 0-9 1.8-12 5.5 1-5.5 4.5-10.5 12-11.5z",
    filled: true,
  },
  more: {
    path: "M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
    filled: true,
  },
  play: { path: "M8 5v14l11-7z", filled: true },
  plus: { path: "M12 5v14M5 12h14", filled: false },
  check: { path: "M5 12.5l4.5 4.5L19 7.5", filled: false },
  search: {
    path: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
    filled: false,
  },
  home: { path: "M3 10.5L12 3l9 7.5V21h-6v-6H9v6H3z", filled: false },
  friends: {
    path: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18.5 14.5A7 7 0 0 1 22 21",
    filled: false,
  },
  inbox: { path: "M4 5h16v11H9l-5 4z", filled: false },
  profile: {
    path: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
    filled: false,
  },
  heartOutline: {
    path: "M12 20s-7-4.3-9-8.6C1.6 8.2 3.5 4.6 7 4.3c2-.2 3.7.8 5 2.6 1.3-1.8 3-2.8 5-2.6 3.5.3 5.4 3.9 4 7.1C19 15.7 12 20 12 20z",
    filled: false,
  },
  brokenHeart: {
    path: "M12 20s-7-4.3-9-8.6C1.6 8.2 3.5 4.6 7 4.3c2-.2 3.7.8 5 2.6 1.3-1.8 3-2.8 5-2.6 3.5.3 5.4 3.9 4 7.1C19 15.7 12 20 12 20zM12 6.9l-1.5 4 3 2-1.5 4",
    filled: false,
  },
  close: { path: "M6 6l12 12M18 6L6 18", filled: false },
  link: {
    path: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
    filled: false,
  },
  mail: { path: "M3 5h18v14H3zM3 6l9 7 9-7", filled: false },
  flag: { path: "M5 21V4h11l-2 4 2 4H5", filled: false },
  download: { path: "M12 4v11M7 10l5 5 5-5M5 20h14", filled: false },
  arrowUp: { path: "M12 19V5M5 12l7-7 7 7", filled: false },
};

type IconProps = { name: IconName; size?: number };

function Icon({ name, size = 24 }: IconProps) {
  const { path, filled } = ICONS[name];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export default Icon;
