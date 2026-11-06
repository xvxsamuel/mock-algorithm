import { ADVERTISERS, type Advertiser, type Weakness } from "../data/ads";
import type { Category } from "../data/categories";
import type { Trait } from "./inference";
import { createRandom } from "./random";
import type { Ranking } from "./ranking";
import type { FeedSource } from "./sources";

/** One ad after every this many videos (TikTok shows one every few). */
export const AD_EVERY = 6;
/** Your interest in its topic can raise a bid by up to this many times its base. */
const INTEREST_PULL = 2;
/** A topic is named as a reason once it is this much of your interest. */
const NAMED_SHARE = 0.15;
/** Bids wobble by up to ±this share, the same way for the same slot. */
const JITTER = 0.16;

/** One advertiser's bid for your next ad slot, in € per 1,000 views. */
export type Bid = {
  advertiser: Advertiser;
  /** What it would pay for anyone. */
  anyone: number;
  /** What your interest in its topic adds. */
  interest: number;
  /** What a weakness of yours it buys adds. */
  premium: number;
  total: number;
  /** What about you raised it: its topic, a weakness. */
  because: string[];
};

export type Auction = {
  /** Highest first. The first one wins. */
  bids: Bid[];
  /** Ad slots so far this session, this one included. */
  slot: number;
};

export type AuctionInput = {
  topics: ReadonlyMap<Category, number>;
  weaknesses: ReadonlySet<Weakness>;
  slot: number;
};

/**
 * Every advertiser bids for you; the highest bid buys the slot. The more
 * the app knows about you, the more you are worth.
 */
export function runAuction({
  topics,
  weaknesses,
  slot,
}: AuctionInput): Auction {
  const liked = [...topics.values()].reduce(
    (sum, score) => sum + Math.max(score, 0),
    0,
  );
  // The same slot always wobbles the same way, so live bids do not flicker.
  const random = createRandom((slot * 0.618034) % 1);
  const bids = ADVERTISERS.map((advertiser): Bid => {
    const score = Math.max(topics.get(advertiser.category) ?? 0, 0);
    const share = liked === 0 ? 0 : score / liked;
    const weak = weaknesses.has(advertiser.extra.weakness);
    const anyone = advertiser.base * (1 + (random() - 0.5) * JITTER);
    const interest = advertiser.base * INTEREST_PULL * share;
    const premium = weak ? advertiser.extra.premium : 0;
    const because: string[] = [];
    if (share >= NAMED_SHARE) because.push(advertiser.category);
    if (weak) because.push(advertiser.extra.weakness);
    const total = anyone + interest + premium;
    return { advertiser, anyone, interest, premium, total, because };
  });
  return { bids: bids.sort((a, b) => b.total - a.total), slot };
}

/** The bid that won. */
export function winnerOf(auction: Auction): Bid {
  return auction.bids[0];
}

/** What your data added to a bid. */
export function yourPart(bid: Bid): number {
  return bid.interest + bid.premium;
}

/** What one view of you sold for, in €. */
export function perView(bid: Bid): number {
  return bid.total / 1000;
}

/** The guesses about you that advertisers can buy right now. */
export function weaknessesOf(
  traits: readonly Trait[],
  pastPlan: boolean,
): Set<Weakness> {
  const found = new Set<Weakness>();
  for (const { key, value } of traits) {
    if (key === "mood" && value === "restless") found.add("restless");
    if (key === "spending" && value === "ready to buy") {
      found.add("ready to buy");
    }
    if (key === "age" && value === "16–24") found.add("16–24");
  }
  if (pastPlan) found.add("past your plan");
  return found;
}

/** Videos since the last ad (all of them if there was none). */
export function sinceLastAd(sources: readonly FeedSource[]): number {
  return sources.length - 1 - sources.lastIndexOf("ad");
}

/** The next video is an ad: enough videos since the last one. */
export function adDue(sources: readonly FeedSource[]): boolean {
  return sinceLastAd(sources) >= AD_EVERY - 1;
}

/** The ad as a pick, so the Engine lens can say why it is in your feed. */
export function adRanking(auction: Auction, explorationRate: number): Ranking {
  const winner = winnerOf(auction);
  const { advertiser } = winner;
  const parts: Ranking["pick"]["parts"] = [
    {
      label: `${advertiser.brand} paid most`,
      value: winner.anyone,
      from: "paid",
    },
  ];
  if (winner.interest > 0) {
    parts.push({
      label: advertiser.category,
      value: winner.interest,
      from: "you",
    });
  }
  if (winner.premium > 0) {
    parts.push({
      label: advertiser.extra.weakness,
      value: winner.premium,
      from: "you",
    });
  }
  return {
    pick: { video: advertiser.ad, score: winner.total, parts },
    source: "ad",
    reason: `Sold to ${advertiser.brand}, the highest bidder for you.`,
    explorationRate,
    candidates: auction.bids.length,
    filteredOut: 0,
    runnersUp: [],
  };
}
