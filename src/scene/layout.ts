import type { Vec3 } from "./math";

/* Where things are in the hut. Everything is measured from the middle of the
   floor: right is +x, up is +y, and +z is behind you. One unit is about
   2.3 mm (the phone is 64 tall), so the hut is about 3.7 m wide. */

/** Half the hut's width (x) and depth (z). */
export const HALF_WIDTH = 800;
export const HALF_DEPTH = 850;
/** Where the walls stop and the roof starts, and the top of the roof. */
export const EAVE = 900;
export const RIDGE = 1350;

/** Your eyes: sitting down, towards the back of the hut. */
export const EYE: Vec3 = [0, 480, 450];

/** The window, in the wall in front of you: left, bottom, right, top. */
export const WINDOW = { x0: -640, y0: 430, x1: -280, y1: 810 } as const;
/** How thick the wall is where the window cuts through it. */
export const WALL_THICKNESS = 34;

/** The phone, in units, and the height it is laid out at on the page. */
export const PHONE = {
  width: (64 * 9) / 19.5,
  height: 64,
  depth: 3.4,
} as const;
export const PHONE_PIXELS = 760;
/** The radius of its corners, and how much of its rim the hut draws: the
    rest of the phone is the real one on the page, seen through a hole. */
export const PHONE_CORNER = (64 * 48) / PHONE_PIXELS;
export const PHONE_RIM = (64 * 5) / PHONE_PIXELS;
/** How far from your eyes you hold it. */
export const ARM = 74;
/** Degrees below eye level you hold it, and where your hand drops to once
    you look up. */
export const HOLD_DEG = 22;
export const REST_DEG = 50;

/** How far the picture plane is from your eyes, in half picture heights.
    Top to bottom you see about 64 degrees, whatever the size of the page. */
export const FOCAL = 1.6;

/** Where the tally starts on the wall in front of you: its top left. */
export const TALLY = { x: -170, y: 770, perRow: 40, rows: 5 } as const;

/** The middle of the clock, on the wall in front of you. */
export const CLOCK: Vec3 = [330, 1010, -HALF_DEPTH];
