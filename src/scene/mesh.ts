import {
  add,
  cross,
  IDENTITY,
  multiply,
  normalize,
  scale,
  sub,
  transformDirection,
  transformPoint,
  type Mat4,
  type Vec3,
} from "./math";

/* Shapes are made of triangles. A mesh is the list of their corners, in the
   layout the shaders read (see shaders.ts). */

/** Numbers per corner: where it is (3), which way it faces (3), its colour
    (3), its material, and two numbers the material may use. */
export const VERTEX_SIZE = 12;

/** How a surface is drawn: its colour, and which material in shaders.ts
    turns that into wood, skin, sky... */
export type Paint = {
  color: Vec3;
  material: number;
  /** Two numbers for the material, e.g. which wall this is. */
  extra?: readonly [number, number];
};

export type Mesh = {
  vertices: Float32Array;
  indices: Uint16Array;
  vertexCount: number;
  indexCount: number;
  /** Moves and turns every shape added while it is set. */
  transform: Mat4;
};

/** An empty mesh with room for this many corners. */
export function createMesh(maxVertices: number): Mesh {
  return {
    vertices: new Float32Array(maxVertices * VERTEX_SIZE),
    indices: new Uint16Array(maxVertices * 3),
    vertexCount: 0,
    indexCount: 0,
    transform: IDENTITY,
  };
}

/** Empties the mesh, to build it again in the same memory. */
export function clearMesh(mesh: Mesh): void {
  mesh.vertexCount = 0;
  mesh.indexCount = 0;
  mesh.transform = IDENTITY;
}

/** Adds the shapes `build` makes, moved and turned by `transform` within the
    current transform. */
export function withTransform(
  mesh: Mesh,
  transform: Mat4,
  build: () => void,
): void {
  const before = mesh.transform;
  mesh.transform = multiply(before, transform);
  build();
  mesh.transform = before;
}

/** One corner. Returns its number, for the triangles that use it. A full
    mesh takes no more, so createMesh has to be given room to spare. */
function corner(
  mesh: Mesh,
  position: Vec3,
  normal: Vec3,
  paint: Paint,
  extra: readonly [number, number] | undefined = paint.extra,
): number {
  const index = mesh.vertexCount;
  const at = index * VERTEX_SIZE;
  if (at + VERTEX_SIZE > mesh.vertices.length) return 0;
  const p = transformPoint(mesh.transform, position);
  const n = transformDirection(mesh.transform, normal);
  const out = mesh.vertices;
  out[at] = p[0];
  out[at + 1] = p[1];
  out[at + 2] = p[2];
  out[at + 3] = n[0];
  out[at + 4] = n[1];
  out[at + 5] = n[2];
  out[at + 6] = paint.color[0];
  out[at + 7] = paint.color[1];
  out[at + 8] = paint.color[2];
  out[at + 9] = paint.material;
  out[at + 10] = extra === undefined ? 0 : extra[0];
  out[at + 11] = extra === undefined ? 0 : extra[1];
  mesh.vertexCount = index + 1;
  return index;
}

function triangle(mesh: Mesh, a: number, b: number, c: number): void {
  if (mesh.indexCount + 3 > mesh.indices.length) return;
  mesh.indices[mesh.indexCount] = a;
  mesh.indices[mesh.indexCount + 1] = b;
  mesh.indices[mesh.indexCount + 2] = c;
  mesh.indexCount += 3;
}

/** A flat triangle. */
export function addTriangle(
  mesh: Mesh,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  paint: Paint,
): void {
  const normal = normalize(cross(sub(b, a), sub(c, a)));
  triangle(
    mesh,
    corner(mesh, a, normal, paint),
    corner(mesh, b, normal, paint),
    corner(mesh, c, normal, paint),
  );
}

/**
 * A flat four-sided face, its corners given going round. With `mapped`, the
 * material's two numbers run from 0 to 1 across it: 0,0 at the first corner,
 * 1,0 at the second, 1,1 at the third.
 */
export function addQuad(
  mesh: Mesh,
  a: Vec3,
  b: Vec3,
  c: Vec3,
  d: Vec3,
  paint: Paint,
  mapped = false,
): void {
  const normal = normalize(cross(sub(b, a), sub(d, a)));
  const ia = corner(mesh, a, normal, paint, mapped ? [0, 0] : paint.extra);
  const ib = corner(mesh, b, normal, paint, mapped ? [1, 0] : paint.extra);
  const ic = corner(mesh, c, normal, paint, mapped ? [1, 1] : paint.extra);
  const id = corner(mesh, d, normal, paint, mapped ? [0, 1] : paint.extra);
  triangle(mesh, ia, ib, ic);
  triangle(mesh, ia, ic, id);
}

/** A box with its sides along the axes, from one corner to the opposite. */
export function addBox(mesh: Mesh, min: Vec3, max: Vec3, paint: Paint): void {
  const [x0, y0, z0] = min;
  const [x1, y1, z1] = max;
  // Front and back.
  addQuad(mesh, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], paint);
  addQuad(mesh, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], paint);
  // Right and left.
  addQuad(mesh, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], paint);
  addQuad(mesh, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], paint);
  // Top and bottom.
  addQuad(mesh, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], paint);
  addQuad(mesh, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], paint);
}

/** Two directions at right angles to `axis` and to each other. */
function sidesOf(axis: Vec3): [Vec3, Vec3] {
  const helper: Vec3 = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize(cross(helper, axis));
  return [u, cross(axis, u)];
}

/** How many sides a round shape is cut into. */
const AROUND = 8;
/** How many bands each rounded end is cut into. */
const BANDS = 2;

/**
 * A rounded stick from `a` to `b`: a ball of radius `ra` at one end, a ball
 * of radius `rb` at the other, and a straight skin between them. Fingers
 * are made of these.
 */
export function addRoundCone(
  mesh: Mesh,
  a: Vec3,
  b: Vec3,
  ra: number,
  rb: number,
  paint: Paint,
): void {
  const axis = normalize(sub(b, a));
  const [u, v] = sidesOf(axis);
  // Rings from the tip behind `a` to the tip past `b`. Each is how far
  // along the stick, how wide, and how much the skin leans along it.
  const rings: { at: Vec3; radius: number; lean: number }[] = [];
  for (let i = 0; i <= BANDS; i++) {
    const angle = (Math.PI / 2) * (i / BANDS);
    rings.push({
      at: add(a, scale(axis, -ra * Math.cos(angle))),
      radius: ra * Math.sin(angle),
      lean: -Math.cos(angle),
    });
  }
  for (let i = BANDS; i >= 0; i--) {
    const angle = (Math.PI / 2) * (i / BANDS);
    rings.push({
      at: add(b, scale(axis, rb * Math.cos(angle))),
      radius: rb * Math.sin(angle),
      lean: Math.cos(angle),
    });
  }
  const first = mesh.vertexCount;
  for (const ring of rings) {
    const flat = Math.sqrt(Math.max(1 - ring.lean * ring.lean, 0));
    for (let j = 0; j < AROUND; j++) {
      const turn = (j / AROUND) * Math.PI * 2;
      const out = add(scale(u, Math.cos(turn)), scale(v, Math.sin(turn)));
      corner(
        mesh,
        add(ring.at, scale(out, ring.radius)),
        add(scale(out, flat), scale(axis, ring.lean)),
        paint,
      );
    }
  }
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < AROUND; j++) {
      const next = (j + 1) % AROUND;
      const p = first + i * AROUND + j;
      const q = first + i * AROUND + next;
      triangle(mesh, p, q, p + AROUND);
      triangle(mesh, q, q + AROUND, p + AROUND);
    }
  }
}

/** A ball squashed to `radii` along the axes. Turn it with withTransform. */
export function addEllipsoid(
  mesh: Mesh,
  center: Vec3,
  radii: Vec3,
  paint: Paint,
  sides = AROUND,
  bands = BANDS,
): void {
  const rows = bands * 2;
  const first = mesh.vertexCount;
  for (let i = 0; i <= rows; i++) {
    const tilt = Math.PI * (i / rows);
    for (let j = 0; j < sides; j++) {
      const turn = (j / sides) * Math.PI * 2;
      const out: Vec3 = [
        Math.sin(tilt) * Math.cos(turn),
        Math.cos(tilt),
        Math.sin(tilt) * Math.sin(turn),
      ];
      corner(
        mesh,
        [
          center[0] + out[0] * radii[0],
          center[1] + out[1] * radii[1],
          center[2] + out[2] * radii[2],
        ],
        normalize([out[0] / radii[0], out[1] / radii[1], out[2] / radii[2]]),
        paint,
      );
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < sides; j++) {
      const next = (j + 1) % sides;
      const p = first + i * sides + j;
      const q = first + i * sides + next;
      triangle(mesh, p, q, p + sides);
      triangle(mesh, q, q + sides, p + sides);
    }
  }
}

/**
 * A round pot or disc standing on `base`: `r0` wide at the bottom, `r1` at
 * the top, with both ends closed.
 */
export function addDrum(
  mesh: Mesh,
  base: Vec3,
  height: number,
  r0: number,
  r1: number,
  paint: Paint,
  top: Paint = paint,
  sides = AROUND,
): void {
  const up: Vec3 = [0, 1, 0];
  const lid = add(base, [0, height, 0]);
  const slope = (r0 - r1) / height;
  const first = mesh.vertexCount;
  for (let j = 0; j < sides; j++) {
    const turn = (j / sides) * Math.PI * 2;
    const out: Vec3 = [Math.cos(turn), 0, Math.sin(turn)];
    const normal = normalize([out[0], slope, out[2]]);
    corner(mesh, add(base, scale(out, r0)), normal, paint);
    corner(mesh, add(lid, scale(out, r1)), normal, paint);
  }
  for (let j = 0; j < sides; j++) {
    const p = first + j * 2;
    const q = first + ((j + 1) % sides) * 2;
    triangle(mesh, p, q, p + 1);
    triangle(mesh, q, q + 1, p + 1);
  }
  for (const [center, radius, normal, coat] of [
    [lid, r1, up, top],
    [base, r0, scale(up, -1), paint],
  ] as const) {
    const middle = corner(mesh, center, normal, coat);
    const rim = mesh.vertexCount;
    for (let j = 0; j < sides; j++) {
      const turn = (j / sides) * Math.PI * 2;
      corner(
        mesh,
        add(center, [Math.cos(turn) * radius, 0, Math.sin(turn) * radius]),
        normal,
        coat,
      );
    }
    for (let j = 0; j < sides; j++) {
      triangle(mesh, middle, rim + j, rim + ((j + 1) % sides));
    }
  }
}

/**
 * A smooth grid surface (`rows[r][c]`). Normals are averaged from neighbouring
 * quads (`cross(colStep, rowStep)`). With `mapped`, each vertex carries
 * continuous `[c / (cols - 1), r / (rows - 1)]` coordinates in `extra`.
 */
export function addSurface(
  mesh: Mesh,
  rows: readonly (readonly Vec3[])[],
  paint: Paint,
  mapped = false,
): void {
  const rowCount = rows.length;
  if (rowCount < 2) return;
  const colCount = rows[0].length;
  if (colCount < 2) return;

  const first = mesh.vertexCount;
  for (let r = 0; r < rowCount; r++) {
    const rPrev = Math.max(0, r - 1);
    const rNext = Math.min(rowCount - 1, r + 1);
    for (let c = 0; c < colCount; c++) {
      const cPrev = Math.max(0, c - 1);
      const cNext = Math.min(colCount - 1, c + 1);
      const du = sub(rows[r][cNext], rows[r][cPrev]);
      const dv = sub(rows[rNext][c], rows[rPrev][c]);
      const rawN = cross(du, dv);
      const len = Math.hypot(rawN[0], rawN[1], rawN[2]);
      const normal: Vec3 =
        len > 1e-6 ? [rawN[0] / len, rawN[1] / len, rawN[2] / len] : [0, 1, 0];
      const extra: readonly [number, number] | undefined = mapped
        ? [c / (colCount - 1), r / (rowCount - 1)]
        : paint.extra;
      corner(mesh, rows[r][c], normal, paint, extra);
    }
  }

  for (let r = 0; r < rowCount - 1; r++) {
    for (let c = 0; c < colCount - 1; c++) {
      const p00 = first + r * colCount + c;
      const p01 = p00 + 1;
      const p10 = p00 + colCount;
      const p11 = p10 + 1;
      triangle(mesh, p00, p01, p11);
      triangle(mesh, p00, p11, p10);
    }
  }
}

export type CushionOptions = {
  /** Edge rounding radius. */
  bevel: number;
  /** Upward plush crown on the top face (negative sinks the middle). */
  crownY?: number;
  /** Subtle extra dip in the very centre of the top face (sat-in couch seat). */
  sinkY?: number;
  /** Outward plush bulge on the front (-z) face (for reclined back cushions). */
  crownFront?: number;
  /** Recessed button-tuft dimples on the front (-z) face, in [-1, 1] x [-1, 1]. */
  tufts?: readonly (readonly [number, number])[];
  /** Grid subdivisions along x, y, z (defaults to [6, 3, 6]). */
  steps?: readonly [number, number, number];
};

/**
 * A plush, bevel-edged upholstered cushion or tufted mattress, built as six
 * seamlessly stitched grids projected onto a rounded box with soft crowning
 * and optional 3D recessed tuft dimples.
 */
export function addCushion(
  mesh: Mesh,
  min: Vec3,
  max: Vec3,
  options: CushionOptions,
  paint: Paint,
): void {
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;
  const hx = (max[0] - min[0]) / 2;
  const hy = (max[1] - min[1]) / 2;
  const hz = (max[2] - min[2]) / 2;
  const bevel = Math.min(options.bevel, hx * 0.85, hy * 0.85, hz * 0.85);
  const ix = hx - bevel;
  const iy = hy - bevel;
  const iz = hz - bevel;
  const crownY = options.crownY ?? 0;
  const sinkY = options.sinkY ?? 0;
  const crownFront = options.crownFront ?? 0;
  const tufts = options.tufts ?? [];
  const [sx, sy, sz] = options.steps ?? [6, 3, 6];

  const evalPos = (qx: number, qy: number, qz: number): Vec3 => {
    const kx = Math.max(-ix, Math.min(ix, qx));
    const ky = Math.max(-iy, Math.min(iy, qy));
    const kz = Math.max(-iz, Math.min(iz, qz));
    const dx = qx - kx;
    const dy = qy - ky;
    const dz = qz - kz;
    const len = Math.hypot(dx, dy, dz);
    const s = len > 1e-6 ? bevel / len : 0;
    const px = kx + dx * s;
    let py = ky + dy * s;
    let pz = kz + dz * s;

    const nx = qx / hx;
    const ny = qy / hy;
    const nz = qz / hz;

    if (py > 0 && (crownY !== 0 || sinkY !== 0)) {
      const dome = Math.max(0, 1 - nx * nx) * Math.max(0, 1 - nz * nz);
      const topMask = Math.max(0, py / hy);
      py += crownY * dome * topMask;
      if (sinkY !== 0) {
        const seat = Math.exp(-(nx * nx * 2.6 + nz * nz * 2.2));
        py += sinkY * seat * topMask;
      }
    }

    if (pz < 0 && (crownFront !== 0 || tufts.length > 0)) {
      const frontMask = Math.max(0, -pz / hz);
      const dome = Math.max(0, 1 - nx * nx) * Math.max(0, 1 - ny * ny);
      pz -= crownFront * dome * frontMask;
      for (const [tx, ty] of tufts) {
        const ux = nx - tx;
        const uy = ny - ty;
        const dimple = Math.exp(-(ux * ux * 16 + uy * uy * 14));
        pz += 12 * dimple * frontMask;
      }
    }

    return [cx + px, cy + py, cz + pz];
  };

  /** S-clustered parameter in [-1, 1] for extra smoothness along the bevels. */
  const axis = (n: number): number[] => {
    const out: number[] = [];
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * 2 - 1;
      out.push(Math.sign(t) * Math.pow(Math.abs(t), 0.85));
    }
    return out;
  };
  const ax = axis(sx);
  const ay = axis(sy);
  const az = axis(sz);

  // Top (+y): col = +x, row = -z
  addSurface(
    mesh,
    [...az].reverse().map((z) => ax.map((x) => evalPos(x * hx, hy, z * hz))),
    paint,
  );
  // Bottom (-y): col = +x, row = +z
  addSurface(
    mesh,
    az.map((z) => ax.map((x) => evalPos(x * hx, -hy, z * hz))),
    paint,
  );
  // Front (+z): col = +x, row = +y
  addSurface(
    mesh,
    ay.map((y) => ax.map((x) => evalPos(x * hx, y * hy, hz))),
    paint,
  );
  // Back (-z): col = -x, row = +y
  addSurface(
    mesh,
    ay.map((y) => [...ax].reverse().map((x) => evalPos(x * hx, y * hy, -hz))),
    paint,
  );
  // Right (+x): col = -z, row = +y
  addSurface(
    mesh,
    ay.map((y) => [...az].reverse().map((z) => evalPos(hx, y * hy, z * hz))),
    paint,
  );
  // Left (-x): col = +z, row = +y
  addSurface(
    mesh,
    ay.map((y) => az.map((z) => evalPos(-hx, y * hy, z * hz))),
    paint,
  );
}

/**
 * A plump sculpted pillow centered at the origin (`width` along x, `height`
 * along y, `thickness` along z), with soft pinched corners and optional
 * stitched perimeter piping.
 */
export function addPillow(
  mesh: Mesh,
  width: number,
  height: number,
  thickness: number,
  paint: Paint,
  piping?: Paint,
): void {
  const cols = 8;
  const rows = 6;
  const halfW = width / 2;
  const halfH = height / 2;
  const halfT = thickness / 2;

  const pointAt = (u: number, v: number, side: 1 | -1): Vec3 => {
    const cx = Math.cos((u * Math.PI) / 2);
    const cy = Math.cos((v * Math.PI) / 2);
    const puff = Math.pow(Math.max(cx * cy, 0), 0.54);
    const earX = 1 + 0.045 * v * v;
    const earY = 1 + 0.045 * u * u;
    // Slight gentle pinch across the middle so the pillow looks casually slumped.
    const crease = 1 - 0.06 * Math.exp(-(u * u * 3.5 + v * v * 3.5));
    return [u * halfW * earX, v * halfH * earY, side * halfT * puff * crease];
  };

  const front: Vec3[][] = [];
  const back: Vec3[][] = [];
  for (let r = 0; r <= rows; r++) {
    const v = (r / rows) * 2 - 1;
    const rowFront: Vec3[] = [];
    const rowBack: Vec3[] = [];
    for (let c = 0; c <= cols; c++) {
      const u = (c / cols) * 2 - 1;
      rowFront.push(pointAt(u, v, 1));
      rowBack.push(pointAt(-u, v, -1));
    }
    front.push(rowFront);
    back.push(rowBack);
  }
  addSurface(mesh, front, paint);
  addSurface(mesh, back, paint);

  if (piping !== undefined) {
    const ring: Vec3[] = [];
    for (let c = 0; c < cols; c++)
      ring.push(pointAt((c / cols) * 2 - 1, -1, 1));
    for (let r = 0; r < rows; r++) ring.push(pointAt(1, (r / rows) * 2 - 1, 1));
    for (let c = cols; c > 0; c--) ring.push(pointAt((c / cols) * 2 - 1, 1, 1));
    for (let r = rows; r > 0; r--)
      ring.push(pointAt(-1, (r / rows) * 2 - 1, 1));
    ring.push(ring[0]);
    const radii = ring.map(() => Math.max(2.2, thickness * 0.065));
    addTube(mesh, ring, radii, piping, 6, true);
  }
}

/**
 * A smooth multi-segment curved pipe along `points` with per-point `radii`.
 * Used for curved kettle spouts, arched handles, stove legs, and pillow welts.
 */
export function addTube(
  mesh: Mesh,
  points: readonly Vec3[],
  radii: readonly number[],
  paint: Paint,
  sides = 8,
  closed = false,
): void {
  const count = points.length;
  if (count < 2) return;

  const first = mesh.vertexCount;
  let prevU: Vec3 | null = null;
  for (let i = 0; i < count; i++) {
    const pPrev = points[Math.max(0, i - 1)];
    const pNext = points[Math.min(count - 1, i + 1)];
    const tangent = normalize(sub(pNext, pPrev));
    let u: Vec3;
    let v: Vec3;
    if (prevU === null) {
      [u, v] = sidesOf(tangent);
    } else {
      // Parallel-transport frame along the curve so the tube never twists.
      const dotTU =
        prevU[0] * tangent[0] + prevU[1] * tangent[1] + prevU[2] * tangent[2];
      const projected = sub(prevU, scale(tangent, dotTU));
      const len = Math.hypot(projected[0], projected[1], projected[2]);
      u = len > 1e-4 ? scale(projected, 1 / len) : sidesOf(tangent)[0];
      v = cross(tangent, u);
    }
    prevU = u;
    const r = radii[i] ?? radii[radii.length - 1];
    for (let j = 0; j < sides; j++) {
      const turn = (j / sides) * Math.PI * 2;
      const out = add(scale(u, Math.cos(turn)), scale(v, Math.sin(turn)));
      corner(mesh, add(points[i], scale(out, r)), out, paint);
    }
  }

  for (let i = 0; i < count - 1; i++) {
    for (let j = 0; j < sides; j++) {
      const next = (j + 1) % sides;
      const p = first + i * sides + j;
      const q = first + i * sides + next;
      triangle(mesh, p, q, p + sides);
      triangle(mesh, q, q + sides, p + sides);
    }
  }

  if (!closed) {
    // Cap start and end cleanly.
    const startDir = scale(normalize(sub(points[1], points[0])), -1);
    const endDir = normalize(sub(points[count - 1], points[count - 2]));
    const caps: readonly (readonly [number, Vec3, boolean])[] = [
      [0, startDir, true],
      [count - 1, endDir, false],
    ];
    for (const [idx, normal, flip] of caps) {
      const center = corner(mesh, points[idx], normal, paint);
      const ringStart = first + idx * sides;
      for (let j = 0; j < sides; j++) {
        const a = ringStart + j;
        const b = ringStart + ((j + 1) % sides);
        if (flip) triangle(mesh, center, b, a);
        else triangle(mesh, center, a, b);
      }
    }
  }
}

/**
 * A flat outline in the x-y plane pulled back from `z1` to `z0`, closed at
 * the back. The outline is given going round, and must bulge outwards
 * everywhere. The phone's body is one of these.
 */
export function addSlab(
  mesh: Mesh,
  outline: readonly (readonly [number, number])[],
  z0: number,
  z1: number,
  paint: Paint,
): void {
  const count = outline.length;
  for (let i = 0; i < count; i++) {
    const [x0, y0] = outline[i];
    const [x1, y1] = outline[(i + 1) % count];
    addQuad(
      mesh,
      [x0, y0, z1],
      [x0, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      paint,
    );
  }
  const back: Vec3 = [0, 0, -1];
  const first = mesh.vertexCount;
  for (const [x, y] of outline) corner(mesh, [x, y, z0], back, paint);
  for (let i = 1; i < count - 1; i++) {
    triangle(mesh, first, first + i + 1, first + i);
  }
}
