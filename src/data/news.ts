/** Visual diagram drawn inside the CRT news broadcast for a report. */
export type NewsGraphic =
  | "crossover"
  | "bars_down"
  | "panopticon"
  | "lawsuit"
  | "face_grid"
  | "stream_eye"
  | "fracture"
  | "synthetic"
  | "collapse"
  | "static_eye";

export type NewsSource = {
  name: string;
  url: string;
};

export type NewsReport = {
  id: string;
  /** Reel pull count at which this broadcast comes on air. */
  atPull: number;
  /** 0 (uneasy trend) to 1 (bleak late-night signal). */
  severity: number;
  /** Short red/amber badge in the top corner of the TV. */
  tag: string;
  /** Desk label beside the channel bug. */
  desk: string;
  /** Short uppercase chyron headline for the CRT screen. */
  headline: string;
  /** Hero figure shown big in the broadcast graphic. */
  stat: string;
  /** One-line label under the hero figure. */
  statSub: string;
  /** Scrolling ticker text along the bottom of the TV. */
  ticker: string;
  /** Short plain-language summary shown when inspecting the TV. */
  summary: string;
  graphic: NewsGraphic;
  sources: readonly NewsSource[];
};

/**
 * Progressively bleaker news bulletins broadcast on the hut's CRT television,
 * advancing strictly with reel pulls. Grounded in primary federal datasets,
 * peer-reviewed studies, public-health advisories, legal filings, and national
 * polling on screen displacement, surveillance anxiety, algorithmic outrage,
 * loneliness, and sleep loss.
 */
export const NEWS_REPORTS: readonly NewsReport[] = [
  {
    id: "crossover",
    atPull: 0,
    severity: 0.08,
    tag: "DEMOGRAPHICS",
    desk: "PUBLIC HEALTH",
    headline: "IN-PERSON FRIEND TIME CUT TO 40 MIN",
    stat: "40 MIN",
    statSub: "DAILY WITH FRIENDS (WAS 150)",
    ticker:
      "U.S. SURGEON GENERAL (2023): AGES 15-24 FELL FROM 150 TO 40 MIN/DAY IN PERSON WITH FRIENDS — TWENGE ET AL. (2019): HIGH SCHOOL SENIORS LOST ~1 HR/DAY OF FACE-TO-FACE PEER TIME",
    summary:
      "American Time Use Survey data cited in the U.S. Surgeon General's 2023 advisory shows young people aged 15 to 24 dropped from 150 minutes a day in person with friends in 2003 to 40 minutes by 2020. Monitoring the Future analysis (Twenge et al., 2019) likewise tracks roughly an hour a day of teen socializing displaced by screens.",
    graphic: "crossover",
    sources: [
      {
        name: "U.S. Surgeon General (2023)",
        url: "https://www.hhs.gov/sites/default/files/surgeon-general-social-connection-advisory.pdf",
      },
      {
        name: "Twenge et al., JSPR (2019)",
        url: "https://doi.org/10.1177/0265407519836170",
      },
    ],
  },
  {
    id: "third-spaces",
    atPull: 4,
    severity: 0.2,
    tag: "DATA WATCH",
    desk: "THIRD SPACES",
    headline: "YOUTH PARTYING DROPS 70% SINCE 2003",
    stat: "-70%",
    statSub: "TIME AT PARTIES (AGES 15-24)",
    ticker:
      "BUREAU OF LABOR STATISTICS ATUS: AMERICANS AGES 15-24 SPEND 70% LESS TIME HOSTING OR ATTENDING PARTIES THAN IN 2003 — OVERALL PARTY TIME DOWN 50%, UNDER-25 SOCIALIZING DOWN OVER 35%",
    summary:
      "Federal Bureau of Labor Statistics American Time Use Survey records examined in The Atlantic show Americans aged 15 to 24 spend 70% less time hosting or attending parties than in 2003 (and 50% less across all ages), with total face-to-face socializing down over 35% among under-25s as leisure retreats indoors.",
    graphic: "bars_down",
    sources: [
      {
        name: "BLS American Time Use Survey",
        url: "https://www.bls.gov/tus/",
      },
      {
        name: "The Atlantic (2025)",
        url: "https://www.theatlantic.com/magazine/archive/2025/02/american-loneliness-personality-politics/681091/",
      },
    ],
  },
  {
    id: "dancing-panopticon",
    atPull: 8,
    severity: 0.34,
    tag: "SPECIAL REPORT",
    desk: "SURVEILLANCE",
    headline: "HALF OF GEN Z AFRAID TO DANCE",
    stat: "49%",
    statSub: "HOLD BACK FOR FEAR OF CAMERAS",
    ticker:
      "LIFESTANCE HEALTH SURVEY (2026, N=1,000): 49% OF GEN Z HOLD BACK FROM DANCING IN PUBLIC OVER FEAR OF BEING FILMED — 72% SAY VIRAL ANXIETY AFFECTS LEAVING HOME — 74% STRUGGLE TO STAY PRESENT",
    summary:
      "A September 2026 LifeStance Health survey of 1,000 U.S. adults found 49% of Gen Z skip or hold back from dancing in public out of fear of being filmed and posted online. 72% say fear of an unwanted viral clip affects leaving the house, and 74% say it undermines enjoying the present moment.",
    graphic: "panopticon",
    sources: [
      {
        name: "LifeStance Health Survey (2026)",
        url: "https://lifestance.com/insight/fear-of-going-viral-social-media-anxiety-survey/",
      },
    ],
  },
  {
    id: "meta-settlement",
    atPull: 13,
    severity: 0.46,
    tag: "BREAKING",
    desk: "COURTS",
    headline: "51 AGS REACH $17B META YOUTH DEAL",
    stat: "$17B",
    statSub: "PROPOSED META YOUTH DEAL",
    ticker:
      "CA ATTORNEY GENERAL ROB BONTA (AUG 2026): BIPARTISAN COALITION OF 51 AGS ANNOUNCES UP TO $17B META SETTLEMENT — MANDATES 2-HR MINOR LIMITS, MIDNIGHT-6AM BLOCKS & BEAUTY FILTER CURBS",
    summary:
      "In August 2026, California Attorney General Rob Bonta and a bipartisan coalition of 51 attorneys general announced a proposed settlement of up to $17B with Meta over youth mental health litigation. Terms mandate a 2-hour daily minor limit, midnight-to-6am feed blocks, school-hour notification silences, and curbs on cosmetic filters and visible like counts.",
    graphic: "lawsuit",
    sources: [
      {
        name: "California Attorney General (2026)",
        url: "https://oag.ca.gov/news/press-releases/attorney-general-bonta-secures-transformative-17-billion-settlement-meta-proposed",
      },
    ],
  },
  {
    id: "self-audit",
    atPull: 18,
    severity: 0.56,
    tag: "INVESTIGATION",
    desk: "BODY IMAGE",
    headline: "FILTERS TURN FACES INTO AUDITS",
    stat: "1 IN 3",
    statSub: "STRUGGLING TEEN GIRLS HIT HARDER",
    ticker:
      "INTERNAL META RESEARCH (WSJ): INSTAGRAM WORSENS BODY IMAGE FOR 32% OF STRUGGLING TEEN GIRLS — 77% OF FACIAL PLASTIC SURGEONS CITE SELFIE PRESSURE (AAFPRS) — CHB (2025): SLIMMING FILTERS RAISE SELF-OBJECTIFICATION",
    summary:
      "Internal Meta research disclosed by The Wall Street Journal found Instagram worsened body image for 32% of teen girls already struggling with it. Meanwhile, 77% of AAFPRS facial plastic surgeons cite looking better in selfies as a top driver, and a Computers in Human Behavior study links slimming AR filters to body dissatisfaction and self-objectification.",
    graphic: "face_grid",
    sources: [
      {
        name: "Wall Street Journal (2021)",
        url: "https://www.wsj.com/articles/facebook-knows-instagram-is-toxic-for-teen-girls-company-documents-show-11631620739",
      },
      {
        name: "AAFPRS Survey",
        url: "https://www.aafprs.org/media/press-releases/detail/2021-statistics-trends-released-demand-for-facial-plastic-surgery-skyrocket",
      },
      {
        name: "CHB (2025)",
        url: "https://doi.org/10.1016/j.chb.2024.108519",
      },
    ],
  },
  {
    id: "zero-roi",
    atPull: 24,
    severity: 0.66,
    tag: "ATTENTION",
    desk: "SCREEN DIET",
    headline: "TEENS LOG 8H 39M DAILY ON SCREENS",
    stat: "8H 39M",
    statSub: "DAILY ENTERTAINMENT SCREENS",
    ticker:
      "COMMON SENSE CENSUS: TEENS AVERAGE 8H 39M/DAY ON ENTERTAINMENT SCREENS — PEW RESEARCH (2024): 46% OF U.S. TEENS ONLINE ALMOST CONSTANTLY — WHO HBSC (2024): PROBLEMATIC SOCIAL MEDIA USE ROSE FROM 7% TO 11%",
    summary:
      "The Common Sense Census reports U.S. teens average 8 hours and 39 minutes a day on entertainment screen media, with over 4 in 10 logging 10+ hours. Pew Research (2024) finds 46% of teens are online 'almost constantly,' while a WHO Europe study of 280,000 adolescents tracks problematic social media use climbing from 7% to 11%.",
    graphic: "stream_eye",
    sources: [
      {
        name: "Common Sense Census",
        url: "https://www.commonsensemedia.org/sites/default/files/research/report/8-18-census-integrated-report-final-web_0.pdf",
      },
      {
        name: "Pew Research (2024)",
        url: "https://www.pewresearch.org/internet/2024/12/12/teens-social-media-and-technology-2024/",
      },
      {
        name: "WHO HBSC (2024)",
        url: "https://www.who.int/europe/news/item/25-09-2024-teens-screens-and-mental-health",
      },
    ],
  },
  {
    id: "distrust",
    atPull: 30,
    severity: 0.75,
    tag: "BREAKING",
    desk: "SOCIAL TRUST",
    headline: "OUTRAGE FEEDS DEEPEN DISTRUST",
    stat: "60%",
    statSub: "UNDER 30 SAY PEOPLE CAN'T BE TRUSTED",
    ticker:
      "PEW RESEARCH: 60% OF ADULTS 18-29 SAY MOST PEOPLE CAN'T BE TRUSTED, OVERALL U.S. TRUST DOWN FROM 46% TO 34% — PNAS NEXUS (2025) & SCIENCE ADVANCES (2021): ENGAGEMENT ALGORITHMS AMPLIFY MORAL OUTRAGE",
    summary:
      "Pew Research finds 60% of adults aged 18 to 29 say most people can't be trusted (and 71% think others would take advantage of them), while overall U.S. interpersonal trust fell from 46% in 1972 to 34%. Studies in Science Advances (2021) and PNAS Nexus (2025) show engagement-driven feeds systematically amplify moral outrage and divisive content.",
    graphic: "fracture",
    sources: [
      {
        name: "Pew (2019)",
        url: "https://www.pewresearch.org/politics/2019/07/22/trust-and-distrust-in-america/",
      },
      {
        name: "Pew (2025)",
        url: "https://www.pewresearch.org/short-reads/2025/05/08/americans-declining-trust-in-each-other-and-reasons-behind-it/",
      },
      {
        name: "PNAS Nexus (2025)",
        url: "https://doi.org/10.1093/pnasnexus/pgaf062",
      },
      {
        name: "Sci. Adv. (2021)",
        url: "https://doi.org/10.1126/sciadv.abe5641",
      },
    ],
  },
  {
    id: "synthetic-companions",
    atPull: 37,
    severity: 0.84,
    tag: "TECH ALERT",
    desk: "ISOLATION",
    headline: "72% OF TEENS TRY AI COMPANIONS",
    stat: "72%",
    statSub: "TEENS WHO TRIED AI COMPANIONS",
    ticker:
      "COMMON SENSE MEDIA (2025): 72% OF U.S. TEENS USED AI COMPANIONS, 1 IN 3 FOR EMOTIONAL SUPPORT — META-GALLUP: 27% OF AGES 19-29 FEEL LONELY — MIT MEDIA LAB & OPENAI (2025): HEAVY USE TIED TO HIGHER LONELINESS",
    summary:
      "Meta-Gallup polling across 142 countries shows 27% of adults aged 19 to 29 feel very or fairly lonely—10 points higher than adults 65+. A July 2025 Common Sense Media survey found 72% of U.S. teens have used AI companions, while a 2025 MIT Media Lab and OpenAI randomized study (n=981) linked heavy daily chatbot reliance to higher loneliness and less real-world socialization.",
    graphic: "synthetic",
    sources: [
      {
        name: "Common Sense (2025)",
        url: "https://www.commonsensemedia.org/research/talk-trust-and-trade-offs-how-and-why-teens-use-ai-companions",
      },
      {
        name: "MIT / OpenAI (2025)",
        url: "https://arxiv.org/abs/2503.17473",
      },
      {
        name: "Meta-Gallup (2023)",
        url: "https://www.gallup.com/analytics/512903/state-of-social-connections.aspx",
      },
    ],
  },
  {
    id: "institutional-collapse",
    atPull: 45,
    severity: 0.92,
    tag: "CRISIS DESK",
    desk: "CIVIC TRUST",
    headline: "GEN Z INSTITUTIONAL TRUST HITS FLOOR",
    stat: "16%",
    statSub: "GEN Z TRUST NEWS (17% BIG TECH)",
    ticker:
      "GALLUP & WALTON FAMILY FOUNDATION VOICES OF GEN Z: ONLY 12% TRUST CONGRESS, 16% TRUST NEWS MEDIA, 17% TRUST BIG TECH — 40% TO 50% REPORT VERY LITTLE CONFIDENCE IN EACH",
    summary:
      "In the Gallup and Walton Family Foundation Voices of Gen Z study, just 12% of Gen Z express strong confidence in Congress, 16% in the news media, and 17% in large tech companies—with 40% to 50% saying they have very little trust in each as faith in shared public institutions erodes.",
    graphic: "collapse",
    sources: [
      {
        name: "Gallup / Walton Family Foundation",
        url: "https://news.gallup.com/opinion/gallup/510395/gen-voices-lackluster-trust-major-institutions.aspx",
      },
    ],
  },
  {
    id: "alone-in-feed",
    atPull: 54,
    severity: 1,
    tag: "24/7 WIRE",
    desk: "LATE NIGHT",
    headline: "BEDTIME SCROLLS SPIKE INSOMNIA 59%",
    stat: "+59%",
    statSub: "INSOMNIA RISK PER HOUR IN BED",
    ticker:
      "FRONTIERS IN PSYCHIATRY (2025, N=45,202): EACH EXTRA HOUR OF SCREEN USE IN BED RAISES INSOMNIA ODDS BY 59% AND CUTS 24 MINUTES OF SLEEP — 03:00 AND ONLY THE SCREEN STAYS LIT",
    summary:
      "A 2025 Frontiers in Psychiatry study of 45,202 young adults aged 18 to 28 (Hjetland et al.) found each extra hour of screen time after going to bed raises insomnia odds by 59% and cuts sleep by 24 minutes—primarily through time displacement as the endless glow crowds out rest.",
    graphic: "static_eye",
    sources: [
      {
        name: "Hjetland et al., Front. Psych. (2025)",
        url: "https://doi.org/10.3389/fpsyt.2025.1548273",
      },
      {
        name: "U.S. Surgeon General (2023)",
        url: "https://www.hhs.gov/sites/default/files/surgeon-general-social-connection-advisory.pdf",
      },
    ],
  },
];

/** Index of the latest broadcast unlocked at this many reel pulls. */
export function reportIndexAt(pulls: number): number {
  let index = 0;
  for (let i = 0; i < NEWS_REPORTS.length; i++) {
    if (pulls >= NEWS_REPORTS[i].atPull) index = i;
  }
  return index;
}

/** How many broadcasts have come on air so far. */
export function unlockedReportsCount(pulls: number): number {
  return reportIndexAt(pulls) + 1;
}

/** The broadcast on the TV right now at this many reel pulls. */
export function reportAt(pulls: number): NewsReport {
  return NEWS_REPORTS[reportIndexAt(pulls)];
}
