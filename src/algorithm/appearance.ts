/**
 * A mock "predicted attractiveness" model for the user cam.
 *
 * There is no face model here. It only measures four crude things about the
 * camera frame: light, contrast, sharpness and left-right symmetry. That is
 * the point: real beauty-score models are known to react strongly to lighting,
 * camera quality and head tilt, and to the taste of the people who rated
 * their training photos. Move to a lamp and "your attractiveness" goes up.
 *
 * Why it exists: leaked 2019-20 TikTok moderation rules kept "ugly facial
 * looks" and "abnormal body shape" out of For You (The Intercept, 2020), and
 * the 2024 Kentucky lawsuit alleges TikTok changed its algorithm to show fewer
 * "not attractive subjects". TikTok disputes both. TikTok is not known to scan
 * viewers through the front camera; it analyses faces in videos people post.
 * So the score is shown as the reach a video of this frame would get.
 */

/** RGBA pixels of one camera frame, the same shape as the browser's ImageData. */
export type Frame = {
  data: ArrayLike<number>;
  width: number;
  height: number;
};

export type AppearanceFactor = "light" | "contrast" | "sharpness" | "symmetry";

export type FactorReading = {
  factor: AppearanceFactor;
  /** 0 = worst, 1 = best, as far as this mock model is concerned. */
  value: number;
};

export type AppearanceReading = {
  /** False when the frame is too dark or flat to score, e.g. a covered camera. */
  scorable: boolean;
  /** The mock "predicted attractiveness", from 3.0 to 9.0. */
  score: number;
  factors: FactorReading[];
  /** For You reach of a video showing this frame. 1.2 = 20% more viewers. */
  reach: number;
};

/** Made-up weights. Real models learn theirs from rated photos. */
export const FACTOR_WEIGHTS: Record<AppearanceFactor, number> = {
  light: 0.3,
  contrast: 0.15,
  sharpness: 0.25,
  symmetry: 0.3,
};

/**
 * The part of the frame that gets scored, as fractions of width and height.
 * A webcam face is usually in the middle, so that is where the mock looks.
 */
export const FACE_BOX = { left: 0.25, right: 0.75, top: 0.1, bottom: 0.9 };

const SCORE_MIN = 3;
const SCORE_MAX = 9;
const REACH_MIN = 0.5;
const REACH_MAX = 1.5;
/**
 * Pixels darker or brighter than these count as crushed or blown out. "Light"
 * is judged by these, not by average brightness, so darker skin is not marked
 * down. (Real beauty models do show skin-tone bias; this mock avoids copying it.)
 */
const CRUSHED = 0.04;
const BLOWN = 0.97;
/** Share of crushed or blown pixels that counts as fully badly lit. */
const FULLY_BADLY_LIT = 0.3;
/**
 * The next three were tuned on test frames: a front-lit, centred face scores
 * high; a dim room, a blurry lens or a side lamp each pull their factor down.
 */
/** Spread of brightness that counts as full contrast. */
const FULL_CONTRAST = 0.25;
/** Average edge strength that counts as fully sharp. */
const FULL_SHARPNESS = 0.1;
/** Left-right difference (relative to contrast) that counts as fully asymmetric. */
const FULL_ASYMMETRY = 1.6;
/** Symmetry compares blocks this many pixels wide, so noise does not count. */
const SYMMETRY_BLOCK = 4;

/** The raw numbers measured from a frame, before they become 0-1 factors. */
export type FrameMeasures = {
  /** Average brightness of the face box, 0-1. */
  mean: number;
  /** Standard deviation of brightness in the face box. */
  spread: number;
  /** Share of face-box pixels that are crushed to black or blown to white. */
  badlyLit: number;
  /** Average difference between a pixel and its four neighbours. */
  sharpness: number;
  /** Average left-right block difference, divided by the spread. */
  asymmetry: number;
};

/** Scores one camera frame. Pure: the same frame always gets the same score. */
export function readAppearance(frame: Frame): AppearanceReading {
  const measures = measureFrame(frame);
  const factors: FactorReading[] = [
    {
      factor: "light",
      value: clamp01(1 - measures.badlyLit / FULLY_BADLY_LIT),
    },
    { factor: "contrast", value: clamp01(measures.spread / FULL_CONTRAST) },
    {
      factor: "sharpness",
      value: clamp01(measures.sharpness / FULL_SHARPNESS),
    },
    {
      factor: "symmetry",
      value: clamp01(1 - measures.asymmetry / FULL_ASYMMETRY),
    },
  ];
  // A covered or pitch-black camera has nothing to score.
  const scorable = measures.mean > 0.03 && measures.spread > 0.015;
  return fromFactors(factors, scorable);
}

/** Measures light, contrast, sharpness and symmetry inside the face box. */
export function measureFrame(frame: Frame): FrameMeasures {
  const { width, height } = frame;
  const luma = toLuma(frame);
  const x0 = Math.round(width * FACE_BOX.left);
  const x1 = Math.round(width * FACE_BOX.right);
  const y0 = Math.round(height * FACE_BOX.top);
  const y1 = Math.round(height * FACE_BOX.bottom);
  const at = (x: number, y: number) => luma[y * width + x];

  let sum = 0;
  let sumSquares = 0;
  let clipped = 0;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const value = at(x, y);
      sum += value;
      sumSquares += value * value;
      if (value < CRUSHED || value > BLOWN) clipped++;
      count++;
    }
  }
  const mean = count === 0 ? 0 : sum / count;
  const spread =
    count === 0 ? 0 : Math.sqrt(Math.max(sumSquares / count - mean * mean, 0));

  // Sharpness: how strongly each pixel differs from its four neighbours.
  let edges = 0;
  let edgeCount = 0;
  for (let y = Math.max(y0, 1); y < Math.min(y1, height - 1); y++) {
    for (let x = Math.max(x0, 1); x < Math.min(x1, width - 1); x++) {
      const neighbours =
        at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1);
      edges += Math.abs(4 * at(x, y) - neighbours);
      edgeCount++;
    }
  }

  // Symmetry: compare blocks on the left with the mirrored blocks on the
  // right. Side lighting and a tilted or off-centre head both break it.
  const columns = Math.floor((x1 - x0) / SYMMETRY_BLOCK);
  const rows = Math.floor((y1 - y0) / SYMMETRY_BLOCK);
  const block = (column: number, row: number) => {
    let total = 0;
    for (let dy = 0; dy < SYMMETRY_BLOCK; dy++) {
      for (let dx = 0; dx < SYMMETRY_BLOCK; dx++) {
        total += at(
          x0 + column * SYMMETRY_BLOCK + dx,
          y0 + row * SYMMETRY_BLOCK + dy,
        );
      }
    }
    return total / (SYMMETRY_BLOCK * SYMMETRY_BLOCK);
  };
  let difference = 0;
  let pairs = 0;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < Math.floor(columns / 2); column++) {
      difference += Math.abs(
        block(column, row) - block(columns - 1 - column, row),
      );
      pairs++;
    }
  }

  return {
    mean,
    spread,
    badlyLit: count === 0 ? 1 : clipped / count,
    sharpness: edgeCount === 0 ? 0 : edges / edgeCount,
    asymmetry: pairs === 0 ? 1 : difference / pairs / Math.max(spread, 0.05),
  };
}

/**
 * Blends a new reading into the previous one so the score drifts instead of
 * flickering. `keep` is how much of the previous reading survives (0-1).
 */
export function smoothReading(
  previous: AppearanceReading | null,
  next: AppearanceReading,
  keep = 0.7,
): AppearanceReading {
  if (previous === null || !previous.scorable || !next.scorable) return next;
  const factors = next.factors.map((reading) => {
    const before = previous.factors.find((f) => f.factor === reading.factor);
    const value =
      before === undefined
        ? reading.value
        : before.value * keep + reading.value * (1 - keep);
    return { factor: reading.factor, value };
  });
  return fromFactors(factors, true);
}

function fromFactors(
  factors: FactorReading[],
  scorable: boolean,
): AppearanceReading {
  const total = factors.reduce(
    (sum, reading) => sum + reading.value * FACTOR_WEIGHTS[reading.factor],
    0,
  );
  const score = SCORE_MIN + total * (SCORE_MAX - SCORE_MIN);
  const reach = REACH_MIN + total * (REACH_MAX - REACH_MIN);
  return {
    scorable,
    score: Math.round(score * 10) / 10,
    factors,
    reach: Math.round(reach * 100) / 100,
  };
}

/** Brightness of every pixel, 0 (black) to 1 (white). */
function toLuma(frame: Frame): Float32Array {
  const { data, width, height } = frame;
  const luma = new Float32Array(width * height);
  for (let i = 0; i < luma.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    luma[i] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }
  return luma;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}
