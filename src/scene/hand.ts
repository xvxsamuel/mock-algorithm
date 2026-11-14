import { PHONE, PHONE_CORNER } from "./layout";
import {
  add,
  cross,
  dot,
  mix,
  normalize,
  radians,
  scale,
  smoothstep,
  sub,
  type Mat4,
  type Vec3,
} from "./math";
import {
  addEllipsoid,
  addQuad,
  addRoundCone,
  addSlab,
  withTransform,
  type Mesh,
  type Paint,
} from "./mesh";
import { MATERIAL } from "./shaders";

/* Your right hand around the phone, seen from your own eyes. It is built in
   the phone's own space: the middle of the screen is the origin, right is
   +x, up the phone is +y, and +z comes out of the screen towards you. One
   unit is about 2.3 mm.

   Each finger is a chain of rounded sticks from joint to joint. That is
   what makes it slightly off even at the start; as the hut decays the hand
   stops being yours: the fingers stretch across the screen and thin to the
   bone, the nails grow, and a sixth finger comes round the edge. */

const HALF_WIDTH = PHONE.width / 2;
const HALF_HEIGHT = PHONE.height / 2;

type Finger = {
  /** The knuckle, the two joints after it, and the tip. */
  joints: readonly [Vec3, Vec3, Vec3, Vec3];
  /** How thick the finger is at each of those. */
  radii: readonly [number, number, number, number];
  /** How far the hand has turned (0 to 1) when this finger starts to grow.
      0: it is there from the start. */
  from: number;
};

/** The four fingers come from behind the phone, round its left edge, and
    rest their tips on the glass. The last one is not yours. */
const FINGERS: readonly Finger[] = [
  {
    joints: [
      [-1, 3, -8.2],
      [-18.2, 6, -6.4],
      [-19.4, 7.2, 2.2],
      [-12, 8.2, 3],
    ],
    radii: [3.5, 3.2, 3, 2.7],
    from: 0,
  },
  {
    joints: [
      [-2, -5.5, -8.6],
      [-18.6, -4.2, -6.6],
      [-19.8, -3.4, 2.4],
      [-12, -2.8, 3.1],
    ],
    radii: [3.6, 3.3, 3.1, 2.8],
    from: 0,
  },
  {
    joints: [
      [-2, -14, -8.6],
      [-18.3, -13.6, -6.5],
      [-19.4, -13.2, 2.2],
      [-12.3, -12.8, 3],
    ],
    radii: [3.4, 3.1, 2.9, 2.6],
    from: 0,
  },
  {
    joints: [
      [-1, -22, -8.2],
      [-17.6, -22.8, -6],
      [-18.4, -23.3, 1.6],
      [-12.8, -23.8, 2.6],
    ],
    radii: [2.9, 2.6, 2.4, 2.2],
    from: 0,
  },
  {
    joints: [
      [-1, 13, -8],
      [-18, 16.5, -6.2],
      [-19.2, 17.6, 2.2],
      [-12, 18.4, 3],
    ],
    radii: [3.2, 2.9, 2.7, 2.4],
    from: 0.5,
  },
];

/** The thumb comes up the right edge and lies across the bottom of the
    screen. At rest, and at the top of a swipe. */
const THUMB: readonly [Vec3, Vec3, Vec3, Vec3] = [
  [12, -31, -9],
  [20.2, -27, -1.2],
  [16.4, -21, 4.3],
  [7, -18.6, 3.4],
];
const THUMB_SWIPED: readonly [Vec3, Vec3, Vec3, Vec3] = [
  [12, -31, -9],
  [20.2, -25, -1],
  [16, -16.5, 4.4],
  [5.5, -9.5, 3.4],
];
const THUMB_RADII = [5.2, 4.5, 4, 3.5] as const;

const SKIN: Vec3 = [0.88, 0.67, 0.55];
const SKIN_TURNED: Vec3 = [0.6, 0.61, 0.56];
const NAIL: Vec3 = [0.95, 0.78, 0.73];
const NAIL_TURNED: Vec3 = [0.42, 0.37, 0.25];
const SLEEVE: Vec3 = [0.24, 0.38, 0.62];

export type HandState = {
  /** How far the hand has turned: 0 is yours, 1 is not. */
  turned: number;
  /** The thumb: 0 at rest, 1 at the top of a swipe. */
  swipe: number;
};

/** The phone's outline: a rectangle with round corners, going round. */
function phoneOutline(): [number, number][] {
  const points: [number, number][] = [];
  const x = HALF_WIDTH - PHONE_CORNER;
  const y = HALF_HEIGHT - PHONE_CORNER;
  const corners = [
    [x, y, 0],
    [-x, y, 90],
    [-x, -y, 180],
    [x, -y, 270],
  ] as const;
  for (const [cx, cy, start] of corners) {
    for (let i = 0; i <= 6; i++) {
      const angle = radians(start + (i / 6) * 90);
      points.push([
        cx + Math.cos(angle) * PHONE_CORNER,
        cy + Math.sin(angle) * PHONE_CORNER,
      ]);
    }
  }
  return points;
}

/**
 * One finger. `size` below 1 is a finger still growing out of its knuckle.
 * `nailFaces` is roughly which way the back of the fingertip points.
 */
function addFinger(
  mesh: Mesh,
  joints: readonly Vec3[],
  radii: readonly number[],
  nailFaces: Vec3,
  size: number,
  turned: number,
  skin: Paint,
  nail: Paint,
): void {
  const points = joints.map((joint) => mix(joints[0], joint, size));
  // The last bone stretches as the hand turns.
  points[3] = add(points[3], scale(sub(points[3], points[2]), 0.7 * turned));
  const thin = (1 - 0.3 * turned) * size;
  for (let i = 0; i < 3; i++) {
    addRoundCone(
      mesh,
      points[i],
      points[i + 1],
      radii[i] * thin,
      radii[i + 1] * thin,
      skin,
    );
  }
  // The joints do not thin with the rest, so they start to stand out.
  if (turned > 0.05) {
    for (const i of [1, 2]) {
      const knuckle = radii[i] * size * (1 - 0.12 * turned);
      addEllipsoid(mesh, points[i], [knuckle, knuckle, knuckle], skin);
    }
  }

  // The nail lies on the back of the last bone, and grows past its end.
  const along = normalize(sub(points[3], points[2]));
  const up = normalize(sub(nailFaces, scale(along, dot(nailFaces, along))));
  const across = cross(along, up);
  const tip = radii[3] * thin;
  const long = tip * (0.62 + 1.6 * turned);
  // Its back end stays put, just behind the fingertip; it grows forwards.
  const middle = add(
    add(points[3], scale(along, long - tip * 0.95)),
    scale(up, tip * 0.93),
  );
  const frame: Mat4 = [...across, 0, ...up, 0, ...along, 0, ...middle, 1];
  withTransform(mesh, frame, () =>
    addEllipsoid(mesh, [0, 0, 0], [tip * 0.66, tip * 0.2, long], nail),
  );
}

/** The phone and the hand that holds it. */
export function buildHand(mesh: Mesh, { turned, swipe }: HandState): void {
  // The phone: its body, and a front that the real screen shows through.
  addSlab(mesh, phoneOutline(), -PHONE.depth, -0.05, {
    color: [0.09, 0.09, 0.1],
    material: MATERIAL.plain,
  });
  addQuad(
    mesh,
    [-HALF_WIDTH, -HALF_HEIGHT, 0],
    [HALF_WIDTH, -HALF_HEIGHT, 0],
    [HALF_WIDTH, HALF_HEIGHT, 0],
    [-HALF_WIDTH, HALF_HEIGHT, 0],
    { color: [0.1, 0.1, 0.11], material: MATERIAL.screen },
  );

  const skin: Paint = {
    color: mix(SKIN, SKIN_TURNED, turned),
    material: MATERIAL.skin,
    extra: [turned, 0],
  };
  const nail: Paint = {
    color: mix(NAIL, NAIL_TURNED, turned),
    material: MATERIAL.plain,
  };

  for (const finger of FINGERS) {
    const size =
      finger.from === 0
        ? 1
        : smoothstep(finger.from, finger.from + 0.4, turned);
    if (size < 0.03) continue;
    addFinger(
      mesh,
      finger.joints,
      finger.radii,
      [-0.3, 0, 1],
      size,
      turned,
      skin,
      nail,
    );
  }
  addFinger(
    mesh,
    THUMB.map((joint, i) => mix(joint, THUMB_SWIPED[i], swipe)),
    THUMB_RADII,
    [0.1, 0.3, 1],
    1,
    turned * 0.7,
    skin,
    nail,
  );

  // The palm behind the phone, the ball of the thumb, and the heel.
  addEllipsoid(mesh, [7, -14, -9.4], [14, 19, 5], skin);
  addEllipsoid(mesh, [15.5, -27, -5.5], [6.5, 9, 5.5], skin);
  addEllipsoid(mesh, [9, -32, -8.6], [11, 6, 5.4], skin);
  // The wrist and forearm, down towards you, into a sleeve.
  const wrist: Vec3 = [10.5, -37, -9];
  const forearm: Vec3 = [22, -75, 10];
  const elbow: Vec3 = [40, -135, 44];
  addRoundCone(mesh, wrist, forearm, 8.2, 9.5, skin);
  const cloth: Paint = { color: SLEEVE, material: MATERIAL.dusty };
  addRoundCone(mesh, mix(wrist, forearm, 0.55), elbow, 11.2, 14, cloth);
  addRoundCone(
    mesh,
    mix(wrist, forearm, 0.5),
    mix(wrist, forearm, 0.66),
    12,
    12,
    cloth,
  );
}
