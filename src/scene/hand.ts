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

/* Your right hand under the phone, seen from your own eyes. It is built in
   the phone's own space: the middle of the screen is the origin, right is
   +x, up the phone is +y, and +z comes out of the screen towards you. One
   unit is about 2.3 mm.

   The phone lies in the hand more than it is gripped: nothing reaches over
   the screen. The fingers come round its left edge and stop there, and the
   thumb lies along the right one, until it swipes.

   Each finger is a chain of rounded sticks from joint to joint. That is
   what makes it slightly off even at the start; as the hut decays the hand
   stops being yours: the fingers grow out past the phone and thin to the
   bone, and the nails grow. */

const HALF_WIDTH = PHONE.width / 2;
const HALF_HEIGHT = PHONE.height / 2;

type Joints = readonly [Vec3, Vec3, Vec3, Vec3];

type Finger = {
  /** The knuckle, the two joints after it, and the tip. */
  joints: Joints;
  /** How thick the finger is at each of those. */
  radii: readonly [number, number, number, number];
};

/** The four fingers lie flat against the back of the phone, come round its
    left edge, and hook back in, so the pads of their tips press on the edge
    where the side meets the glass, nails towards you. They lie against each
    other, rise a little towards their tips, and get shorter towards the
    little finger, which tucks in lowest. */
const FINGERS: readonly Finger[] = [
  {
    joints: [
      [-1, 2, -8.2],
      [-17.4, 4.5, -6.1],
      [-19.9, 7.1, -1.6],
      [-17.5, 9.3, 1.3],
    ],
    radii: [3.7, 3.45, 3.25, 3.05],
  },
  {
    joints: [
      [-2, -6, -8.4],
      [-17.6, -3.5, -6.2],
      [-20.1, -0.8, -1.6],
      [-17.6, 1.5, 1.4],
    ],
    radii: [3.8, 3.55, 3.35, 3.15],
  },
  {
    joints: [
      [-2, -13.5, -8.3],
      [-17.3, -11, -6.1],
      [-19.8, -8.4, -1.7],
      [-17.4, -6.2, 1.2],
    ],
    radii: [3.6, 3.35, 3.15, 2.95],
  },
  {
    joints: [
      [-1, -20.5, -8],
      [-16.7, -18.2, -5.8],
      [-19.3, -15.8, -1.9],
      [-17.2, -13.8, 0.7],
    ],
    radii: [3.1, 2.9, 2.7, 2.55],
  },
];

/** The thumb comes up the right edge and lies along it. To tap or swipe it
    comes down on the glass, with its tip where it touches. */
const THUMB: Joints = [
  [12, -31, -9],
  [20.1, -27, -3],
  [18.8, -19.5, 0.2],
  [18.1, -11.5, 0.9],
];
const THUMB_RADII = [5.2, 4.5, 4, 3.5] as const;
/** How far the tip can reach from the root of the thumb. A tap further
    away lands as far as it gets, on the way there. */
const THUMB_REACH = 42;
/** How high the thumb lifts on its way to the glass and back, so that it
    goes over the edge of the phone and not through it. */
const THUMB_LIFT = 3;

const SKIN: Vec3 = [0.88, 0.67, 0.55];
const SKIN_TURNED: Vec3 = [0.6, 0.61, 0.56];
const NAIL: Vec3 = [0.95, 0.78, 0.73];
const NAIL_TURNED: Vec3 = [0.42, 0.37, 0.25];
const SLEEVE: Vec3 = [0.24, 0.38, 0.62];

export type HandState = {
  /** How far the hand has turned: 0 is yours, 1 is not. */
  turned: number;
  /** How far the thumb has come down on the glass: 0 is at rest along the
      edge, 1 is on it. */
  press: number;
  /** Where its tip touches the glass, in the phone's space (x, y). */
  tip: readonly [number, number];
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

/** The thumb on the glass with its tip at (x, y): the first joint stays
    by the edge, and the middle one bows out between it and the tip. */
function thumbOnGlass(x: number, y: number): Vec3[] {
  const root = THUMB[0];
  let tipX = x - root[0];
  let tipY = y - root[1];
  const reach = Math.hypot(tipX, tipY);
  if (reach > THUMB_REACH) {
    tipX *= THUMB_REACH / reach;
    tipY *= THUMB_REACH / reach;
  }
  const tip: Vec3 = [root[0] + tipX, root[1] + tipY, 3.9];
  const first: Vec3 = [
    20.4,
    Math.min(Math.max(-26.5 + (tip[1] + 15.5) * 0.2, -28), -22),
    -1.4,
  ];
  const middle: Vec3 = add(mix(first, tip, 0.5), [4.3, 1.2, 0]);
  return [root, first, [middle[0], middle[1], 4.6], tip];
}

/** Where the thumb's joints are: `press` of the way down from rest to the
    glass, where it touches at `tip`. */
function thumbAt(press: number, tip: readonly [number, number]): Vec3[] {
  const down = smoothstep(0, 1, press);
  const lift = THUMB_LIFT * Math.sin(Math.PI * down);
  const onGlass = thumbOnGlass(tip[0], tip[1]);
  return THUMB.map((joint, i) =>
    add(mix(joint, onGlass[i], down), [0, 0, i >= 2 ? lift : 0]),
  );
}

/** One finger. `nailFaces` is roughly which way the back of the fingertip
    points. */
function addFinger(
  mesh: Mesh,
  joints: readonly Vec3[],
  radii: readonly number[],
  nailFaces: Vec3,
  turned: number,
  skin: Paint,
  nail: Paint,
): void {
  const points = [...joints];
  // The last bone stretches as the hand turns: forwards and along the
  // phone, but not further in across it, so that it grows past the edge
  // and not over the glass.
  const [reachX, reachY, reachZ] = sub(points[3], points[2]);
  points[3] = add(
    points[3],
    scale([Math.min(reachX, 0), reachY, reachZ], 0.7 * turned),
  );
  const thin = 1 - 0.3 * turned;
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
      const knuckle = radii[i] * (1 - 0.12 * turned);
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
export function buildHand(mesh: Mesh, { turned, press, tip }: HandState): void {
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
    addFinger(
      mesh,
      finger.joints,
      finger.radii,
      [-0.45, 0, 0.9],
      turned,
      skin,
      nail,
    );
  }
  addFinger(
    mesh,
    thumbAt(press, tip),
    THUMB_RADII,
    [0.3, 0, 0.95],
    turned * 0.7,
    skin,
    nail,
  );

  // The palm behind the phone, the ball of the thumb, and the heel.
  addEllipsoid(mesh, [7, -14, -8.3], [14, 19, 5], skin);
  addEllipsoid(mesh, [16.5, -28, -6.2], [6, 8.5, 5], skin);
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
