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

/* Renders the hut's CRT news broadcast onto a crisp 640x480 2D canvas that
   WebGL uploads and samples at native display resolution through the CRT glass
   pass. Features a deadpan carp news anchor in a tailored suit at the desk,
   bold broadcast typography, animated data graphics, a lower-third chyron,
   and a scrolling breaking-news ticker. */

export const TV_WIDTH = 640;
export const TV_HEIGHT = 480;

const FONT_STACK =
  '"Departure Mono", "White Rabbit Pixel", ui-monospace, SFMono-Regular, Menlo, monospace';

export type TvFrameInput = {
  report: NewsReport;
  /** Seconds since the page opened, for the ticker, anchor speech, and LIVE blink. */
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
  const cold: Vec3 = [0.52, 0.88, 1.12];
  const bleak: Vec3 = [0.54, 0.68, 1.04];
  const alert: Vec3 = [1.18, 0.26, 0.34];

  const base = mix(cold, bleak, report.severity);
  // Late-stage breaking reports breathe gently toward red with the chyron.
  const pulse =
    report.severity > 0.55
      ? (0.5 + 0.5 * Math.sin(time * 1.4)) * (report.severity - 0.5) * 0.6
      : 0;
  const tint = mix(base, alert, clamp(pulse, 0, 0.44));
  // Subtle slow CRT drift rather than rapid strobing, so quantized walls stay calm.
  const hum =
    1 + 0.012 * Math.sin(time * 1.9) + 0.008 * Math.sin(time * 3.7 + 1.4);
  // Barely noticeable in bright afternoon sun, then swells slowly through
  // dusk and night until the CRT owns the entire dark cabin.
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
    ctx.imageSmoothingEnabled = false;

    const sev = report.severity;
    // Studio backdrop darkens and shifts from broadcast navy to grim crimson-charcoal.
    const bgTop = sev < 0.45 ? "#09182e" : sev < 0.78 ? "#111221" : "#1c080e";
    const bgBot = sev < 0.45 ? "#122a4d" : sev < 0.78 ? "#1e1b30" : "#2e0d15";
    const accent = sev < 0.3 ? "#38e8ff" : sev < 0.65 ? "#ffae2b" : "#ff334f";

    const grad = ctx.createLinearGradient(0, 0, 0, TV_HEIGHT);
    grad.addColorStop(0, bgTop);
    grad.addColorStop(1, bgBot);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TV_WIDTH, TV_HEIGHT);

    // Subtle broadcast grid behind the stage.
    ctx.strokeStyle = "rgba(180, 220, 255, 0.08)";
    ctx.lineWidth = 2;
    for (let x = 28; x < TV_WIDTH; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 58);
      ctx.lineTo(x, 270);
      ctx.stroke();
    }
    for (let y = 76; y < 270; y += 44) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(TV_WIDTH, y);
      ctx.stroke();
    }

    // --- Top broadcast bar (overscan-safe padding) ---
    ctx.fillStyle = "rgba(5, 8, 15, 0.92)";
    ctx.fillRect(0, 0, TV_WIDTH, 56);
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    ctx.fillRect(0, 54, TV_WIDTH, 2);

    // Category/alert badge
    ctx.font = `bold 19px ${FONT_STACK}`;
    const tagWidth = Math.min(
      Math.max(Math.ceil(ctx.measureText(report.tag).width) + 26, 132),
      230,
    );
    ctx.fillStyle = accent;
    ctx.fillRect(20, 11, tagWidth, 34);
    ctx.fillStyle = sev < 0.65 ? "#060c14" : "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(report.tag, 33, 29);

    // Desk label
    ctx.fillStyle = "#dce8f8";
    ctx.font = `bold 19px ${FONT_STACK}`;
    ctx.fillText(report.desk, 20 + tagWidth + 16, 29);

    // Pulsing LIVE dot on top right
    const blink = Math.floor(time * 2) % 2 === 0;
    ctx.fillStyle = blink ? "#ff2e47" : "#6a1420";
    ctx.fillRect(TV_WIDTH - 108, 20, 14, 14);
    ctx.fillStyle = "#f4f8ff";
    ctx.font = `bold 19px ${FONT_STACK}`;
    ctx.fillText("LIVE", TV_WIDTH - 86, 29);

    // --- Main broadcast stage: Carp anchor in suit (left) + Hero stat & graphic (right) ---
    drawCarpAnchor(ctx, 20, 66, 234, 196, accent, sev, time);

    // Right-hand broadcast data card
    const dataX = 266;
    const dataW = TV_WIDTH - dataX - 20;
    const graphicW = 132;
    const graphicH = 114;
    const graphicX = dataX + dataW - graphicW;
    const graphicY = 68;
    const statMaxWidth = graphicX - dataX - 14;

    // Big hero stat, auto-fitted so both short figures and words stay razor crisp.
    let statSize = 68;
    ctx.font = `bold ${statSize}px ${FONT_STACK}`;
    while (statSize > 38 && ctx.measureText(report.stat).width > statMaxWidth) {
      statSize -= 4;
      ctx.font = `bold ${statSize}px ${FONT_STACK}`;
    }
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = "rgba(0, 0, 0, 0.68)";
    ctx.fillText(report.stat, dataX + 3, 146);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(report.stat, dataX, 143);

    ctx.fillStyle = accent;
    ctx.fillRect(dataX, 158, statMaxWidth, 6);

    // Framed animated OTS broadcast graphic beside the hero figure
    drawGraphic(
      ctx,
      report.graphic,
      graphicX,
      graphicY,
      graphicW,
      graphicH,
      accent,
      time,
    );

    // Full-width subtitle below stat + graphic so it stays large and effortless to read
    ctx.fillStyle = "#e8f2ff";
    ctx.font = `bold 21px ${FONT_STACK}`;
    drawWrapped(ctx, report.statSub, dataX, 212, dataW, 27, 2);

    // --- Lower-third news chyron ---
    ctx.fillStyle = "#080c14";
    ctx.fillRect(0, 272, TV_WIDTH, 144);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 272, 16, 144);
    ctx.fillRect(0, 272, TV_WIDTH, 5);

    const headlineX = 32;
    const headlineWidth = TV_WIDTH - headlineX - 24;
    const headlineSize = fitWrappedSize(
      ctx,
      report.headline,
      headlineWidth,
      2,
      32,
      24,
    );
    ctx.font = `bold ${headlineSize}px ${FONT_STACK}`;
    ctx.textBaseline = "alphabetic";
    const headlineStep = Math.round(headlineSize * 1.24);
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    drawWrapped(
      ctx,
      report.headline,
      headlineX + 2,
      320,
      headlineWidth,
      headlineStep,
      2,
    );
    ctx.fillStyle = "#ffffff";
    drawWrapped(
      ctx,
      report.headline,
      headlineX,
      318,
      headlineWidth,
      headlineStep,
      2,
    );

    const sourceLabel = report.sources.map((s) => s.name).join(" / ");
    ctx.fillStyle = "#a9c2de";
    ctx.font = `bold 16px ${FONT_STACK}`;
    ctx.fillText(
      `SRC: ${sourceLabel.toUpperCase()}`,
      headlineX,
      398,
      headlineWidth,
    );

    // --- Bottom scrolling breaking news ticker ---
    ctx.fillStyle = sev > 0.65 ? "#8b0e20" : sev > 0.35 ? "#573208" : "#122949";
    ctx.fillRect(0, 416, TV_WIDTH, 64);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 416, TV_WIDTH, 3);

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 21px ${FONT_STACK}`;
    ctx.textBaseline = "middle";
    const marquee = `${report.ticker}   ///   ${report.ticker}   ///   `;
    const span = Math.max(ctx.measureText(marquee).width / 2, 1);
    const offset = ((time * 74) % span) | 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(18, 420, TV_WIDTH - 36, 56);
    ctx.clip();
    ctx.fillText(marquee, 18 - offset, 448);
    ctx.restore();

    // --- Brief CRT static / interference on report cuts and faint deep-decay drift ---
    const noiseAmount = clamp(glitch + decay * 0.06, 0, 1);
    if (noiseAmount > 0.05) {
      drawStatic(ctx, noiseAmount, time);
    }
  };

  return { canvas, render };
}

type Pt = readonly [number, number];

/** Five flat-shading steps per material, dark to light, like a PSX palette. */
const CARP_SKIN: readonly (readonly string[])[] = [
  ["#2e1c0c", "#5c3a15", "#8e5c1f", "#c48a2d", "#ecbf58"], // healthy bronze
  ["#2a2214", "#544226", "#7c6339", "#a68750", "#ccb072"], // dulling
  ["#1c211d", "#38423a", "#58665a", "#7e8c7c", "#a6b09c"], // sickly grey-green
];
const CARP_LIP = ["#4a1c14", "#7a3224", "#a8503a", "#d27a5c", "#eea688"];
const SUIT = ["#0b0f17", "#141a26", "#1e2636", "#2c374c"];
const CARP_LIGHT = normalize([-0.55, 0.6, 0.62]);
const CARP_LIP_BAND = 6;
const CARP_SEGMENTS = 9;
const CARP_DEPTH = 0.86;

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
 * Draws the anchor: a carp head pointing straight up out of a suit collar,
 * gulping its lines at the ceiling. The head is a tiny low-poly lathe model
 * flat-shaded into a few colour steps, so it reads like the hut's PSX props
 * once the CRT glass dithers it.
 */
function drawCarpAnchor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
  severity: number,
  time: number,
): void {
  const trace = (points: readonly Pt[], dx = 0, dy = 0): void => {
    points.forEach(([px, py], i) => {
      if (i === 0) ctx.moveTo(x + px + dx, y + py + dy);
      else ctx.lineTo(x + px + dx, y + py + dy);
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
  ctx.rect(x, y, w, h);
  ctx.clip();

  const cx = Math.round(w / 2);
  const bob = Math.sin(time * 2.2) * 1.5;
  const collarY = 118 + bob;
  const deskY = 162;

  // --- Studio wall with a stepped, banded key light behind the anchor ---
  const wall =
    severity > 0.7
      ? ["#14060b", "#1e0a12", "#2a0f19", "#371522"]
      : severity > 0.4
        ? ["#0b0d19", "#121626", "#1a1f34", "#232a44"]
        : ["#08142a", "#0d1d3a", "#14294d", "#1c3762"];
  box(0, 0, w, h, wall[0]);
  for (let band = 1; band <= 3; band++) {
    const r = 128 - band * 30;
    const ring: Pt[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      ring.push([cx - 26 + Math.cos(a) * r * 1.2, 54 + Math.sin(a) * r]);
    }
    poly(ring, wall[band]);
  }
  // Slanted window-blind shadows across the key light.
  for (let i = 0; i < 4; i++) {
    const sy = 8 + i * 26;
    poly(
      [
        [0, sy + 30],
        [w, sy],
        [w, sy + 9],
        [0, sy + 39],
      ],
      "rgba(0, 0, 0, 0.22)",
    );
  }
  box(12, 12, 10, 8, Math.floor(time * 2) % 2 === 0 ? "#ff334f" : "#5a1420");

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
  const toScreen = (v: Vec3): Pt => [cx + v[0], collarY - v[1]];
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
      const light = 0.12 + 0.88 * Math.max(dot(n, CARP_LIGHT), 0);
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
    [cx - 84, deskY],
    [cx - 76, collarY + 18],
    [cx - 56, collarY + 6],
    [cx - 28, collarY - 2],
    [cx + 28, collarY - 2],
    [cx + 56, collarY + 6],
    [cx + 76, collarY + 18],
    [cx + 84, deskY],
  ];

  // One cast shadow for head and shoulders, thrown down-right by the key light.
  ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
  ctx.beginPath();
  for (const face of faces) trace(face.pts, 12, 7);
  trace(shoulders, 12, 7);
  ctx.fill();

  // --- Faceted suit: lit from the left, falling into shadow on the right ---
  poly(shoulders, SUIT[1]);
  for (const side of [-1, 1]) {
    poly(
      [
        [cx + side * 84, deskY],
        [cx + side * 76, collarY + 18],
        [cx + side * 56, collarY + 6],
        [cx + side * 40, collarY + 14],
        [cx + side * 50, deskY],
      ],
      side < 0 ? SUIT[2] : SUIT[0],
    );
    poly(
      [
        [cx + side * 56, collarY + 6],
        [cx + side * 28, collarY - 2],
        [cx + side * 20, collarY + 12],
        [cx + side * 40, collarY + 14],
      ],
      side < 0 ? SUIT[3] : SUIT[2],
    );
  }

  // --- The head itself, clipped at the collar so it grows out of the shirt ---
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, collarY + 6);
  ctx.clip();
  for (const face of faces) {
    poly(face.pts, face.color);
    if (face.rim) {
      // Accent-coloured studio backlight catching the shadow-side facets.
      ctx.globalAlpha = 0.28;
      poly(face.pts, accent);
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
  ctx.lineWidth = 2.5;
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
      if (drawing) ctx.lineTo(x + px, y + py);
      else ctx.moveTo(x + px, y + py);
      drawing = true;
    }
    ctx.stroke();
  }

  // Barbels droop from the corners of the lips.
  const twitch = Math.sin(time * 5) * 2;
  ctx.strokeStyle = skin[1];
  ctx.lineWidth = 3;
  for (const angle of [-1.1, -0.55, 0.55, 1.1]) {
    if (!facesViewer(angle, 0.1)) continue;
    const [bx, by] = toScreen(rot(surface(93, 12.5, angle)));
    const dir = Math.sign(angle);
    const reach = Math.abs(angle) > 1 ? 1 : 0.6;
    ctx.beginPath();
    ctx.moveTo(x + bx, y + by);
    ctx.lineTo(x + bx + dir * 9 * reach, y + by + 6 * reach);
    ctx.lineTo(x + bx + dir * (12 + twitch) * reach, y + by + 18 * reach);
    ctx.stroke();
  }

  // Bulging eyes on the sides of the head, staring at nothing.
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
    // The lids sag as the news gets bleaker.
    if (severity > 0.4) {
      const cut = Math.asin(severity > 0.7 ? 0.05 : 0.45);
      poly(disc(11.2, 4.8, cut, Math.PI - cut), skin[1]);
    }
  }
  ctx.restore();

  // --- Shirt, collar, lapels and tie laid over the base of the neck ---
  poly(
    [
      [cx - 24, collarY],
      [cx + 24, collarY],
      [cx, collarY + 42],
    ],
    "#e9f0fb",
  );
  poly(
    [
      [cx, collarY + 2],
      [cx + 24, collarY],
      [cx, collarY + 42],
    ],
    "#bccbe0",
  );
  for (const side of [-1, 1]) {
    poly(
      [
        [cx + side * 32, collarY - 4],
        [cx + side * 6, collarY + 6],
        [cx + side * 18, collarY + 15],
      ],
      side < 0 ? "#f6f9ff" : "#c9d6ea",
    );
    poly(
      [
        [cx + side * 30, collarY - 2],
        [cx + side * 20, collarY + 12],
        [cx + side * 4, deskY],
        [cx + side * 16, deskY],
        [cx + side * 34, collarY + 22],
        [cx + side * 40, collarY + 10],
      ],
      side < 0 ? SUIT[3] : SUIT[1],
    );
  }
  poly(
    [
      [cx - 6, collarY + 5],
      [cx + 6, collarY + 5],
      [cx + 4, collarY + 13],
      [cx - 4, collarY + 13],
    ],
    accent,
  );
  poly(
    [
      [cx - 4, collarY + 13],
      [cx + 4, collarY + 13],
      [cx + 8, collarY + 36],
      [cx, collarY + 44],
      [cx - 8, collarY + 36],
    ],
    accent,
  );
  poly(
    [
      [cx, collarY + 13],
      [cx + 4, collarY + 13],
      [cx + 8, collarY + 36],
      [cx, collarY + 44],
    ],
    "rgba(0, 0, 0, 0.3)",
  );
  poly(
    [
      [cx + 44, collarY + 26],
      [cx + 60, collarY + 26],
      [cx + 54, collarY + 19],
      [cx + 49, collarY + 22],
    ],
    "#eef3fc",
  );
  box(cx - 30, collarY + 20, 5, 5, "#05070b");

  // --- Desk: lit top, dark front, accent trim, script pages and a mug ---
  box(0, deskY, w, 10, "#1b2436");
  box(0, deskY + 10, w, h - deskY - 10, "#0a0f19");
  box(0, deskY + 10, w, 3, accent);
  poly(
    [
      [cx - 54, deskY + 2],
      [cx - 6, deskY + 1],
      [cx - 2, deskY + 8],
      [cx - 52, deskY + 9],
    ],
    "#dfe7f3",
  );
  box(cx - 46, deskY + 4, 28, 1.5, "#7b8ea8");
  box(cx + 60, deskY - 14, 16, 19, "#cfd9ea");
  box(cx + 69, deskY - 14, 7, 19, "#9fb0c8");
  box(cx + 76, deskY - 10, 6, 3, "#9fb0c8");
  box(cx + 79, deskY - 10, 3, 10, "#9fb0c8");
  box(cx + 76, deskY - 3, 6, 3, "#9fb0c8");
  box(cx + 60, deskY - 7, 16, 5, accent);

  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 4;
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
  ctx.restore();
}

function fitWrappedSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  minSize: number,
): number {
  for (let size = startSize; size >= minSize; size -= 2) {
    ctx.font = `bold ${size}px ${FONT_STACK}`;
    if (countWrappedLines(ctx, text, maxWidth) <= maxLines) return size;
  }
  return minSize;
}

function countWrappedLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): number {
  const words = text.split(" ");
  let line = "";
  let rows = 1;
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(next).width > maxWidth && line !== "") {
      rows += 1;
      line = word;
    } else {
      line = next;
    }
  }
  return rows;
}

function drawWrapped(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
): void {
  const words = text.split(" ");
  let line = "";
  let row = 0;
  for (const word of words) {
    const next = line === "" ? word : `${line} ${word}`;
    if (ctx.measureText(next).width > maxWidth && line !== "") {
      ctx.fillText(line, x, y + row * lineHeight);
      row += 1;
      if (row >= maxLines) return;
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== "" && row < maxLines) {
    ctx.fillText(line, x, y + row * lineHeight);
  }
}

function drawGraphic(
  ctx: CanvasRenderingContext2D,
  kind: NewsGraphic,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: string,
  time: number,
): void {
  // Inner frame
  ctx.fillStyle = "rgba(4, 7, 13, 0.85)";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);

  const px = x + 14;
  const py = y + 14;
  const pw = w - 28;
  const ph = h - 28;
  const cx = x + w / 2;
  const cy = y + h / 2;

  switch (kind) {
    case "crossover": {
      ctx.strokeStyle = "#38e8ff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px, py + ph - 6);
      ctx.lineTo(px + pw, py + 6);
      ctx.stroke();

      ctx.strokeStyle = "#ff4e64";
      ctx.beginPath();
      ctx.moveTo(px, py + 10);
      ctx.lineTo(px + pw, py + ph - 6);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
      break;
    }
    case "bars_down": {
      const bars = [0.92, 0.78, 0.62, 0.45, 0.34, 0.28];
      const gap = 5;
      const bw = Math.floor((pw - gap * (bars.length - 1)) / bars.length);
      bars.forEach((v, i) => {
        const bh = Math.round(v * ph);
        ctx.fillStyle = i >= 4 ? "#ff3854" : accent;
        ctx.fillRect(px + i * (bw + gap), py + ph - bh, bw, bh);
      });
      break;
    }
    case "panopticon": {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 42, 24, 0, 0, Math.PI * 2);
      ctx.stroke();
      const lookX = Math.sin(time * 1.4) * 9;
      ctx.fillStyle = "#ff2d46";
      ctx.beginPath();
      ctx.arc(cx + lookX, cy, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx + lookX - 4, cy - 4, 5, 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(px, py, 12, 3);
      ctx.fillRect(px, py, 3, 12);
      ctx.fillRect(px + pw - 12, py, 12, 3);
      ctx.fillRect(px + pw - 3, py, 3, 12);
      ctx.fillRect(px, py + ph - 3, 12, 3);
      ctx.fillRect(px, py + ph - 12, 3, 12);
      ctx.fillRect(px + pw - 12, py + ph - 3, 12, 3);
      ctx.fillRect(px + pw - 3, py + ph - 12, 3, 12);
      break;
    }
    case "lawsuit": {
      ctx.strokeStyle = "#38e8ff";
      ctx.lineWidth = 4;
      ctx.strokeRect(cx - 24, cy - 30, 48, 60);
      ctx.fillStyle = accent;
      ctx.fillRect(cx - 16, cy - 19, 32, 8);
      ctx.fillRect(cx - 16, cy - 4, 32, 8);
      ctx.fillRect(cx - 16, cy + 11, 32, 8);
      ctx.strokeStyle = "#ff2e44";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px + 6, py + ph - 4);
      ctx.lineTo(px + pw - 6, py + 4);
      ctx.stroke();
      break;
    }
    case "face_grid": {
      ctx.strokeStyle = "#5ee7ff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 26, 34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 38, cy - 6);
      ctx.lineTo(cx + 38, cy - 6);
      ctx.moveTo(cx - 32, cy + 14);
      ctx.lineTo(cx + 32, cy + 14);
      ctx.moveTo(cx, cy - 38);
      ctx.lineTo(cx, cy + 38);
      ctx.stroke();
      const scanY = py + ((time * 34) % ph);
      ctx.fillStyle = "rgba(255, 64, 96, 0.85)";
      ctx.fillRect(px, scanY, pw, 3);
      break;
    }
    case "stream_eye": {
      ctx.fillStyle = "#ff2e44";
      ctx.fillRect(px + 2, py + 2, 62, 20);
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold 13px ${FONT_STACK}`;
      ctx.textBaseline = "middle";
      ctx.fillText("18.4K", px + 10, py + 13);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
      ctx.lineWidth = 3;
      ctx.strokeRect(px + 10, py + 30, pw - 20, ph - 34);
      ctx.fillStyle = "#38e8ff";
      ctx.fillRect(cx - 8, py + 46, 16, 24);
      break;
    }
    case "fracture": {
      ctx.strokeStyle = "#38e8ff";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px, cy);
      ctx.lineTo(px + pw * 0.38, py + 8);
      ctx.lineTo(px + pw * 0.44, py + ph - 8);
      ctx.stroke();

      ctx.strokeStyle = "#ff2e44";
      ctx.beginPath();
      ctx.moveTo(px + pw, cy);
      ctx.lineTo(px + pw * 0.62, py + ph - 8);
      ctx.lineTo(px + pw * 0.56, py + 8);
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(cx - 1.5, py + 4, 3, ph - 8);
      break;
    }
    case "synthetic": {
      for (let i = 0; i < 9; i++) {
        const amp =
          9 + Math.abs(Math.sin(time * 3.5 + i * 0.7)) * (i === 4 ? 30 : 20);
        ctx.fillStyle = i % 2 === 0 ? "#38e8ff" : accent;
        ctx.fillRect(px + i * 11.5, cy - amp, 7, amp * 2);
      }
      break;
    }
    case "collapse": {
      ctx.strokeStyle = "#ff334f";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(px, py + 12);
      ctx.lineTo(px + pw * 0.25, py + 20);
      ctx.lineTo(px + pw * 0.5, py + 36);
      ctx.lineTo(px + pw * 0.72, py + 60);
      ctx.lineTo(px + pw, py + ph - 4);
      ctx.stroke();
      ctx.fillStyle = "rgba(255, 51, 79, 0.28)";
      ctx.lineTo(px + pw, py + ph);
      ctx.lineTo(px, py + ph);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case "static_eye": {
      ctx.strokeStyle = "#ff2e44";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(px, cy);
      ctx.lineTo(px + pw, cy);
      ctx.stroke();
      const pulse = 15 + Math.sin(time * 4) * 5;
      ctx.strokeStyle = "rgba(255, 46, 68, 0.9)";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ff2e44";
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
      break;
    }
  }
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
