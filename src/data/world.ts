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

/** The phone's line, for a phone kept this many years: its share of every
    minute shrinks as its making is spread thinner. */
export function phoneText(years: number): string {
  const { phone, total } = footprint(years);
  const share = Math.round((phone / total) * 100);
  return `On Wi-Fi, ${share}% of each minute's CO2e: mostly the making of it, spread over ${years} years.`;
}

/** How the number on a part is known. */
export type WorldKind = "estimate" | "simulated" | "sample" | "worldwide";

export const KIND_LABELS: Record<WorldKind, string> = {
  estimate: "estimate",
  simulated: "simulated",
  sample: "sample email",
  worldwide: "worldwide estimate",
};

export type WorldFact = {
  /** How its number is known; none for a fixed, sourced figure. */
  kind?: WorldKind;
  /** What it is, in a line. */
  text: string;
  /** Who says so. */
  source: string;
  url: string;
};

/** One line about each part of the world a scroll touches. */
export const WORLD_FACTS: Record<WorldNodeId, WorldFact> = {
  tiktok: {
    kind: "simulated",
    text: "Ranks every video for you and sells the space between them. Staff also push some by hand: 1 to 2% of daily views, by an internal document. TikTok says far less.",
    source: "Forbes, 2023",
    url: "https://www.forbes.com.au/news/innovation/tiktoks-secret-heating-button-can-make-anyone-go-viral",
  },
  sites: {
    kind: "sample",
    text: "Sites with TikTok's pixel send it what you do there, and can add your email, scrambled the same way every time. Even without an account.",
    source: "Consumer Reports, 2022; TikTok Ads Help",
    url: "https://www.consumerreports.org/electronics-computers/privacy/tiktok-tracks-you-across-the-web-even-if-you-dont-use-app-a4383537813/",
  },
  advertisers: {
    kind: "simulated",
    text: "Bid on every ad slot, about $4 to $10 per 1,000 views on TikTok. What the app knows about you raises the price.",
    source: "Ad agency benchmarks, 2025; TikTok Ads Help",
    url: "https://www.scrumball.com/blog/tiktok-cpm-rates",
  },
  moderators: {
    kind: "worldwide",
    text: "About 1,500 videos are taken down every minute, over 9 in 10 by machines. People check what the machines miss, at 10 to 15 seconds a video, for €1 to €3 an hour in Colombia, Kenya or Morocco.",
    source:
      "TikTok enforcement reports; TIME and TBIJ, 2022; Le Desk, 2022; openDemocracy, 2026",
    url: "https://time.com/6223340/tiktok-content-moderators-latin-america/",
  },
  creators: {
    kind: "simulated",
    text: "Make every video you watch. TikTok pays only for videos over a minute, by creators with 10,000+ followers: about €0.35 to €0.85 per 1,000 views.",
    source: "TikTok Creator Rewards Program, as reported by creators",
    url: "https://www.zdnet.com.au/article/tiktok-rolls-out-new-creator-rewards-program-to-help-you-earn-more-money/",
  },
  network: {
    kind: "estimate",
    text: "Carries each video from TikTok's data centres to you: about half of each minute's CO2e on Wi-Fi, seven in ten on mobile data. The data centres make only about 1%.",
    source: "ADEME Impact CO2, via Projet Celsius, 2026",
    url: "https://projetcelsius.com/en/blog/tiktok-carbon-footprint/",
  },
  phone: {
    kind: "estimate",
    text: phoneText(PHONE_YEARS),
    source: "ADEME Impact CO2, via Projet Celsius, 2026",
    url: "https://projetcelsius.com/en/blog/tiktok-carbon-footprint/",
  },
  mines: {
    text: "About 3 in 4 tonnes of the world's mined cobalt, used in phone batteries, comes from DR Congo.",
    source: "USGS, 2024",
    url: "https://www.usgs.gov/centers/national-minerals-information-center/congo-kinshasa",
  },
  factory: {
    text: "Making one phone emits about 25 to 50 kg CO2e: around 80% of all it will ever cause.",
    source: "Fairphone 5 LCA, 2024; Apple iPhone 16 report",
    url: "https://www.fairphone.com/wp-content/uploads/2024/09/Fairphone5_LCA_Report_2024.pdf",
  },
  drawer: {
    text: "About 700 million unused phones sit in drawers in the EU. Fewer than 5% are collected.",
    source: "EU Commission Recommendation 2023/2585",
    url: "https://eur-lex.europa.eu/eli/reco/2023/2585/oj/eng",
  },
  ewaste: {
    text: "62 million tonnes of e-waste worldwide in 2022. 22% was formally collected and recycled.",
    source: "Global E-waste Monitor 2024",
    url: "https://unitar.org/about/news-stories/press/global-e-waste-monitor-2024-electronic-waste-rising-five-times-faster-documented-e-waste-recycling",
  },
};
