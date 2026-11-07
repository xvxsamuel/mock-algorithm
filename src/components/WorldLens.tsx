import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatClock } from "../algorithm/clock";
import {
  GRAMS_PER_MINUTE,
  MB_PER_MINUTE,
  METRES_PER_GRAM,
  PAID_FROM_SEC,
  REMOVED_PER_MINUTE,
  SAMPLE_EMAIL,
  SPLIT,
  WORLD_FACTS,
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

const EDGES: { from: WorldNodeId; to: WorldNodeId; flow: Flow }[] = [
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

const SPLIT_PARTS: { key: keyof typeof SPLIT; label: string }[] = [
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

/** Below this width the nodes get smaller... */
const COMPACT_PX = 560;
/** ...and below this one the map stacks into four rows. */
const STACKED_PX = 440;
/** Room kept around the node centres, for the circles and their labels.
    Wide, your big phone sits on the bottom row and needs more below it. */
const INSET = { x: 58, top: 26, bottom: 64 };
const COMPACT_INSET = { x: 48, top: 26, bottom: 56 };

type WorldLensProps = { feed: FeedController };

/**
 * Everything one scroll touches, beyond the app: the people and companies
 * in it, the machines that carry it, and the phone it runs on, from the
 * mine to the bin. Its CO2 adds up as you scroll.
 */
function WorldLens({ feed }: WorldLensProps) {
  const map = useRef<HTMLDivElement>(null);
  const factPane = useRef<HTMLDivElement>(null);
  const { width, height } = useElementSize(map);
  const [picked, setPicked] = useState<WorldNodeId>("phone");
  const hash = useHash(SAMPLE_EMAIL);

  const minutes = feed.sessionMs / 60_000;
  const grams = minutes * GRAMS_PER_MINUTE;
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
    creators: paying === 0 ? "€0 from you" : `${paying} paid`,
    network: `${(grams * SPLIT.network).toFixed(2)} g, ${Math.round(megabytes)} MB`,
    phone: `${(grams * SPLIT.phone).toFixed(2)} g`,
    mines: "cobalt",
    factory: "30–60 kg",
    drawer: "700 million",
    ewaste: "22% recycled",
  };

  const compact = width > 0 && width < COMPACT_PX;
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
  const live = feed.started && !feed.ended;

  return (
    <div className="lens">
      <section className="pane world">
        <div className="world-head">
          <h2 className="eyebrow">What your scroll is made of</h2>
          <p className="world-total">
            <b>{grams.toFixed(1)} g</b> CO2e in {formatClock(feed.sessionMs)},
            like driving {Math.round(metres)} m
          </p>
        </div>
        {/* Where each gram comes from: mostly not the cloud. */}
        <div className="world-split" aria-label="Where the CO2 comes from">
          {SPLIT_PARTS.map(({ key, label }) => (
            <span
              key={key}
              className={`world-split-part is-${key}`}
              // The data centres' sliver is too thin to scale: a tick.
              style={{ flexGrow: key === "servers" ? 0 : SPLIT[key] }}
            >
              <span className="world-split-bar" />
              <span className="world-split-label">
                {label} <b>{percent(SPLIT[key])}</b>
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
              {EDGES.map(({ from, to, flow }) => {
                const a = spot(from);
                const b = spot(to);
                return (
                  <line
                    key={`${from}-${to}`}
                    className={`world-line is-${flow}`}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                  />
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
          <p className="world-fact-text">
            {picked === "sites" && hash !== null && (
              <span className="world-hash">
                {SAMPLE_EMAIL} <span aria-hidden="true">→</span>{" "}
                {hash.slice(0, 24)}…
              </span>
            )}
            {fact.text}
            {picked === "creators" && paying === 0 && " None you watched were."}
          </p>
          {fact.source !== "" && (
            <a
              className="world-source"
              href={fact.url}
              target="_blank"
              rel="noreferrer"
            >
              {fact.source}
            </a>
          )}
        </div>
      </section>
    </div>
  );
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

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export default WorldLens;
