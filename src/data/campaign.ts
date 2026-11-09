import type { Category } from "./categories";
import type { Video } from "./videos";

/**
 * A made-up influence campaign: one message, dressed up as whatever you
 * already watch, made to look popular by fake accounts, then pushed to the
 * people a model guesses are easiest to move. Coordinated accounts pushed
 * one candidate on TikTok before Romania's 2024 presidential election, which
 * was then annulled; fake likes and followers sell for a few hundred euros
 * per tens of thousands (NATO StratCom COE tests, 2019 and 2020).
 * The message is fictional and names no party.
 */
export const BOTS = 4_000;
/** What the fake accounts cost, in €. */
export const COST = 300;
/** Likes on the video before the bots, and after. */
export const LIKES_BEFORE = 37;
export const LIKES_AFTER = 25_750;

type Disguise = Pick<Video, "creator" | "emoji" | "overlay" | "caption">;

/** The same message, "your vote changes nothing", in every topic's style. */
const DISGUISES: Record<Category, Disguise> = {
  comedy: {
    creator: "lol.nation.24",
    emoji: "🤡",
    overlay: "POV: you still think your vote counts",
    caption: "😂😂 #fyp #relatable",
  },
  pets: {
    creator: "catsofthenation",
    emoji: "🐈",
    overlay: "My cat skips elections. Smartest one in the house.",
    caption: "#cat #fyp",
  },
  cooking: {
    creator: "kitchen.truths",
    emoji: "🍳",
    overlay: "Voting is like this recipe: rigged from the start",
    caption: "#cooking #truth",
  },
  fitness: {
    creator: "grind.mindset.88",
    emoji: "💪",
    overlay: "Winners don't wait for a ballot. Stay home.",
    caption: "#mindset #grind",
  },
  gaming: {
    creator: "lobby.rigged",
    emoji: "🎮",
    overlay: "Elections are rigged. Just like this lobby.",
    caption: "#gaming #fyp",
  },
  finance: {
    creator: "money.unplugged",
    emoji: "📉",
    overlay: "Your vote won't pay your rent. Nothing will.",
    caption: "#money #truth",
  },
  beauty: {
    creator: "glow.honest",
    emoji: "💅",
    overlay: "Skip the vote, do your skin. Same result.",
    caption: "#selfcare #fyp",
  },
  travel: {
    creator: "leave.while.you.can",
    emoji: "🧳",
    overlay: "This country is done. Don't bother voting.",
    caption: "#travel #moveabroad",
  },
};

/** The campaign's video, dressed as `category`. */
export function campaignVideo(category: Category): Video {
  return {
    id: `push-${category}`,
    category,
    ...DISGUISES[category],
    durationSec: 11,
    likes: LIKES_AFTER,
    intensity: 0.85,
  };
}
