import { clamp, lerp, mix, type Vec3 } from "./math";

/* Time in the hut runs on your attention: it only moves while you look at
   the phone, and then it moves fast. A few minutes of scrolling is the whole
   afternoon and the evening. Nothing here is animated to look fast: you look
   up, and it is simply later. */

/** Seconds of looking at the phone that pass for one hour in the hut. */
const SECONDS_PER_HOUR = 22;
/** The hour it is in the hut when you sit down. */
const START_HOUR = 14;
/** Hours after which the hut is well on its way to ruin. */
const DECAY_HOURS = 5.2;

/** Hours gone by in the hut after this many seconds on the phone. */
function hoursPassed(seconds: number): number {
  return seconds / SECONDS_PER_HOUR;
}

/** The hour on the hut's clock: 14.5 is half past two. It keeps counting
    past midnight. */
export function hourAfter(seconds: number): number {
  return START_HOUR + hoursPassed(seconds);
}

/**
 * How far gone the hut is, from 0 (as you found it) to 1 (ruined). It starts
 * slowly, so the first minute still looks like a nice afternoon.
 */
export function decayAfter(seconds: number): number {
  return 1 - Math.exp(-Math.pow(hoursPassed(seconds) / DECAY_HOURS, 1.8));
}

/** The light at one moment of the day. Colours are red, green, blue. */
export type Daylight = {
  /** Light that reaches everywhere in the hut. */
  ambient: Vec3;
  /** Extra light near the window, from the sky. */
  skyLight: Vec3;
  /** The beam that falls through the window: the sun, later the moon. */
  beam: Vec3;
  /** The sky at the top of the window, and low over the hills. */
  skyTop: Vec3;
  skyLow: Vec3;
  /** 0 by day, 1 at night: the stars and the moon. */
  night: number;
  /** How well the land outside is lit, 1 by day. */
  land: number;
};

type Moment = Daylight & { hour: number };

/** The day, as a few moments. The light between two is a blend of them. */
const MOMENTS: readonly Moment[] = [
  {
    hour: 16.5,
    ambient: [0.96, 0.85, 0.66],
    skyLight: [0.52, 0.44, 0.28],
    beam: [1.55, 1.22, 0.7],
    skyTop: [0.3, 0.56, 0.9],
    skyLow: [0.99, 0.92, 0.72],
    night: 0,
    land: 1,
  },
  {
    hour: 18.6,
    ambient: [0.8, 0.6, 0.44],
    skyLight: [0.55, 0.36, 0.22],
    beam: [1.5, 0.8, 0.3],
    skyTop: [0.3, 0.42, 0.72],
    skyLow: [1, 0.7, 0.42],
    night: 0,
    land: 0.8,
  },
  {
    hour: 20,
    ambient: [0.4, 0.34, 0.42],
    skyLight: [0.34, 0.22, 0.24],
    beam: [0.5, 0.2, 0.1],
    skyTop: [0.13, 0.15, 0.36],
    skyLow: [0.88, 0.4, 0.26],
    night: 0.15,
    land: 0.32,
  },
  {
    hour: 21.4,
    ambient: [0.3, 0.35, 0.54],
    skyLight: [0.45, 0.55, 0.9],
    beam: [1.05, 1.25, 1.8],
    skyTop: [0.05, 0.075, 0.19],
    skyLow: [0.16, 0.22, 0.42],
    night: 0.85,
    land: 0.06,
  },
  {
    hour: 23,
    ambient: [0.28, 0.33, 0.52],
    skyLight: [0.45, 0.55, 0.9],
    beam: [1.05, 1.25, 1.8],
    skyTop: [0.04, 0.06, 0.16],
    skyLow: [0.13, 0.18, 0.36],
    night: 1,
    land: 0.035,
  },
];

/** The light at this hour on the hut's clock. After dark it stays dark. */
export function daylightAt(hour: number): Daylight {
  const last = MOMENTS.length - 1;
  if (hour <= MOMENTS[0].hour) return MOMENTS[0];
  if (hour >= MOMENTS[last].hour) return MOMENTS[last];
  let i = 0;
  while (hour > MOMENTS[i + 1].hour) i++;
  const from = MOMENTS[i];
  const to = MOMENTS[i + 1];
  const t = clamp((hour - from.hour) / (to.hour - from.hour), 0, 1);
  return {
    ambient: mix(from.ambient, to.ambient, t),
    skyLight: mix(from.skyLight, to.skyLight, t),
    beam: mix(from.beam, to.beam, t),
    skyTop: mix(from.skyTop, to.skyTop, t),
    skyLow: mix(from.skyLow, to.skyLow, t),
    night: lerp(from.night, to.night, t),
    land: lerp(from.land, to.land, t),
  };
}
