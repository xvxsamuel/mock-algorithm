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
): void {
  const rows = BANDS * 2;
  const first = mesh.vertexCount;
  for (let i = 0; i <= rows; i++) {
    const tilt = Math.PI * (i / rows);
    for (let j = 0; j < AROUND; j++) {
      const turn = (j / AROUND) * Math.PI * 2;
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
    for (let j = 0; j < AROUND; j++) {
      const next = (j + 1) % AROUND;
      const p = first + i * AROUND + j;
      const q = first + i * AROUND + next;
      triangle(mesh, p, q, p + AROUND);
      triangle(mesh, q, q + AROUND, p + AROUND);
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
): void {
  const up: Vec3 = [0, 1, 0];
  const lid = add(base, [0, height, 0]);
  const slope = (r0 - r1) / height;
  const first = mesh.vertexCount;
  for (let j = 0; j < AROUND; j++) {
    const turn = (j / AROUND) * Math.PI * 2;
    const out: Vec3 = [Math.cos(turn), 0, Math.sin(turn)];
    const normal = normalize([out[0], slope, out[2]]);
    corner(mesh, add(base, scale(out, r0)), normal, paint);
    corner(mesh, add(lid, scale(out, r1)), normal, paint);
  }
  for (let j = 0; j < AROUND; j++) {
    const p = first + j * 2;
    const q = first + ((j + 1) % AROUND) * 2;
    triangle(mesh, p, q, p + 1);
    triangle(mesh, q, q + 1, p + 1);
  }
  for (const [center, radius, normal, coat] of [
    [lid, r1, up, top],
    [base, r0, scale(up, -1), paint],
  ] as const) {
    const middle = corner(mesh, center, normal, coat);
    const rim = mesh.vertexCount;
    for (let j = 0; j < AROUND; j++) {
      const turn = (j / AROUND) * Math.PI * 2;
      corner(
        mesh,
        add(center, [Math.cos(turn) * radius, 0, Math.sin(turn) * radius]),
        normal,
        coat,
      );
    }
    for (let j = 0; j < AROUND; j++) {
      triangle(mesh, middle, rim + j, rim + ((j + 1) % AROUND));
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
