import { radians, type Vec3 } from "./math";

/* Where things are in the hut. Everything is measured from the middle of the
   floor: right is +x, up is +y, and +z is behind you. One unit is about
   2.3 mm (the phone is 64 tall), so the hut is about 4.4 m wide by 3.9 m deep. */

/** Half the hut's width (x) and depth (z). */
export const HALF_WIDTH = 960;
export const HALF_DEPTH = 850;
/** Where the walls stop and the roof starts, and the top of the roof. */
export const EAVE = 900;
export const RIDGE = 1350;

/** Your eyes: sunk into the red couch, angled slightly toward the room so
    the window, wall shelf, clock, and CRT television all sit in view around
    the phone while the hearth glows on your left and the door sits right. */
export const EYE: Vec3 = [-20, 455, 310];

/** The window, in the wall in front of you: left, bottom, right, top. */
export const WINDOW = { x0: -690, y0: 345, x1: -335, y1: 695 } as const;
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
export const HOLD_DEG = 20.5;
export const REST_DEG = 50;

/** How far the picture plane is from your eyes, in half picture heights.
    Top to bottom you see about 64 degrees, whatever the size of the page. */
export const FOCAL = 1.6;

/** Where the tally starts on the wall in front of you: its top left, beside
    the clock and above the CRT television so you catch it growing without
    looking up. */
export const TALLY = { x: 350, y: 722, perRow: 20, rows: 6 } as const;

/** The cast-iron wood stove / heater on its brick-and-slate hearth along the
    left wall: well clear of the TV and curtains, facing inward toward the
    couch, rug, and bed. */
export const STOVE: Vec3 = [-825, 0, -480];
export const STOVE_YAW = radians(66);

/** The middle of the clock, on the front wall above the TV and right of the
    shelf so its hands stay readable over your phone. */
export const CLOCK: Vec3 = [245, 650, -HALF_DEPTH];

/** The door opening along the right wall (front-right entryway). */
export const DOOR = { z0: -470, z1: -120, height: 800 } as const;

/** A box from its lowest corner to its highest. */
export type Box = readonly [Vec3, Vec3];

/** The mid-century writing desk beneath the window, holding the potted plant. */
export const WINDOW_TABLE = {
  at: [-515, 0, -685] as Vec3,
  yaw: radians(10),
  width: 256,
  depth: 148,
  height: 292,
} as const;

/** The low coffee table in front of the couch, turned slightly off-axis. */
export const COFFEE_TABLE = {
  at: [55, 0, -175] as Vec3,
  yaw: radians(-7),
  width: 236,
  depth: 136,
  height: 168,
} as const;

/** The red three-seater you are sitting on, slightly angled off the grid.
    Its middle (x = 0 in its own space) is right under your eyes. */
export const COUCH = {
  at: [-21, 0, 338] as Vec3,
  yaw: radians(-3),
} as const;

/** The timber cabin bed tucked into the warm back-left sleeping nook, with
    its headboard against a built-in back-wall shelf. */
export const BED = {
  x0: -948,
  x1: -468,
  z0: -65,
  z1: 755,
  mattressTop: 224,
} as const;

/** The wooden credenza and CRT television, placed to the right of your phone
    and turned toward the couch so the broadcast sits cleanly in view. */
export const TV_AT: Vec3 = [355, 0, -605];
export const TV_YAW = radians(-22);
export const TV_FACING: Vec3 = [Math.sin(TV_YAW), 0, Math.cos(TV_YAW)];

/** The stand, cabinet, and CRT glass in the television's own local space
    (centered on TV_AT before rotation by TV_YAW). */
export const TV_STAND: Box = [
  [-165, 0, -82],
  [165, 212, 82],
];

export const TV_CABINET: Box = [
  [-145, 212, -76],
  [145, 462, 76],
];

export const TV_SCREEN = {
  x0: -126,
  y0: 248,
  x1: 82,
  y1: 424,
  z: 76.8,
} as const;

const TV_LOCAL_LIGHT: Vec3 = [
  (TV_SCREEN.x0 + TV_SCREEN.x1) / 2,
  (TV_SCREEN.y0 + TV_SCREEN.y1) / 2,
  TV_SCREEN.z + 24,
];

/** Where the CRT television casts its light from (just in front of the glass,
    in world space). */
export const TV_LIGHT_AT: Vec3 = [
  TV_AT[0] +
    TV_LOCAL_LIGHT[0] * Math.cos(TV_YAW) +
    TV_LOCAL_LIGHT[2] * Math.sin(TV_YAW),
  TV_LOCAL_LIGHT[1],
  TV_AT[2] -
    TV_LOCAL_LIGHT[0] * Math.sin(TV_YAW) +
    TV_LOCAL_LIGHT[2] * Math.cos(TV_YAW),
];

/** The surveillance pole outside the window: seen through the upper-right pane. */
export const CAMERA_POLE = {
  poleBase: [-475, 160, -1175] as Vec3,
  poleHeight: 490,
  headAt: [-520, 600, -1150] as Vec3,
} as const;

/** The big things in the hut that throw a shadow: hard edged and darker
    than real, on purpose, like the drawn shadows of an old game. The sun
    through the window is blocked by them, and each one darkens the floor
    right under it. The plants and small things don't. */
export const SHADOW_CASTERS: readonly Box[] = [
  // The mid-century desk under the window (tabletop + leg volume).
  [
    [-642, 266, -756],
    [-388, 292, -612],
  ],
  [
    [-625, 0, -740],
    [-405, 266, -628],
  ],
  // The ceramic planter pot on the window desk.
  [
    [-512, 292, -714],
    [-432, 354, -634],
  ],
  // Low vinyl sideboard beneath the front wall shelf.
  [
    [-220, 48, -846],
    [130, 228, -736],
  ],
  // The low coffee table in front of the couch.
  [
    [-60, 148, -242],
    [170, 168, -108],
  ],
  [
    [-46, 0, -228],
    [156, 60, -122],
  ],
  // The angled television credenza and CRT cabinet.
  [
    [200, 0, -695],
    [510, 212, -515],
  ],
  [
    [220, 212, -682],
    [490, 462, -528],
  ],
  // The cast-iron wood stove on its left-wall hearth.
  [
    [STOVE[0] - 92, 0, STOVE[2] - 92],
    [STOVE[0] + 92, 326, STOVE[2] + 92],
  ],
  // The board of the shelf on the front wall above your phone. The thin
  // iron brackets under it let the light by.
  [
    [-210, 518, -HALF_DEPTH],
    [150, 534, -HALF_DEPTH + 94],
  ],
  // The timber bed in the back-left sleeping nook.
  [
    [BED.x0, 52, BED.z0],
    [BED.x1, BED.mattressTop, BED.z1],
  ],
  [
    [BED.x0, 52, BED.z1 - 24],
    [BED.x1, 445, BED.z1 + 92],
  ],
  // The red couch you sit on.
  [
    [-340, 52, 165],
    [300, 360, 530],
  ],
  // The cabin kitchenette counter along the back-right wall.
  [
    [735, 0, 90],
    [956, 332, 680],
  ],
  // Entryway bench in the front-right corner: only its seat. Light gets
  // through the thin legs and the slatted rack under it.
  [
    [712, 170, -836],
    [942, 188, -692],
  ],
];
