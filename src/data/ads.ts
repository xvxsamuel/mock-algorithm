import type { Category } from "./categories";
import type { Video } from "./videos";

/**
 * Guesses about you (from the You lens) that advertisers pay extra for.
 * Ad platforms sell audiences by interests, behaviour and device; these
 * stand in for the "moments" and states ads are aimed at.
 */
export type Weakness = "restless" | "ready to buy" | "16–24" | "past your plan";

/** A fictional brand that bids for your next ad slot. */
export type Advertiser = {
  id: string;
  brand: string;
  emoji: string;
  category: Category;
  /** € per 1,000 views it bids for anyone at all. */
  base: number;
  /** What about you it pays extra for, in € per 1,000 views. */
  extra: { weakness: Weakness; premium: number };
  /** The button on its ad. */
  cta: string;
  /** Its ad, shown in the feed like any video. */
  ad: Video;
};

export const ADVERTISERS: readonly Advertiser[] = [
  advertiser({
    id: "fitfuel",
    brand: "FitFuel",
    emoji: "🥤",
    category: "fitness",
    base: 2.6,
    extra: { weakness: "ready to buy", premium: 3 },
    cta: "Shop now",
    overlay: "Shredded in 30 days. Guaranteed.",
  }),
  advertiser({
    id: "quickcash",
    brand: "QuickCash",
    emoji: "💸",
    category: "finance",
    base: 2,
    extra: { weakness: "past your plan", premium: 4.4 },
    cta: "Apply now",
    overlay: "€500 in 5 minutes. No questions.",
  }),
  advertiser({
    id: "glowlab",
    brand: "GlowLab",
    emoji: "✨",
    category: "beauty",
    base: 2.4,
    extra: { weakness: "16–24", premium: 2.8 },
    cta: "Shop now",
    overlay: "Your skin, but filtered. For real.",
  }),
  advertiser({
    id: "lootlegends",
    brand: "LootLegends",
    emoji: "🐉",
    category: "gaming",
    base: 2.2,
    extra: { weakness: "restless", premium: 3.6 },
    cta: "Install",
    overlay: "10 free legendary chests. Pull now.",
  }),
  advertiser({
    id: "pawbox",
    brand: "PawBox",
    emoji: "🦴",
    category: "pets",
    base: 2.3,
    extra: { weakness: "ready to buy", premium: 2.2 },
    cta: "Shop now",
    overlay: "Your dog deserves this. Subscribe & save",
  }),
  advertiser({
    id: "flycheap",
    brand: "FlyCheap",
    emoji: "✈️",
    category: "travel",
    base: 2.5,
    extra: { weakness: "ready to buy", premium: 1.8 },
    cta: "Book now",
    overlay: "Get out of here. Flights from €19",
  }),
];

/** The advertiser behind an ad, or undefined for a normal video. */
export function advertiserOf(video: Video): Advertiser | undefined {
  return ADVERTISERS.find((entry) => entry.ad.id === video.id);
}

/**
 * Videos a brand paid the creator for, with no "paid partnership" label.
 * TikTok requires one; undisclosed paid posts were still common (Mozilla
 * Foundation, 2021). The brands are fictional.
 */
export type PaidPost = { brand: string; emoji: string };

const PAID_POSTS: Partial<Record<string, PaidPost>> = {
  "beauty-1": { brand: "GlowLab", emoji: "✨" },
  "fitness-3": { brand: "FitFuel", emoji: "🥤" },
  "fitness-5": { brand: "SlimTea", emoji: "🍵" },
  "gaming-5": { brand: "LootLegends", emoji: "🐉" },
  "finance-6": { brand: "MoonCoin", emoji: "🪙" },
  "travel-4": { brand: "FlyCheap", emoji: "✈️" },
};

/** Who secretly paid for a video, if anyone. */
export function paidPostOf(video: Video): PaidPost | undefined {
  return PAID_POSTS[video.id];
}

/** An advertiser with its ad, a 9-second video in its topic. */
function advertiser(
  spec: Omit<Advertiser, "ad"> & { overlay: string },
): Advertiser {
  const { overlay, ...rest } = spec;
  return {
    ...rest,
    ad: {
      id: `ad-${spec.id}`,
      creator: spec.id,
      category: spec.category,
      emoji: spec.emoji,
      overlay,
      caption: `${spec.brand}. Limited time only.`,
      sound: `Promoted music - ${spec.brand}`,
      durationSec: 9,
      likes: 12_400,
      intensity: 0.4,
    },
  };
}
