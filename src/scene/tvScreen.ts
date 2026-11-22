import type { NewsGraphic, NewsReport } from "../data/news";
import {
  clamp,
  cross,
  dot,
  lerp,
  mix,
  normalize,
  sub,
  type Vec3,
} from "./math";

/* Renders the hut's CRT news broadcast onto a 640x480 2D canvas that WebGL
   uploads and samples at native display resolution through the CRT glass pass.
   A classic 4:3 news broadcast: the deadpan carp anchor behind a news desk,
   an over-the-shoulder graphic with one big figure, a white headline plate
   and a slim crawl. The TV is read from across the room, so nothing on it is
   set small; the card beside the TV carries the details. */

export const TV_WIDTH = 640;
export const TV_HEIGHT = 480;

const FONT_DISPLAY =
  '"Arial Narrow", "Franklin Gothic Medium", "Helvetica Neue", Arial, sans-serif';
const FONT_NEWS = '"Helvetica Neue", "Segoe UI", Arial, Helvetica, sans-serif';

export type TvFrameInput = {
  report: NewsReport;
  /** Seconds since the page opened, for the ticker, anchor speech, and source cycling. */
  time: number;
  /** 0 to 1: brief static burst right after a channel/report cut. */
  glitch: number;
  /** 0 to 1: overall room decay, adding subtle background snow late at night. */
  decay: number;
};

export type TvScreen = {
  canvas: HTMLCanvasElement;
  render: (input: TvFrameInput) => void;
};

type BroadcastTheme = {
  wallTop: string;
  wallBot: string;
  wallGlow: string;
  windowTint: string;
  deskTop: string;
  deskFront: string;
  deskTrim: string;
  otsHeaderBg: string;
  otsStatBg: string;
  otsAccent: string;
  kickerBg: string;
  kickerText: string;
  tickerBg: string;
  tickerRule: string;
  tieColor: string;
  rimTint: string;
};

function themeFor(report: NewsReport): BroadcastTheme {
  const sev = report.severity;
  const isBreaking =
    report.tag === "BREAKING" || report.tag === "CRISIS DESK" || sev >= 0.7;
  const isSpecial =
    report.tag === "SPECIAL REPORT" ||
    report.tag === "INVESTIGATION" ||
    report.tag === "ATTENTION" ||
    report.tag === "TECH ALERT";

  if (sev >= 0.7) {
    return {
      wallTop: "#141828",
      wallBot: "#24111a",
      wallGlow: "rgba(186, 46, 58, 0.24)",
      windowTint: "#121829",
      deskTop: "#493022",
      deskFront: "#151a28",
      deskTrim: "#c8963e",
      otsHeaderBg: "#7d1720",
      otsStatBg: "#1b1019",
      otsAccent: "#d42b35",
      kickerBg: "#c41822",
      kickerText: "#ffffff",
      tickerBg: "#8f131b",
      tickerRule: "#e2b23b",
      tieColor: "#9c1b24",
      rimTint: "#d95b66",
    };
  }

  if (sev >= 0.34) {
    return {
      wallTop: "#132440",
      wallBot: "#1c2c48",
      wallGlow: "rgba(218, 160, 62, 0.16)",
      windowTint: "#10203a",
      deskTop: "#563826",
      deskFront: "#13223a",
      deskTrim: "#d2a03c",
      otsHeaderBg: isBreaking ? "#8c1a22" : "#18335c",
      otsStatBg: "#10203b",
      otsAccent: isBreaking ? "#cf232c" : "#d69c28",
      kickerBg: isBreaking ? "#c41822" : "#cf8e18",
      kickerText: isBreaking ? "#ffffff" : "#10151e",
      tickerBg: "#941820",
      tickerRule: "#e3b43c",
      tieColor: "#8f222a",
      rimTint: "#e2b462",
    };
  }

  return {
    wallTop: "#15325c",
    wallBot: "#0f2342",
    wallGlow: "rgba(116, 174, 236, 0.18)",
    windowTint: "#0e2240",
    deskTop: "#5c3c28",
    deskFront: "#132542",
    deskTrim: "#d4a442",
    otsHeaderBg: "#163868",
    otsStatBg: "#102442",
    otsAccent: "#c92028",
    kickerBg: isSpecial ? "#c41a22" : "#194a8a",
    kickerText: "#ffffff",
    tickerBg: "#19355c",
    tickerRule: "#c92028",
    tieColor: "#9c222a",
    rimTint: "#9cc2eb",
  };
}

/**
 * Light the CRT screen casts into the hut: subtle in daylight, then growing
 * dominant and harsher as night falls and the news worsens until it is the
 * only light left in the room.
 */
export function tvLightFor(
  report: NewsReport,
  decay: number,
  night: number,
  time: number,
): Vec3 {
  const cold: Vec3 = [0.64, 0.84, 1.06];
  const bleak: Vec3 = [0.58, 0.68, 0.98];
  const alert: Vec3 = [1.14, 0.3, 0.34];

  const base = mix(cold, bleak, report.severity);
  // Late-stage breaking reports breathe gently toward red with the chyron.
  const pulse =
    report.severity > 0.55
      ? (0.5 + 0.5 * Math.sin(time * 1.4)) * (report.severity - 0.5) * 0.55
      : 0;
  const tint = mix(base, alert, clamp(pulse, 0, 0.4));
  // Subtle slow CRT drift rather than rapid strobing, so quantized walls stay calm.
  const hum =
    1 + 0.012 * Math.sin(time * 1.9) + 0.008 * Math.sin(time * 3.7 + 1.4);
  const dark = clamp(
    night * 0.72 + Math.pow(clamp(decay, 0, 1), 1.35) * 0.45,
    0,
    1,
  );
  const eased = dark * dark * (3 - 2 * dark);
  const strength = lerp(0.09, 1.95, eased);
  return [
    tint[0] * strength * hum,
    tint[1] * strength * hum,
    tint[2] * strength * hum,
  ];
}

export function createTvScreen(): TvScreen {
  const canvas = document.createElement("canvas");
  canvas.width = TV_WIDTH;
  canvas.height = TV_HEIGHT;
  const ctx = canvas.getContext("2d");

  const render = ({ report, time, glitch, decay }: TvFrameInput): void => {
    if (ctx === null) return;
    ctx.imageSmoothingEnabled = true;

    const theme = themeFor(report);

    // 1. Full-bleed broadcast studio backdrop (no top app bar, no sci-fi grid).
    drawStudioBackdrop(ctx, theme, report.severity);

    // 2. Carp news anchor seated naturally in the studio on the left, behind the desk.
    drawCarpAnchor(ctx, 168, 250, theme, report.severity, time);

    // 3. Full-width physical studio news desk spanning across the foreground.
    drawStudioDesk(ctx, 250, 168, theme);

    // 4. Over-the-shoulder (OTS) broadcast graphic slate on the right side of the studio.
    drawOtsSlate(ctx, report, theme, time);

    // 5. Channel bug, kicker flag, headline plate and news crawl.
    drawLowerThird(ctx, report, theme, time);

    // 6. Brief analog CRT static on channel/report cuts and faint late-night snow.
    const noiseAmount = clamp(glitch + decay * 0.05, 0, 1);
    if (noiseAmount > 0.05) {
      drawStatic(ctx, noiseAmount, time);
    }
  };

  return { canvas, render };
}

/**
 * Draws a physical-feeling television news studio set: studio cyclorama wall,
 * soft vertical studio sconces, frosted glass newsroom partition with muted
 * background desks/monitors, subtle world-map wash, and overhead key light.
 */
function drawStudioBackdrop(
  ctx: CanvasRenderingContext2D,
  theme: BroadcastTheme,
  severity: number,
): void {
  const grad = ctx.createLinearGradient(0, 0, 0, 290);
  grad.addColorStop(0, theme.wallTop);
  grad.addColorStop(1, theme.wallBot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TV_WIDTH, 292);

  // Soft studio spotlight glow behind the anchor seat.
  const spot = ctx.createRadialGradient(170, 130, 18, 170, 135, 220);
  spot.addColorStop(0, theme.wallGlow);
  spot.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, TV_WIDTH, 260);

  // Architectural studio wall paneling & subtle frosted newsroom window band.
  ctx.fillStyle = theme.windowTint;
  ctx.fillRect(0, 68, TV_WIDTH, 168);

  // Faint horizontal architectural blinds/trim bars behind glass.
  ctx.fillStyle = "rgba(255, 255, 255, 0.05)";
  ctx.fillRect(0, 68, TV_WIDTH, 3);
  ctx.fillRect(0, 234, TV_WIDTH, 3);
  for (let y = 94; y < 230; y += 26) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.035)";
    ctx.fillRect(0, y, TV_WIDTH, 2);
  }

  // Soft out-of-focus newsroom silhouettes behind the frosted studio glass:
  // distant studio monitors and warm tungsten desk lamps.
  const monitors = [
    [34, 110, 44, 28],
    [254, 102, 50, 32],
    [262, 152, 38, 24],
    [420, 108, 48, 30],
    [548, 114, 42, 26],
  ] as const;
  for (const [mx, my, mw, mh] of monitors) {
    ctx.fillStyle =
      severity > 0.7 ? "rgba(180, 95, 102, 0.14)" : "rgba(130, 178, 232, 0.16)";
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
    ctx.fillRect(mx + 4, my + 5, mw - 8, 5);
  }

  // Subtle warm tungsten newsroom desk lamp pools in the background.
  const lamps = [
    [58, 188],
    [282, 194],
  ] as const;
  for (const [lx, ly] of lamps) {
    const lamp = ctx.createRadialGradient(lx, ly, 2, lx, ly, 42);
    lamp.addColorStop(
      0,
      severity > 0.7 ? "rgba(218, 134, 72, 0.18)" : "rgba(244, 198, 118, 0.24)",
    );
    lamp.addColorStop(1, "rgba(244, 198, 118, 0)");
    ctx.fillStyle = lamp;
    ctx.fillRect(lx - 44, ly - 44, 88, 88);
  }

  // Softly brushed vertical studio columns framing the anchor area.
  const columns = [
    [0, 26],
    [290, 20],
  ] as const;
  for (const [cx, cw] of columns) {
    ctx.fillStyle = "rgba(7, 13, 24, 0.45)";
    ctx.fillRect(cx, 0, cw, 252);
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    ctx.fillRect(cx + cw - 2, 0, 2, 252);
  }

  // Faint classic broadcast world-map silhouette behind the anchor.
  ctx.fillStyle = "rgba(215, 230, 250, 0.055)";
  const continents = [
    [54, 104, 48, 22],
    [76, 126, 26, 30],
    [138, 96, 56, 20],
    [152, 118, 34, 34],
    [206, 102, 58, 28],
    [232, 136, 30, 22],
  ] as const;
  for (const [x, y, w, h] of continents) {
    ctx.fillRect(x, y, w, h);
  }

  // Gentle top-down studio light falloff from the lighting grid.
  const topBeam = ctx.createLinearGradient(0, 0, 0, 96);
  topBeam.addColorStop(0, "rgba(255, 248, 234, 0.09)");
  topBeam.addColorStop(1, "rgba(255, 248, 234, 0)");
  ctx.fillStyle = topBeam;
  ctx.fillRect(30, 0, 260, 96);
}

/**
 * Draws the physical anchor desk spanning the full width of the studio shot,
 * with warm wood desktop, broadcast front fascia, brass trim, script pages,
 * ceramic mug, and a low broadcast desk microphone.
 */
function drawStudioDesk(
  ctx: CanvasRenderingContext2D,
  deskY: number,
  anchorX: number,
  theme: BroadcastTheme,
): void {
  // Warm studio wood desktop surface
  const topGrad = ctx.createLinearGradient(0, deskY, 0, deskY + 15);
  topGrad.addColorStop(0, theme.deskTop);
  topGrad.addColorStop(1, "#352116");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, deskY, TV_WIDTH, 15);

  // Subtle highlight bevel along front edge of the tabletop
  ctx.fillStyle = "rgba(255, 238, 210, 0.22)";
  ctx.fillRect(0, deskY, TV_WIDTH, 2);

  // Desk front fascia & brushed brass trim bar
  ctx.fillStyle = theme.deskFront;
  ctx.fillRect(0, deskY + 15, TV_WIDTH, 32);
  ctx.fillStyle = theme.deskTrim;
  ctx.fillRect(0, deskY + 15, TV_WIDTH, 3);

  // Anchor's printed script stack on the desk (left of center)
  ctx.fillStyle = "#e6e9ef";
  ctx.beginPath();
  ctx.moveTo(anchorX - 72, deskY + 3);
  ctx.lineTo(anchorX - 16, deskY + 2);
  ctx.lineTo(anchorX - 10, deskY + 12);
  ctx.lineTo(anchorX - 70, deskY + 13);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#92a0b5";
  ctx.fillRect(anchorX - 62, deskY + 5, 34, 2);
  ctx.fillRect(anchorX - 60, deskY + 9, 26, 2);

  // Slim broadcast desk microphone on stand
  ctx.fillStyle = "#1a202c";
  ctx.fillRect(anchorX + 26, deskY + 5, 20, 5);
  ctx.strokeStyle = "#2b3445";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(anchorX + 36, deskY + 5);
  ctx.lineTo(anchorX + 24, deskY - 19);
  ctx.stroke();
  ctx.fillStyle = "#161b24";
  ctx.beginPath();
  ctx.ellipse(anchorX + 21, deskY - 22, 7, 5, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#485468";
  ctx.fillRect(anchorX + 17, deskY - 24, 4, 2);

  // Ceramic broadcast studio mug on the desk
  const mugX = anchorX + 66;
  ctx.fillStyle = "#dfe5ee";
  ctx.fillRect(mugX, deskY - 14, 18, 20);
  ctx.fillStyle = "#b4c0d2";
  ctx.fillRect(mugX + 10, deskY - 14, 8, 20);
  ctx.fillStyle = "#b4c0d2";
  ctx.fillRect(mugX + 18, deskY - 10, 5, 3);
  ctx.fillRect(mugX + 21, deskY - 10, 3, 10);
  ctx.fillRect(mugX + 18, deskY - 2, 5, 3);
  ctx.fillStyle = "#b81820";
  ctx.fillRect(mugX, deskY - 7, 18, 5);
}

/**
 * Draws the over-the-shoulder (OTS) graphic on the right of the studio: a
 * picture of the story over one big figure. The TV sits across the room, so
 * nothing on it is smaller than the figure's caption would need to be; the
 * card beside the TV carries the words.
 */
function drawOtsSlate(
  ctx: CanvasRenderingContext2D,
  report: NewsReport,
  theme: BroadcastTheme,
  time: number,
): void {
  const x = 330;
  const y = 30;
  const w = 278;
  const h = 214;
  const stripH = 10;
  const chartH = 104;
  const statY = y + stripH + chartH;
  const statH = h - stripH - chartH;

  ctx.fillStyle = "rgba(0, 0, 0, 0.46)";
  ctx.fillRect(x + 6, y + 6, w, h);

  // Coloured desk strip along the top, in place of a written desk title.
  ctx.fillStyle = theme.otsHeaderBg;
  ctx.fillRect(x, y, w, stripH);
  ctx.fillStyle = theme.deskTrim;
  ctx.fillRect(x, y + stripH - 3, w, 3);

  drawBroadcastGraphic(
    ctx,
    report.graphic,
    x,
    y + stripH,
    w,
    chartH,
    theme,
    time,
  );

  ctx.fillStyle = theme.otsStatBg;
  ctx.fillRect(x, statY, w, statH);
  ctx.fillStyle = theme.otsAccent;
  ctx.fillRect(x, statY, w, 4);

  // The figure, as large as the plate lets it be.
  const statMaxW = w - 32;
  let statSize = 80;
  ctx.font = `800 ${statSize}px ${FONT_DISPLAY}`;
  while (statSize > 48 && ctx.measureText(report.stat).width > statMaxW) {
    statSize -= 2;
    ctx.font = `800 ${statSize}px ${FONT_DISPLAY}`;
  }
  const statMid = statY + 4 + (statH - 4) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillText(report.stat, x + w / 2 + 3, statMid + 5);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(report.stat, x + w / 2, statMid + 2);

  ctx.strokeStyle = "#b9c6d8";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}

/**
 * Draws the lower third: the kicker flag, a broad white headline plate in big
 * heavy type, and a slim news crawl. The left side of the picture keeps a
 * channel bug in the studio instead of a column of small labels.
 */
function drawLowerThird(
  ctx: CanvasRenderingContext2D,
  report: NewsReport,
  theme: BroadcastTheme,
  time: number,
): void {
  const safeLeft = 34;
  const safeRight = 606;
  const bannerY = 292;
  const bannerH = 126;
  const tickerY = bannerY + bannerH; // 422; the tube's rim hides the last rows
  const tickerTextY = tickerY + 25;

  // --- Channel bug, top left of the studio ---
  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.fillRect(safeLeft + 3, 33, 82, 38);
  ctx.fillStyle = "#c81d25";
  ctx.fillRect(safeLeft, 30, 82, 38);
  ctx.fillStyle = "#e3b43c";
  ctx.fillRect(safeLeft, 64, 82, 4);
  ctx.fillStyle = "#ffffff";
  ctx.font = `900 28px ${FONT_DISPLAY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CH 4", safeLeft + 41, 48);

  // --- Kicker flag perched on the headline plate ---
  ctx.font = `800 28px ${FONT_DISPLAY}`;
  const flagW = Math.ceil(ctx.measureText(report.tag).width) + 40;
  const flagH = 40;
  const flagX = safeLeft;
  const flagY = bannerY - flagH;

  ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
  ctx.beginPath();
  ctx.moveTo(flagX + 4, flagY + 4);
  ctx.lineTo(flagX + flagW - 10, flagY + 4);
  ctx.lineTo(flagX + flagW + 6, bannerY);
  ctx.lineTo(flagX + 4, bannerY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = theme.kickerBg;
  ctx.beginPath();
  ctx.moveTo(flagX, flagY);
  ctx.lineTo(flagX + flagW - 14, flagY);
  ctx.lineTo(flagX + flagW + 2, bannerY);
  ctx.lineTo(flagX, bannerY);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = theme.kickerText;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(report.tag, flagX + 16, flagY + flagH / 2 + 1);

  ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
  ctx.fillRect(0, bannerY - 4, TV_WIDTH, 4);

  // --- Headline plate ---
  const plateGrad = ctx.createLinearGradient(0, bannerY, 0, bannerY + bannerH);
  plateGrad.addColorStop(0, "#f4f6f9");
  plateGrad.addColorStop(1, "#dfe4ec");
  ctx.fillStyle = plateGrad;
  ctx.fillRect(0, bannerY, TV_WIDTH, bannerH);
  ctx.fillStyle = theme.kickerBg;
  ctx.fillRect(0, bannerY, safeLeft - 12, bannerH);

  const headlineX = safeLeft;
  const headlineWidth = safeRight - headlineX;
  const headlineSize = fitWrappedSize(
    ctx,
    report.headline,
    headlineWidth,
    2,
    54,
    38,
    FONT_DISPLAY,
    "800",
  );
  ctx.font = `800 ${headlineSize}px ${FONT_DISPLAY}`;
  const headlineLines = wrapLines(ctx, report.headline, headlineWidth, 2);
  const lineStep = Math.round(headlineSize * 1.04);
  const totalTextH = headlineSize + (headlineLines.length - 1) * lineStep;
  const firstBaseline =
    bannerY + Math.round((bannerH - totalTextH) / 2 + headlineSize * 0.82);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#0a0f17";
  headlineLines.forEach((line, i) => {
    ctx.fillText(line, headlineX, firstBaseline + i * lineStep);
  });

  // --- Slim news crawl ---
  ctx.fillStyle = theme.tickerBg;
  ctx.fillRect(0, tickerY, TV_WIDTH, TV_HEIGHT - tickerY);
  ctx.fillStyle = theme.tickerRule;
  ctx.fillRect(0, tickerY, TV_WIDTH, 3);

  ctx.fillStyle = "#ffffff";
  ctx.font = `700 30px ${FONT_NEWS}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const marquee = `${report.ticker}   ▪   ${report.ticker}   ▪   `;
  const span = Math.max(ctx.measureText(marquee).width / 2, 1);
  const offset = ((time * 70) % span) | 0;
  ctx.fillText(marquee, -offset, tickerTextY);
}

type Pt = readonly [number, number];

/** Five flat-shading steps per material, dark to light, like a PSX palette. */
const CARP_SKIN: readonly (readonly string[])[] = [
  ["#2e1c0c", "#5c3a15", "#8e5c1f", "#c48a2d", "#ecbf58"], // healthy bronze
  ["#2a2214", "#544226", "#7c6339", "#a68750", "#ccb072"], // dulling
  ["#1c211d", "#38423a", "#58665a", "#7e8c7c", "#a6b09c"], // sickly grey-green
];
const CARP_LIP = ["#4a1c14", "#7a3224", "#a8503a", "#d27a5c", "#eea688"];
const SUIT = ["#0c111b", "#151d2c", "#202b40", "#2f3d58"];
const CARP_LIGHT = normalize([-0.55, 0.6, 0.62]);
const CARP_LIP_BAND = 6;
const CARP_SEGMENTS = 9;
const CARP_DEPTH = 0.86;
const CARP_SCALE = 1.15;

/** Head silhouette as [height, radius] rings, from inside the collar up to the lips. */
function carpProfile(mouthOpen: number): readonly Pt[] {
  return [
    [-16, 31],
    [6, 33],
    [28, 32],
    [50, 27.5],
    [70, 21],
    [85, 14.5],
    [93, 12],
    [99, 14.5 + mouthOpen * 2.5],
    [104, 12.5 + mouthOpen * 2],
    [105, 3 + mouthOpen * 8],
  ];
}

/**
 * Draws the anchor: a deadpan carp head pointing straight up out of a tailored
 * news-anchor suit collar, seated naturally behind the studio desk with no
 * UI frame around him. Flat-shaded into stepped PSX tones so he fits the hut.
 */
function drawCarpAnchor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  deskY: number,
  theme: BroadcastTheme,
  severity: number,
  time: number,
): void {
  const trace = (points: readonly Pt[], dx = 0, dy = 0): void => {
    points.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(px + dx, py + dy);
      else ctx.lineTo(px + dx, py + dy);
    });
    ctx.closePath();
  };
  const poly = (points: readonly Pt[], color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    trace(points);
    ctx.fill();
  };
  const box = (bx: number, by: number, bw: number, bh: number, color: string) =>
    poly(
      [
        [bx, by],
        [bx + bw, by],
        [bx + bw, by + bh],
        [bx, by + bh],
      ],
      color,
    );

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, TV_WIDTH, deskY + 2);
  ctx.clip();

  const bob = Math.sin(time * 2.2) * 1.6;
  const collarY = 198 + bob;

  // --- Carp head model: yaw sway plus a backward tilt so the open mouth shows ---
  const gulp = Math.sin(time * 9) * Math.sin(time * 3.1 + 0.5);
  const mouthOpen = clamp(gulp * 0.7 + 0.45, 0, 1);
  const yaw = Math.sin(time * 0.7) * 0.22 + Math.sin(time * 1.9) * 0.05;
  const pitch = 0.42 + mouthOpen * 0.05;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const rot = (v: Vec3): Vec3 => {
    const x1 = v[0] * cosYaw + v[2] * sinYaw;
    const z1 = -v[0] * sinYaw + v[2] * cosYaw;
    return [
      x1,
      v[1] * cosPitch - z1 * sinPitch,
      v[1] * sinPitch + z1 * cosPitch,
    ];
  };
  const toScreen = (v: Vec3): Pt => [
    cx + v[0] * CARP_SCALE,
    collarY - v[1] * CARP_SCALE,
  ];
  const surface = (height: number, radius: number, angle: number): Vec3 => [
    radius * Math.sin(angle),
    height,
    radius * Math.cos(angle) * CARP_DEPTH,
  ];
  const facesViewer = (angle: number, min: number): boolean =>
    rot([Math.sin(angle), 0, Math.cos(angle)])[2] > min;

  const profile = carpProfile(mouthOpen);
  const skin = CARP_SKIN[severity > 0.7 ? 2 : severity > 0.4 ? 1 : 0];
  type Face = { pts: Pt[]; depth: number; color: string; rim: boolean };
  const faces: Face[] = [];
  for (let band = 0; band < profile.length - 1; band++) {
    const [h0, r0] = profile[band];
    const [h1, r1] = profile[band + 1];
    for (let s = 0; s < CARP_SEGMENTS; s++) {
      const a0 = (s / CARP_SEGMENTS) * Math.PI * 2;
      const a1 = ((s + 1) / CARP_SEGMENTS) * Math.PI * 2;
      const quad = [
        rot(surface(h0, r0, a0)),
        rot(surface(h0, r0, a1)),
        rot(surface(h1, r1, a1)),
        rot(surface(h1, r1, a0)),
      ];
      const n = normalize(cross(sub(quad[1], quad[0]), sub(quad[3], quad[0])));
      if (n[2] <= 0) continue;
      const light = 0.14 + 0.86 * Math.max(dot(n, CARP_LIGHT), 0);
      const palette = band >= CARP_LIP_BAND ? CARP_LIP : skin;
      faces.push({
        pts: quad.map(toScreen),
        depth: (quad[0][2] + quad[2][2]) / 2,
        color: palette[Math.min(4, Math.floor(light * 5))],
        rim: n[0] > 0.62,
      });
    }
  }
  faces.sort((a, b) => a.depth - b.depth);

  const shoulders: Pt[] = [
    [cx - 96, deskY + 2],
    [cx - 88, collarY + 21],
    [cx - 64, collarY + 7],
    [cx - 32, collarY - 2],
    [cx + 32, collarY - 2],
    [cx + 64, collarY + 7],
    [cx + 88, collarY + 21],
    [cx + 96, deskY + 2],
  ];

  // Soft studio key-light shadow thrown gently down-right behind the anchor.
  ctx.fillStyle = "rgba(0, 0, 0, 0.28)";
  ctx.beginPath();
  for (const face of faces) trace(face.pts, 14, 8);
  trace(shoulders, 14, 8);
  ctx.fill();

  // --- Faceted suit: lit from the left, falling into shadow on the right ---
  poly(shoulders, SUIT[1]);
  for (const side of [-1, 1]) {
    poly(
      [
        [cx + side * 96, deskY + 2],
        [cx + side * 88, collarY + 21],
        [cx + side * 64, collarY + 7],
        [cx + side * 46, collarY + 16],
        [cx + side * 58, deskY + 2],
      ],
      side < 0 ? SUIT[2] : SUIT[0],
    );
    poly(
      [
        [cx + side * 64, collarY + 7],
        [cx + side * 32, collarY - 2],
        [cx + side * 23, collarY + 14],
        [cx + side * 46, collarY + 16],
      ],
      side < 0 ? SUIT[3] : SUIT[2],
    );
  }

  // --- The head itself, clipped at the collar so it rises out of the shirt ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, TV_WIDTH, collarY + 7);
  ctx.clip();
  for (const face of faces) {
    poly(face.pts, face.color);
    if (face.rim) {
      ctx.globalAlpha = 0.2;
      poly(face.pts, theme.rimTint);
      ctx.globalAlpha = 1;
    }
  }
  // Open gullet inside the lip ring.
  const [holeH, holeR] = profile[profile.length - 1];
  const hole: Pt[] = [];
  for (let s = 0; s < CARP_SEGMENTS; s++) {
    const a = (s / CARP_SEGMENTS) * Math.PI * 2;
    hole.push(toScreen(rot(surface(holeH, holeR, a))));
  }
  poly(hole, "#14060a");

  // Gill covers: a ")"-shaped seam up each cheek, behind the eyes.
  ctx.lineWidth = 2.8;
  ctx.lineJoin = "round";
  ctx.strokeStyle = skin[0];
  for (const side of [-1, 1]) {
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const angle = side * (1.05 + Math.sin(t * Math.PI) * 0.3);
      const height = 2 + t * 34;
      if (!facesViewer(angle, 0.05)) {
        drawing = false;
        continue;
      }
      const [px, py] = toScreen(rot(surface(height, 33.4, angle)));
      if (drawing) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      drawing = true;
    }
    ctx.stroke();
  }

  // Barbels droop from the corners of the lips.
  const twitch = Math.sin(time * 5) * 2;
  ctx.strokeStyle = skin[1];
  ctx.lineWidth = 3.2;
  for (const angle of [-1.1, -0.55, 0.55, 1.1]) {
    if (!facesViewer(angle, 0.1)) continue;
    const [bx, by] = toScreen(rot(surface(93, 12.5, angle)));
    const dir = Math.sign(angle);
    const reach = Math.abs(angle) > 1 ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + dir * 10 * reach, by + 7 * reach);
    ctx.lineTo(bx + dir * (13 + twitch) * reach, by + 20 * reach);
    ctx.stroke();
  }

  // Bulging eyes on the sides of the head, staring blankly at the teleprompter.
  const blinking = (time * 0.3) % 1 > 0.94;
  for (const side of [-1, 1]) {
    const angle = side * 0.86;
    const normal = normalize([Math.sin(angle), 0.3, Math.cos(angle)]);
    if (rot(normal)[2] < 0.08) continue;
    const across = normalize(cross([0, 1, 0], normal));
    const upward = cross(normal, across);
    const center = surface(60, 27.5, angle);
    const onEye = (u: number, v: number, lift: number): Pt =>
      toScreen(
        rot([
          center[0] + normal[0] * lift + across[0] * u + upward[0] * v,
          center[1] + normal[1] * lift + across[1] * u + upward[1] * v,
          center[2] + normal[2] * lift + across[2] * u + upward[2] * v,
        ]),
      );
    const disc = (radius: number, lift: number, from = 0, to = Math.PI * 2) => {
      const out: Pt[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = from + ((to - from) * i) / 8;
        out.push(onEye(Math.cos(a) * radius, Math.sin(a) * radius, lift));
      }
      return out;
    };
    poly(disc(12.5, 1.5), skin[0]);
    if (blinking) {
      poly(disc(11, 3.5), skin[1]);
      continue;
    }
    poly(disc(10.5, 3.5), "#e8cf62");
    poly(disc(5.6, 4.4), "#07080c");
    poly(
      [
        onEye(-3.6, 3.6, 4.8),
        onEye(-0.4, 3.6, 4.8),
        onEye(-0.4, 0.4, 4.8),
        onEye(-3.6, 0.4, 4.8),
      ],
      "#ffffff",
    );
    if (severity > 0.4) {
      const cut = Math.asin(severity > 0.7 ? 0.05 : 0.45);
      poly(disc(11.2, 4.8, cut, Math.PI - cut), skin[1]);
    }
  }
  ctx.restore();

  // --- Shirt, collar, lapels, classic broadcast tie, lapel mic and pocket square ---
  poly(
    [
      [cx - 28, collarY],
      [cx + 28, collarY],
      [cx, collarY + 48],
    ],
    "#e9f0fb",
  );
  poly(
    [
      [cx, collarY + 2],
      [cx + 28, collarY],
      [cx, collarY + 48],
    ],
    "#bccbe0",
  );
  for (const side of [-1, 1]) {
    poly(
      [
        [cx + side * 36, collarY - 4],
        [cx + side * 7, collarY + 7],
        [cx + side * 20, collarY + 17],
      ],
      side < 0 ? "#f6f9ff" : "#c9d6ea",
    );
    poly(
      [
        [cx + side * 34, collarY - 2],
        [cx + side * 23, collarY + 14],
        [cx + side * 5, deskY + 2],
        [cx + side * 18, deskY + 2],
        [cx + side * 39, collarY + 25],
        [cx + side * 46, collarY + 12],
      ],
      side < 0 ? SUIT[3] : SUIT[1],
    );
  }
  poly(
    [
      [cx - 7, collarY + 6],
      [cx + 7, collarY + 6],
      [cx + 5, collarY + 15],
      [cx - 5, collarY + 15],
    ],
    theme.tieColor,
  );
  poly(
    [
      [cx - 5, collarY + 15],
      [cx + 5, collarY + 15],
      [cx + 9, collarY + 42],
      [cx, collarY + 51],
      [cx - 9, collarY + 42],
    ],
    theme.tieColor,
  );
  // Subtle diagonal gold stripe on the news anchor's silk tie
  poly(
    [
      [cx - 6, collarY + 25],
      [cx + 6, collarY + 21],
      [cx + 7, collarY + 25],
      [cx - 7, collarY + 29],
    ],
    "rgba(229, 188, 92, 0.55)",
  );
  poly(
    [
      [cx, collarY + 15],
      [cx + 5, collarY + 15],
      [cx + 9, collarY + 42],
      [cx, collarY + 51],
    ],
    "rgba(0, 0, 0, 0.28)",
  );
  // Crisp pocket square and small clip-on lapel mic
  poly(
    [
      [cx + 50, collarY + 29],
      [cx + 68, collarY + 29],
      [cx + 61, collarY + 21],
      [cx + 56, collarY + 25],
    ],
    "#eef3fc",
  );
  box(cx - 34, collarY + 23, 5, 6, "#06080d");
  ctx.restore();
}

/**
 * Draws the picture inside the OTS board: plain broadcast charts and
 * diagrams in thick strokes, with no labels too small to read across the room.
 */
function drawBroadcastGraphic(
  ctx: CanvasRenderingContext2D,
  kind: NewsGraphic,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: BroadcastTheme,
  time: number,
): void {
  const isNight = kind === "static_eye";
  ctx.fillStyle = isNight ? "#121b2e" : "#e9edf3";
  ctx.fillRect(x, y, w, h);

  const px = x + 22;
  const py = y + 14;
  const pw = w - 44;
  const ph = h - 28;
  const cx = x + w / 2;
  const cy = y + h / 2;

  const inkNavy = "#193866";
  const inkRed = "#c41e26";
  const inkGold = "#c48414";
  const inkSlate = "#5d6f86";
  const paleTrack = "#c4cedb";

  switch (kind) {
    case "crossover": {
      // In-person time falling as screen time rises.
      ctx.strokeStyle = inkSlate;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py - 4);
      ctx.lineTo(px, py + ph);
      ctx.lineTo(px + pw, py + ph);
      ctx.stroke();

      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.strokeStyle = inkNavy;
      ctx.beginPath();
      ctx.moveTo(px + 8, py + ph - 8);
      ctx.lineTo(px + pw * 0.42, py + ph * 0.52);
      ctx.lineTo(px + pw - 8, py + 4);
      ctx.stroke();

      ctx.strokeStyle = inkRed;
      ctx.beginPath();
      ctx.moveTo(px + 8, py + 4);
      ctx.lineTo(px + pw * 0.52, py + ph * 0.5);
      ctx.lineTo(px + pw - 8, py + ph - 8);
      ctx.stroke();

      ctx.fillStyle = inkRed;
      ctx.beginPath();
      ctx.arc(px + pw - 8, py + ph - 8, 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case "bars_down": {
      // Falling bars, the last two in red.
      ctx.strokeStyle = inkSlate;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py + ph);
      ctx.lineTo(px + pw, py + ph);
      ctx.stroke();

      const bars = [0.98, 0.84, 0.68, 0.52, 0.36, 0.24];
      const gap = 10;
      const bw = Math.floor((pw - 12 - gap * (bars.length - 1)) / bars.length);
      bars.forEach((v, i) => {
        const bh = Math.round(v * (ph + 6));
        const bx = px + 6 + i * (bw + gap);
        ctx.fillStyle = i >= 4 ? inkRed : inkNavy;
        ctx.fillRect(bx, py + ph - bh, bw, bh);
      });
      break;
    }

    case "panopticon": {
      // A phone camera pointed at a figure.
      ctx.fillStyle = inkNavy;
      ctx.beginPath();
      ctx.arc(cx - 62, cy - 20, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 76, cy - 3, 28, 38);

      ctx.fillStyle = "rgba(196, 30, 38, 0.2)";
      ctx.beginPath();
      ctx.moveTo(cx + 38, cy - 6);
      ctx.lineTo(cx - 38, cy - 36);
      ctx.lineTo(cx - 38, cy + 36);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#1d2838";
      ctx.fillRect(cx + 36, cy - 34, 42, 68);
      ctx.fillStyle = "#cfd8e4";
      ctx.fillRect(cx + 41, cy - 27, 32, 52);
      ctx.fillStyle = inkNavy;
      ctx.beginPath();
      ctx.arc(cx + 57, cy - 6, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = Math.floor(time * 2) % 2 === 0 ? inkRed : "#7d1c22";
      ctx.beginPath();
      ctx.arc(cx + 57, cy - 6, 6, 0, Math.PI * 2);
      ctx.fill();
      break;
    }

    case "lawsuit": {
      // A courthouse beside a red stamp.
      const hx = cx - 46;
      ctx.fillStyle = inkNavy;
      ctx.beginPath();
      ctx.moveTo(hx - 64, cy - 14);
      ctx.lineTo(hx, cy - 38);
      ctx.lineTo(hx + 64, cy - 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(hx - 68, cy - 14, 136, 7);
      for (const offset of [-52, -21, 10, 41]) {
        ctx.fillRect(hx + offset, cy - 5, 12, 31);
      }
      ctx.fillRect(hx - 68, cy + 26, 136, 9);

      ctx.fillStyle = inkRed;
      ctx.fillRect(cx + 34, cy - 20, 92, 40);
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 26px ${FONT_DISPLAY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("51 AGs", cx + 80, cy + 1);
      break;
    }

    case "face_grid": {
      // A face outline measured against three meters.
      ctx.strokeStyle = inkNavy;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(cx - 64, cy, 26, 34, 0, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = inkSlate;
      ctx.lineWidth = 3;
      for (const dy of [-20, 0, 20]) {
        ctx.beginPath();
        ctx.moveTo(cx - 30, cy + dy);
        ctx.lineTo(cx - 6, cy + dy);
        ctx.stroke();
      }
      const widths = [96, 66, 116];
      widths.forEach((bw, i) => {
        const by = cy - 27 + i * 20;
        ctx.fillStyle = paleTrack;
        ctx.fillRect(cx, by, 120, 14);
        ctx.fillStyle = i === 2 ? inkRed : inkNavy;
        ctx.fillRect(cx, by, bw, 14);
      });
      break;
    }

    case "stream_eye": {
      // The waking day as one bar, more than half of it red.
      const barY = cy - 22;
      const barH = 44;
      ctx.fillStyle = paleTrack;
      ctx.fillRect(px, barY, pw, barH);
      const fillW = Math.round(pw * 0.54);
      ctx.fillStyle = inkRed;
      ctx.fillRect(px, barY, fillW, barH);

      ctx.strokeStyle = inkSlate;
      ctx.lineWidth = 3;
      for (let i = 0; i <= 4; i++) {
        const tx = px + Math.round((pw * i) / 4);
        ctx.beginPath();
        ctx.moveTo(tx, barY + barH);
        ctx.lineTo(tx, barY + barH + 10);
        ctx.stroke();
      }
      break;
    }

    case "fracture": {
      // A poll split 60 / 40, cracked where the halves meet.
      const barY = cy - 24;
      const barH = 48;
      const splitX = px + Math.round(pw * 0.6);
      ctx.fillStyle = inkRed;
      ctx.fillRect(px, barY, splitX - px - 3, barH);
      ctx.fillStyle = inkNavy;
      ctx.fillRect(splitX + 3, barY, px + pw - splitX - 3, barH);

      ctx.fillStyle = "#e9edf3";
      ctx.beginPath();
      ctx.moveTo(splitX - 2, barY - 2);
      ctx.lineTo(splitX + 5, barY + barH / 2);
      ctx.lineTo(splitX - 3, barY + barH + 2);
      ctx.lineTo(splitX + 3, barY + barH + 2);
      ctx.lineTo(splitX + 9, barY + barH / 2);
      ctx.lineTo(splitX + 3, barY - 2);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = `800 28px ${FONT_DISPLAY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("60%", (px + splitX) / 2, barY + barH / 2 + 1);
      ctx.fillText("40%", (splitX + px + pw) / 2 + 2, barY + barH / 2 + 1);
      break;
    }

    case "synthetic": {
      // A person's message answered by a chatbot.
      ctx.fillStyle = inkNavy;
      ctx.fillRect(px + 4, py, 108, 34);
      ctx.beginPath();
      ctx.moveTo(px + 16, py + 34);
      ctx.lineTo(px + 30, py + 34);
      ctx.lineTo(px + 14, py + 46);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#e9edf3";
      ctx.fillRect(px + 16, py + 10, 70, 5);
      ctx.fillRect(px + 16, py + 20, 48, 5);

      ctx.fillStyle = inkRed;
      ctx.fillRect(px + pw - 116, py + 30, 112, 36);
      ctx.beginPath();
      ctx.moveTo(px + pw - 20, py + 66);
      ctx.lineTo(px + pw - 34, py + 66);
      ctx.lineTo(px + pw - 14, py + 78);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      for (const dx of [-84, -60, -36]) {
        ctx.beginPath();
        ctx.arc(px + pw + dx, py + 48, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }

    case "collapse": {
      // Trust in three institutions, every bar nearly empty.
      for (let i = 0; i < 3; i++) {
        const ry = py - 2 + i * 28;
        const pct = [0.12, 0.16, 0.17][i];
        ctx.fillStyle = paleTrack;
        ctx.fillRect(px, ry, pw, 20);
        ctx.fillStyle = i === 1 ? inkRed : inkGold;
        ctx.fillRect(px, ry, Math.round(pw * pct), 20);
      }
      break;
    }

    case "static_eye": {
      // A bedside clock at three in the morning beside a lit phone.
      ctx.fillStyle = "#1c2840";
      ctx.fillRect(px - 6, cy - 32, 140, 64);
      ctx.strokeStyle = "#485d80";
      ctx.lineWidth = 3;
      ctx.strokeRect(px - 6, cy - 32, 140, 64);

      ctx.fillStyle = Math.floor(time * 1.5) % 2 === 0 ? "#ff4650" : "#c22e38";
      ctx.font = `800 44px ${FONT_DISPLAY}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("03:00", px + 64, cy + 2);

      const glow = ctx.createRadialGradient(
        px + pw - 30,
        cy,
        6,
        px + pw - 30,
        cy,
        46,
      );
      glow.addColorStop(0, "rgba(182, 214, 255, 0.4)");
      glow.addColorStop(1, "rgba(182, 214, 255, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(px + pw - 78, y + 4, 96, h - 8);

      ctx.fillStyle = "#0b111c";
      ctx.fillRect(px + pw - 50, cy - 30, 40, 60);
      ctx.fillStyle = "#d9e8ff";
      ctx.fillRect(px + pw - 45, cy - 24, 30, 48);
      ctx.fillStyle = theme.otsAccent;
      ctx.fillRect(px + pw - 40, cy - 10, 20, 6);
      ctx.fillRect(px + pw - 40, cy + 1, 14, 6);
      break;
    }
  }
}

function fitWrappedSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
  fontFamily: string,
  weight: string,
): number {
  for (let size = startSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px ${fontFamily}`;
    if (wrapLines(ctx, text, maxWidth, maxLines + 1).length <= maxLines) {
      return size;
    }
  }
  return minSize;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(next).width > maxWidth && line !== "") {
      lines.push(line);
      if (lines.length >= maxLines) return lines;
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== "" && lines.length < maxLines) {
    lines.push(line);
  }
  return lines;
}

function drawStatic(
  ctx: CanvasRenderingContext2D,
  amount: number,
  time: number,
): void {
  const seed = Math.floor(time * 18);
  const strips = Math.floor(amount * 14);
  for (let i = 0; i < strips; i++) {
    const r1 = fract(Math.sin((seed + i * 19.3) * 127.1) * 43758.5453);
    const r2 = fract(Math.sin((seed + i * 47.7) * 311.7) * 43758.5453);
    const y = Math.floor(r1 * TV_HEIGHT);
    const h = 2 + Math.floor(r2 * 6);
    ctx.fillStyle =
      r2 > 0.5
        ? `rgba(180, 205, 225, ${(amount * 0.16).toFixed(2)})`
        : `rgba(8, 10, 16, ${(amount * 0.34).toFixed(2)})`;
    ctx.fillRect(0, y, TV_WIDTH, h);
  }
}

function fract(x: number): number {
  return x - Math.floor(x);
}
