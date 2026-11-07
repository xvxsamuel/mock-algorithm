import type { CSSProperties } from "react";
import { faceRule } from "../algorithm/appearance";
import {
  CROWD,
  ORDINARY,
  videoReach,
  type VideoReach,
} from "../algorithm/reach";
import { CATEGORY_COLORS } from "../data/categories";
import { scanOf } from "../data/scans";
import type { FeedController } from "../hooks/useFeed";
import "./ContentLens.css";

type ContentLensProps = { feed: FeedController };

/** Where a reading's row and its box on the scanned frame light up, in s:
    one after the other, as the scanner passes over them. */
const AT = { text: 0.3, subject: 0.5, face: 0.7, sound: 0.9, topic: 1.1 };

/**
 * The video playing now, as the app reads it: the words on it, what it
 * shows, the face on camera, the sound, and so its topic and how extreme it
 * is. Then how far that lets it travel, and how your watching adds to it,
 * live.
 */
function ContentLens({ feed }: ContentLensProps) {
  const { current, currentItem, started } = feed;
  const { video, watchMs } = current;
  const scan = scanOf(video);
  const { face } = scan;
  const rule = face === null ? null : faceRule(face);
  const [from, to] = CATEGORY_COLORS[video.category];
  const durationMs = video.durationSec * 1000;
  const reach = videoReach(
    video,
    face,
    currentItem.ranking.source,
    started ? watchMs : 0,
  );

  return (
    <div className="lens">
      <section className="pane con-scan">
        <div className="pane-head">
          <h2 className="eyebrow">
            Scanning <span className="con-handle">@{video.creator}</span>
          </h2>
        </div>
        <div className="con-body">
          {/* The video playing now, scanned again each time it changes. */}
          <div
            key={currentItem.key}
            className="con-mini"
            data-link="scan"
            style={{
              backgroundImage: `linear-gradient(160deg, ${from}, ${to})`,
            }}
          >
            <p className="con-box is-text" style={delay(AT.text)}>
              <span className="con-mini-sticker">
                {wholeWords(video.overlay)}
              </span>
            </p>
            <span className="con-box is-subject" style={delay(AT.subject)}>
              <span className="con-mini-art" aria-hidden="true">
                {video.emoji}
              </span>
            </span>
            {face !== null && (
              <span
                className={
                  rule === null ? "con-box is-face" : "con-box is-face is-cut"
                }
                style={delay(AT.face)}
              >
                <span className="con-face" aria-hidden="true">
                  {face.emoji}
                </span>
              </span>
            )}
            <span
              className="con-box is-sound"
              style={delay(AT.sound)}
              aria-hidden="true"
            >
              ♫
            </span>
            <span className="con-sweep" aria-hidden="true" />
            {/* Where the video playing now is, as it plays. */}
            <span
              className="con-play"
              style={{
                width: `${((watchMs % durationMs) / durationMs) * 100}%`,
              }}
              aria-hidden="true"
            />
          </div>

          {/* What each box says, in the order the scanner finds it. */}
          <dl key={`read-${currentItem.key}`} className="con-reads">
            <div className="con-read" style={delay(AT.text)}>
              <dt>reads</dt>
              <dd className="con-quote">{video.overlay}</dd>
            </div>
            <div className="con-read" style={delay(AT.subject)}>
              <dt>sees</dt>
              <dd>
                {scan.sees}{" "}
                <span className="con-sure">{percent(scan.sure)}</span>
              </dd>
            </div>
            <div
              className={rule === null ? "con-read" : "con-read is-cut"}
              style={delay(AT.face)}
            >
              <dt>rates</dt>
              {face === null ? (
                <dd className="tone-muted">nobody on camera</dd>
              ) : rule === null ? (
                <dd>
                  {face.age}, looks <b>{face.looks.toFixed(1)}</b>
                </dd>
              ) : (
                <dd title="Leaked TikTok moderation rules, 2019–20. TikTok says they are no longer used.">
                  {face.age} <q>{rule}</q>
                </dd>
              )}
            </div>
            <div className="con-read" style={delay(AT.sound)}>
              <dt>hears</dt>
              <dd>{video.sound ?? "original sound"}</dd>
            </div>
            <div className="con-read is-verdict" style={delay(AT.topic)}>
              <dt>topic</dt>
              <dd>
                <span
                  className="con-topic"
                  style={{
                    backgroundImage: `linear-gradient(120deg, ${from}, ${to})`,
                  }}
                >
                  {video.category}
                </span>
                <span className="con-extreme">
                  <span className="con-extreme-track" aria-hidden="true">
                    <span
                      className="con-extreme-fill"
                      style={{ width: `${video.intensity * 100}%` }}
                    />
                  </span>
                  extreme
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="pane con-reach">
        <div className="pane-head">
          <h2 className="eyebrow">How far it goes</h2>
          <p
            className={reach.followersOnly ? "con-figure is-cut" : "con-figure"}
          >
            {reach.followersOnly ? (
              "followers only"
            ) : (
              <>
                ×{(reach.people / ORDINARY).toFixed(1)}
                <small>reach</small>
              </>
            )}
          </p>
        </div>
        <Crowd key={currentItem.key} reach={reach} />
        <ul className="con-parts">
          {face !== null && (
            <Part
              tone={reach.face < 0 ? "cut" : "up"}
              label={
                rule === null ? `looks ${face.looks.toFixed(1)}` : face.age
              }
              people={reach.face}
            />
          )}
          {reach.extreme > 0 && (
            <Part tone="up" label="extreme" people={reach.extreme} />
          )}
          {reach.paid > 0 && (
            <Part tone="paid" label="paid" people={reach.paid} />
          )}
          {reach.pushed > 0 && (
            <Part tone="pushed" label="bots" people={reach.pushed} />
          )}
          {started && (
            <Part
              tone="you"
              label={`your watch ${Math.floor(watchMs / 1000)}s`}
              people={reach.watch}
            />
          )}
        </ul>
      </section>
    </div>
  );
}

type Tone = "up" | "cut" | "paid" | "pushed" | "you";

/**
 * The people it reaches, one figure each. The first row is what an ordinary
 * video reaches; lit in the colour of what carried it there, in pink the
 * ones its face cost it.
 */
function Crowd({ reach }: { reach: VideoReach }) {
  const content = ORDINARY + reach.face + reach.extreme;
  const bands: [Tone, number][] = [
    ["up", content],
    ["paid", reach.paid],
    ["pushed", reach.pushed],
    ["you", reach.watch],
    ["cut", Math.max(-reach.face, 0)],
  ];
  const tones: (Tone | null)[] = [];
  for (const [tone, count] of bands) {
    for (let i = 0; i < count; i++) tones.push(tone);
  }

  return (
    <div className="con-crowd-wrap">
      <div
        className="con-crowd"
        role="img"
        aria-label={`Shown to ${reach.people} of these ${CROWD} people. An ordinary video: ${ORDINARY}.`}
      >
        {Array.from({ length: CROWD }, (_, i) => {
          const tone = tones[i] ?? null;
          return (
            <span
              key={i}
              className={tone === null ? "con-person" : `con-person is-${tone}`}
            />
          );
        })}
      </div>
      <span className="con-ordinary" title="An ordinary video">
        ×1
      </span>
    </div>
  );
}

function Part({
  tone,
  label,
  people,
}: {
  tone: Tone;
  label: string;
  people: number;
}) {
  return (
    <li className={`con-part is-${tone}`}>
      {label}
      <b>{people > 0 ? `+${people}` : people < 0 ? `−${-people}` : "+0"}</b>
    </li>
  );
}

/** A reading lands as the scanner reaches it. */
function delay(seconds: number): CSSProperties {
  return { animationDelay: `${seconds}s` };
}

/** Hyphens that do not break, so a cut line never ends in "self-". */
function wholeWords(text: string): string {
  return text.replaceAll("-", "‑");
}

function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

export default ContentLens;
