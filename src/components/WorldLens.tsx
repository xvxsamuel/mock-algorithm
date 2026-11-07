import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatClock } from "../algorithm/clock";
import {
  footprint,
  KIND_LABELS,
  LONGER_YEARS,
  MB_PER_MINUTE,
  METRES_PER_GRAM,
  PAID_FROM_SEC,
  PHONE_YEARS,
  phoneText,
  splitPercents,
  REMOVED_PER_MINUTE,
  SAMPLE_EMAIL,
  WORLD_FACTS,
  type Footprint,
  type WorldNodeId,
} from "../data/world";
import { useElementSize } from "../hooks/useElementSize";
import type { FeedController } from "../hooks/useFeed";
import "./WorldLens.css";

/** What flows along a line: data, money, people's work, the video itself,
    or matter (the stuff a phone is made of, and what is left of it). */
type Flow = "data" | "money" | "work" | "video" | "matter";

type Spot = { x: number; y: number };

type WorldNode = {
  id: WorldNodeId;
  icon: string;
  name: string;
  /** Where it sits, as shares of the map's width and height: in three
      rows, or stacked in four on a phone. */
  at: { wide: Spot; stacked: Spot };
  big?: boolean;
};

/**
 * Top: TikTok and who else is in your scroll. Down the middle: the network
 * that carries each video to you. Bottom: your phone, between what it is
 * made of and where it ends up.
 */
const NODES: WorldNode[] = [
  node("sites", "🌐", "Websites", [0, 0], [0, 0]),
  node("tiktok", "♪", "TikTok", [0.5, 0], [0.5, 0]),
  node("advertisers", "💸", "Advertisers", [1, 0], [1, 0]),
  node("moderators", "🧑‍💻", "Moderators", [0, 0.5], [0, 0.33]),
  node("network", "📡", "Network", [0.5, 0.5], [0.5, 0.33]),
  node("creators", "🎬", "Creators", [1, 0.5], [1, 0.33]),
  {
    ...node("phone", "📱", "Your phone", [0.5, 1], [0.5, 0.66]),
    big: true,
  },
  node("mines", "⛏️", "Mines", [0, 1], [0, 1]),
  node("factory", "🏭", "Factory", [0.25, 1], [0, 0.66]),
  node("drawer", "🗃️", "Drawer", [0.75, 1], [1, 0.66]),
  node("ewaste", "🗑️", "E-waste", [1, 1], [1, 1]),
];

type Edge = { from: WorldNodeId; to: WorldNodeId; flow: Flow };

const EDGES: Edge[] = [
  { from: "sites", to: "tiktok", flow: "data" },
  { from: "advertisers", to: "tiktok", flow: "money" },
  { from: "moderators", to: "tiktok", flow: "work" },
  { from: "creators", to: "tiktok", flow: "video" },
  { from: "tiktok", to: "network", flow: "video" },
  { from: "network", to: "phone", flow: "video" },
  { from: "mines", to: "factory", flow: "matter" },
  { from: "factory", to: "phone", flow: "matter" },
  { from: "phone", to: "drawer", flow: "matter" },
  { from: "drawer", to: "ewaste", flow: "matter" },
];

const SPLIT_PARTS: {
  key: Exclude<keyof Footprint, "total">;
  label: string;
}[] = [
  { key: "phone", label: "your phone" },
  { key: "network", label: "network" },
  { key: "servers", label: "data centres" },
];

const FLOW_LABELS: Record<Flow, string> = {
  data: "data",
  money: "money",
  work: "work",
  video: "videos",
  matter: "materials",
};

/** Below this width, or this height, the nodes get smaller... */
const COMPACT_PX = 560;
const SHORT_PX = 290;
/** ...and below this one the map stacks into four rows. */
const STACKED_PX = 440;
/** Room kept around the node centres, for the circles and their labels.
    Wide, your big phone sits on the bottom row and needs more below it. */
const INSET = { x: 58, top: 26, bottom: 64 };
const COMPACT_INSET = { x: 48, top: 22, bottom: 58 };

type WorldLensProps = {
  feed: FeedController;
  /** How long the phone is kept, in years: it changes every gram. */
  years: number;
  onYears: (years: number) => void;
};

/**
 * Everything one scroll touches, beyond the app: the people and companies
 * in it, the machines that carry it, and the phone it runs on, from the
 * mine to the bin. Its CO2e adds up as you scroll.
 */
function WorldLens({ feed, years, onYears }: WorldLensProps) {
  const map = useRef<HTMLDivElement>(null);
  const factPane = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(map);
  const [picked, setPicked] = useState<WorldNodeId>("phone");
  const hash = useHash(SAMPLE_EMAIL);

  const minutes = feed.sessionMs / 60_000;
  const perMinute = footprint(years);
  const shares = splitPercents(years);
  const grams = minutes * perMinute.total;
  const metres = grams * METRES_PER_GRAM;
  const megabytes = minutes * MB_PER_MINUTE;
  // Videos long enough for their creator to be paid at all.
  const paying = [
    ...feed.history.map((entry) => entry.impression),
    feed.current,
  ]
    .filter((impression) => impression.source !== "ad")
    .filter(
      (impression) => impression.video.durationSec > PAID_FROM_SEC,
    ).length;
  const brands = new Set(
    feed.market.sales
      .filter((sale) => sale.kind === "ad")
      .map((sale) => sale.brand),
  ).size;

  const values: Partial<Record<WorldNodeId, string>> = {
    tiktok: `€${feed.market.earned.toFixed(4)}`,
    sites: hash === null ? "…" : `${hash.slice(0, 8)}…`,
    advertisers: `${brands} paid`,
    moderators: `${Math.round(minutes * REMOVED_PER_MINUTE).toLocaleString("en")} taken down`,
    creators: paying === 0 ? "€0 from you" : `${paying} over a minute`,
    network: `${(minutes * perMinute.network).toFixed(2)} g, ${Math.round(megabytes)} MB`,
    phone: `${(minutes * perMinute.phone).toFixed(2)} g`,
    mines: "cobalt",
    factory: "80% of CO2e",
    drawer: "700 million",
    ewaste: "22% recycled",
  };

  const compact = width > 0 && (width < COMPACT_PX || height < SHORT_PX);
  const stacked = width > 0 && width < STACKED_PX;
  const spot = (id: WorldNodeId): Spot => {
    const found = NODES.find((n) => n.id === id);
    const share =
      found === undefined
        ? { x: 0.5, y: 0.5 }
        : stacked
          ? found.at.stacked
          : found.at.wide;
    const inset = compact ? COMPACT_INSET : INSET;
    return {
      x: inset.x + share.x * (width - 2 * inset.x),
      y: inset.top + share.y * (height - inset.top - inset.bottom),
    };
  };
  const fact = WORLD_FACTS[picked];
  const pickedNode = NODES.find((n) => n.id === picked);
  const near = flowsThrough(picked);
  const live = feed.started && !feed.ended;

  return (
    <div className="lens">
      <section className="pane world">
        <div className="world-head">
          <h2 className="eyebrow">What your scroll is made of</h2>
          <p className="world-total">
            <b>{grams.toFixed(1)} g</b> CO2e on Wi-Fi in{" "}
            {formatClock(feed.sessionMs)}, like a new car driving&nbsp;
            {Math.round(metres)}&nbsp;m
          </p>
        </div>
        {/* Where each gram comes from: mostly not the cloud. */}
        <div
          className="world-split"
          aria-label="Where the CO2e comes from, on Wi-Fi"
        >
          {SPLIT_PARTS.map(({ key, label }) => (
            <span
              key={key}
              className={`world-split-part is-${key}`}
              // The data centres' sliver is too thin to scale: a tick.
              style={{
                flexGrow:
                  key === "servers" ? 0 : perMinute[key] / perMinute.total,
              }}
            >
              <span className="world-split-bar" />
              <span className="world-split-label">
                {label} <b>{shares[key]}%</b>
              </span>
            </span>
          ))}
        </div>

        <div
          ref={map}
          className={
            "world-map" +
            (compact ? " is-compact" : "") +
            (stacked ? " is-stacked" : "")
          }
        >
          {width > 0 && (
            <svg
              className="world-lines"
              width={width}
              height={height}
              aria-hidden="true"
            >
              {EDGES.map((edge) => {
                const { from, to, flow } = edge;
                const a = spot(from);
                const b = spot(to);
                const tone = `is-${flow}${near.has(edge) ? " is-near" : ""}`;
                // Halfway along, a small arrow says which way it flows.
                const angle =
                  (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
                const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
                return (
                  <g key={`${from}-${to}`}>
                    <line
                      className={`world-line ${tone}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                    />
                    <path
                      className={`world-arrow ${tone}`}
                      d="M -4 -4 L 4 0 L -4 4 z"
                      transform={`translate(${mid.x.toFixed(1)} ${mid.y.toFixed(1)}) rotate(${angle.toFixed(1)})`}
                    />
                  </g>
                );
              })}
            </svg>
          )}

          {/* Each swipe: the video comes down to you, your data goes up. */}
          {width > 0 && live && (
            <span key={feed.currentItem.key} aria-hidden="true">
              <Pulse
                path={[spot("tiktok"), spot("network"), spot("phone")]}
                flow="video"
              />
              <Pulse
                path={[spot("phone"), spot("network"), spot("tiktok")]}
                flow="data"
              />
              {feed.currentItem.auction !== null && (
                <Pulse
                  path={[spot("advertisers"), spot("tiktok")]}
                  flow="money"
                />
              )}
            </span>
          )}

          {width > 0 &&
            NODES.map(({ id, icon, name, big }) => {
              const { x, y } = spot(id);
              const classes = ["world-node"];
              if (big === true) classes.push("is-big");
              if (id === picked) classes.push("is-picked");
              return (
                <button
                  key={id}
                  type="button"
                  className={classes.join(" ")}
                  style={{ left: x, top: y }}
                  aria-pressed={id === picked}
                  onClick={() => {
                    setPicked(id);
                    if (stacked) {
                      factPane.current?.scrollIntoView({
                        block: "nearest",
                        behavior: "smooth",
                      });
                    }
                  }}
                >
                  <span className="world-icon" aria-hidden="true">
                    {icon}
                  </span>
                  <span className="world-name">{name}</span>
                  {values[id] !== undefined && (
                    <span className={`world-value is-${id}`}>{values[id]}</span>
                  )}
                </button>
              );
            })}
        </div>

        <ul className="world-key" aria-label="Lines">
          {(["data", "money", "work", "video", "matter"] as const).map(
            (flow) => (
              <li key={flow} className={`is-${flow}`}>
                {FLOW_LABELS[flow]}
              </li>
            ),
          )}
        </ul>

        <div ref={factPane} className="world-fact" aria-live="polite">
          {/* Which part, its number, and how that number is known. On the
              phone, the one thing here you can change: how long you keep it. */}
          <div className="world-fact-head">
            <span aria-hidden="true">{pickedNode?.icon}</span>
            <b>{pickedNode?.name}</b>
            {values[picked] !== undefined && (
              <span className={`world-value is-${picked}`}>
                {values[picked]}
              </span>
            )}
            {fact.kind !== undefined && (
              <span className="kind">{KIND_LABELS[fact.kind]}</span>
            )}
            {picked === "phone" && (
              <div className="world-keep">
                <span>Kept for</span>
                <div
                  className="levers"
                  role="group"
                  aria-label="Phone kept for"
                >
                  {[PHONE_YEARS, LONGER_YEARS].map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={option === years ? "lever is-on" : "lever"}
                      aria-pressed={option === years}
                      onClick={() => onYears(option)}
                    >
                      {option} years
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="world-fact-text">
            {picked === "sites" && hash !== null && (
              <span className="world-hash">
                {SAMPLE_EMAIL} <span aria-hidden="true">→</span>{" "}
                {hash.slice(0, 24)}…
              </span>
            )}
            {picked === "phone" ? phoneText(years) : fact.text}
            {picked === "creators" &&
              paying === 0 &&
              " None you watched were."}{" "}
            <span className="world-sources">
              {fact.sources.map((source, i) => (
                <span key={source.url}>
                  {i > 0 && "; "}
                  <a
                    className="world-source"
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {source.name}
                  </a>
                </span>
              ))}
            </span>
          </p>
        </div>
      </section>
    </div>
  );
}

/**
 * The lines to light up for a part: every flow it is on, followed along
 * that flow both ways. The phone lights the video coming in and its whole
 * life from mine to bin.
 */
function flowsThrough(id: WorldNodeId): Set<Edge> {
  const lit = new Set<Edge>();
  for (const start of EDGES.filter((e) => e.from === id || e.to === id)) {
    const reached = new Set<WorldNodeId>([start.from, start.to]);
    lit.add(start);
    let grew = true;
    while (grew) {
      grew = false;
      for (const edge of EDGES) {
        if (edge.flow !== start.flow || lit.has(edge)) continue;
        if (reached.has(edge.from) || reached.has(edge.to)) {
          lit.add(edge);
          reached.add(edge.from);
          reached.add(edge.to);
          grew = true;
        }
      }
    }
  }
  return lit;
}

/** A dot running along a path of points, once. */
function Pulse({ path, flow }: { path: Spot[]; flow: Flow }) {
  const d = path
    .map(
      ({ x, y }, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`,
    )
    .join(" ");
  const style: CSSProperties = { offsetPath: `path("${d}")` };
  return <span className={`world-pulse is-${flow}`} style={style} />;
}

/** The SHA-256 of a text, in hex, worked out in this browser. */
function useHash(text: string): string | null {
  const [hash, setHash] = useState<string | null>(null);
  useEffect(() => {
    let gone = false;
    const bytes = new TextEncoder().encode(text);
    crypto.subtle
      .digest("SHA-256", bytes)
      .then((digest) => {
        if (gone) return;
        const hex = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        setHash(hex);
      })
      .catch(() => setHash(null));
    return () => {
      gone = true;
    };
  }, [text]);
  return hash;
}

function node(
  id: WorldNodeId,
  icon: string,
  name: string,
  wide: [number, number],
  stacked: [number, number],
): WorldNode {
  return {
    id,
    icon,
    name,
    at: {
      wide: { x: wide[0], y: wide[1] },
      stacked: { x: stacked[0], y: stacked[1] },
    },
  };
}

export default WorldLens;
