import { clamp, lerp, mix, type Vec3 } from "./math";

/* Time in the hut runs on reel pulls, not the wall clock: stopping to read
   the algorithm panel or watch the TV never punishes you. Every swipe pulls
   the afternoon deeper into night, rots the walls a little more, and leaves
   the CRT television as the last light in the room. */

/** Reel pulls that pass for one hour on the hut's clock (10 min per pull). */
const PULLS_PER_HOUR = 6;
/** The hour it is in the hut when you sit down. */
const START_HOUR = 14;
/** Reel pulls after which the hut is well on its way to ruin. */
const DECAY_PULLS = 44;

/** Hours gone by in the hut after this many reel pulls. */
function hoursPassed(pulls: number): number {
  return Math.max(pulls, 0) / PULLS_PER_HOUR;
}

/** The hour on the hut's clock: 14.5 is half past two. It keeps counting
    past midnight. */
export function hourAfter(pulls: number): number {
  return START_HOUR + hoursPassed(pulls);
}

/**
 * How far gone the hut is, from 0 (as you found it) to 1 (ruined). Creeps
 * very slowly over dozens of reels so you never catch a sudden jump.
 */
export function decayAfter(pulls: number): number {
  const safe = Math.max(pulls, 0);
  return 1 - Math.exp(-Math.pow(safe / DECAY_PULLS, 1.75));
}

/** The light at one moment of the day. Colours are red, green, blue. */
export type Daylight = {
  /** Light that reaches everywhere in the hut. */
  ambient: Vec3;
  /** Extra light near the window, from the sky. */
  skyLight: Vec3;
  /** The beam that falls through the window: the sun, later fading moonlight. */
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

/** The day, as a few moments. Late at night even the moonlight dies down so
    that the flickering CRT TV becomes the only thing lighting the hut. */
const MOMENTS: readonly Moment[] = [
  {
    hour: 15.2,
    ambient: [0.96, 0.85, 0.66],
    skyLight: [0.52, 0.44, 0.28],
    beam: [1.55, 1.22, 0.7],
    skyTop: [0.3, 0.56, 0.9],
    skyLow: [0.99, 0.92, 0.72],
    night: 0,
    land: 1,
  },
  {
    hour: 17.8,
    ambient: [0.76, 0.57, 0.42],
    skyLight: [0.52, 0.34, 0.2],
    beam: [1.4, 0.74, 0.28],
    skyTop: [0.28, 0.38, 0.68],
    skyLow: [0.96, 0.66, 0.38],
    night: 0,
    land: 0.76,
  },
  {
    hour: 19.6,
    ambient: [0.34, 0.29, 0.38],
    skyLight: [0.28, 0.19, 0.22],
    beam: [0.42, 0.18, 0.1],
    skyTop: [0.11, 0.13, 0.32],
    skyLow: [0.78, 0.34, 0.24],
    night: 0.22,
    land: 0.28,
  },
  {
    hour: 21.4,
    ambient: [0.16, 0.19, 0.3],
    skyLight: [0.24, 0.3, 0.48],
    beam: [0.48, 0.58, 0.85],
    skyTop: [0.04, 0.06, 0.16],
    skyLow: [0.12, 0.17, 0.32],
    night: 0.85,
    land: 0.05,
  },
  {
    hour: 23.4,
    ambient: [0.06, 0.07, 0.12],
    skyLight: [0.1, 0.13, 0.22],
    beam: [0.16, 0.2, 0.32],
    skyTop: [0.025, 0.035, 0.09],
    skyLow: [0.06, 0.085, 0.16],
    night: 1,
    land: 0.025,
  },
  {
    hour: 25.5,
    ambient: [0.02, 0.024, 0.04],
    skyLight: [0.035, 0.045, 0.075],
    beam: [0.04, 0.05, 0.085],
    skyTop: [0.014, 0.018, 0.045],
    skyLow: [0.035, 0.045, 0.08],
    night: 1,
    land: 0.012,
  },
];

/** The light at this hour on the hut's clock. Late at night the sky stays
    black and only the TV keeps the room lit. */
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
