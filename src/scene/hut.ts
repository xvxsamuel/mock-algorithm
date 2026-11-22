import {
  BED,
  CAMERA_POLE,
  CLOCK,
  COFFEE_TABLE,
  COUCH,
  DOOR,
  EAVE,
  HALF_DEPTH,
  HALF_WIDTH,
  RIDGE,
  STOVE,
  STOVE_YAW,
  TALLY,
  TV_AT,
  TV_CABINET,
  TV_SCREEN,
  TV_STAND,
  TV_YAW,
  WALL_THICKNESS,
  WINDOW,
  WINDOW_TABLE,
} from "./layout";
import {
  clamp,
  lerp,
  mix,
  multiply,
  radians,
  rotationX,
  rotationY,
  rotationZ,
  smoothstep,
  translation,
  type Mat4,
  type Vec3,
} from "./math";
import {
  addBox,
  addCushion,
  addDrum,
  addEllipsoid,
  addPillow,
  addQuad,
  addSurface,
  addTriangle,
  addTube,
  withTransform,
  type Mesh,
  type Paint,
} from "./mesh";
import { MATERIAL } from "./shaders";

/* The cabin studio and what is in it, built from boxes, drums, ellipsoids,
   and flat faces. buildHut makes everything that stays as it is; buildProps
   makes the things that shift, wilt, tilt, or accumulate as scrolling goes
   on. Surface textures and decay live in shaders.ts. */

const W = HALF_WIDTH;
const D = HALF_DEPTH;
const WHITE: Vec3 = [1, 1, 1];

function wood(color: Vec3): Paint {
  return { color, material: MATERIAL.wood };
}

function plain(color: Vec3): Paint {
  return { color, material: MATERIAL.plain };
}

/** Its own colour, for something thin that lies flat on something else. */
function mark(color: Vec3): Paint {
  return { color, material: MATERIAL.mark };
}

/** Its own colour, with the dust that settles on it. */
function dusty(color: Vec3): Paint {
  return { color, material: MATERIAL.dusty };
}

/** Wide-wale ribbed corduroy upholstery. */
function corduroy(color: Vec3): Paint {
  return { color, material: MATERIAL.fabric, extra: [0, 0] };
}

/** Chunky woollen knit / herringbone blanket weave. */
function knit(color: Vec3): Paint {
  return { color, material: MATERIAL.fabric, extra: [1, 0] };
}

/** Slubbed woven linen cloth (curtains, pillows, hanging jacket). */
function linen(color: Vec3): Paint {
  return { color, material: MATERIAL.fabric, extra: [2, 0] };
}

/** Patchwork diamond-stitched cabin quilt. */
const QUILT: Paint = { color: WHITE, material: MATERIAL.quilt };

/** Kiln-fired running-bond brick masonry. */
const BRICK: Paint = { color: WHITE, material: MATERIAL.brick };

/** Slate/terracotta hearth tile (0) or glazed cream/sage backsplash (1). */
function tile(kind: 0 | 1): Paint {
  return { color: WHITE, material: MATERIAL.tile, extra: [kind, 0] };
}

/** Matte hammered cast iron / dark forged steel. */
function iron(color: Vec3): Paint {
  return { color, material: MATERIAL.metal, extra: [0, 0] };
}

/** Warm burnished brass, bronze, or copper. */
function brass(color: Vec3): Paint {
  return { color, material: MATERIAL.metal, extra: [1, 0] };
}

/** Glossy enamelled metal (pendant lamp shade, coffee tin). */
function enamel(color: Vec3): Paint {
  return { color, material: MATERIAL.metal, extra: [2, 0] };
}

const BEAM = wood([0.44, 0.3, 0.19]);
const TRIM = wood([0.84, 0.79, 0.7]);
const WALNUT = wood([0.46, 0.29, 0.17]);
const OAK = wood([0.68, 0.48, 0.29]);
const DARK_IRON = iron([0.16, 0.16, 0.17]);
const AGED_BRASS = brass([0.82, 0.65, 0.31]);
const COPPER = brass([0.84, 0.45, 0.24]);

/** Left-wall brick chimney breast span along z. */
const CHIMNEY_Z0 = -605;
const CHIMNEY_Z1 = -355;

/** Where the ceramic planter pot stands on the angled window desk (world space). */
const POT_LOCAL: Vec3 = [44, WINDOW_TABLE.height, 10];
const POT: Vec3 = [
  WINDOW_TABLE.at[0] +
    POT_LOCAL[0] * Math.cos(WINDOW_TABLE.yaw) +
    POT_LOCAL[2] * Math.sin(WINDOW_TABLE.yaw),
  POT_LOCAL[1],
  WINDOW_TABLE.at[2] -
    POT_LOCAL[0] * Math.sin(WINDOW_TABLE.yaw) +
    POT_LOCAL[2] * Math.cos(WINDOW_TABLE.yaw),
];
const LEAVES = 11;

/** A nail in the left wall above the bed, which the framed painting hangs from. */
const NAIL: Vec3 = [-W, 710, 240];

/** The door's hinges on the right wall. */
const HINGE: Vec3 = [W - 2, 0, DOOR.z1];

/** The front-wall shelf above your phone, holding your books, dossier files,
    and the coin jar so every in-world record stays readable from the couch. */
const SHELF_X0 = -210;
const SHELF_X1 = 150;
const SHELF = 534;
const SHELF_DEPTH = 94;
/** The books you brought, from the left end of the shelf. */
const BOOKS = 5;
/** Where the row of files starts, right beside your books. */
const FILES_FROM = -64;
/** A file stands on the shelf once it is this sure of the guess in it. */
const SURE = 0.5;
/** The strip on each file's back: one colour for each guess. */
const FILE_LABELS: readonly Vec3[] = [
  [0.9, 0.3, 0.22],
  [0.95, 0.76, 0.26],
  [0.36, 0.72, 0.68],
  [0.9, 0.88, 0.8],
];
/** The jar at the right end of the shelf: the middle of its foot. */
const JAR: Vec3 = [104, SHELF, -D + 46];
/** How thick a coin is, and how many fit in the jar. */
const COIN = 3.5;
const JAR_HOLDS = 16;
/** The coins that do not fit go in stacks beside it. */
const STACKS: readonly (readonly [number, number])[] = [
  [72, -D + 60],
  [132, -D + 58],
];
const STACK_HOLDS = 10;
const COINS_MOST = JAR_HOLDS + STACKS.length * STACK_HOLDS;

/** Organic landing spots for flyers pushed in under the right-hand door
    (z = -470..-120): [x, z, yawDeg]. The earliest flyers skid slightly
    further inward so bright paper peeks into the lower-right of your view. */
const LEAFLET_SPOTS: readonly (readonly [number, number, number])[] = [
  [380, -370, -26],
  [475, -425, 34],
  [435, -265, 16],
  [575, -345, -44],
  [665, -285, 22],
  [760, -225, -18],
  [625, -205, 52],
  [735, -340, -32],
  [535, -235, -12],
  [805, -310, 39],
  [715, -165, -48],
  [485, -330, 58],
];
/** The most leaflets that lie on the floor (two layers at most). */
const LEAFLETS_MOST = LEAFLET_SPOTS.length * 2;

/** A number from 0 to 1 that is always the same for the same `seed`. */
function random(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A piece of wall: 0 is the one in front of you, then right, back, left.
    It runs from `u0` to `u1` along the wall and from `y0` up to `y1`. */
function wallPanel(
  mesh: Mesh,
  id: number,
  u0: number,
  y0: number,
  u1: number,
  y1: number,
  behind = 0,
): void {
  const paint: Paint = {
    color: WHITE,
    material: MATERIAL.wall,
    extra: [id, 0],
  };
  const at = (u: number, y: number): Vec3 => {
    if (id === 0) return [u, y, -D - behind];
    if (id === 1) return [W, y, u];
    if (id === 2) return [u, y, D];
    return [-W, y, u];
  };
  addQuad(mesh, at(u0, y0), at(u1, y0), at(u1, y1), at(u0, y1), paint);
}

/** A cobweb across a corner: from `corner` along two edges.
    `seed` varies its spokes and sag; `startAt`..`fullAt` stagger its growth
    across `uDecay`. */
function web(
  mesh: Mesh,
  corner: Vec3,
  along: Vec3,
  down: Vec3,
  seed: number,
  startAt = 0.18,
  fullAt = 0.82,
): void {
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
    { color: [seed, startAt, fullAt], material: MATERIAL.web },
    true,
  );
}

/** A gently splayed mid-century tapered furniture leg from floor up to `height`,
    with an optional aligned brass ferrule cap at the foot. */
function splayedLeg(
  mesh: Mesh,
  topX: number,
  topZ: number,
  height: number,
  leanX: number,
  leanZ: number,
  rBottom: number,
  rTop: number,
  paint: Paint,
  ferruleHeight = 0,
  ferrulePaint?: Paint,
  sides = 10,
): void {
  withTransform(
    mesh,
    multiply(
      translation([topX, height, topZ]),
      multiply(rotationZ(leanX), rotationX(leanZ)),
    ),
    () => {
      if (ferruleHeight > 0 && ferrulePaint !== undefined) {
        const split = ferruleHeight / height;
        const rMid = lerp(rBottom, rTop, split);
        addDrum(
          mesh,
          [0, -height, 0],
          ferruleHeight,
          rBottom + 0.4,
          rMid + 0.5,
          ferrulePaint,
          ferrulePaint,
          sides,
        );
        addDrum(
          mesh,
          [0, -height + ferruleHeight, 0],
          height - ferruleHeight,
          rMid,
          rTop,
          paint,
          paint,
          sides,
        );
      } else {
        addDrum(
          mesh,
          [0, -height, 0],
          height,
          rBottom,
          rTop,
          paint,
          paint,
          sides,
        );
      }
    },
  );
}

/** The L-shaped burgundy-red corduroy couch you sit on: plush bevelled
    upholstery, splayed walnut legs with aligned brass ferrules, 3D button-tufted
    back cushions, smooth bolster armrests with piped caps, sculpted pillows,
    and an organically draped chunky knit throw blanket. */
function buildCouch(mesh: Mesh): void {
  const couchRed = corduroy([0.74, 0.16, 0.16]);
  const couchTop = corduroy([0.82, 0.21, 0.18]);
  const couchDark = corduroy([0.52, 0.11, 0.11]);
  const couchPiping = corduroy([0.42, 0.08, 0.09]);
  const couchWood = wood([0.36, 0.23, 0.14]);
  const tuftButton = wood([0.26, 0.08, 0.09]);
  const pillowGold = linen([0.89, 0.65, 0.21]);
  const pillowGoldWelt = linen([0.66, 0.46, 0.14]);
  const pillowTeal = linen([0.2, 0.44, 0.48]);
  const pillowTealWelt = linen([0.13, 0.3, 0.34]);
  const pillowCream = linen([0.92, 0.87, 0.76]);
  const pillowRustWelt = linen([0.72, 0.28, 0.2]);
  const blanketCream = knit([0.91, 0.85, 0.74]);
  const blanketStripe = knit([0.2, 0.32, 0.48]);

  withTransform(
    mesh,
    multiply(translation(COUCH.at), rotationY(COUCH.yaw)),
    () => {
      // Lower bevelled walnut plinth and upholstered L-shaped base apron.
      addBox(mesh, [-308, 46, -168], [338, 62, 182], couchWood);
      addBox(mesh, [-308, 46, -358], [-122, 62, -166], couchWood);
      // Subtle dark shadow reveal between walnut plinth and upholstered base.
      addBox(mesh, [-304, 62, -165], [334, 67, 179], couchPiping);
      addBox(mesh, [-304, 62, -354], [-126, 67, -165], couchPiping);
      addBox(mesh, [-306, 67, -166], [336, 128, 180], couchDark);
      addBox(mesh, [-306, 67, -356], [-124, 128, -166], couchDark);

      // Six tapered mid-century walnut legs with seamlessly aligned brass ferrules.
      for (const [lx, lz, sx, sz] of [
        [-290, -340, 0.08, -0.08],
        [-142, -340, -0.05, -0.08],
        [-290, -146, 0.08, 0],
        [314, -146, -0.08, -0.06],
        [-290, 158, 0.08, 0.08],
        [314, 158, -0.08, 0.08],
      ] as const) {
        splayedLeg(
          mesh,
          lx,
          lz,
          48,
          sx,
          sz,
          7.5,
          13,
          couchWood,
          13,
          AGED_BRASS,
          12,
        );
      }

      // Three plush corduroy seat cushions: deep left chaise, lived-in sunken
      // middle seat where you sit, and plump right seat beside you.
      addCushion(
        mesh,
        [-242, 126, -364],
        [-123, 200, 102],
        { bevel: 14, crownY: 7, steps: [6, 3, 8] },
        couchTop,
      );
      addCushion(
        mesh,
        [-120, 126, -172],
        [88, 195, 102],
        { bevel: 14, crownY: 5, sinkY: -7, steps: [7, 3, 6] },
        couchRed,
      );
      addCushion(
        mesh,
        [91, 126, -172],
        [268, 200, 102],
        { bevel: 14, crownY: 7, steps: [6, 3, 6] },
        couchTop,
      );

      // Stitched piping trim running along the lower front apron of each seat.
      addTube(
        mesh,
        [
          [-236, 129, -360],
          [-128, 129, -360],
        ],
        [3.2, 3.2],
        couchPiping,
        6,
      );
      addTube(
        mesh,
        [
          [-116, 129, -168],
          [264, 129, -168],
        ],
        [3.2, 3.2],
        couchPiping,
        6,
      );

      // Wrapped backrest shell with soft rounded crest rail along the top.
      addBox(mesh, [-306, 128, 118], [336, 404, 188], couchDark);
      withTransform(
        mesh,
        multiply(translation([-306, 404, 153]), rotationZ(-Math.PI / 2)),
        () => addDrum(mesh, [0, 0, 0], 642, 35, 35, couchDark, couchPiping, 12),
      );

      // Three reclined plush back cushions with real 3D recessed button tufts.
      for (const [bx0, bx1, paint] of [
        [-242, -123, couchRed],
        [-119, 87, couchTop],
        [91, 267, couchRed],
      ] as const) {
        withTransform(
          mesh,
          multiply(translation([(bx0 + bx1) / 2, 196, 108]), rotationX(-0.14)),
          () => {
            const half = (bx1 - bx0) / 2;
            const tufts: readonly (readonly [number, number])[] = [
              [-0.44, 0.04],
              [0.44, 0.04],
            ];
            addCushion(
              mesh,
              [-half, 0, -28],
              [half, 214, 30],
              { bevel: 15, crownFront: 9, tufts, steps: [8, 6, 3] },
              paint,
            );
            // Tufted upholstery buttons nestled cleanly inside the 3D dimples.
            for (const [tx, ty] of tufts) {
              addEllipsoid(
                mesh,
                [tx * half, 107 + ty * 107, -23],
                [6.5, 6.5, 4],
                tuftButton,
                10,
                3,
              );
            }
          },
        );
      }

      // Sculpted padded armrests with smooth 14-sided cylindrical bolster rolls,
      // piped front end-caps, and recessed walnut front accent strips.
      for (const [ax0, ax1, az0, az1] of [
        [-308, -242, -188, 178],
        [268, 338, -176, 178],
      ] as const) {
        const acx = (ax0 + ax1) / 2;
        const armRadius = (ax1 - ax0) / 2 + 1;
        const armLen = az1 - az0;
        addCushion(
          mesh,
          [ax0, 126, az0],
          [ax1, 290, az1],
          { bevel: 8, steps: [4, 4, 5] },
          couchRed,
        );
        withTransform(
          mesh,
          multiply(translation([acx, 288, az0]), rotationX(Math.PI / 2)),
          () => {
            addDrum(
              mesh,
              [0, 0, 0],
              armLen,
              armRadius,
              armRadius,
              couchTop,
              couchDark,
              14,
            );
            // Recessed piped circular front bolster medallion.
            addDrum(
              mesh,
              [0, -2, 0],
              3,
              armRadius - 5,
              armRadius - 5,
              couchPiping,
              couchDark,
              14,
            );
          },
        );
        // Subtle walnut vertical trim inlay on the front arm face.
        addBox(
          mesh,
          [acx - 7, 146, az0 - 2],
          [acx + 7, 250, az0 + 2],
          couchWood,
        );
      }

      // Mustard linen throw pillow slumped warmly against the right armrest.
      withTransform(
        mesh,
        multiply(
          translation([218, 256, 44]),
          multiply(
            rotationY(radians(-28)),
            multiply(rotationZ(radians(-16)), rotationX(radians(14))),
          ),
        ),
        () => addPillow(mesh, 102, 108, 42, pillowGold, pillowGoldWelt),
      );

      // Coastal-teal accent pillow tucked into the left back corner.
      withTransform(
        mesh,
        multiply(
          translation([-192, 248, 54]),
          multiply(
            rotationY(radians(24)),
            multiply(rotationZ(radians(14)), rotationX(radians(12))),
          ),
        ),
        () => addPillow(mesh, 88, 94, 36, pillowTeal, pillowTealWelt),
      );

      // Cozy cream-linen lumbar pillow angled softly along the chaise backrest.
      withTransform(
        mesh,
        multiply(
          translation([-148, 224, 24]),
          multiply(
            rotationY(radians(36)),
            multiply(rotationZ(radians(-6)), rotationX(radians(18))),
          ),
        ),
        () => addPillow(mesh, 78, 54, 30, pillowCream, pillowRustWelt),
      );

      // Organically draped chunky cream-and-indigo knit throw blanket flowing
      // smoothly over the curved left bolster arm with hanging ripples & fringe.
      const drapeRows = 12;
      const drapeCols = 18;
      const armCx = -275;
      const armCy = 288;
      const armR = 37;
      const couchThrowPoint = (u: number, v: number, lift = 0): Vec3 => {
        // v in [0, 1] runs from front-side (+z = 52) to back-side (-z = -90).
        const z = lerp(52, -90, v) + Math.sin(u * Math.PI) * 5;
        const ripple =
          Math.sin(v * Math.PI * 3.5 + u * 2.2) * 3.2 +
          Math.sin(v * Math.PI * 7.0) * 1.1;
        let x: number;
        let y: number;
        if (u < 0.34) {
          // Outer hanging tail draping smoothly down the left side of the arm.
          const t = u / 0.34;
          const flare = (1 - t) * (1 - t);
          x = armCx - armR - 4 - flare * 5 - ripple * flare - lift;
          y = lerp(164 + Math.sin(v * Math.PI * 3) * 6, armCy, t);
        } else if (u <= 0.68) {
          // Smooth wrap arching cleanly over the cylindrical bolster roll.
          const t = (u - 0.34) / 0.34;
          const angle = lerp(Math.PI, 0, t);
          const r = armR + 2.5 + lift + Math.sin(v * Math.PI * 2.5) * 1.2;
          x = armCx + Math.cos(angle) * r;
          y = armCy + Math.sin(angle) * r;
        } else {
          // Inner tail cascading down onto the chaise seat cushion.
          const t = (u - 0.68) / 0.32;
          const flare = t * t;
          x = armCx + armR + 3 + flare * 8 + ripple * flare + lift;
          y = lerp(armCy, 202 + Math.sin(v * Math.PI * 3.2) * 4, t);
        }
        return [x, y, z];
      };

      const throwGrid: Vec3[][] = [];
      for (let r = 0; r <= drapeRows; r++) {
        const v = r / drapeRows;
        const row: Vec3[] = [];
        for (let c = 0; c <= drapeCols; c++) {
          row.push(couchThrowPoint(c / drapeCols, v, 0));
        }
        throwGrid.push(row);
      }
      addSurface(mesh, throwGrid, blanketCream);

      // Two woven indigo knit accent stripes hugging the exact throw contour.
      for (const [v0, v1] of [
        [0.16, 0.27],
        [0.73, 0.84],
      ] as const) {
        const stripeGrid: Vec3[][] = [];
        for (let r = 0; r <= 2; r++) {
          const v = lerp(v0, v1, r / 2);
          const row: Vec3[] = [];
          for (let c = 0; c <= drapeCols; c++) {
            row.push(couchThrowPoint(c / drapeCols, v, 1.8));
          }
          stripeGrid.push(row);
        }
        addSurface(mesh, stripeGrid, blanketStripe);
      }

      // Knotted cream wool fringe tassels along both hanging ends of the throw.
      for (const endU of [0, 1]) {
        for (let t = 0; t < 7; t++) {
          const v = lerp(0.06, 0.94, t / 6);
          const p = couchThrowPoint(endU, v, 0);
          addDrum(
            mesh,
            [p[0], p[1] - 14, p[2]],
            15,
            2.2,
            1.6,
            blanketCream,
            blanketCream,
            6,
          );
        }
      }
    },
  );
}

/** The timber cabin bed in the back-left sleeping nook, with turned walnut
    posts, panelled oak headboard, built-in alcove shelf, plush tufted mattress,
    crisp rolled top sheet cuff, sculpted heirloom Nordic duvet with seamless
    UVs, draped chunky sage knit throw, plump piped pillows, bedside runner,
    nightstand, and arched brass reading lamp. */
function buildBedAndSleepingNook(mesh: Mesh): void {
  const { x0, x1, z0, z1, mattressTop } = BED;
  const cx = (x0 + x1) / 2;
  const frameDark = wood([0.38, 0.24, 0.14]);
  const frameWarm = WALNUT;
  const sheetCream = linen([0.96, 0.93, 0.87]);
  const sheetTrimSage = linen([0.46, 0.62, 0.51]);
  const sheetTrimTerra = linen([0.82, 0.41, 0.29]);
  const mattressSide = linen([0.9, 0.86, 0.79]);
  const mattressWelt = linen([0.78, 0.73, 0.65]);
  const pillowLinen = linen([0.96, 0.93, 0.87]);
  const pillowSagePiping = linen([0.48, 0.62, 0.52]);
  const pillowRust = linen([0.81, 0.36, 0.24]);
  const pillowRustPiping = linen([0.58, 0.23, 0.16]);
  const pillowOchre = linen([0.88, 0.68, 0.27]);
  const pillowOchrePiping = linen([0.65, 0.47, 0.16]);
  const sageThrow = knit([0.39, 0.56, 0.44]);
  const throwStripe = knit([0.9, 0.84, 0.72]);

  // Four crafted walnut corner posts with turned upper necks & brass finials.
  const posts: readonly (readonly [number, number, number])[] = [
    [x0 + 16, z0 + 16, 296],
    [x1 - 16, z0 + 16, 296],
    [x0 + 16, z1 - 16, 438],
    [x1 - 16, z1 - 16, 438],
  ];
  for (const [px, pz, h] of posts) {
    // Sturdy square lower post & decorative collar block.
    addBox(mesh, [px - 15, 0, pz - 15], [px + 15, h - 42, pz + 15], frameDark);
    addBox(
      mesh,
      [px - 17, h - 44, pz - 17],
      [px + 17, h - 32, pz + 17],
      frameWarm,
    );
    // Turned tapered walnut neck + stepped brass collar + smooth brass ball finial.
    addDrum(mesh, [px, h - 32, pz], 32, 13, 10, frameDark, frameDark, 12);
    addDrum(mesh, [px, h, pz], 11, 10, 14, AGED_BRASS, AGED_BRASS, 12);
    addEllipsoid(mesh, [px, h + 19, pz], [13.5, 13.5, 13.5], AGED_BRASS, 12, 4);
  }

  // Moulded side timber rails with subtle lower apron trim.
  addBox(mesh, [x0 + 6, 74, z0 + 28], [x0 + 24, 148, z1 - 28], frameWarm);
  addBox(mesh, [x1 - 24, 74, z0 + 28], [x1 - 6, 148, z1 - 28], frameWarm);
  addBox(mesh, [x1 - 26, 70, z0 + 28], [x1 - 4, 82, z1 - 28], frameDark);

  // Crafted slatted footboard with stepped walnut cap rail & turned spindles.
  addBox(mesh, [x0 + 28, 76, z0 + 6], [x1 - 28, 146, z0 + 24], frameWarm);
  addBox(mesh, [x0 + 24, 244, z0 + 4], [x1 - 24, 266, z0 + 26], frameDark);
  addBox(mesh, [x0 + 20, 266, z0 + 2], [x1 - 20, 275, z0 + 28], frameWarm);
  for (let s = 0; s < 5; s++) {
    const sx = lerp(x0 + 68, x1 - 68, s / 4);
    addDrum(mesh, [sx, 146, z0 + 15], 98, 7.5, 7.5, frameWarm, frameWarm, 10);
    addEllipsoid(mesh, [sx, 195, z0 + 15], [11, 14, 11], frameDark, 10, 3);
  }

  // Architectural panelled walnut headboard with recessed framed oak panels & cornice.
  addBox(mesh, [x0 + 28, 80, z1 - 24], [x1 - 28, 412, z1 - 6], frameWarm);
  addBox(mesh, [x0 + 20, 408, z1 - 30], [x1 - 20, 424, z1], frameDark);
  addBox(mesh, [x0 + 16, 424, z1 - 33], [x1 - 16, 434, z1 + 2], frameWarm);
  for (const [px0, px1] of [
    [x0 + 48, cx - 14],
    [cx + 14, x1 - 48],
  ] as const) {
    addBox(mesh, [px0 - 5, 228, z1 - 27], [px1 + 5, 390, z1 - 23], frameDark);
    addBox(mesh, [px0, 234, z1 - 29], [px1, 384, z1 - 23], OAK);
  }

  // Built-in back-wall headboard shelf filling the alcove behind the bed.
  addBox(mesh, [-W + 6, 0, z1], [x1 + 6, 304, D - 4], frameDark);
  addBox(mesh, [-W + 4, 304, z1 - 4], [x1 + 10, 320, D - 2], OAK);
  // Bedtime books, brass pillar candle holder with wax candle, and leaning frame.
  for (const [bx, w, h, col] of [
    [x0 + 42, 20, 74, [0.22, 0.36, 0.5] as Vec3],
    [x0 + 65, 16, 64, [0.76, 0.28, 0.2] as Vec3],
    [x0 + 84, 22, 82, [0.85, 0.68, 0.28] as Vec3],
  ] as const) {
    addBox(mesh, [bx, 320, z1 + 14], [bx + w, 320 + h, z1 + 74], dusty(col));
  }
  addDrum(
    mesh,
    [cx + 42, 320, z1 + 42],
    14,
    20,
    17,
    AGED_BRASS,
    AGED_BRASS,
    12,
  );
  addDrum(
    mesh,
    [cx + 42, 334, z1 + 42],
    42,
    13,
    12,
    dusty([0.96, 0.92, 0.8]),
    dusty([0.98, 0.95, 0.86]),
    12,
  );
  addDrum(mesh, [cx + 42, 376, z1 + 42], 6, 1.5, 1, DARK_IRON, DARK_IRON, 6);
  withTransform(
    mesh,
    multiply(translation([x1 - 68, 320, z1 + 48]), rotationY(radians(-14))),
    () => {
      addBox(mesh, [-28, 0, -6], [28, 72, 6], frameDark);
      addBox(mesh, [-21, 9, -7], [21, 63, -5], dusty([0.84, 0.78, 0.66]));
    },
  );

  // Plush bevelled mattress sitting cleanly inside the walnut bed frame rails.
  addCushion(
    mesh,
    [x0 + 24, 134, z0 + 28],
    [x1 - 24, mattressTop, z1 - 29],
    { bevel: 14, crownY: 4, steps: [6, 3, 8] },
    mattressSide,
  );
  // Crisp fitted cream sheet covering the upper bed & peeking neatly by the head.
  addCushion(
    mesh,
    [x0 + 22, mattressTop - 42, 474],
    [x1 - 21, mattressTop + 5, z1 - 29],
    { bevel: 10, crownY: 3, steps: [6, 2, 5] },
    sheetCream,
  );
  // Subtle mattress side piping welt visible near the head of the bed.
  addTube(
    mesh,
    [
      [x1 - 23, 150, 480],
      [x1 - 23, 150, z1 - 34],
    ],
    [2.5, 2.5],
    mattressWelt,
    6,
  );

  // Sculpted heirloom Nordic cabin duvet: a single continuous draped surface
  // with organic pillowy loft, gentle lived-in folds, smooth rounded overhang
  // hanging cleanly OUTSIDE the right wooden rail, and tucked behind the
  // slatted footboard with zero clipping and seamless continuous UVs.
  const duvetZHead = 490;
  const duvetZFoot = z0 + 34;
  const duvetRows = 20;
  const duvetCols = 22;

  const duvetPoint = (u: number, v: number, extraLift = 0): Vec3 => {
    // v runs 0 (head edge) -> 1 (foot edge).
    const z = lerp(duvetZHead, duvetZFoot, v);
    // Keep the right-side overhang cleanly outside the right rail, gently
    // tucking inward only in the last few units beside the foot corner post.
    const footClear = smoothstep(1.0, 0.94, v);
    const shoulderX = lerp(x1 - 22, x1 - 14, footClear);
    const shoulderR = lerp(12, 20, footClear) + extraLift;
    const drapeX = shoulderX + shoulderR;
    const foldWave =
      Math.sin(v * Math.PI * 3.0 + u * 3.2) * 3.4 +
      Math.sin(u * Math.PI * 2.4 - v * 2.6) * 2.6;
    const pleat =
      Math.sin(v * Math.PI * 6.5 + 0.6) * 3.8 +
      Math.sin(v * Math.PI * 11.0) * 1.2;

    let x: number;
    let y: number;
    if (u < 0.06) {
      // Soft left-side tuck inside the left rail (never touches wall or rail).
      const t = u / 0.06;
      x = lerp(x0 + 22, x0 + 34, t);
      y = lerp(182, mattressTop + 11, Math.sin((t * Math.PI) / 2)) + extraLift;
    } else if (u <= 0.74) {
      // Plush pillowy bed top with gentle organic billows and domed loft.
      const t = (u - 0.06) / 0.68;
      x = lerp(x0 + 34, shoulderX, t);
      const env = Math.sin(t * Math.PI);
      const footTaper = lerp(1, 0.55, smoothstep(0.84, 1, v));
      y = mattressTop + 11 + env * (9.5 + foldWave) * footTaper + extraLift;
    } else if (u <= 0.84) {
      // Smooth rounded blanket shoulder curving cleanly outside the right rail.
      const t = (u - 0.74) / 0.1;
      const angle = lerp(Math.PI / 2, 0, t);
      x = shoulderX + Math.cos(angle) * shoulderR;
      y = mattressTop - 5 + Math.sin(angle) * (16 + extraLift);
    } else {
      // Draped living-room overhang skirt hanging gracefully outside x1 - 6 rail.
      const t = (u - 0.84) / 0.16;
      const hemY = lerp(156, 114, footClear) + Math.sin(v * Math.PI * 5.0) * 4;
      x = drapeX + t * (4 + pleat * footClear);
      y = lerp(mattressTop - 5, hemY, t);
    }
    return [x, y, z];
  };

  const duvetGrid: Vec3[][] = [];
  for (let r = 0; r <= duvetRows; r++) {
    const v = r / duvetRows;
    const row: Vec3[] = [];
    for (let c = 0; c <= duvetCols; c++) {
      row.push(duvetPoint(c / duvetCols, v, 0));
    }
    duvetGrid.push(row);
  }
  addSurface(mesh, duvetGrid, QUILT, true);

  // Neatly folded turned-back cream top sheet cuff rolling over the duvet's
  // top edge, with delicate sage & terracotta woven embroidery trim.
  const cuffRows = 8;
  const cuffCols = 22;
  const cuffPoint = (u: number, t: number, lift = 0): Vec3 => {
    // t in [0, 1]: rolls from tucked under pillows (z = 506) up over the duvet
    // fold crest (z = 490) and lies neatly down onto the duvet to z = 434.
    const z = lerp(506, 434, t);
    const vOnDuvet = clamp((duvetZHead - z) / (duvetZHead - duvetZFoot), 0, 1);
    const base = duvetPoint(u, vOnDuvet, 3.5 + lift);
    const roll = Math.sin(t * Math.PI) * 5.5;
    const backTuck = (1 - smoothstep(0, 0.25, t)) * -8;
    const isSide = smoothstep(0.76, 0.86, u);
    return [
      base[0] + isSide * (2.5 + lift * 0.5),
      base[1] + (1 - isSide) * (roll + backTuck),
      z + Math.sin(u * Math.PI * 2.5) * 3,
    ];
  };

  const cuffGrid: Vec3[][] = [];
  for (let r = 0; r <= cuffRows; r++) {
    const t = r / cuffRows;
    const row: Vec3[] = [];
    for (let c = 0; c <= cuffCols; c++) {
      row.push(cuffPoint(c / cuffCols, t, 0));
    }
    cuffGrid.push(row);
  }
  addSurface(mesh, cuffGrid, sheetCream);

  // Woven sage & terracotta decorative hem stripes along the turned-down cuff.
  for (const [t0, t1, trimPaint] of [
    [0.74, 0.82, sheetTrimSage],
    [0.85, 0.91, sheetTrimTerra],
  ] as const) {
    const band: Vec3[][] = [];
    for (let r = 0; r <= 2; r++) {
      const t = lerp(t0, t1, r / 2);
      const row: Vec3[] = [];
      for (let c = 0; c <= cuffCols; c++) {
        row.push(cuffPoint(c / cuffCols, t, 1.4));
      }
      band.push(row);
    }
    addSurface(mesh, band, trimPaint);
  }

  // Folded chunky sage-green knit throw draped slightly askew across the foot
  // of the bed, hugging the exact duvet contour & hanging outside the drape.
  const bedThrowRows = 10;
  const bedThrowCols = 22;
  const bedThrowPoint = (u: number, w: number, lift = 0): Vec3 => {
    // w in [0, 1] spans across the throw's width (~135 units) near the foot.
    const skew = (u - 0.5) * 26;
    const z = lerp(z0 + 196, z0 + 62, w) + skew;
    const vOnDuvet = clamp((duvetZHead - z) / (duvetZHead - duvetZFoot), 0, 1);
    const p = duvetPoint(u, vOnDuvet, 6.5 + lift);
    // Soft raised knit pillowing in the middle of the folded throw strip.
    const thickness = Math.sin(w * Math.PI) * 5.5;
    const isSide = smoothstep(0.76, 0.86, u);
    const hemDrop = smoothstep(0.84, 1, u) * 14;
    return [
      p[0] + isSide * (2.5 + thickness * 0.35),
      p[1] + (1 - isSide) * thickness - hemDrop,
      z,
    ];
  };

  const bedThrowGrid: Vec3[][] = [];
  for (let r = 0; r <= bedThrowRows; r++) {
    const w = r / bedThrowRows;
    const row: Vec3[] = [];
    for (let c = 0; c <= bedThrowCols; c++) {
      row.push(bedThrowPoint(c / bedThrowCols, w, 0));
    }
    bedThrowGrid.push(row);
  }
  addSurface(mesh, bedThrowGrid, sageThrow);

  // Cream woven stripes following the folded sage throw across the bed.
  for (const [w0, w1] of [
    [0.14, 0.24],
    [0.76, 0.86],
  ] as const) {
    const stripe: Vec3[][] = [];
    for (let r = 0; r <= 2; r++) {
      const w = lerp(w0, w1, r / 2);
      const row: Vec3[] = [];
      for (let c = 0; c <= bedThrowCols; c++) {
        row.push(bedThrowPoint(c / bedThrowCols, w, 1.8));
      }
      stripe.push(row);
    }
    addSurface(mesh, stripe, throwStripe);
  }
  // Knotted cream fringe tassels hanging along the living-room hem of the throw.
  for (let i = 0; i < 6; i++) {
    const w = lerp(0.08, 0.92, i / 5);
    const p = bedThrowPoint(1, w, 0);
    addDrum(
      mesh,
      [p[0], p[1] - 16, p[2]],
      17,
      2.3,
      1.6,
      throwStripe,
      throwStripe,
      6,
    );
  }

  // Two plump linen sleeping pillows with sage piping, leaning back against
  // the oak headboard panels with their lower edge sunk into the sheet, and
  // two accent cushions leaning back on them in turn. A positive turn about
  // x tips a pillow's top towards the headboard.
  for (const [px, yawDeg] of [
    [cx - 102, 3],
    [cx + 100, -4],
  ] as const) {
    withTransform(
      mesh,
      multiply(
        translation([px, mattressTop + 52, z1 - 64]),
        multiply(rotationY(radians(yawDeg)), rotationX(radians(28))),
      ),
      () => addPillow(mesh, 192, 118, 56, pillowLinen, pillowSagePiping),
    );
  }
  withTransform(
    mesh,
    multiply(
      translation([cx + 62, mattressTop + 41, z1 - 118]),
      multiply(
        rotationY(radians(-10)),
        multiply(rotationX(radians(20)), rotationZ(radians(3))),
      ),
    ),
    () => addPillow(mesh, 126, 90, 44, pillowRust, pillowRustPiping),
  );
  withTransform(
    mesh,
    multiply(
      translation([cx - 70, mattressTop + 42, z1 - 116]),
      multiply(
        rotationY(radians(9)),
        multiply(rotationX(radians(20)), rotationZ(radians(-3))),
      ),
    ),
    () => addPillow(mesh, 102, 92, 40, pillowOchre, pillowOchrePiping),
  );

  // Narrow woven bedside runner rug along the right edge of the bed.
  withTransform(
    mesh,
    multiply(translation([x1 + 74, 1.2, 270]), rotationY(radians(2))),
    () =>
      addQuad(
        mesh,
        [-64, 0, 235],
        [64, 0, 235],
        [64, 0, -235],
        [-64, 0, -235],
        { color: WHITE, material: MATERIAL.rug },
        true,
      ),
  );

  // Round mid-century walnut nightstand tucked between the bed pillows and
  // the back of the couch, holding a ceramic bedside lamp, book, and mug.
  withTransform(
    mesh,
    multiply(translation([-385, 0, 665]), rotationY(radians(14))),
    () => {
      for (let i = 0; i < 3; i++) {
        const a = radians(i * 120 + 25);
        splayedLeg(
          mesh,
          Math.cos(a) * 40,
          Math.sin(a) * 40,
          156,
          -Math.cos(a) * 0.08,
          Math.sin(a) * 0.08,
          6,
          10,
          frameDark,
          12,
          AGED_BRASS,
          10,
        );
      }
      addDrum(mesh, [0, 152, 0], 78, 56, 56, frameWarm, frameWarm, 14);
      addDrum(mesh, [0, 228, 0], 14, 66, 68, OAK, OAK, 14);
      // Small brass drawer pull facing the bed/room.
      addEllipsoid(mesh, [0, 192, -59], [7, 7, 5], AGED_BRASS, 10, 3);

      // Ceramic gourd-base bedside lamp with pleated cream drum shade & brass finial.
      addEllipsoid(
        mesh,
        [-12, 272, 10],
        [21, 30, 21],
        enamel([0.22, 0.48, 0.47]),
        12,
        4,
      );
      addDrum(mesh, [-12, 298, 10], 26, 6, 5, AGED_BRASS, AGED_BRASS, 10);
      addDrum(
        mesh,
        [-12, 314, 10],
        66,
        42,
        30,
        linen([0.95, 0.9, 0.78]),
        linen([0.82, 0.76, 0.64]),
        14,
      );
      addEllipsoid(mesh, [-12, 384, 10], [5, 6, 5], AGED_BRASS, 10, 3);

      // Small bedside paperback & mug with curved handle.
      withTransform(
        mesh,
        multiply(translation([24, 242, -16]), rotationY(radians(-22))),
        () =>
          addBox(mesh, [-24, 0, -18], [24, 11, 18], dusty([0.74, 0.24, 0.19])),
      );
      addDrum(
        mesh,
        [28, 242, 24],
        28,
        12,
        14,
        enamel([0.9, 0.86, 0.76]),
        dusty([0.2, 0.12, 0.08]),
        12,
      );
      addTube(
        mesh,
        [
          [40, 264, 24],
          [49, 260, 24],
          [49, 250, 24],
          [39, 247, 24],
        ],
        [2.2, 2.2, 2.2, 2.2],
        enamel([0.9, 0.86, 0.76]),
        6,
      );
    },
  );

  // Tall burnished-brass reading floor lamp with graceful curved gooseneck arch.
  addDrum(mesh, [-365, 0, 785], 16, 44, 34, DARK_IRON, AGED_BRASS, 14);
  addDrum(mesh, [-365, 16, 785], 568, 6.5, 5.5, AGED_BRASS, AGED_BRASS, 10);
  addTube(
    mesh,
    [
      [-365, 582, 785],
      [-365, 636, 783],
      [-365, 678, 766],
      [-365, 690, 742],
      [-365, 676, 728],
    ],
    [5.5, 5.2, 4.8, 4.5, 4.2],
    AGED_BRASS,
    10,
  );
  addDrum(
    mesh,
    [-365, 594, 728],
    84,
    60,
    34,
    linen([0.94, 0.88, 0.75]),
    linen([0.78, 0.72, 0.6]),
    14,
  );
}

/** The heirloom Scandinavian cast-iron wood stove / heater on its brick
    chimney breast and tiled hearth along the left wall, facing inward toward
    the couch, rug, and bed. */
function buildStove(mesh: Mesh): void {
  const stoveTrim = iron([0.23, 0.23, 0.25]);

  // Full-height running-bond brick chimney breast / heat shield on the left wall.
  addBox(mesh, [-W, 0, CHIMNEY_Z0], [-W + 30, EAVE, CHIMNEY_Z1], BRICK);
  // Stepped brick corbel & dark walnut mantle shelf above the stove.
  addBox(
    mesh,
    [-W + 26, 654, CHIMNEY_Z0 + 6],
    [-W + 46, 672, CHIMNEY_Z1 - 6],
    BRICK,
  );
  addBox(
    mesh,
    [-W + 24, 672, CHIMNEY_Z0 - 4],
    [-W + 104, 696, CHIMNEY_Z1 + 4],
    WALNUT,
  );
  // Mantle objects: brass candlestick, glazed cobalt stoneware jug, small frame.
  addDrum(mesh, [-W + 66, 696, -540], 12, 16, 12, AGED_BRASS, AGED_BRASS, 12);
  addDrum(
    mesh,
    [-W + 66, 708, -540],
    54,
    7,
    7,
    dusty([0.96, 0.93, 0.84]),
    dusty([0.96, 0.93, 0.84]),
    10,
  );
  addDrum(
    mesh,
    [-W + 66, 696, -420],
    46,
    22,
    16,
    enamel([0.2, 0.35, 0.56]),
    enamel([0.2, 0.35, 0.56]),
    12,
  );
  addDrum(
    mesh,
    [-W + 66, 742, -420],
    20,
    12,
    14,
    enamel([0.2, 0.35, 0.56]),
    plain([0.08, 0.1, 0.14]),
    12,
  );
  withTransform(
    mesh,
    multiply(translation([-W + 58, 696, -482]), rotationY(radians(8))),
    () => {
      addBox(mesh, [-6, 0, -28], [6, 68, 28], WALNUT);
      addBox(mesh, [5, 8, -21], [7, 60, 21], dusty([0.9, 0.84, 0.72]));
    },
  );

  // Raised slate-and-terracotta tiled hearth pad with dark curb & brass fender.
  addBox(mesh, [-W + 28, 0, CHIMNEY_Z0], [-685, 22, CHIMNEY_Z1], tile(0));
  addBox(
    mesh,
    [-693, 0, CHIMNEY_Z0 - 4],
    [-681, 24, CHIMNEY_Z1 + 4],
    DARK_IRON,
  );
  addBox(
    mesh,
    [-W + 28, 0, CHIMNEY_Z0 - 4],
    [-681, 24, CHIMNEY_Z0 + 8],
    DARK_IRON,
  );
  addBox(
    mesh,
    [-W + 28, 0, CHIMNEY_Z1 - 8],
    [-681, 24, CHIMNEY_Z1 + 4],
    DARK_IRON,
  );
  // Brass spark-fender rail standing on four turned brass finial posts.
  for (const fz of [CHIMNEY_Z0 + 18, -520, -440, CHIMNEY_Z1 - 18]) {
    addDrum(mesh, [-696, 22, fz], 34, 4.5, 4, AGED_BRASS, AGED_BRASS, 10);
    addEllipsoid(mesh, [-696, 59, fz], [6, 6, 6], AGED_BRASS, 10, 3);
  }
  withTransform(
    mesh,
    multiply(translation([-696, 48, CHIMNEY_Z0 + 16]), rotationX(Math.PI / 2)),
    () =>
      addDrum(
        mesh,
        [0, 0, 0],
        CHIMNEY_Z1 - CHIMNEY_Z0 - 32,
        3.8,
        3.8,
        AGED_BRASS,
        AGED_BRASS,
        10,
      ),
  );

  // Heirloom ribbed Scandinavian cast-iron wood stove standing on the hearth pad.
  withTransform(
    mesh,
    multiply(translation([STOVE[0], 22, STOVE[2]]), rotationY(STOVE_YAW)),
    () => {
      // Four curved cabriole cast-iron feet with broad floor pads.
      for (const [sx, sz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const) {
        addDrum(
          mesh,
          [sx * 76, 0, sz * 70],
          7,
          12.5,
          10,
          DARK_IRON,
          DARK_IRON,
          10,
        );
        addTube(
          mesh,
          [
            [sx * 76, 5, sz * 70],
            [sx * 74, 18, sz * 68],
            [sx * 67, 34, sz * 62],
            [sx * 69, 50, sz * 64],
          ],
          [9.5, 7.5, 9.5, 13.5],
          DARK_IRON,
          10,
        );
      }

      // Stepped lower hearth apron, protruding curved ash-catch lip, and
      // recessed ash drawer with brass spin-wheel draft regulator.
      addBox(mesh, [-86, 46, -80], [86, 74, 82], DARK_IRON);
      addBox(mesh, [-82, 48, 82], [82, 62, 106], DARK_IRON);
      // Rounded front edge on the ash-catch tray + raised catch rim.
      withTransform(
        mesh,
        multiply(translation([-80, 55, 106]), rotationZ(-Math.PI / 2)),
        () => addDrum(mesh, [0, 0, 0], 160, 7, 7, DARK_IRON, DARK_IRON, 10),
      );
      addBox(mesh, [-78, 62, 100], [78, 67, 108], stoveTrim);
      // Recessed ash-drawer plate + brass rosette draft damper wheel.
      addBox(mesh, [-44, 52, 81], [44, 71, 86], stoveTrim);
      withTransform(
        mesh,
        multiply(translation([-22, 62, 85]), rotationX(Math.PI / 2)),
        () => addDrum(mesh, [0, 0, 0], 5, 8.5, 7.5, AGED_BRASS, AGED_BRASS, 10),
      );
      withTransform(
        mesh,
        multiply(translation([22, 62, 85]), rotationX(Math.PI / 2)),
        () => addDrum(mesh, [0, 0, 0], 5, 8.5, 7.5, AGED_BRASS, AGED_BRASS, 10),
      );
      addEllipsoid(mesh, [0, 62, 89], [6, 5, 5], AGED_BRASS, 10, 3);

      // Main cast-iron firebox chamber + four fluted corner pilasters.
      addBox(mesh, [-78, 74, -72], [78, 290, 76], DARK_IRON);
      for (const [cxp, czp] of [
        [-78, -72],
        [78, -72],
        [-78, 76],
        [78, 76],
      ] as const) {
        addDrum(
          mesh,
          [cxp, 72, czp],
          220,
          10.5,
          10.5,
          stoveTrim,
          stoveTrim,
          10,
        );
        addDrum(mesh, [cxp, 74, czp], 14, 13, 12, DARK_IRON, DARK_IRON, 10);
        addDrum(mesh, [cxp, 276, czp], 14, 12, 13, DARK_IRON, DARK_IRON, 10);
      }

      // Five sculpted vertical radiating convection fins on both sides.
      for (const rz of [-52, -26, 0, 26, 52]) {
        for (const side of [-1, 1] as const) {
          addBox(
            mesh,
            [side < 0 ? -91 : 78, 86, rz - 4.5],
            [side < 0 ? -78 : 91, 278, rz + 4.5],
            stoveTrim,
          );
          addBox(
            mesh,
            [side < 0 ? -87 : 78, 78, rz - 4.5],
            [side < 0 ? -78 : 87, 86, rz + 4.5],
            DARK_IRON,
          );
          addBox(
            mesh,
            [side < 0 ? -87 : 78, 278, rz - 4.5],
            [side < 0 ? -78 : 87, 286, rz + 4.5],
            DARK_IRON,
          );
        }
      }

      // Stepped cast-iron crown cornice, concentric hotplate rings & brass rail.
      addBox(mesh, [-94, 290, -88], [94, 304, 88], DARK_IRON);
      addBox(mesh, [-86, 304, -80], [86, 316, 80], stoveTrim);
      // Two inlaid circular cast-iron hotplate cooking rings on the stove top.
      for (const [hx, hz, hr] of [
        [-34, 14, 34],
        [36, 26, 34],
      ] as const) {
        addDrum(mesh, [hx, 315, hz], 3, hr, hr - 1, DARK_IRON, stoveTrim, 16);
        addDrum(
          mesh,
          [hx, 317, hz],
          2,
          hr * 0.58,
          hr * 0.54,
          stoveTrim,
          DARK_IRON,
          14,
        );
      }
      // Subtle burnished brass warming gallery rail along the rear & side crown.
      addTube(
        mesh,
        [
          [-84, 326, 48],
          [-84, 326, -78],
          [84, 326, -78],
          [84, 326, 48],
        ],
        [3.2, 3.2, 3.2, 3.2],
        AGED_BRASS,
        8,
      );
      for (const [gx, gz] of [
        [-84, 48],
        [-84, -78],
        [84, -78],
        [84, 48],
      ] as const) {
        addDrum(mesh, [gx, 315, gz], 12, 3.2, 3.2, AGED_BRASS, AGED_BRASS, 8);
      }

      // Arched cathedral firebox door with brass barrel hinges, Gothic lattice
      // mullions over the animated fire, and coiled brass cool-touch latch.
      const mouth = 79.4;
      addBox(mesh, [-66, 84, 76], [66, 98, 84], stoveTrim);
      addBox(mesh, [-66, 214, 76], [66, 232, 84], stoveTrim);
      addBox(mesh, [-50, 232, 76], [50, 244, 84], stoveTrim);
      addBox(mesh, [-66, 98, 76], [-52, 214, 84], stoveTrim);
      addBox(mesh, [52, 98, 76], [66, 214, 84], stoveTrim);
      // Decorative arch spandrels framing the upper corners of the glass window.
      addTriangle(
        mesh,
        [-52, 214, 83.2],
        [-28, 214, 83.2],
        [-52, 190, 83.2],
        DARK_IRON,
      );
      addTriangle(
        mesh,
        [52, 214, 83.2],
        [52, 190, 83.2],
        [28, 214, 83.2],
        DARK_IRON,
      );
      // Animated fire & glowing ember bed behind the arched lattice.
      addQuad(
        mesh,
        [-52, 98, mouth],
        [52, 98, mouth],
        [52, 214, mouth],
        [-52, 214, mouth],
        { color: WHITE, material: MATERIAL.fire },
        true,
      );
      // Vertical & crossed iron mullions + bottom ember guard bar.
      for (const gx of [-22, 22]) {
        addBox(
          mesh,
          [gx - 3, 98, mouth],
          [gx + 3, 214, mouth + 3.2],
          DARK_IRON,
        );
      }
      addBox(mesh, [-52, 118, mouth], [52, 124, mouth + 3.5], DARK_IRON);
      // Upper Gothic arch struts meeting at center keystone.
      addTube(
        mesh,
        [
          [-22, 192, mouth + 1.8],
          [0, 212, mouth + 1.8],
          [22, 192, mouth + 1.8],
        ],
        [3.2, 3.2, 3.2],
        DARK_IRON,
        6,
      );
      // Two brass barrel hinges on the left side of the firebox door.
      for (const hy of [112, 194]) {
        addDrum(mesh, [-67, hy, 82], 18, 4.5, 4.5, AGED_BRASS, AGED_BRASS, 10);
      }
      // Coiled brass cool-touch spring handle & latch on the right side.
      addBox(mesh, [64, 148, 78], [74, 166, 86], DARK_IRON);
      addDrum(mesh, [71, 134, 88], 38, 5.2, 5.2, AGED_BRASS, AGED_BRASS, 10);
      addEllipsoid(mesh, [71, 174, 88], [6, 5, 6], AGED_BRASS, 10, 3);
      addEllipsoid(mesh, [71, 132, 88], [6, 5, 6], AGED_BRASS, 10, 3);

      // Smooth matte-black stovepipe with stepped collars & brass flue damper key.
      addDrum(mesh, [0, 314, -20], 20, 35, 27, stoveTrim, DARK_IRON, 14);
      addDrum(mesh, [0, 332, -20], 638, 24, 24, DARK_IRON, DARK_IRON, 14);
      addDrum(mesh, [0, 560, -20], 10, 27, 27, stoveTrim, stoveTrim, 14);
      addDrum(mesh, [0, 922, -20], 26, 39, 36, stoveTrim, DARK_IRON, 14);
      // Little brass flue damper key projecting from the right side of the pipe.
      withTransform(
        mesh,
        multiply(translation([24, 438, -20]), rotationZ(-Math.PI / 2)),
        () => {
          addDrum(mesh, [0, 0, 0], 18, 3, 2.5, AGED_BRASS, AGED_BRASS, 8);
          addEllipsoid(mesh, [0, 20, 0], [4, 7, 4], AGED_BRASS, 8, 3);
        },
      );

      // Sculpted burnished copper tea kettle simmering on the front-right hotplate.
      addDrum(mesh, [36, 318, 26], 20, 29, 31, COPPER, COPPER, 14);
      addDrum(mesh, [36, 338, 26], 18, 31, 21, COPPER, COPPER, 14);
      addEllipsoid(mesh, [36, 356, 26], [20, 9, 20], COPPER, 14, 4);
      addDrum(mesh, [36, 363, 26], 10, 5.5, 7.5, WALNUT, WALNUT, 10);
      // Graceful curved swan-neck copper spout.
      addTube(
        mesh,
        [
          [58, 330, 30],
          [70, 336, 33],
          [76, 349, 35],
          [82, 362, 37],
          [88, 366, 38],
        ],
        [7.5, 6.2, 5.2, 4.4, 3.8],
        COPPER,
        10,
      );
      // Smooth arched iron bail handle topped with a turned walnut grip.
      addTube(
        mesh,
        [
          [36, 350, 2],
          [36, 372, 2],
          [36, 384, 14],
          [36, 386, 26],
          [36, 384, 38],
          [36, 372, 50],
          [36, 350, 50],
        ],
        [2.6, 2.6, 2.6, 2.6, 2.6, 2.6, 2.6],
        DARK_IRON,
        8,
      );
      withTransform(
        mesh,
        multiply(translation([36, 386, 13]), rotationX(Math.PI / 2)),
        () => addDrum(mesh, [0, 0, 0], 26, 4.8, 4.8, WALNUT, WALNUT, 10),
      );
    },
  );

  // Curved wrought-iron firewood cradle beside the hearth holding split logs.
  const birchBark = dusty([0.84, 0.8, 0.72]);
  const oakBark = wood([0.36, 0.24, 0.15]);
  const splitHeart = wood([0.78, 0.62, 0.4]);
  withTransform(
    mesh,
    multiply(translation([-865, 0, -268]), rotationY(radians(8))),
    () => {
      // Curved wrought-iron U-hoops & stretcher bars.
      for (const hz of [-52, 52]) {
        addTube(
          mesh,
          [
            [-54, 84, hz],
            [-52, 24, hz],
            [-36, 8, hz],
            [36, 8, hz],
            [52, 24, hz],
            [54, 84, hz],
          ],
          [4.2, 4.2, 4.5, 4.5, 4.2, 4.2],
          DARK_IRON,
          8,
        );
      }
      for (const hx of [-48, 48]) {
        addBox(mesh, [hx - 3, 12, -52], [hx + 3, 18, 52], DARK_IRON);
      }
      for (const [lx, ly, lz, yaw, bark] of [
        [-22, 27, 0, 5, birchBark],
        [10, 27, 4, -4, oakBark],
        [30, 33, -3, 7, birchBark],
        [-8, 53, -2, -6, oakBark],
        [18, 55, 2, 4, birchBark],
      ] as const) {
        withTransform(
          mesh,
          multiply(
            translation([lx, ly, lz]),
            multiply(rotationY(radians(yaw)), rotationX(Math.PI / 2)),
          ),
          () => addDrum(mesh, [0, -48, 0], 96, 14, 13, bark, splitHeart, 12),
        );
      }
    },
  );

  // Standing wrought-iron hearth tool rack (hooked poker, shovel & brass pommels).
  addDrum(mesh, [-735, 0, -322], 12, 24, 20, DARK_IRON, stoveTrim, 12);
  addDrum(mesh, [-735, 12, -322], 138, 4.5, 4, DARK_IRON, DARK_IRON, 10);
  addEllipsoid(mesh, [-735, 154, -322], [7, 7, 7], AGED_BRASS, 10, 3);
  addBox(mesh, [-752, 138, -325], [-718, 143, -319], DARK_IRON);
  // Hanging hooked poker & ash shovel with turned brass handles.
  addDrum(mesh, [-722, 16, -320], 112, 2.8, 2.8, DARK_IRON, DARK_IRON, 8);
  addDrum(mesh, [-722, 126, -320], 14, 4.2, 3.6, AGED_BRASS, AGED_BRASS, 8);
  addBox(mesh, [-722, 18, -322], [-710, 23, -318], DARK_IRON);
  addDrum(mesh, [-748, 18, -324], 110, 2.8, 2.8, DARK_IRON, DARK_IRON, 8);
  addDrum(mesh, [-748, 126, -324], 14, 4.2, 3.6, AGED_BRASS, AGED_BRASS, 8);
  addBox(mesh, [-757, 12, -330], [-739, 34, -318], DARK_IRON);
}

/** Low walnut sideboard beneath the front wall shelf, holding vinyl records,
    a vintage walnut-and-cream tabletop radio, and a catchall bowl so the
    front wall feels anchored and lived-in. */
function buildSideboard(mesh: Mesh): void {
  const x0 = -220;
  const x1 = 130;
  const z0 = -D + 6;
  const z1 = -D + 114;
  const topY = 228;
  const bodyLow = 56;
  const midX = -46;

  // Four tapered walnut legs.
  for (const [lx, lz, sx, sz] of [
    [x0 + 24, z0 + 22, 0.08, -0.06],
    [x1 - 24, z0 + 22, -0.08, -0.06],
    [x0 + 24, z1 - 22, 0.08, 0.06],
    [x1 - 24, z1 - 22, -0.08, 0.06],
  ] as const) {
    splayedLeg(mesh, lx, lz, bodyLow, sx, sz, 7, 11, WALNUT);
  }

  // Cabinet carcass: top, bottom, sides, back, and center divider.
  addBox(mesh, [x0 - 4, topY - 14, z0 - 2], [x1 + 4, topY, z1 + 4], OAK);
  addBox(mesh, [x0, bodyLow, z0], [x1, bodyLow + 14, z1], WALNUT);
  addBox(mesh, [x0, bodyLow + 14, z0], [x0 + 16, topY - 14, z1], WALNUT);
  addBox(mesh, [x1 - 16, bodyLow + 14, z0], [x1, topY - 14, z1], WALNUT);
  addBox(
    mesh,
    [midX - 7, bodyLow + 14, z0],
    [midX + 7, topY - 14, z1 - 2],
    WALNUT,
  );
  addBox(
    mesh,
    [x0 + 14, bodyLow + 14, z0],
    [x1 - 14, topY - 14, z0 + 12],
    wood([0.3, 0.19, 0.12]),
  );

  // Left half: slatted tambour wood door with brass handle.
  addBox(
    mesh,
    [x0 + 16, bodyLow + 16, z1 - 10],
    [midX - 7, topY - 16, z1 - 2],
    wood([0.52, 0.34, 0.2]),
  );
  for (let i = 0; i < 8; i++) {
    const sx = lerp(x0 + 24, midX - 18, i / 7);
    addBox(
      mesh,
      [sx - 2, bodyLow + 22, z1 - 2],
      [sx + 2, topY - 22, z1 + 1],
      wood([0.34, 0.21, 0.13]),
    );
  }
  addBox(mesh, [midX - 24, 128, z1], [midX - 16, 158, z1 + 6], AGED_BRASS);

  // Right half: open vinyl record cubby packed with colourful LP spines.
  const sleeves: readonly Vec3[] = [
    [0.84, 0.26, 0.2],
    [0.92, 0.86, 0.74],
    [0.2, 0.38, 0.56],
    [0.9, 0.68, 0.22],
    [0.24, 0.48, 0.36],
    [0.64, 0.24, 0.38],
    [0.88, 0.48, 0.24],
    [0.26, 0.28, 0.34],
    [0.84, 0.78, 0.62],
  ];
  let rx = midX + 14;
  sleeves.forEach((col, i) => {
    const lean =
      i === sleeves.length - 1
        ? radians(-11)
        : radians((random(i + 91) - 0.5) * 4);
    withTransform(
      mesh,
      multiply(translation([rx, bodyLow + 14, z0 + 18]), rotationZ(lean)),
      () => addBox(mesh, [0, 0, 0], [8, 128, 86], dusty(col)),
    );
    rx += 14.5;
  });

  // Vintage walnut-and-cream tabletop radio sitting slightly angled on the left.
  withTransform(
    mesh,
    multiply(translation([-128, topY, z0 + 54]), rotationY(radians(12))),
    () => {
      addBox(mesh, [-56, 0, -32], [56, 62, 32], WALNUT);
      addBox(mesh, [-48, 8, 32], [48, 54, 35], dusty([0.92, 0.87, 0.76]));
      // Speaker slats on left, tuning dial & brass knobs on right.
      for (let s = 0; s < 5; s++) {
        const sy = 14 + s * 8;
        addBox(mesh, [-42, sy, 35], [4, sy + 3, 37], wood([0.32, 0.21, 0.13]));
      }
      addBox(mesh, [12, 34, 35], [42, 48, 37], plain([0.16, 0.22, 0.2]));
      for (const kx of [19, 35]) {
        withTransform(
          mesh,
          multiply(translation([kx, 20, 35]), rotationX(Math.PI / 2)),
          () => addDrum(mesh, [0, 0, 0], 6, 5.5, 4.5, AGED_BRASS),
        );
      }
    },
  );

  // Glazed ceramic catchall bowl on the right side of the sideboard.
  addDrum(
    mesh,
    [66, topY, z0 + 58],
    22,
    22,
    30,
    enamel([0.78, 0.36, 0.24]),
    dusty([0.88, 0.82, 0.7]),
  );
}

/** Front-right entryway: wooden coat-peg rail with hanging olive jacket and
    knit scarf, slatted shoe bench with boots, umbrella crock, and doormat. */
function buildEntryway(mesh: Mesh): void {
  const coatOlive = linen([0.33, 0.43, 0.29]);
  const coatDark = linen([0.24, 0.32, 0.21]);
  const scarfMustard = knit([0.86, 0.62, 0.2]);
  const leather = wood([0.38, 0.22, 0.13]);

  // Wall-mounted oak coat-peg rail on the front-right wall.
  addBox(mesh, [710, 548, -D + 2], [935, 582, -D + 16], OAK);
  for (const px of [745, 800, 855, 905]) {
    withTransform(
      mesh,
      multiply(translation([px, 565, -D + 16]), rotationX(Math.PI / 2)),
      () => addDrum(mesh, [0, 0, 0], 22, 5.5, 7, WALNUT),
    );
  }
  // Olive wool jacket hanging casually on the second peg.
  withTransform(
    mesh,
    multiply(translation([800, 560, -D + 30]), rotationZ(radians(3))),
    () => {
      addBox(mesh, [-42, -238, -14], [42, -4, 22], coatOlive);
      addBox(mesh, [-50, -210, -8], [-32, -24, 16], coatDark);
      addBox(mesh, [32, -214, -8], [50, -24, 16], coatDark);
      addBox(mesh, [-16, -24, -12], [16, 8, 16], coatDark);
    },
  );
  // Mustard knit scarf draped from the third peg.
  withTransform(
    mesh,
    multiply(translation([855, 560, -D + 32]), rotationZ(radians(-4))),
    () => {
      addBox(mesh, [-14, -162, -10], [8, 4, 14], scarfMustard);
      addBox(mesh, [2, -196, -8], [20, -6, 12], scarfMustard);
    },
  );

  // Slatted oak entryway shoe bench underneath the coat rail.
  const bx0 = 712;
  const bx1 = 942;
  const bz0 = -D + 14;
  const bz1 = -D + 158;
  addBox(mesh, [bx0, 170, bz0], [bx1, 188, bz1], OAK);
  for (const lx of [bx0 + 12, bx1 - 28]) {
    for (const lz of [bz0 + 12, bz1 - 28]) {
      addBox(mesh, [lx, 0, lz], [lx + 16, 170, lz + 16], WALNUT);
    }
  }
  for (let i = 0; i < 4; i++) {
    const sz = lerp(bz0 + 26, bz1 - 26, i / 3);
    addBox(mesh, [bx0 + 16, 48, sz - 7], [bx1 - 16, 58, sz + 7], OAK);
  }
  // Pair of worn leather boots resting askew on the lower shoe rack.
  for (const [ox, oz, deg] of [
    [784, bz0 + 78, -14],
    [836, bz0 + 88, 11],
  ] as const) {
    withTransform(
      mesh,
      multiply(translation([ox, 58, oz]), rotationY(radians(deg))),
      () => {
        addBox(mesh, [-15, 0, -22], [15, 32, 34], leather);
        addBox(mesh, [-14, 32, -22], [14, 78, 8], leather);
      },
    );
  }

  // Ceramic umbrella crock tucked beside the bench near the door.
  addDrum(
    mesh,
    [908, 0, -565],
    112,
    28,
    32,
    enamel([0.24, 0.38, 0.44]),
    plain([0.08, 0.1, 0.12]),
  );
  withTransform(
    mesh,
    multiply(translation([904, 100, -565]), rotationZ(radians(11))),
    () => {
      addDrum(mesh, [0, 0, 0], 110, 6, 4, linen([0.74, 0.24, 0.2]));
      addDrum(mesh, [0, 108, 0], 26, 4.5, 4.5, WALNUT);
    },
  );

  // Woven coir doormat inside the front door.
  addBox(
    mesh,
    [W - 148, 0, DOOR.z0 + 22],
    [W - 8, 7, DOOR.z1 - 22],
    knit([0.64, 0.49, 0.31]),
  );
}

/** Back-right cabin kitchenette / pantry hutch: sage-painted timber base
    cabinets, butcher-block oak countertop, glazed ceramic backsplash, upper
    floating dish shelves, stacked ceramic ware, spice jars, and brass teapot. */
function buildKitchenette(mesh: Mesh): void {
  const z0 = 96;
  const z1 = 676;
  const frontX = W - 214;
  const counterY = 332;
  const sageCab = dusty([0.44, 0.54, 0.46]);
  const sageRecess = dusty([0.35, 0.45, 0.38]);
  const ceramicCream = enamel([0.93, 0.9, 0.82]);
  const ceramicClay = enamel([0.78, 0.38, 0.24]);
  const tinRed = enamel([0.8, 0.22, 0.19]);

  // Base cabinet carcass & dark toe-kick.
  addBox(mesh, [frontX + 18, 0, z0 + 6], [W - 2, 34, z1 - 6], WALNUT);
  addBox(
    mesh,
    [frontX + 4, 34, z0 + 4],
    [W - 2, counterY - 22, z1 - 4],
    sageCab,
  );
  // Three shaker cabinet door fronts with brass pulls.
  for (let i = 0; i < 3; i++) {
    const dz0 = lerp(z0 + 14, z1 - 14, i / 3) + 6;
    const dz1 = lerp(z0 + 14, z1 - 14, (i + 1) / 3) - 6;
    addBox(
      mesh,
      [frontX, 50, dz0],
      [frontX + 5, counterY - 38, dz1],
      sageRecess,
    );
    addBox(
      mesh,
      [frontX - 6, 224, (dz0 + dz1) / 2 - 4],
      [frontX, 260, (dz0 + dz1) / 2 + 4],
      AGED_BRASS,
    );
  }

  // Thick butcher-block oak countertop.
  addBox(
    mesh,
    [frontX - 12, counterY - 22, z0 - 6],
    [W - 1, counterY, z1 + 6],
    OAK,
  );

  // Glazed cream & sage ceramic tile backsplash on the right wall.
  addBox(mesh, [W - 10, counterY, z0], [W - 1, 526, z1], tile(1));

  // Two floating oak dish shelves with dark iron brackets.
  for (const sy of [536, 658]) {
    addBox(mesh, [W - 118, sy - 14, z0 + 18], [W - 2, sy, z1 - 18], OAK);
    for (const bz of [z0 + 58, (z0 + z1) / 2, z1 - 58]) {
      addBox(
        mesh,
        [W - 92, sy - 64, bz - 5],
        [W - 2, sy - 14, bz + 5],
        DARK_IRON,
      );
    }
  }

  // Countertop items: oak cutting board, red coffee tin, brass teapot, 2 mugs.
  withTransform(
    mesh,
    multiply(translation([frontX + 94, counterY, 214]), rotationY(radians(8))),
    () => {
      addBox(mesh, [-44, 0, -64], [44, 10, 64], wood([0.74, 0.56, 0.34]));
      addEllipsoid(mesh, [6, 28, -8], [26, 18, 38], dusty([0.76, 0.52, 0.28]));
    },
  );
  addDrum(mesh, [frontX + 128, counterY, 378], 58, 22, 22, tinRed, AGED_BRASS);
  // Burnished brass teapot / French press.
  addDrum(mesh, [frontX + 102, counterY, 474], 54, 24, 20, AGED_BRASS);
  addEllipsoid(
    mesh,
    [frontX + 102, counterY + 54, 474],
    [20, 8, 20],
    AGED_BRASS,
  );
  addBox(
    mesh,
    [frontX + 70, counterY + 14, 470],
    [frontX + 80, counterY + 46, 478],
    WALNUT,
  );
  // Two stoneware mugs near the front edge.
  addDrum(
    mesh,
    [frontX + 86, counterY, 568],
    34,
    15,
    16,
    ceramicCream,
    dusty([0.2, 0.12, 0.08]),
  );
  addDrum(
    mesh,
    [frontX + 116, counterY, 608],
    34,
    15,
    16,
    ceramicClay,
    dusty([0.2, 0.12, 0.08]),
  );

  // Lower dish shelf (y = 536): stacked ceramic plates & terracotta bowls.
  for (let p = 0; p < 5; p++) {
    addDrum(mesh, [W - 62, 536 + p * 8, 210], 7, 34, 38, ceramicCream);
  }
  for (let b = 0; b < 3; b++) {
    addDrum(
      mesh,
      [W - 62, 536 + b * 18, 336],
      18,
      20,
      30,
      ceramicClay,
      ceramicCream,
    );
  }
  // Three glass pantry jars with visible dry goods inside.
  const pantryFill: readonly Vec3[] = [
    [0.86, 0.72, 0.42],
    [0.64, 0.32, 0.22],
    [0.36, 0.46, 0.3],
  ];
  pantryFill.forEach((col, i) => {
    const jz = 452 + i * 64;
    addDrum(mesh, [W - 60, 537, jz], 34 + i * 6, 15, 15, dusty(col));
    addDrum(mesh, [W - 60, 536, jz], 60, 20, 20, {
      color: [0.82, 0.9, 0.86],
      material: MATERIAL.jar,
    });
    addDrum(mesh, [W - 60, 594, jz], 10, 21, 21, OAK);
  });

  // Upper shelf (y = 658): enamel pitcher, stacked cookbooks, ceramic vase.
  addDrum(mesh, [W - 62, 658, 240], 68, 24, 18, enamel([0.22, 0.42, 0.56]));
  for (const [bz, w, h, col] of [
    [358, 18, 76, [0.76, 0.26, 0.2] as Vec3],
    [380, 16, 68, [0.88, 0.72, 0.26] as Vec3],
    [400, 20, 82, [0.24, 0.44, 0.36] as Vec3],
  ] as const) {
    addBox(mesh, [W - 96, 658, bz], [W - 22, 658 + h, bz + w], dusty(col));
  }
  addDrum(mesh, [W - 60, 658, 558], 72, 22, 14, ceramicClay);
}

/** Everything in the hut that keeps its shape. */
export function buildHut(mesh: Mesh): void {
  const { x0, y0, x1, y1 } = WINDOW;

  addQuad(mesh, [-W, 0, D], [W, 0, D], [W, 0, -D], [-W, 0, -D], {
    color: WHITE,
    material: MATERIAL.floor,
  });

  // The wall in front of you, around the window. Overlapping strips prevent
  // cracks when the shader snaps vertices to whole pixels.
  wallPanel(mesh, 0, -W, 0, x0, EAVE);
  wallPanel(mesh, 0, x1, 0, W, EAVE);
  wallPanel(mesh, 0, x0 - 8, 0, x1 + 8, y0, 0.6);
  wallPanel(mesh, 0, x0 - 8, y1, x1 + 8, EAVE, 0.6);
  wallPanel(mesh, 0, -W, EAVE - 8, W, EAVE + 8, 0.6);
  wallPanel(mesh, 1, -D, 0, D, EAVE);
  wallPanel(mesh, 2, -W, 0, W, EAVE);
  wallPanel(mesh, 3, -D, 0, D, EAVE);
  // The pointed gable tops of the front and back walls.
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

  // The vaulted cedar roof, rafters, tie-beams, king-posts, and wall posts.
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
      () => addBox(mesh, [0, -46, -16], [rafter, 0, 16], BEAM),
    );
    withTransform(
      mesh,
      multiply(translation([W, EAVE, z]), rotationZ(Math.PI - slope)),
      () => addBox(mesh, [0, 0, -16], [rafter, 46, 16], BEAM),
    );
  }
  // Ridge beam, eave wall plates, cross tie-beams, and central king-posts.
  addBox(mesh, [-26, RIDGE - 78, -D], [26, RIDGE - 16, D], BEAM);
  addBox(mesh, [-W, EAVE - 28, -D], [-W + 26, EAVE + 8, D], BEAM);
  addBox(mesh, [W - 26, EAVE - 28, -D], [W, EAVE + 8, D], BEAM);
  for (const z of [-300, 250]) {
    addBox(mesh, [-W, EAVE - 32, z - 26], [W, EAVE + 22, z + 26], BEAM);
    addBox(mesh, [-18, EAVE + 22, z - 18], [18, RIDGE - 76, z + 18], BEAM);
  }
  // Timber corner posts framing all four corners of the studio.
  for (const [cx, cz] of [
    [-W, -D],
    [W - 40, -D],
    [-W, D - 40],
    [W - 40, D - 40],
  ] as const) {
    addBox(mesh, [cx, 0, cz], [cx + 40, EAVE, cz + 40], BEAM);
  }

  // Baseboard skirting (y = 0..62) and chair-rail dado molding (y = 282..298)
  // around every wall, stopping cleanly at the door and brick chimney breast.
  const skirting = wood([0.52, 0.36, 0.23]);
  const rail = wood([0.58, 0.4, 0.25]);
  // Front and back walls.
  addBox(mesh, [-W, 0, -D], [W, 62, -D + 12], skirting);
  addBox(mesh, [-W, 282, -D], [W, 298, -D + 16], rail);
  addBox(mesh, [-W, 0, D - 12], [W, 62, D], skirting);
  addBox(mesh, [-W, 282, D - 16], [W, 298, D], rail);
  // Left wall (split around the brick chimney breast).
  addBox(mesh, [-W, 0, -D], [-W + 12, 62, CHIMNEY_Z0], skirting);
  addBox(mesh, [-W, 282, -D], [-W + 16, 298, CHIMNEY_Z0], rail);
  addBox(mesh, [-W, 0, CHIMNEY_Z1], [-W + 12, 62, D], skirting);
  addBox(mesh, [-W, 282, CHIMNEY_Z1], [-W + 16, 298, D], rail);
  // Right wall (split around the front door).
  addBox(mesh, [W - 12, 0, -D], [W, 62, DOOR.z0 - 30], skirting);
  addBox(mesh, [W - 16, 282, -D], [W, 298, DOOR.z0 - 30], rail);
  addBox(mesh, [W - 12, 0, DOOR.z1 + 30], [W, 62, D], skirting);
  addBox(mesh, [W - 16, 282, DOOR.z1 + 30], [W, 298, D], rail);

  // The window: recessed jambs, deep timber casing, beveled sill, and mullions.
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
  addBox(mesh, [x0 - 32, y0, -D], [x0, y1 + 34, -D + 14], TRIM);
  addBox(mesh, [x1, y0, -D], [x1 + 32, y1 + 34, -D + 14], TRIM);
  addBox(mesh, [x0 - 38, y1, -D], [x1 + 38, y1 + 36, -D + 18], TRIM);
  addBox(mesh, [x0 - 46, y0 - 22, -D], [x1 + 46, y0, -D + 66], TRIM);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  addBox(mesh, [cx - 9, y0, -D - 24], [cx + 9, y1, -D - 10], TRIM);
  addBox(mesh, [x0, cy - 9, -D - 24], [x1, cy + 9, -D - 10], TRIM);

  // Outside backdrop far behind the window.
  addQuad(
    mesh,
    [-1250, 180, -1500],
    [150, 180, -1500],
    [150, 1080, -1500],
    [-1250, 1080, -1500],
    { color: WHITE, material: MATERIAL.sky },
    true,
  );

  // --- Furniture & Zones ---
  buildCouch(mesh);
  buildBedAndSleepingNook(mesh);
  buildStove(mesh);
  buildSideboard(mesh);
  buildEntryway(mesh);
  buildKitchenette(mesh);

  // Mid-century angled writing desk beneath the window, with drawer, desk
  // blotter, paperbacks, pencil cup, and glazed ceramic planter pot.
  const wtHalfW = WINDOW_TABLE.width / 2;
  const wtHalfD = WINDOW_TABLE.depth / 2;
  const wtH = WINDOW_TABLE.height;
  withTransform(
    mesh,
    multiply(translation(WINDOW_TABLE.at), rotationY(WINDOW_TABLE.yaw)),
    () => {
      addBox(
        mesh,
        [-wtHalfW, wtH - 16, -wtHalfD],
        [wtHalfW, wtH, wtHalfD],
        OAK,
      );
      addBox(
        mesh,
        [-wtHalfW + 14, wtH - 64, -wtHalfD + 12],
        [wtHalfW - 14, wtH - 16, wtHalfD - 12],
        WALNUT,
      );
      // Right-hand drawer front & brass cup pull.
      addBox(
        mesh,
        [8, wtH - 58, wtHalfD - 12],
        [wtHalfW - 22, wtH - 22, wtHalfD - 8],
        OAK,
      );
      addBox(
        mesh,
        [52, wtH - 44, wtHalfD - 8],
        [76, wtH - 36, wtHalfD - 2],
        AGED_BRASS,
      );
      for (const [lx, lz, sx, sz] of [
        [-wtHalfW + 24, -wtHalfD + 22, 0.07, -0.06],
        [wtHalfW - 24, -wtHalfD + 22, -0.07, -0.06],
        [-wtHalfW + 24, wtHalfD - 22, 0.07, 0.06],
        [wtHalfW - 24, wtHalfD - 22, -0.07, 0.06],
      ] as const) {
        splayedLeg(mesh, lx, lz, wtH - 16, sx, sz, 8, 13, WALNUT);
      }
      // Dark green desk blotter & pencil cup.
      addBox(
        mesh,
        [-98, wtH, -48],
        [6, wtH + 3, 44],
        linen([0.19, 0.36, 0.28]),
      );
      addDrum(
        mesh,
        [-96, wtH, -38],
        34,
        11,
        13,
        enamel([0.82, 0.64, 0.24]),
        plain([0.1, 0.1, 0.1]),
      );
      // Skewed stack of two paperbacks beside the plant.
      withTransform(
        mesh,
        multiply(translation([-52, wtH + 3, -6]), rotationY(radians(-15))),
        () =>
          addBox(mesh, [-40, 0, -26], [40, 15, 26], dusty([0.24, 0.42, 0.36])),
      );
      withTransform(
        mesh,
        multiply(translation([-48, wtH + 18, -2]), rotationY(radians(10))),
        () =>
          addBox(mesh, [-34, 0, -22], [34, 12, 22], dusty([0.88, 0.8, 0.64])),
      );
      // Cobweb anchored under the walnut apron and hugging the splayed
      // front-left leg so it stays completely clear of the drawer and tabletop.
      web(
        mesh,
        [-90, wtH - 64, 55],
        [118, 0, 0],
        [6.7, -118, -8],
        0.37,
        0.3,
        0.86,
      );
    },
  );
  // Glazed ribbed ceramic planter pot at POT (world space, matching plant leaves).
  addDrum(
    mesh,
    POT,
    60,
    30,
    40,
    enamel([0.78, 0.41, 0.25]),
    dusty([0.2, 0.14, 0.1]),
  );
  addDrum(
    mesh,
    [POT[0], POT[1] + 46, POT[2]],
    15,
    42,
    43,
    enamel([0.22, 0.44, 0.48]),
    dusty([0.2, 0.14, 0.1]),
  );

  // Low sculpted mid-century coffee table in front of the couch.
  const ctHalfW = COFFEE_TABLE.width / 2;
  const ctHalfD = COFFEE_TABLE.depth / 2;
  const ctH = COFFEE_TABLE.height;
  withTransform(
    mesh,
    multiply(translation(COFFEE_TABLE.at), rotationY(COFFEE_TABLE.yaw)),
    () => {
      addBox(
        mesh,
        [-ctHalfW, ctH - 14, -ctHalfD],
        [ctHalfW, ctH, ctHalfD],
        WALNUT,
      );
      addBox(
        mesh,
        [-ctHalfW + 10, ctH - 22, -ctHalfD + 10],
        [ctHalfW - 10, ctH - 14, ctHalfD - 10],
        wood([0.34, 0.21, 0.13]),
      );
      // Lower slatted magazine shelf.
      for (let s = 0; s < 5; s++) {
        const sz = lerp(-ctHalfD + 22, ctHalfD - 22, s / 4);
        addBox(
          mesh,
          [-ctHalfW + 22, 48, sz - 6],
          [ctHalfW - 22, 56, sz + 6],
          OAK,
        );
      }
      for (const [lx, lz, sx, sz] of [
        [-ctHalfW + 22, -ctHalfD + 20, 0.08, -0.07],
        [ctHalfW - 22, -ctHalfD + 20, -0.08, -0.07],
        [-ctHalfW + 22, ctHalfD - 20, 0.08, 0.07],
        [ctHalfW - 22, ctHalfD - 20, -0.08, 0.07],
      ] as const) {
        splayedLeg(mesh, lx, lz, ctH - 16, sx, sz, 7, 11, WALNUT);
      }
      // Glazed stoneware mug on a cork coaster.
      addDrum(mesh, [-66, ctH, 18], 3, 24, 24, wood([0.74, 0.56, 0.36]));
      withTransform(
        mesh,
        multiply(translation([-66, ctH + 3, 18]), rotationY(radians(35))),
        () => {
          addDrum(
            mesh,
            [0, 0, 0],
            40,
            17,
            19,
            enamel([0.88, 0.38, 0.22]),
            dusty([0.22, 0.13, 0.09]),
          );
          addBox(mesh, [17, 10, -4], [28, 32, 4], enamel([0.88, 0.38, 0.22]));
        },
      );
      // Chunky remote control left pointing vaguely toward the TV.
      withTransform(
        mesh,
        multiply(translation([66, ctH, -16]), rotationY(radians(-26))),
        () => {
          addBox(mesh, [-9, 0, -26], [9, 7, 26], plain([0.14, 0.15, 0.17]));
          addBox(mesh, [2, 7, -21], [6, 8.5, -17], dusty([0.88, 0.22, 0.18]));
          addBox(mesh, [-6, 7, -11], [6, 8, 12], dusty([0.45, 0.46, 0.5]));
        },
      );
      // Open art magazine lying askew across the middle of the table.
      withTransform(
        mesh,
        multiply(translation([4, ctH, 16]), rotationY(radians(15))),
        () => {
          addBox(mesh, [-42, 0, -28], [42, 3.5, 28], dusty([0.92, 0.88, 0.78]));
          addBox(
            mesh,
            [-34, 3.5, -20],
            [-2, 4.4, 18],
            dusty([0.24, 0.46, 0.62]),
          );
          addBox(mesh, [4, 3.5, -16], [34, 4.4, 2], dusty([0.86, 0.62, 0.24]));
        },
      );
      // Small brass candle saucer on the back-left corner.
      addDrum(mesh, [-84, ctH, -36], 6, 17, 19, AGED_BRASS);
      addDrum(mesh, [-84, ctH + 6, -36], 24, 9, 8.5, dusty([0.95, 0.91, 0.8]));
    },
  );

  // Mid-century fluted media credenza and two-tone wood-trim CRT television,
  // turned toward the couch so the live broadcast stays cleanly in view.
  withTransform(mesh, multiply(translation(TV_AT), rotationY(TV_YAW)), () => {
    const [st0, st1] = TV_STAND;
    const standDark = wood([0.36, 0.23, 0.14]);
    const standWarm = WALNUT;
    // Splayed legs + brass ferrules.
    for (const [lx, lz, sx, sz] of [
      [st0[0] + 24, st0[2] + 20, 0.08, -0.06],
      [st1[0] - 24, st0[2] + 20, -0.08, -0.06],
      [st0[0] + 24, st1[2] - 20, 0.08, 0.06],
      [st1[0] - 24, st1[2] - 20, -0.08, 0.06],
    ] as const) {
      splayedLeg(mesh, lx, lz, 48, sx, sz, 8, 12, standDark);
      addDrum(mesh, [lx, 0, lz], 10, 8.5, 9.2, AGED_BRASS);
    }
    // Credenza top, lower deck, side walls, back panel, and center partition.
    addBox(mesh, [st0[0], st1[1] - 18, st0[2]], st1, OAK);
    addBox(
      mesh,
      [st0[0] + 4, 46, st0[2] + 4],
      [st1[0] - 4, 62, st1[2] - 4],
      standWarm,
    );
    addBox(
      mesh,
      [st0[0] + 4, 62, st0[2] + 4],
      [st0[0] + 22, st1[1] - 18, st1[2] - 4],
      standWarm,
    );
    addBox(
      mesh,
      [st1[0] - 22, 62, st0[2] + 4],
      [st1[0] - 4, st1[1] - 18, st1[2] - 4],
      standWarm,
    );
    addBox(
      mesh,
      [st0[0] + 22, 62, st0[2] + 4],
      [st1[0] - 22, st1[1] - 18, st0[2] + 14],
      standDark,
    );
    addBox(
      mesh,
      [58, 62, st0[2] + 10],
      [72, st1[1] - 18, st1[2] - 6],
      standWarm,
    );
    // Right-hand louvered cabinet door + brass knob.
    addBox(
      mesh,
      [72, 64, st1[2] - 12],
      [st1[0] - 22, st1[1] - 20, st1[2] - 4],
      wood([0.52, 0.34, 0.2]),
    );
    for (let s = 0; s < 5; s++) {
      const sx = lerp(82, st1[0] - 32, s / 4);
      addBox(
        mesh,
        [sx - 2, 72, st1[2] - 4],
        [sx + 2, st1[1] - 28, st1[2] - 1],
        standDark,
      );
    }
    addEllipsoid(mesh, [84, 128, st1[2] + 1], [6, 6, 5], AGED_BRASS);

    // Old cable box / VCR tucked slightly askew in the open left bay.
    withTransform(
      mesh,
      multiply(translation([-50, 62, 6]), rotationY(radians(4))),
      () => {
        addBox(mesh, [-84, 0, -56], [84, 46, 56], DARK_IRON);
        addBox(mesh, [-70, 20, 56], [30, 34, 58], plain([0.05, 0.05, 0.06]));
        addBox(mesh, [42, 18, 56], [70, 28, 59], {
          color: [0.25, 1.05, 0.55],
          material: MATERIAL.led,
          extra: [0, 0],
        });
      },
    );
    // Two VHS cassettes stacked slightly crooked atop the VCR.
    withTransform(
      mesh,
      multiply(translation([-78, 108, 4]), rotationY(radians(-10))),
      () => {
        addBox(mesh, [-36, 0, -24], [36, 13, 24], dusty([0.18, 0.19, 0.22]));
        addBox(mesh, [-32, 13, -22], [38, 26, 26], dusty([0.24, 0.22, 0.2]));
        addBox(mesh, [-28, 3, 24], [24, 10, 25], mark([0.88, 0.32, 0.22]));
        addBox(mesh, [-24, 16, 26], [28, 23, 27], mark([0.92, 0.78, 0.32]));
      },
    );

    // Two-tone 1980s wood-veneered CRT television cabinet, charcoal front,
    // brushed metal control strip, rotary dials, antennas, and live screen.
    const [tv0, tv1] = TV_CABINET;
    const tvWalnut = wood([0.42, 0.26, 0.16]);
    const casing = dusty([0.15, 0.16, 0.18]);
    const trim = iron([0.22, 0.23, 0.26]);
    const bezel = plain([0.07, 0.075, 0.09]);
    const chrome = brass([0.74, 0.76, 0.78]);
    // Woodgrain outer cabinet shell wrapping the charcoal front face.
    addBox(mesh, [tv0[0], tv0[1], -22], [tv1[0], tv1[1], tv1[2] - 8], tvWalnut);
    addBox(
      mesh,
      [tv0[0] + 6, tv0[1] + 6, tv1[2] - 10],
      [tv1[0] - 6, tv1[1] - 6, tv1[2]],
      casing,
    );
    addBox(
      mesh,
      [tv0[0] + 40, tv0[1] + 24, tv0[2]],
      [tv1[0] - 40, tv1[1] - 24, -22],
      dusty([0.12, 0.125, 0.14]),
    );
    // Deep recessed metallic bezel framing the CRT glass.
    const { x0: sx0, y0: sy0, x1: sx1, y1: sy1, z: szScreen } = TV_SCREEN;
    const bz0 = tv1[2];
    const bz1 = tv1[2] + 7;
    addBox(mesh, [sx0 - 10, sy1, bz0], [sx1 + 10, sy1 + 14, bz1], trim);
    addBox(mesh, [sx0 - 10, sy0 - 14, bz0], [sx1 + 10, sy0, bz1], trim);
    addBox(mesh, [sx0 - 10, sy0, bz0], [sx0, sy1, bz1], trim);
    addBox(mesh, [sx1, sy0, bz0], [sx1 + 10, sy1, bz1], trim);
    // The live news broadcast quad (matched by extractTvQuad in renderer.ts).
    addQuad(
      mesh,
      [sx0, sy0, szScreen],
      [sx1, sy0, szScreen],
      [sx1, sy1, szScreen],
      [sx0, sy1, szScreen],
      { color: WHITE, material: MATERIAL.tv },
      true,
    );
    // Right-hand brushed-metal control strip: speaker slats, chrome dials, LED.
    addBox(
      mesh,
      [94, 224, tv1[2]],
      [140, 444, tv1[2] + 2],
      iron([0.28, 0.29, 0.32]),
    );
    for (let slat = 0; slat < 6; slat++) {
      const sy = 252 + slat * 12;
      addBox(mesh, [98, sy, tv1[2] + 1.5], [136, sy + 5, tv1[2] + 3.5], bezel);
    }
    for (const ky of [394, 354]) {
      withTransform(
        mesh,
        multiply(translation([117, ky, tv1[2] + 1.5]), rotationX(Math.PI / 2)),
        () => addDrum(mesh, [0, 0, 0], 11, 13, 10, chrome, trim),
      );
    }
    addBox(mesh, [122, 232, tv1[2] + 1.5], [130, 240, tv1[2] + 4], {
      color: [1.35, 0.24, 0.18],
      material: MATERIAL.led,
      extra: [0, 0],
    });
    // Telescopic chrome rabbit-ear antennas with brass ball tips.
    addDrum(mesh, [-12, tv1[1], 14], 12, 22, 16, DARK_IRON);
    for (const tilt of [-0.62, 0.68]) {
      withTransform(
        mesh,
        multiply(translation([-12, tv1[1] + 10, 14]), rotationZ(tilt)),
        () => {
          addDrum(mesh, [0, 0, 0], 78, 2.4, 1.3, chrome);
          addEllipsoid(mesh, [0, 80, 0], [4.5, 4.5, 4.5], AGED_BRASS);
        },
      );
    }
  });

  // Front-wall floating oak shelf above your phone, on forged dark-iron
  // brackets, holding your books, dossier files, and the glass coin jar.
  addBox(
    mesh,
    [SHELF_X0, SHELF - 16, -D],
    [SHELF_X1, SHELF, -D + SHELF_DEPTH],
    OAK,
  );
  for (const bx of [SHELF_X0 + 26, SHELF_X1 - 38]) {
    addBox(
      mesh,
      [bx, SHELF - 72, -D],
      [bx + 10, SHELF - 16, -D + 12],
      DARK_IRON,
    );
    addBox(
      mesh,
      [bx, SHELF - 24, -D + 10],
      [bx + 10, SHELF - 16, -D + 76],
      DARK_IRON,
    );
    withTransform(
      mesh,
      multiply(
        translation([bx + 5, SHELF - 66, -D + 10]),
        rotationX(radians(44)),
      ),
      () => addBox(mesh, [-4, 0, -4], [4, 72, 4], DARK_IRON),
    );
  }
  const covers: readonly Vec3[] = [
    [0.72, 0.2, 0.16],
    [0.2, 0.36, 0.5],
    [0.88, 0.68, 0.22],
    [0.26, 0.46, 0.3],
    [0.9, 0.84, 0.7],
    [0.56, 0.26, 0.4],
  ];
  let spine = SHELF_X0 + 12;
  for (let i = 0; i < BOOKS; i++) {
    const thick = 17 + random(i + 20) * 14;
    const tall = 78 + random(i + 30) * 44;
    const deep = 56 + random(i + 40) * 20;
    const bookPaint = linen(covers[i % covers.length]);
    const band = mark([0.92, 0.84, 0.58]);
    if (i === BOOKS - 1) {
      withTransform(
        mesh,
        multiply(
          translation([spine + 10, SHELF, -D + 4]),
          rotationZ(radians(10)),
        ),
        () => {
          addBox(mesh, [0, 0, 0], [thick, tall, deep], bookPaint);
          addQuad(
            mesh,
            [2, tall * 0.68, deep + 0.6],
            [thick - 2, tall * 0.68, deep + 0.6],
            [thick - 2, tall * 0.76, deep + 0.6],
            [2, tall * 0.76, deep + 0.6],
            band,
          );
        },
      );
    } else {
      addBox(
        mesh,
        [spine, SHELF, -D + 4],
        [spine + thick, SHELF + tall, -D + 4 + deep],
        bookPaint,
      );
      addQuad(
        mesh,
        [spine + 2, SHELF + tall * 0.68, -D + 4.6 + deep],
        [spine + thick - 2, SHELF + tall * 0.68, -D + 4.6 + deep],
        [spine + thick - 2, SHELF + tall * 0.76, -D + 4.6 + deep],
        [spine + 2, SHELF + tall * 0.76, -D + 4.6 + deep],
        band,
      );
    }
    spine += thick + 1.5;
  }
  // Glass coin jar at the right end of the shelf.
  addDrum(mesh, JAR, 62, 19, 19, {
    color: [0.8, 0.9, 0.86],
    material: MATERIAL.jar,
  });

  // Woven Nordic/kilim medallion rug laid slightly off-axis where the sun
  // falls between the couch, hearth, and TV.
  withTransform(
    mesh,
    multiply(translation([-10, 1.2, -245]), rotationY(radians(4))),
    () =>
      addQuad(
        mesh,
        [-310, 0, 245],
        [310, 0, 245],
        [310, 0, -245],
        [-310, 0, -245],
        { color: WHITE, material: MATERIAL.rug },
        true,
      ),
  );

  // Enamelled forest-green dome pendant lamp hanging from the front tie-beam.
  // Nobody ever gets up to switch it on.
  addBox(mesh, [-46.5, 694, -301.5], [-43.5, EAVE - 32, -298.5], DARK_IRON);
  addDrum(mesh, [-45, 680, -300], 18, 10, 8, AGED_BRASS);
  addDrum(
    mesh,
    [-45, 646, -300],
    38,
    58,
    18,
    enamel([0.19, 0.42, 0.34]),
    enamel([0.92, 0.88, 0.76]),
  );
  addEllipsoid(mesh, [-45, 640, -300], [17, 22, 17], dusty([0.95, 0.92, 0.82]));

  // Vintage brass-rimmed wall clock above the TV: walnut body, burnished
  // brass bezel, cream enamel dial, and crisp hour indices.
  const clockRadius = 74;
  withTransform(
    mesh,
    multiply(translation(CLOCK), rotationX(Math.PI / 2)),
    () => {
      addDrum(
        mesh,
        [0, 0, 0],
        14,
        clockRadius + 4,
        clockRadius + 4,
        WALNUT,
        AGED_BRASS,
      );
      addDrum(
        mesh,
        [0, 13, 0],
        5,
        clockRadius - 3,
        clockRadius - 5,
        AGED_BRASS,
        dusty([0.96, 0.94, 0.86]),
      );
    },
  );
  for (let hour = 0; hour < 12; hour++) {
    const major = hour % 3 === 0;
    const wide = major ? 4.4 : 2.2;
    const inner = major ? 48 : 54;
    withTransform(
      mesh,
      multiply(
        translation([CLOCK[0], CLOCK[1], CLOCK[2] + 18.6]),
        rotationZ((-hour / 12) * Math.PI * 2),
      ),
      () =>
        addQuad(
          mesh,
          [-wide, inner, 0],
          [wide, inner, 0],
          [wide, 64, 0],
          [-wide, 64, 0],
          mark([0.12, 0.1, 0.09]),
        ),
    );
  }
  addEllipsoid(
    mesh,
    [CLOCK[0], CLOCK[1], CLOCK[2] + 20],
    [5.5, 5.5, 4],
    AGED_BRASS,
  );

  // The door opening in the right wall: timber casing and dark void behind it.
  addBox(mesh, [W - 14, 0, DOOR.z0 - 30], [W, DOOR.height + 30, DOOR.z0], TRIM);
  addBox(mesh, [W - 14, 0, DOOR.z1], [W, DOOR.height + 30, DOOR.z1 + 30], TRIM);
  addBox(
    mesh,
    [W - 14, DOOR.height, DOOR.z0 - 30],
    [W, DOOR.height + 34, DOOR.z1 + 30],
    TRIM,
  );
  addQuad(
    mesh,
    [W - 1, 0, DOOR.z0],
    [W - 1, 0, DOOR.z1],
    [W - 1, DOOR.height, DOOR.z1],
    [W - 1, DOOR.height, DOOR.z0],
    { color: WHITE, material: MATERIAL.dark },
  );

  // Cobwebs in exposed architectural corners and window panes, staggered so
  // they colonize the hut gradually without clipping into corner posts or door
  // trim.
  web(
    mesh,
    [-W + 40, EAVE + 17, -D + 3],
    [148, 69, 0],
    [0, -148, 0],
    0.14,
    0.14,
    0.72,
  );
  web(
    mesh,
    [W - 40, EAVE + 17, -D + 3],
    [-152, 71, 0],
    [0, -155, 0],
    0.58,
    0.22,
    0.8,
  );
  web(
    mesh,
    [-W + 3, EAVE - 32, -300],
    [148, 0, 0],
    [0, -148, 0],
    0.73,
    0.26,
    0.84,
  );
  web(mesh, [18, EAVE + 22, -300], [138, 0, 0], [0, 138, 0], 0.29, 0.34, 0.9);
  web(
    mesh,
    [W - 3, EAVE - 32, 250],
    [-122, 0, 0],
    [0, -112, 0],
    0.84,
    0.38,
    0.92,
  );
  web(mesh, [x1, y1, -D - 15], [-120, 0, 0], [0, -120, 0], 0.46, 0.16, 0.74);
  web(mesh, [x0, y0, -D - 15], [92, 0, 0], [0, 92, 0], 0.91, 0.42, 0.94);
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
  /** How sure it is of each thing it has guessed about you, 0 to 1. Each
      guess it is sure enough of is a file on the shelf. */
  files: readonly number[];
  /** Coins in the jar on the shelf: what your views were sold for. */
  coins: number;
  /** A leaflet inside the door for each video that was pushed at you, in
      the colour of the topic it was dressed up as. */
  leaflets: readonly Vec3[];
};

/** Where a leaflet is on its way from under the door to where it lands
    (`at`, turned by `turn`), `flight` of the way there. It slips out flat
    along the floor, lifts and flutters as it glides, spins round and
    settles. */
function leafletInFlight(
  at: Vec3,
  turn: number,
  flight: number,
  seed: number,
): Mat4 {
  const landed = multiply(translation(at), rotationY(turn));
  if (flight >= 1) return landed;
  const t = clamp(flight, 0, 1);
  // Fast out from under the door, slowing as it comes down.
  const along = 1 - (1 - t) ** 3;
  const from: Vec3 = [
    W + 40,
    1.5,
    clamp(at[2] + (random(seed + 90) - 0.5) * 80, DOOR.z0 + 40, DOOR.z1 - 40),
  ];
  // Flat under the gap first, then up on the air and gently down.
  const up = clamp((t - 0.12) / 0.88, 0, 1);
  const lift = Math.sin(Math.PI * up) * (26 + random(seed + 91) * 18);
  const position: Vec3 = [
    lerp(from[0], at[0], along),
    lerp(from[1], at[1], along) + lift,
    lerp(from[2], at[2], along),
  ];
  const side = random(seed + 92) < 0.5 ? -1 : 1;
  const spin = side * radians(110 + random(seed + 93) * 80) * (1 - along);
  const flutter = (1 - t) * Math.sin(up * Math.PI * 3.5 + seed);
  return [
    translation(position),
    rotationY(turn + spin),
    rotationX(flutter * 0.45),
    rotationZ(flutter * 0.25 * side),
  ].reduce(multiply);
}

/** The things in the hut that change shape as time goes by. `flights` says
    how far each leaflet is on its way in under the door, from 0 (just
    pushed) to 1 (lying still); a leaflet without one has landed. */
export function buildProps(
  mesh: Mesh,
  state: PropsState,
  flights: readonly number[] = [],
): void {
  const { decay, hour, videos, files, coins, leaflets } = state;

  // The tally scratched in the front plaster wall: four strokes and one across.
  const scratch = mark([0.2, 0.16, 0.13]);
  const marks = Math.min(videos, TALLY.perRow * TALLY.rows);
  for (let i = 0; i < marks; i++) {
    const group = Math.floor(i / 5);
    const stroke = i % 5;
    const left = TALLY.x + (group % (TALLY.perRow / 5)) * 72;
    const top = TALLY.y - Math.floor(group / (TALLY.perRow / 5)) * 68;
    const across = stroke === 4;
    const middle: Vec3 = across
      ? [left + 23, top - 24, -D + 1.2]
      : [left + 4 + stroke * 13, top - 24, -D + 0.8];
    const lean = across ? radians(-58) : radians((random(i) - 0.5) * 6);
    const half = across ? 33 : 21 + random(i + 0.5) * 3.5;
    withTransform(mesh, multiply(translation(middle), rotationZ(lean)), () =>
      addQuad(
        mesh,
        [-3.5, -half, 0],
        [3.5, -half, 0],
        [3.5, half, 0],
        [-3.5, half, 0],
        scratch,
      ),
    );
  }

  // The hands of the clock.
  const hand = mark([0.1, 0.09, 0.08]);
  const hands = [
    [(hour % 12) / 12, 36, 4.2],
    [hour % 1, 54, 2.6],
  ] as const;
  hands.forEach(([turn, long, wide], i) => {
    withTransform(
      mesh,
      multiply(
        translation([CLOCK[0], CLOCK[1], CLOCK[2] + 19.6 + i]),
        rotationZ(-turn * Math.PI * 2),
      ),
      () =>
        addQuad(
          mesh,
          [-wide, -8, 0],
          [wide, -8, 0],
          [wide * 0.6, long, 0],
          [-wide * 0.6, long, 0],
          hand,
        ),
    );
  });

  // The lush potted plant by the window: stands proud in daylight, then droops
  // and browns as the scroll drags on.
  const wilt = smoothstep(0.08, 0.8, decay);
  for (let i = 0; i < LEAVES; i++) {
    const turn = radians(i * 137.5);
    const out: Vec3 = [Math.cos(turn), 0, Math.sin(turn)];
    const side: Vec3 = [-out[2], 0, out[0]];
    const long = lerp(45, 31, wilt) * (0.82 + 0.36 * random(i + 3));
    const color = mix(
      [0.16 + 0.1 * random(i), 0.54 + 0.14 * random(i + 1), 0.25],
      [0.36, 0.25, 0.13],
      smoothstep(0.1, 0.9, wilt + (random(i + 2) - 0.5) * 0.3),
    );
    const leaf = plain(color);
    let at: Vec3 = [POT[0] + out[0] * 6, POT[1] + 58, POT[2] + out[2] * 6];
    let rise = radians(lerp(74, 28, wilt) - random(i + 4) * 16);
    let width = 4.5;
    for (let part = 0; part < 3; part++) {
      const next: Vec3 = [
        at[0] + out[0] * Math.cos(rise) * long,
        at[1] + Math.sin(rise) * long,
        at[2] + out[2] * Math.cos(rise) * long,
      ];
      const nextWidth = [lerp(19, 10, wilt), lerp(15, 7.5, wilt), 0.5][part];
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

  // Woven terracotta-linen curtains on a forged iron rod with brass finials.
  // The right curtain slips off its rings as decay deepens.
  const { x0, y0, x1, y1 } = WINDOW;
  const top = y1 + 48;
  withTransform(
    mesh,
    multiply(translation([x0 - 102, top, -D + 20]), rotationZ(-Math.PI / 2)),
    () => addDrum(mesh, [0, 0, 0], x1 - x0 + 204, 4.5, 4.5, DARK_IRON),
  );
  addEllipsoid(mesh, [x0 - 106, top, -D + 20], [10, 10, 10], AGED_BRASS);
  addEllipsoid(mesh, [x1 + 106, top, -D + 20], [10, 10, 10], AGED_BRASS);

  const slipped = radians(15) * smoothstep(0.45, 0.9, decay);
  for (const [hook, way, turn] of [
    [x0 - 84, 1, 0],
    [x1 + 84, -1, slipped],
  ] as const) {
    withTransform(
      mesh,
      multiply(translation([hook, top, -D + 12]), rotationZ(turn)),
      () => {
        for (let fold = 0; fold < 4; fold++) {
          const near = fold % 2 === 0;
          const from = way * fold * 19;
          addBox(
            mesh,
            [Math.min(from, from + way * 19), y0 - 65 - top, near ? 2 : 0],
            [Math.max(from, from + way * 19), 0, near ? 13 : 8],
            linen(near ? [0.84, 0.37, 0.22] : [0.7, 0.29, 0.18]),
          );
        }
      },
    );
  }

  // The framed coastal-lighthouse painting hanging on the left wall above the
  // bed; it slips crooked on its nail as decay progresses.
  withTransform(
    mesh,
    multiply(
      translation(NAIL),
      rotationX(radians(13) * smoothstep(0.3, 1, decay)),
    ),
    () => {
      addBox(mesh, [0, -225, -142], [12, -15, 142], WALNUT);
      addBox(mesh, [10, -214, -130], [13.5, -26, 130], AGED_BRASS);
      addQuad(
        mesh,
        [14.2, -206, 122],
        [14.2, -206, -122],
        [14.2, -34, -122],
        [14.2, -34, 122],
        { color: WHITE, material: MATERIAL.picture },
        true,
      );
    },
  );

  // Dossier files kept on you, standing in a row on the front wall shelf.
  const covers = [plain([0.2, 0.22, 0.28]), plain([0.16, 0.17, 0.22])];
  const frontZ = -D + 68;
  let spine = FILES_FROM;
  files.forEach((sure, i) => {
    if (sure < SURE) return;
    const thick = lerp(10, 20, (sure - SURE) / (1 - SURE));
    if (spine + thick > JAR[0] - 46) return;
    addBox(
      mesh,
      [spine, SHELF, -D + 4],
      [spine + thick, SHELF + 114, frontZ],
      covers[i % 2],
    );
    addQuad(
      mesh,
      [spine + 2, SHELF + 62, frontZ + 0.8],
      [spine + thick - 2, SHELF + 62, frontZ + 0.8],
      [spine + thick - 2, SHELF + 102, frontZ + 0.8],
      [spine + 2, SHELF + 102, frontZ + 0.8],
      mark(FILE_LABELS[i % FILE_LABELS.length]),
    );
    spine += thick + 1.5;
  });

  // Gold coins in the glass jar and stacked beside it on the front shelf.
  const gold = [plain([1.3, 1, 0.25]), plain([1.05, 0.75, 0.15])];
  const shown = Math.min(coins, COINS_MOST);
  for (let i = 0; i < shown; i++) {
    const beside = i - JAR_HOLDS;
    const [x, z] =
      beside < 0 ? [JAR[0], JAR[2]] : STACKS[Math.floor(beside / STACK_HOLDS)];
    const level = beside < 0 ? i : beside % STACK_HOLDS;
    addDrum(
      mesh,
      [
        x + (random(i + 60) - 0.5) * 3,
        SHELF + 0.5 + level * COIN,
        z + (random(i + 70) - 0.5) * 3,
      ],
      COIN,
      14,
      14,
      gold[i % 2],
      gold[0],
    );
  }

  // Flyers pushed in under the right-hand door, skidding across the floor.
  const paper = mark([0.9, 0.87, 0.78]);
  const print = mark([0.3, 0.28, 0.26]);
  leaflets.slice(0, LEAFLETS_MOST).forEach((color, i) => {
    const [sx, sz, baseDeg] = LEAFLET_SPOTS[i % LEAFLET_SPOTS.length];
    const secondLayer = i >= LEAFLET_SPOTS.length;
    const at: Vec3 = [
      sx + (secondLayer ? (random(i + 81) - 0.5) * 24 : 0),
      secondLayer ? 5.6 : 2.2,
      sz + (secondLayer ? (random(i + 82) - 0.5) * 24 : 0),
    ];
    const turn = radians(
      baseDeg + (secondLayer ? (random(i + 80) - 0.5) * 34 : 0),
    );
    const place = leafletInFlight(at, turn, flights[i] ?? 1, i);
    const strips: readonly (readonly [number, Paint])[] = [
      [-46, paper],
      [-34, print],
      [-28, paper],
      [-20, print],
      [-14, paper],
      [-4, mark(color)],
      [38, paper],
      [46, paper],
    ];
    withTransform(mesh, place, () => {
      for (let strip = 0; strip < strips.length - 1; strip++) {
        const [x0s, paint] = strips[strip];
        const x1s = strips[strip + 1][0];
        addQuad(
          mesh,
          [x0s, 0, 32],
          [x1s, 0, 32],
          [x1s, 0, -32],
          [x0s, 0, -32],
          paint,
        );
      }
    });
  });

  // The panelled timber front door slowly creeps open on its own.
  const doorWidth = DOOR.z1 - DOOR.z0;
  const ajar = radians(26) * smoothstep(0.55, 1, decay);
  withTransform(mesh, multiply(translation(HINGE), rotationY(ajar)), () => {
    const panel = wood([0.36, 0.24, 0.15]);
    addBox(mesh, [-14, 0, -doorWidth], [0, DOOR.height, 0], WALNUT);
    // Brass kickplate along the bottom + two recessed timber panels.
    addBox(mesh, [-16, 4, -doorWidth + 12], [-13, 56, -12], AGED_BRASS);
    addBox(mesh, [-16, 94, -doorWidth + 46], [-13, 365, -46], panel);
    addBox(mesh, [-16, 430, -doorWidth + 46], [-13, 735, -46], panel);
    // Brass escutcheon plate & doorknob.
    addBox(
      mesh,
      [-17, 362, -doorWidth + 24],
      [-13, 426, -doorWidth + 48],
      AGED_BRASS,
    );
    addEllipsoid(mesh, [-26, 396, -doorWidth + 36], [10, 10, 10], AGED_BRASS);
  });

  // Outside the window: a surveillance camera on a steel pole that appears once
  // you scroll and slowly tracks straight toward your spot on the couch.
  if (videos >= 3) {
    const steel = iron([0.34, 0.36, 0.4]);
    const body = plain([0.72, 0.74, 0.76]);
    const darkLens = plain([0.06, 0.07, 0.09]);
    const { poleBase, poleHeight, headAt } = CAMERA_POLE;
    addDrum(mesh, poleBase, poleHeight, 11, 8, steel);
    addBox(
      mesh,
      [headAt[0] - 6, headAt[1] - 7, poleBase[2] - 7],
      [poleBase[0] + 6, headAt[1] + 7, poleBase[2] + 7],
      steel,
    );
    addBox(
      mesh,
      [headAt[0] - 6, headAt[1] - 6, poleBase[2]],
      [headAt[0] + 6, headAt[1] + 6, headAt[2]],
      steel,
    );

    const track = smoothstep(3, 15, videos);
    const camYaw = radians(lerp(-24, 19, track));
    const camPitch = radians(lerp(16, 5.4, track));
    withTransform(
      mesh,
      multiply(
        translation(headAt),
        multiply(rotationY(camYaw), rotationX(camPitch)),
      ),
      () => {
        addBox(mesh, [-17, -14, -30], [17, 14, 22], body);
        addBox(mesh, [-19, 12, -32], [19, 17, 34], plain([0.56, 0.58, 0.62]));
        withTransform(
          mesh,
          multiply(translation([0, -1, 20]), rotationX(Math.PI / 2)),
          () => addDrum(mesh, [0, 0, 0], 12, 11, 10, darkLens),
        );
        addBox(mesh, [8, 4, 21.5], [14, 10, 26], {
          color: [1.9, 0.14, 0.1],
          material: MATERIAL.led,
          extra: [1, 0],
        });
      },
    );
  }
}
