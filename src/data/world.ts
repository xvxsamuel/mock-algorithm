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

/** Metres an average new EU car drives on one gram of CO2 (106.7 g/km, EEA,
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

export type WorldFact = {
  /** What it is, in a line. */
  text: string;
  /** Who says so. */
  source: string;
  url: string;
};

/** One line about each part of the world a scroll touches. */
export const WORLD_FACTS: Record<WorldNodeId, WorldFact> = {
  tiktok: {
    text: "Ranks every video for you and sells the space between them. Staff also push some by hand: 1 to 2% of daily views, by an internal document.",
    source: "Forbes, 2023",
    url: "https://www.forbes.com.au/news/innovation/tiktoks-secret-heating-button-can-make-anyone-go-viral",
  },
  sites: {
    text: "Sites with TikTok's pixel send it what you click, with your email scrambled the same way every time. Even without an account.",
    source: "Consumer Reports, 2022; TikTok Ads Help",
    url: "https://www.consumerreports.org/electronics-computers/privacy/tiktok-tracks-you-across-the-web-even-if-you-dont-use-app-a4383537813/",
  },
  advertisers: {
    text: "Bid on every ad slot. What the app knows about you raises the price.",
    source: "Simulated auction",
    url: "https://ads.tiktok.com/help/article/tiktok-auction-ads",
  },
  moderators: {
    text: "About 1,500 videos are taken down every minute, 97% by machines. People check the rest at 10 to 15 seconds a video, for €1 to €3 an hour in Kenya or Morocco.",
    source:
      "TikTok enforcement reports; TIME and TBIJ, 2022; openDemocracy, 2026",
    url: "https://www.thebureauinvestigates.com/stories/2022-10-20/behind-tiktoks-boom-a-legion-of-traumatised-10-a-day-content-moderators",
  },
  creators: {
    text: "Make every video you watch. TikTok pays them only for videos over a minute, about $0.40 to $1 per 1,000 views.",
    source: "TikTok Creator Rewards Program, as reported by creators",
    url: "https://www.zdnet.com.au/article/tiktok-rolls-out-new-creator-rewards-program-to-help-you-earn-more-money/",
  },
  network: {
    text: "Carries each video from TikTok's data centres to you: about half of each minute's CO2 on Wi-Fi, two thirds on mobile data. The data centres make only about 1%.",
    source: "ADEME Impact CO2, via Projet Celsius, 2026",
    url: "https://projetcelsius.com/en/blog/tiktok-carbon-footprint/",
  },
  phone: {
    text: "Half the CO2 of every minute is your phone: mostly the making of it, spread over its life.",
    source: "ADEME Impact CO2, via Projet Celsius, 2026",
    url: "https://projetcelsius.com/en/blog/tiktok-carbon-footprint/",
  },
  mines: {
    text: "About 3 in 4 tonnes of the world's mined cobalt, used in phone batteries, comes from DR Congo.",
    source: "USGS, 2024",
    url: "https://www.usgs.gov/centers/national-minerals-information-center/congo-kinshasa",
  },
  factory: {
    text: "Making one phone emits about 30 to 60 kg CO2e: around 80% of all it will ever cause.",
    source: "Fairphone 5 LCA, 2024; Apple iPhone 16 report",
    url: "https://www.fairphone.com/wp-content/uploads/2024/09/Fairphone5_LCA_Report_2024.pdf",
  },
  drawer: {
    text: "About 700 million unused phones sit in drawers in the EU. Fewer than 5% are collected.",
    source: "EU Commission Recommendation 2023/2585",
    url: "https://eur-lex.europa.eu/eli/reco/2023/2585/oj/eng",
  },
  ewaste: {
    text: "62 million tonnes of e-waste in 2022. 22% was recycled.",
    source: "Global E-waste Monitor 2024",
    url: "https://unitar.org/about/news-stories/press/global-e-waste-monitor-2024-electronic-waste-rising-five-times-faster-documented-e-waste-recycling",
  },
};
