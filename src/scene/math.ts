/* The little vector maths the hut needs. Everything is measured the way
   WebGL does it: right is +x, up is +y, and +z comes towards you. */

/** A point or a direction. */
export type Vec3 = readonly [number, number, number];

/** A 4x4 transform, column by column: the order WebGL and CSS matrix3d()
    both take. */
export type Mat4 = readonly number[];

export const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function radians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** 0 below `from`, 1 above `to`, and a soft S-curve between. */
export function smoothstep(from: number, to: number, value: number): number {
  const t = clamp((value - from) / (to - from), 0, 1);
  return t * t * (3 - 2 * t);
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, by: number): Vec3 {
  return [a[0] * by, a[1] * by, a[2] * by];
}

export function mix(a: Vec3, b: Vec3, amount: number): Vec3 {
  return [
    lerp(a[0], b[0], amount),
    lerp(a[1], b[1], amount),
    lerp(a[2], b[2], amount),
  ];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

/** The same direction, one unit long. A zero vector points up. */
export function normalize(a: Vec3): Vec3 {
  const size = length(a);
  return size < 1e-9 ? [0, 1, 0] : scale(a, 1 / size);
}

/** Applies `b` first, then `a`. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

export function translation(by: Vec3): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, by[0], by[1], by[2], 1];
}

export function scaling(x: number, y: number, z: number): Mat4 {
  return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1];
}

/** Turns around the x axis: a positive angle tips "up" towards you. */
export function rotationX(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1];
}

/** Turns around the y axis: a positive angle swings "towards you" to the right. */
export function rotationY(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1];
}

/** Turns around the z axis: a positive angle swings "right" upwards. */
export function rotationZ(angle: number): Mat4 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/**
 * What a camera at the origin looking down -z sees. `focal` is how far the
 * picture plane is from the eye, in half picture heights.
 */
export function perspective(
  focal: number,
  aspect: number,
  near: number,
  far: number,
): Mat4 {
  const depth = 1 / (near - far);
  return [
    focal / aspect,
    0,
    0,
    0,
    0,
    focal,
    0,
    0,
    0,
    0,
    (far + near) * depth,
    -1,
    0,
    0,
    2 * far * near * depth,
    0,
  ];
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/** Like transformPoint, but for a direction: it turns and is not moved. */
export function transformDirection(m: Mat4, d: Vec3): Vec3 {
  return [
    m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
    m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
    m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
  ];
}

/** "#ff8a00" as red, green and blue from 0 to 1. Black if it is not a
    six-digit hex colour. */
export function colorOf(hex: string): Vec3 {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (match === null) return [0, 0, 0];
  const value = Number.parseInt(match[1], 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}
