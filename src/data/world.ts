/**
 * The physical world and the people behind a scroll: sourced figures for
 * the World lens. Research notes: "Materials and labour behind the scroll"
 * (algorithm research folder).
 */

/**
 * CO2e per minute of scrolling on Wi-Fi, in grams: Greenspector measured
 * TikTok at 0.96 g/min (2023); the French government's ADEME model gives
 * 58 g an hour for HD video on Wi-Fi. Range about 0.6 to 1.7 g.
 */
export const GRAMS_PER_MINUTE = 1;

/**
 * Where each minute's CO2e comes from on Wi-Fi (ADEME, via Projet Celsius):
 * 29 g an hour the phone (mostly making it, spread over its life), 28 g the
 * network and router, 0.5 g the data centres.
 */
export const SPLIT = { phone: 0.5, network: 0.49, servers: 0.01 } as const;

/** Years ADEME spreads a phone's making over, and a longer life to set
    against it. */
export const PHONE_YEARS = 2.5;
export const LONGER_YEARS = 5;

/** Share of a phone's CO2e that is the making of it: about 80% (Fairphone 5
    LCA; Apple's iPhone reports). Only that part shrinks with a longer life. */
const MAKING_SHARE = 0.8;

export type SplitPart = "phone" | "network" | "servers";

export type Footprint = {
  phone: number;
  network: number;
  servers: number;
  total: number;
};

/** Grams CO2e a minute on Wi-Fi, by where they come from, for a phone kept
    this many years: kept twice as long, its making counts half as much. */
export function footprint(years: number): Footprint {
  const making = MAKING_SHARE * (PHONE_YEARS / years);
  const phone = GRAMS_PER_MINUTE * SPLIT.phone * (1 - MAKING_SHARE + making);
  const network = GRAMS_PER_MINUTE * SPLIT.network;
  const servers = GRAMS_PER_MINUTE * SPLIT.servers;
  return { phone, network, servers, total: phone + network + servers };
}

/** Metres an average new EU car drives on one gram of CO2e (106.7 g/km, EEA,
    2024). */
export const METRES_PER_GRAM = 1000 / 106.7;

/** Megabytes of video a minute: an estimate (TikTok does not publish it;
    ADEME's low-definition setting is 11.7 MB a minute). */
export const MB_PER_MINUTE = 12;

/** Videos TikTok removes a minute, worldwide: about 780 million in 2025
    (its Community Guidelines Enforcement Reports) over 525,600 minutes. */
export const REMOVED_PER_MINUTE = 1500;

/** TikTok pays creators only for videos longer than this (Creator Rewards
    Program). */
export const PAID_FROM_SEC = 60;

/** The SHA-256 of this made-up address is what a tracking pixel would send. */
export const SAMPLE_EMAIL = "you@example.com";

export type WorldNodeId =
  | "tiktok"
  | "sites"
  | "advertisers"
  | "moderators"
  | "creators"
  | "network"
  | "phone"
  | "mines"
  | "factory"
  | "drawer"
  | "ewaste";

/** Each part's share of a minute in whole percent, adding up to 100: the
    leftover points go to the parts that lost the most in rounding. */
export function splitPercents(years: number): Record<SplitPart, number> {
  const minute = footprint(years);
  const parts: SplitPart[] = ["phone", "network", "servers"];
  const exact = parts.map((part) => (minute[part] / minute.total) * 100);
  const whole = exact.map((share) => Math.floor(share));
  let left = 100 - whole.reduce((sum, share) => sum + share, 0);
  const byLoss = parts
    .map((_, i) => i)
    .sort((a, b) => exact[b] - whole[b] - (exact[a] - whole[a]));
  for (const i of byLoss) {
    if (left <= 0) break;
    whole[i] += 1;
    left -= 1;
  }
  return { phone: whole[0], network: whole[1], servers: whole[2] };
}

/** The phone's line, for a phone kept this many years. Its making is
    already emitted; keeping it longer only counts that over more years
    (assuming it is not replaced sooner and is used as much). */
export function phoneText(years: number): string {
  const share = splitPercents(years).phone;
  return `On Wi-Fi, ${share}% of each minute's CO2e. Mostly its making: already emitted, counted over ${years} years.`;
}

/** How the number on a part is known. */
export type WorldKind = "estimate" | "simulated" | "sample" | "worldwide";

export const KIND_LABELS: Record<WorldKind, string> = {
  estimate: "estimate",
  simulated: "simulated",
  sample: "sample email",
  worldwide: "worldwide estimate",
};

/** Who says so, and where to check it. */
export type Source = { name: string; url: string };

export type WorldFact = {
  /** How its number is known; none for a fixed, sourced figure. */
  kind?: WorldKind;
  /** What it is, in a line. */
  text: string;
  /** Who says so. */
  sources: Source[];
};

/** One line about each part of the world a scroll touches. */
export const WORLD_FACTS: Record<WorldNodeId, WorldFact> = {
  tiktok: {
    kind: "simulated",
    text: "Ranks every video for you and sells the space between them. Staff also push some by hand: 1 to 2% of daily views, by an internal document. TikTok puts it at 0.002% of videos in the US.",
    sources: [
      {
        name: "Forbes, 2023",
        url: "https://www.forbes.com.au/news/innovation/tiktoks-secret-heating-button-can-make-anyone-go-viral",
      },
    ],
  },
  sites: {
    kind: "sample",
    text: "Sites with TikTok's pixel send it what you do there, and can add your email, scrambled the same way every time. Even without an account.",
    sources: [
      {
        name: "Consumer Reports, 2022",
        url: "https://www.consumerreports.org/electronics-computers/privacy/tiktok-tracks-you-across-the-web-even-if-you-dont-use-app-a4383537813/",
      },
      {
        name: "TikTok Ads Help",
        url: "https://ads.tiktok.com/help/article/advanced-matching-web",
      },
    ],
  },
  advertisers: {
    kind: "simulated",
    text: "Bid on every ad slot, about €4 to €9 per 1,000 ad views on TikTok. What the app knows about you raises the price.",
    sources: [
      {
        name: "Ad agency benchmarks, 2025",
        url: "https://www.scrumball.com/blog/tiktok-cpm-rates",
      },
      {
        name: "TikTok Ads Help",
        url: "https://ads.tiktok.com/help/article/tiktok-auction-ads",
      },
    ],
  },
  moderators: {
    kind: "worldwide",
    text: "In 2025 about 1,500 videos were taken down every minute, over 9 in 10 by machines. People check what the machines miss, with reported targets of 10 to 15 seconds a video and reported pay of €1 to €3 an hour in Colombia, Kenya or Morocco (2022 to 2026).",
    sources: [
      {
        name: "TikTok",
        url: "https://www.tiktok.com/safety/en/transparency/community-guidelines-enforcement",
      },
      {
        name: "TIME and TBIJ, 2022",
        url: "https://time.com/6223340/tiktok-content-moderators-latin-america/",
      },
      {
        name: "Le Desk, 2022",
        url: "https://ledesk.ma/2022/08/02/lenfer-gore-et-robotise-des-moderateurs-marocains-de-tik-tok-employes-par-moulay-hafid-elalamy/",
      },
      {
        name: "openDemocracy, 2026",
        url: "https://www.opendemocracy.net/tiktok-content-moderator-death-kenya-teleperformance-ladi-olubunmi-nigeria/",
      },
    ],
  },
  creators: {
    kind: "simulated",
    text: "Make every video you watch. TikTok's Creator Rewards pays eligible creators only for videos over a minute: about €0.35 to €0.85 per 1,000 qualified views.",
    sources: [
      {
        name: "TikTok Creator Rewards, as reported by creators",
        url: "https://www.zdnet.com.au/article/tiktok-rolls-out-new-creator-rewards-program-to-help-you-earn-more-money/",
      },
    ],
  },
  network: {
    kind: "estimate",
    text: "Carries each video from TikTok's data centres to you: about half of each minute's CO2e on Wi-Fi, seven in ten on mobile data. The data centres make only about 1%.",
    sources: [
      {
        name: "ADEME Impact CO2, via Projet Celsius, 2026",
        url: "https://projetcelsius.com/en/blog/tiktok-carbon-footprint/",
      },
    ],
  },
  phone: {
    kind: "estimate",
    text: phoneText(PHONE_YEARS),
    sources: [
      {
        name: "ADEME Impact CO2, via Projet Celsius, 2026",
        url: "https://projetcelsius.com/en/blog/tiktok-carbon-footprint/",
      },
    ],
  },
  mines: {
    text: "About 3 in 4 tonnes of the world's mined cobalt, used in phone batteries, comes from DR Congo.",
    sources: [
      {
        name: "USGS, 2024",
        url: "https://www.usgs.gov/centers/national-minerals-information-center/congo-kinshasa",
      },
    ],
  },
  factory: {
    text: "A phone causes about 30 to 75 kg CO2e in its life: around 80% of it in the factory, before you first switch it on.",
    sources: [
      {
        name: "Fairphone 5",
        url: "https://www.fairphone.com/wp-content/uploads/2024/09/Fairphone5_LCA_Report_2024.pdf",
      },
      {
        name: "Fairphone 6",
        url: "https://www.fairphone.com/stories/summing-up-our-2025-impact-report",
      },
      {
        name: "Apple iPhone 16",
        url: "https://apple.com/environment/pdf/products/iphone/iPhone_16_and_iPhone_16_Plus_PER_Sept2024.pdf",
      },
    ],
  },
  drawer: {
    text: "About 700 million unused phones sit in drawers in the EU. Fewer than 5% are collected.",
    sources: [
      {
        name: "EU Commission Recommendation 2023/2585",
        url: "https://eur-lex.europa.eu/eli/reco/2023/2585/oj/eng",
      },
    ],
  },
  ewaste: {
    text: "62 million tonnes of e-waste worldwide in 2022. 22% was formally collected and recycled.",
    sources: [
      {
        name: "Global E-waste Monitor 2024",
        url: "https://unitar.org/about/news-stories/press/global-e-waste-monitor-2024-electronic-waste-rising-five-times-faster-documented-e-waste-recycling",
      },
    ],
  },
};
