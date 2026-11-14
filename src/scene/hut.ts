import {
  CLOCK,
  EAVE,
  HALF_DEPTH,
  HALF_WIDTH,
  RIDGE,
  TALLY,
  WALL_THICKNESS,
  WINDOW,
} from "./layout";
import {
  lerp,
  mix,
  multiply,
  radians,
  rotationX,
  rotationY,
  rotationZ,
  smoothstep,
  translation,
  type Vec3,
} from "./math";
import {
  addBox,
  addDrum,
  addEllipsoid,
  addQuad,
  addTriangle,
  withTransform,
  type Mesh,
  type Paint,
} from "./mesh";
import { MATERIAL } from "./shaders";

/* The hut and what is in it, built from boxes and flat faces. buildHut makes
   everything that stays as it is; buildProps makes the few things that
   change shape as time goes by. Their surfaces rot in the shader. */

const W = HALF_WIDTH;
const D = HALF_DEPTH;
const WHITE: Vec3 = [1, 1, 1];

function wood(color: Vec3): Paint {
  return { color, material: MATERIAL.wood };
}

function plain(color: Vec3): Paint {
  return { color, material: MATERIAL.plain };
}

/** Its own colour, with the dust that settles on it. */
function dusty(color: Vec3): Paint {
  return { color, material: MATERIAL.dusty };
}

const BEAM = wood([0.5, 0.36, 0.23]);
const TRIM = wood([0.86, 0.82, 0.74]);
const FURNITURE = wood([0.68, 0.48, 0.3]);

/** Where the plant pot stands on the table. */
const POT: Vec3 = [-545, 336, -745];
const LEAVES = 9;
/** A nail in the wall to your left, which the picture hangs from. */
const NAIL: Vec3 = [-W, 790, -260];
/** The door's hinges: the edge of the door nearest you. */
const HINGE: Vec3 = [W - 2, 0, -210];

/** A piece of wall: 0 is the one in front of you, then right, back, left.
    It runs from `u0` to `u1` along the wall and from `y0` up to `y1`. */
function wallPanel(
  mesh: Mesh,
  id: number,
  u0: number,
  y0: number,
  u1: number,
  y1: number,
): void {
  const paint: Paint = {
    color: WHITE,
    material: MATERIAL.wall,
    extra: [id, 0],
  };
  const at = (u: number, y: number): Vec3 => {
    if (id === 0) return [u, y, -D];
    if (id === 1) return [W, y, u];
    if (id === 2) return [u, y, D];
    return [-W, y, u];
  };
  addQuad(mesh, at(u0, y0), at(u1, y0), at(u1, y1), at(u0, y1), paint);
}

/** A cobweb across a corner: from `corner` along two edges. */
function web(mesh: Mesh, corner: Vec3, along: Vec3, down: Vec3): void {
  const b: Vec3 = [
    corner[0] + along[0],
    corner[1] + along[1],
    corner[2] + along[2],
  ];
  const d: Vec3 = [
    corner[0] + down[0],
    corner[1] + down[1],
    corner[2] + down[2],
  ];
  const c: Vec3 = [b[0] + down[0], b[1] + down[1], b[2] + down[2]];
  addQuad(
    mesh,
    corner,
    b,
    c,
    d,
    { color: WHITE, material: MATERIAL.web },
    true,
  );
}

/** Everything in the hut that keeps its shape. */
export function buildHut(mesh: Mesh): void {
  const { x0, y0, x1, y1 } = WINDOW;

  addQuad(mesh, [-W, 0, D], [W, 0, D], [W, 0, -D], [-W, 0, -D], {
    color: WHITE,
    material: MATERIAL.floor,
  });

  // The wall in front of you, around the window.
  wallPanel(mesh, 0, -W, 0, x0, EAVE);
  wallPanel(mesh, 0, x1, 0, W, EAVE);
  wallPanel(mesh, 0, x0, 0, x1, y0);
  wallPanel(mesh, 0, x0, y1, x1, EAVE);
  wallPanel(mesh, 1, -D, 0, D, EAVE);
  wallPanel(mesh, 2, -W, 0, W, EAVE);
  wallPanel(mesh, 3, -D, 0, D, EAVE);
  // The pointed tops of the front and back walls.
  for (const [id, z] of [
    [0, -D],
    [2, D],
  ] as const) {
    addTriangle(mesh, [-W, EAVE, z], [W, EAVE, z], [0, RIDGE, z], {
      color: WHITE,
      material: MATERIAL.wall,
      extra: [id, 0],
    });
  }

  // The roof, seen from below, and what holds it up.
  const roof: Paint = { color: WHITE, material: MATERIAL.roof };
  addQuad(
    mesh,
    [-W, EAVE, -D],
    [-W, EAVE, D],
    [0, RIDGE, D],
    [0, RIDGE, -D],
    roof,
  );
  addQuad(
    mesh,
    [W, EAVE, D],
    [W, EAVE, -D],
    [0, RIDGE, -D],
    [0, RIDGE, D],
    roof,
  );
  const slope = Math.atan2(RIDGE - EAVE, W);
  const rafter = Math.hypot(RIDGE - EAVE, W);
  for (const z of [-700, -420, -140, 140, 420, 700]) {
    withTransform(
      mesh,
      multiply(translation([-W, EAVE, z]), rotationZ(slope)),
      () => addBox(mesh, [0, -44, -15], [rafter, 0, 15], BEAM),
    );
    withTransform(
      mesh,
      multiply(translation([W, EAVE, z]), rotationZ(Math.PI - slope)),
      () => addBox(mesh, [0, 0, -15], [rafter, 44, 15], BEAM),
    );
  }
  addBox(mesh, [-24, RIDGE - 76, -D], [24, RIDGE - 16, D], BEAM);
  for (const z of [-300, 250]) {
    addBox(mesh, [-W, EAVE - 30, z - 26], [W, EAVE + 22, z + 26], BEAM);
  }

  // Boards along the foot of each wall.
  const skirting = wood([0.6, 0.44, 0.29]);
  addBox(mesh, [-W, 0, -D], [W, 60, -D + 10], skirting);
  addBox(mesh, [-W, 0, D - 10], [W, 60, D], skirting);
  addBox(mesh, [-W, 0, -D], [-W + 10, 60, D], skirting);
  addBox(mesh, [W - 10, 0, -180], [W, 60, D], skirting);
  addBox(mesh, [W - 10, 0, -D], [W, 60, -590], skirting);

  // The window: the hole through the wall, its frame, sill and two bars.
  const back = -D - WALL_THICKNESS;
  addQuad(
    mesh,
    [x0, y0, -D],
    [x0, y0, back],
    [x0, y1, back],
    [x0, y1, -D],
    TRIM,
  );
  addQuad(
    mesh,
    [x1, y0, -D],
    [x1, y0, back],
    [x1, y1, back],
    [x1, y1, -D],
    TRIM,
  );
  addQuad(
    mesh,
    [x0, y0, -D],
    [x1, y0, -D],
    [x1, y0, back],
    [x0, y0, back],
    TRIM,
  );
  addQuad(
    mesh,
    [x0, y1, -D],
    [x1, y1, -D],
    [x1, y1, back],
    [x0, y1, back],
    TRIM,
  );
  addBox(mesh, [x0 - 30, y0, -D], [x0, y1 + 30, -D + 10], TRIM);
  addBox(mesh, [x1, y0, -D], [x1 + 30, y1 + 30, -D + 10], TRIM);
  addBox(mesh, [x0, y1, -D], [x1, y1 + 30, -D + 10], TRIM);
  addBox(mesh, [x0 - 44, y0 - 22, -D], [x1 + 44, y0, -D + 62], TRIM);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  addBox(mesh, [cx - 9, y0, -D - 24], [cx + 9, y1, -D - 10], TRIM);
  addBox(mesh, [x0, cy - 9, -D - 24], [x1, cy + 9, -D - 10], TRIM);

  // Outside. You never move, so a flat picture far behind the window does.
  addQuad(
    mesh,
    [-1100, 320, -1500],
    [-300, 320, -1500],
    [-300, 1060, -1500],
    [-1100, 1060, -1500],
    { color: WHITE, material: MATERIAL.sky },
    true,
  );

  // A table under the window, with a mug and a plant pot on it.
  addBox(mesh, [-630, 318, -838], [-330, 336, -650], FURNITURE);
  for (const x of [-622, -362]) {
    for (const z of [-830, -682]) {
      addBox(mesh, [x, 0, z], [x + 24, 318, z + 24], FURNITURE);
    }
  }
  addDrum(
    mesh,
    [-392, 336, -728],
    44,
    18,
    20,
    dusty([0.92, 0.38, 0.2]),
    dusty([0.22, 0.13, 0.09]),
  );
  addBox(mesh, [-374, 348, -732], [-362, 372, -724], dusty([0.92, 0.38, 0.2]));
  addDrum(
    mesh,
    POT,
    60,
    30,
    40,
    dusty([0.8, 0.43, 0.27]),
    dusty([0.2, 0.14, 0.1]),
  );

  // A rug where the sun falls.
  addQuad(
    mesh,
    [-520, 1.2, 170],
    [-60, 1.2, 170],
    [-60, 1.2, -330],
    [-520, 1.2, -330],
    { color: WHITE, material: MATERIAL.rug },
    true,
  );

  // A bare bulb on a cord. Nobody gets up to turn it on.
  addBox(
    mesh,
    [38.5, 690, -301.5],
    [41.5, EAVE - 30, -298.5],
    plain([0.1, 0.1, 0.1]),
  );
  addDrum(mesh, [40, 676, -300], 18, 9, 9, plain([0.15, 0.15, 0.15]));
  addEllipsoid(mesh, [40, 652, -300], [21, 27, 21], dusty([0.93, 0.91, 0.8]));

  // The clock, high on the wall: its case, face and hour marks.
  withTransform(
    mesh,
    multiply(translation(CLOCK), rotationX(Math.PI / 2)),
    () =>
      addDrum(
        mesh,
        [0, 0, 0],
        16,
        92,
        92,
        wood([0.34, 0.22, 0.14]),
        dusty([0.96, 0.94, 0.87]),
      ),
  );
  for (let hour = 0; hour < 12; hour++) {
    const wide = hour % 3 === 0 ? 4.5 : 2.5;
    withTransform(
      mesh,
      multiply(
        translation([CLOCK[0], CLOCK[1], CLOCK[2] + 16.6]),
        rotationZ((-hour / 12) * Math.PI * 2),
      ),
      () =>
        addQuad(
          mesh,
          [-wide, 68, 0],
          [wide, 68, 0],
          [wide, 84, 0],
          [-wide, 84, 0],
          plain([0.12, 0.1, 0.09]),
        ),
    );
  }

  // The door, in the wall to your right: its frame, and what is behind it.
  addBox(mesh, [W - 12, 0, -590], [W, 830, -560], TRIM);
  addBox(mesh, [W - 12, 0, -210], [W, 830, -180], TRIM);
  addBox(mesh, [W - 12, 800, -560], [W, 830, -210], TRIM);
  addQuad(
    mesh,
    [W - 1, 0, -560],
    [W - 1, 0, -210],
    [W - 1, 800, -210],
    [W - 1, 800, -560],
    {
      color: WHITE,
      material: MATERIAL.dark,
    },
  );

  // Cobwebs, which only show once they have grown (see the shader).
  web(mesh, [-W, EAVE - 34, -D], [300, -70, 0], [0, -70, 300]);
  web(mesh, [W, EAVE - 34, -D], [-300, -70, 0], [0, -70, 300]);
  web(mesh, [-W, EAVE - 30, -300], [280, 0, 0], [0, -280, 0]);
  web(mesh, [W, EAVE - 30, -300], [-280, 0, 0], [0, -280, 0]);
  web(mesh, [x1, y1, -D + 12], [-170, 0, 0], [0, -170, 0]);
  web(mesh, [-630, 318, -660], [150, 0, 0], [0, -150, 0]);
}

/** The window panes, drawn last because you see through them. */
export function buildGlass(mesh: Mesh): void {
  const { x0, y0, x1, y1 } = WINDOW;
  const z = -D - 17;
  addQuad(
    mesh,
    [x0, y0, z],
    [x1, y0, z],
    [x1, y1, z],
    [x0, y1, z],
    { color: WHITE, material: MATERIAL.glass },
    true,
  );
}

export type PropsState = {
  /** How far gone the hut is, 0 to 1. */
  decay: number;
  /** The hour on the hut's clock: 14.5 is half past two. */
  hour: number;
  /** Videos you have swiped past: one mark on the wall each. */
  videos: number;
};

/** A number from 0 to 1 that is always the same for the same `seed`. */
function random(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** The things in the hut that change shape as the time goes. */
export function buildProps(mesh: Mesh, state: PropsState): void {
  const { decay, hour, videos } = state;

  // The tally scratched in the wall: four strokes and one across.
  const scratch = plain([0.2, 0.16, 0.13]);
  const marks = Math.min(videos, TALLY.perRow * TALLY.rows);
  for (let i = 0; i < marks; i++) {
    const group = Math.floor(i / 5);
    const stroke = i % 5;
    const left = TALLY.x + (group % (TALLY.perRow / 5)) * 92;
    const top = TALLY.y - Math.floor(group / (TALLY.perRow / 5)) * 92;
    const across = stroke === 4;
    const middle: Vec3 = across
      ? [left + 21, top - 28, -D + 1.2]
      : [left + stroke * 14, top - 28, -D + 0.8];
    const lean = across ? radians(-58) : radians((random(i) - 0.5) * 9);
    const half = across ? 36 : 26 + random(i + 0.5) * 4;
    withTransform(mesh, multiply(translation(middle), rotationZ(lean)), () =>
      addQuad(
        mesh,
        [-2.6, -half, 0],
        [2.6, -half, 0],
        [2.6, half, 0],
        [-2.6, half, 0],
        scratch,
      ),
    );
  }

  // The hands of the clock. They are only ever somewhere: you never see
  // them turn.
  const hand = plain([0.1, 0.09, 0.08]);
  const hands = [
    [(hour % 12) / 12, 46, 4.5],
    [hour % 1, 70, 2.8],
  ] as const;
  hands.forEach(([turn, long, wide], i) => {
    withTransform(
      mesh,
      multiply(
        translation([CLOCK[0], CLOCK[1], CLOCK[2] + 18 + i]),
        rotationZ(-turn * Math.PI * 2),
      ),
      () =>
        addQuad(
          mesh,
          [-wide, -10, 0],
          [wide, -10, 0],
          [wide * 0.6, long, 0],
          [-wide * 0.6, long, 0],
          hand,
        ),
    );
  });

  // The plant. Its leaves stand up in the light, then hang and go brown.
  const wilt = smoothstep(0.08, 0.8, decay);
  for (let i = 0; i < LEAVES; i++) {
    const turn = radians(i * 137.5);
    const out: Vec3 = [Math.cos(turn), 0, Math.sin(turn)];
    const side: Vec3 = [-out[2], 0, out[0]];
    const long = lerp(42, 30, wilt) * (0.8 + 0.4 * random(i + 3));
    const color = mix(
      [0.2 + 0.1 * random(i), 0.58 + 0.12 * random(i + 1), 0.24],
      [0.36, 0.25, 0.13],
      smoothstep(0.1, 0.9, wilt + (random(i + 2) - 0.5) * 0.3),
    );
    const leaf = plain(color);
    // Three stretches, each bending further down than the last.
    let at: Vec3 = [POT[0] + out[0] * 6, POT[1] + 58, POT[2] + out[2] * 6];
    let rise = radians(lerp(72, 30, wilt) - random(i + 4) * 14);
    let width = 4;
    for (let part = 0; part < 3; part++) {
      const next: Vec3 = [
        at[0] + out[0] * Math.cos(rise) * long,
        at[1] + Math.sin(rise) * long,
        at[2] + out[2] * Math.cos(rise) * long,
      ];
      const nextWidth = [lerp(17, 9, wilt), lerp(14, 7, wilt), 0.5][part];
      addQuad(
        mesh,
        [at[0] - side[0] * width, at[1], at[2] - side[2] * width],
        [at[0] + side[0] * width, at[1], at[2] + side[2] * width],
        [next[0] + side[0] * nextWidth, next[1], next[2] + side[2] * nextWidth],
        [next[0] - side[0] * nextWidth, next[1], next[2] - side[2] * nextWidth],
        leaf,
      );
      at = next;
      width = nextWidth;
      rise -= radians(lerp(20, 58, wilt));
    }
  }

  // The picture slips on its nail.
  withTransform(
    mesh,
    multiply(
      translation(NAIL),
      rotationX(radians(13) * smoothstep(0.3, 1, decay)),
    ),
    () => {
      addBox(mesh, [0, -215, -130], [10, -15, 130], wood([0.3, 0.2, 0.13]));
      addQuad(
        mesh,
        [10.6, -200, 115],
        [10.6, -200, -115],
        [10.6, -30, -115],
        [10.6, -30, 115],
        { color: WHITE, material: MATERIAL.picture },
        true,
      );
    },
  );

  // The door comes open. Nobody opened it.
  const ajar = radians(26) * smoothstep(0.55, 1, decay);
  withTransform(mesh, multiply(translation(HINGE), rotationY(ajar)), () => {
    const panel = wood([0.4, 0.27, 0.17]);
    addBox(mesh, [-12, 0, -350], [0, 800, 0], wood([0.52, 0.35, 0.22]));
    addBox(mesh, [-14, 80, -300], [-12, 360, -50], panel);
    addBox(mesh, [-14, 430, -300], [-12, 730, -50], panel);
    addEllipsoid(
      mesh,
      [-22, 395, -315],
      [10, 10, 10],
      dusty([0.75, 0.62, 0.3]),
    );
  });
}
