import { SHADOW_CASTERS } from "./layout";

/* The programs the graphics card runs: one colours the hut, one turns that
   picture into the one you see. They are written in GLSL, the language WebGL
   takes them in.

   The hut looks like a game on an old console from start to finish: a small
   picture shown in big pixels, patterns made of coarse squares, corners that
   jump from pixel to pixel, and too few colours, with dots to make up the
   ones between. Decay does not change that look. It only makes the picture
   darker, greyer and dirtier. */

/** What a surface is made of. A corner of a mesh carries one of these, and
    the hut shader paints it accordingly. */
export const MATERIAL = {
  /** Its own colour, lit. */
  plain: 0,
  /** Painted boards. The first extra number says which wall it is. */
  wall: 1,
  floor: 2,
  roof: 3,
  /** Bare wood in its own colour. */
  wood: 4,
  /** The first extra number is how far the hand has turned (0 to 1). */
  skin: 5,
  /** The view outside. The extra numbers run 0 to 1 across it. */
  sky: 6,
  /** The front of the phone: a dark rim around a hole in the picture. */
  screen: 7,
  /** The window panes, which gather dirt. */
  glass: 8,
  /** A cobweb in a corner. The extra numbers run 0 to 1 from the corner. */
  web: 9,
  /** The extra numbers run 0 to 1 across it, for these two as well. */
  rug: 10,
  picture: 11,
  /** Black, whatever the light: what is behind the door. */
  dark: 12,
  /** Its own colour, which dust settles on. */
  dusty: 13,
  /** The fire in the stove. The extra numbers run 0 to 1 across it. */
  fire: 14,
  /** Its own colour, lit, for something thin that lies flat on something
      else: a scratch in the wall, a hand on the clock's face. */
  mark: 15,
  /** Glass. You see its edges, where you look along it. Through the rest
      you see what is in it, the way an old console did it: most of its
      pixels are left out. */
  jar: 16,
  /** The CRT television screen: samples the live news broadcast texture. */
  tv: 17,
  /** Self-lit indicator light (camera recording LED, TV power light). */
  led: 18,
  /** Woven cloth: extra.x = 0 corduroy, 1 chunky knit, 2 woven linen. */
  fabric: 19,
  /** Patchwork diamond-stitched cabin quilt draped over the bed. */
  quilt: 20,
  /** Running-bond kiln-fired brick & mortar (stove chimney breast). */
  brick: 21,
  /** Stone/ceramic tile: extra.x = 0 slate/terracotta hearth, 1 glazed backsplash. */
  tile: 22,
  /** Brushed/hammered metal: extra.x = 0 cast iron, 1 brass/copper, 2 enamel. */
  metal: 23,
} as const;

const MATERIAL_NAMES = Object.entries(MATERIAL)
  .map(([name, id]) => `const int M_${name.toUpperCase()} = ${id};`)
  .join("\n");

/** The shadow casters as GLSL constants: each box's lowest and highest
    corner. */
const glslVec3 = (v: readonly number[]) =>
  `vec3(${v.map((n) => n.toFixed(1)).join(", ")})`;
const CASTERS = `const int CASTERS = ${SHADOW_CASTERS.length};
const vec3 CASTER_MIN[${SHADOW_CASTERS.length}] = vec3[](${SHADOW_CASTERS.map(([min]) => glslVec3(min)).join(", ")});
const vec3 CASTER_MAX[${SHADOW_CASTERS.length}] = vec3[](${SHADOW_CASTERS.map(([, max]) => glslVec3(max)).join(", ")});`;

export const HUT_VERTEX = `#version 300 es
${MATERIAL_NAMES}

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in float aMaterial;
layout(location = 4) in vec2 aExtra;

uniform mat4 uCamera;
uniform mat4 uModel;
// Half the picture's size in pixels. Corners jump to whole pixels, so the
// hut wobbles a little as you look around. 0: they stay where they are.
uniform vec2 uSnap;

// How far the things that lie flat on something else are drawn in front of
// where they are. The further away they are, the more it comes to: about a
// hand's width at the far wall, and nothing you could measure in your hand.
const float PULL = 0.00025;

out vec3 vWorld;
out vec3 vLocal;
out vec3 vNormal;
out vec3 vColor;
out vec2 vExtra;
flat out int vMaterial;

void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vLocal = aPosition;
  vNormal = mat3(uModel) * aNormal;
  vColor = aColor;
  vExtra = aExtra;
  vMaterial = int(aMaterial + 0.5);
  vec4 at = uCamera * world;
  if (uSnap.x > 0.0 && abs(at.w) > 0.0001) {
    at.xy = round(at.xy / at.w * uSnap) / uSnap * at.w;
  }
  // A rug on the floor, a picture in its frame, a scratch in the wall: each
  // lies a hair in front of what it is on. Their corners jump to different
  // pixels than the corners of what is behind them, and that is enough to
  // put parts of them behind it, in patches that change as you look around.
  // So they are drawn a little nearer to you than they are.
  if (
    vMaterial == M_RUG ||
    vMaterial == M_PICTURE ||
    vMaterial == M_MARK ||
    vMaterial == M_TV
  ) {
    at.z -= PULL * at.w;
  }
  gl_Position = at;
}
`;

export const HUT_FRAGMENT = `#version 300 es
precision highp float;

${MATERIAL_NAMES}
${CASTERS}

in vec3 vWorld;
in vec3 vLocal;
in vec3 vNormal;
in vec3 vColor;
in vec2 vExtra;
flat in int vMaterial;

uniform vec3 uEye;
// 0: the hut as you found it. 1: ruined.
uniform float uDecay;
// Light that reaches everywhere, light near the window, and the beam
// through it (with the direction it comes from).
uniform vec3 uAmbient;
uniform vec3 uSkyLight;
uniform vec3 uBeam;
uniform vec3 uBeamFrom;
// The window: left, bottom, right, top, and its middle.
uniform vec4 uWindow;
uniform vec3 uWindowAt;
uniform vec3 uSkyTop;
uniform vec3 uSkyLow;
uniform float uNight;
uniform float uLand;
// The phone's screen: where it is, which way it faces, the light it gives.
uniform vec3 uPhoneAt;
uniform vec3 uPhoneFacing;
uniform vec3 uGlow;
// Half the phone's width and height, the radius of its corners, and how
// far in from its edge the hole for the real screen starts.
uniform vec4 uPhoneSize;
// 1 for the phone and the hand that holds it, which are drawn in the
// phone's own space, and the way from there to the hut's.
uniform float uHeld;
uniform mat4 uModel;
// Half the hut's width, the height of its walls, half its depth.
uniform vec3 uRoom;
// How much the dark swallows what is far away.
uniform float uGloom;
// The fire in the stove: where it is, the light it gives, and how high it
// burns (1 to 0).
uniform vec3 uFireAt;
uniform vec3 uFire;
uniform float uFlame;
// The CRT television: its live broadcast texture, where it sits, which way
// it faces, and the flickering light it casts across the room.
uniform sampler2D uTvScreen;
uniform vec3 uTvAt;
uniform vec3 uTvFacing;
uniform vec3 uTvLight;
// How much dust hangs in the air for the light to catch.
uniform float uHaze;
// Seconds, for the flames and the dust.
uniform float uTime;

out vec4 outColor;

// --- Noise: the same "random" number for the same place, every time ---

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(cell), hash12(cell + vec2(1.0, 0.0)), u.x),
    mix(hash12(cell + vec2(0.0, 1.0)), hash12(cell + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

// The classic 4x4 pattern of dots, as a number from 0 to 1 for each pixel.
float pattern(ivec2 cell) {
  const float order[16] = float[16](
    0.0, 8.0, 2.0, 10.0,
    12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0,
    15.0, 7.0, 13.0, 5.0
  );
  return (order[(cell.x & 3) + (cell.y & 3) * 4] + 0.5) / 16.0;
}

// --- Coarse squares ---

// Every pattern below is worked out for the middle of a square this wide,
// not for the exact spot: that is what makes it look like a small picture
// stretched over a big wall.
const float TEXEL = 6.0;

vec2 texels(vec2 uv) {
  return (floor(uv / TEXEL) + 0.5) * TEXEL;
}

// The same with squares of another width.
vec2 texels(vec2 uv, float size) {
  return (floor(uv / size) + 0.5) * size;
}

// The floor's squares: finer, so the gaps between its boards stay thin.
const float FLOOR_TEXEL = 4.0;

// Shifted a little, so that no face of a box lies on the edge of a square.
vec3 texels(vec3 at) {
  return (floor((at + 3.1) / TEXEL) + 0.5) * TEXEL - 3.1;
}

// The same with cubes of another width.
vec3 texels(vec3 at, float size) {
  return (floor((at + 3.1) / size) + 0.5) * size - 3.1;
}

// The same for the two numbers that run 0 to 1 across a face.
vec2 squares(vec2 uv, vec2 count) {
  return (floor(uv * count) + 0.5) / count;
}

// Cloudy noise from 0 to 1: big shapes with smaller ones on top.
float fbm(vec2 p) {
  float sum = 0.0;
  float weight = 0.5;
  for (int i = 0; i < 4; i++) {
    sum += weight * noise(p);
    p = p * 2.03 + 17.7;
    weight *= 0.5;
  }
  return sum / 0.9375;
}

// --- Damp ---

// A water stain. Where field is above reach the surface is stained, with
// the dark tide line a real stain dries to at its edge, and soaked further
// in.
vec3 stained(vec3 color, float field, float reach, vec3 tint) {
  float stain = smoothstep(reach, reach + 0.1, field);
  float rim = smoothstep(reach - 0.014, reach + 0.004, field) *
    (1.0 - smoothstep(reach + 0.004, reach + 0.07, field));
  float soaked = smoothstep(reach + 0.16, reach + 0.36, field);
  color = mix(color, color * tint, stain * 0.85);
  color = mix(color, color * tint * 0.7, rim * 0.8);
  float value = dot(color, vec3(0.333));
  return mix(color, vec3(0.3, 0.31, 0.23) * (0.5 + 0.6 * value), soaked * 0.7);
}

// --- Materials ---

// The walls combine warm vertical beadboard wainscoting below the chair rail
// (DADO) with hand-troweled warm parchment lime plaster above. Damp creeps
// down from the roof and up from the floor, cracks form, and plaster flakes
// off to reveal raw timber lath and brick beneath.
const float DADO = 290.0;
const float BEAD = 52.0;

vec3 wallColor(vec2 uv, float id) {
  float blot = fbm(uv * 0.0032 + id * 9.1);
  float drip = fbm(vec2(uv.x * 0.018, uv.y * 0.0016) + id * 3.7);
  float high = smoothstep(280.0, 980.0, uv.y);
  float low = 1.0 - smoothstep(0.0, 290.0, uv.y);
  float field = blot * 0.62 + drip * 0.38 + high * 0.3 + low * 0.34;
  float reach = mix(1.18, 0.4, uDecay);

  if (uv.y < DADO) {
    // Painted vertical sage-putty beadboard wainscoting.
    float col = floor(uv.x / BEAD);
    float fx = fract(uv.x / BEAD);
    float board = hash12(vec2(col, id + 3.0));
    float grain = fbm(vec2(uv.x * 0.11, uv.y * 0.007) + board * 27.0);
    vec3 sage = mix(vec3(0.57, 0.63, 0.56), vec3(0.49, 0.55, 0.49), grain) *
      (0.93 + 0.12 * board);
    float groove = 1.0 - smoothstep(0.0, 0.09, min(fx, 1.0 - fx));
    sage = mix(sage, sage * 0.56, groove * 0.85);
    vec3 color = stained(sage, field, reach, vec3(0.7, 0.64, 0.5));
    // Peeling paint reveals bare pine beneath as decay deepens.
    float chip = fbm(uv * 0.016 + 19.0 + id * 4.0) * 0.72 + low * 0.45;
    float chipAt = mix(1.32, 0.72, smoothstep(0.28, 1.0, uDecay));
    float peel = smoothstep(chipAt, chipAt + 0.04, chip);
    vec3 rawPine = mix(vec3(0.46, 0.33, 0.21), vec3(0.32, 0.22, 0.14), grain);
    color = mix(color, rawPine, peel * 0.85);
    return color * (1.0 - 0.2 * uDecay);
  }

  // Hand-troweled warm parchment lime plaster on the upper walls.
  float sweep = fbm(vec2(uv.x * 0.007 + sin(uv.y * 0.012) * 0.4, uv.y * 0.009) + id * 11.3);
  float grit = noise(uv * 0.085 + id * 5.0);
  vec3 plaster = vec3(0.92, 0.89, 0.82) * (0.93 + 0.09 * sweep) * (0.96 + 0.06 * grit);
  vec3 color = stained(plaster, field, reach, vec3(0.79, 0.67, 0.47));

  // Mould, in the wettest parts.
  float soaked = smoothstep(reach + 0.16, reach + 0.36, field);
  float speck = smoothstep(0.58, 0.78, noise(uv * 0.085 + 5.0)) *
    smoothstep(0.3, 0.6, noise(uv * 0.013 + 2.0));
  color = mix(color, vec3(0.06, 0.08, 0.05), speck * soaked * 0.85);

  // Hairline plaster cracks creeping down from the eave as decay worsens.
  float crackLine = abs(noise(vec2(uv.x * 0.014, uv.y * 0.006) + id * 6.1) - 0.5);
  float crack = (1.0 - smoothstep(0.0, 0.016, crackLine)) *
    smoothstep(0.25, 0.85, uDecay) * smoothstep(340.0, 760.0, uv.y);
  color = mix(color, vec3(0.24, 0.2, 0.17), crack * 0.7);

  // Flaking plaster exposes weathered brick & dark timber lath underneath.
  float flake = fbm(uv * 0.0105 + 31.0 + id * 2.0) * 0.75 + field * 0.35;
  float peelAt = mix(1.3, 0.6, smoothstep(0.22, 1.0, uDecay));
  float peel = smoothstep(peelAt, peelAt + 0.02, flake);
  float lip = smoothstep(peelAt - 0.035, peelAt, flake) * (1.0 - peel);
  float lathRow = fract(uv.y / 22.0);
  vec3 lath = mix(vec3(0.45, 0.28, 0.19), vec3(0.28, 0.18, 0.13), step(0.74, lathRow));
  lath = mix(lath, vec3(0.22, 0.2, 0.18), uDecay * 0.55);
  color = mix(color * (1.0 - 0.34 * lip), lath, peel);
  return color * (1.0 - 0.2 * uDecay);
}

// Crisp stepped relief normal: vertical bevelled beadboards below the chair
// rail, gentle hand-trowelled plaster undulations above.
vec3 wallNormal(vec3 face, vec2 uv, float id) {
  vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), face));
  if (uv.y < DADO) {
    float fx = fract(uv.x / BEAD) * 2.0 - 1.0;
    float bevel = clamp((abs(fx) - 0.74) / 0.26, 0.0, 1.0) * sign(fx) * 0.42;
    bevel = floor(bevel * 4.0 + 0.5) / 4.0;
    return normalize(face + tangent * bevel);
  }
  float n1 = noise(uv * 0.016 + id * 7.3) - 0.5;
  float n2 = noise(uv * 0.016 + vec2(4.2, 8.9) + id * 3.1) - 0.5;
  return normalize(face + tangent * (n1 * 0.14) + vec3(0.0, n2 * 0.14, 0.0));
}

// Subtle architectural ambient shade under the chair rail and roofline.
float wallShade(vec2 uv) {
  if (uv.y < DADO) {
    float underRail = mix(1.0, 0.76, smoothstep(DADO - 28.0, DADO, uv.y));
    return underRail;
  }
  float underEave = mix(1.0, 0.84, smoothstep(825.0, 900.0, uv.y));
  return underEave;
}

// Wide staggered honey-walnut floorboards with end-pegs and worn patina.
vec3 floorColor(vec2 uv) {
  float board = uv.x / 116.0;
  float column = floor(board);
  float fx = fract(board);
  float along = uv.y / 820.0 + hash12(vec2(column, 4.0)) * 5.0;
  float fz = fract(along);
  float piece = hash12(vec2(column, floor(along)));
  float seam = min(fx * 116.0, fz * 820.0);
  float swirl = sin(uv.y * 0.012 + fbm(vec2(uv.x * 0.03, uv.y * 0.005) + piece * 17.0) * 5.0) * 0.5 + 0.5;
  float grain = mix(fbm(vec2(uv.x * 0.09, uv.y * 0.0045) + piece * 50.0), swirl, 0.38);

  // Rich warm walnut & oiled honey oak: distinct from skin tones, glowing
  // warmly where sunlight and firelight fall.
  vec3 color = mix(vec3(0.46, 0.3, 0.17), vec3(0.28, 0.18, 0.1), grain) *
    (0.84 + 0.24 * piece);
  // Subtle wood dowel pegs near the butt joints of each plank.
  float nearEnd = step(fz * 820.0, 22.0) * step(8.0, fz * 820.0);
  float pegPos = min(abs(fx - 0.22), abs(fx - 0.78));
  float peg = nearEnd * (1.0 - step(0.055, pegPos));
  color = mix(color, vec3(0.14, 0.09, 0.05), peg * 0.7);

  // Slightly lighter honey sheen along the well-trodden living path.
  float path = 1.0 - smoothstep(140.0, 620.0, length(uv - vec2(40.0, -180.0)));
  float worn = smoothstep(0.62, 0.78, fbm(uv * 0.006 + piece * 7.0 + 30.0));
  color = mix(color, color * vec3(1.24, 1.18, 1.08), (worn * 0.5 + path * 0.22));

  float edge = min(uRoom.x - abs(uv.x), uRoom.z - abs(uv.y));
  float field = fbm(uv * 0.004 + 60.0) * 0.75 + (1.0 - smoothstep(0.0, 380.0, edge)) * 0.4;
  color = stained(color, field, mix(1.2, 0.36, uDecay), vec3(0.6, 0.53, 0.45));
  color = mix(color, vec3(0.42, 0.4, 0.37), uDecay * 0.45);
  float grit = step(0.95 - 0.1 * uDecay, hash12(floor(uv / TEXEL))) * uDecay;
  color = mix(color, vec3(0.12, 0.1, 0.08), grit * 0.6);

  // A thin dark line between boards: one fine square, wider as they shrink.
  float gap = step(seam, FLOOR_TEXEL * (1.0 + uDecay));
  return mix(color, vec3(0.08, 0.05, 0.03), gap * (0.55 + 0.3 * uDecay));
}

// The underside of the roof: warm cedar tongue-and-groove boards.
vec3 roofColor(vec2 uv) {
  float board = uv.y / 112.0;
  float fy = fract(board);
  float piece = hash12(vec2(floor(board), 8.0));
  float grain = fbm(vec2(uv.x * 0.005, uv.y * 0.1) + piece * 30.0);
  vec3 color = mix(vec3(0.68, 0.49, 0.31), vec3(0.5, 0.35, 0.21), grain) *
    (0.88 + 0.18 * piece);
  float field = fbm(uv * 0.004 + 20.0) * 0.8 + 0.25;
  color = stained(color, field, mix(1.15, 0.32, uDecay), vec3(0.55, 0.5, 0.42));
  float gap = step(fy * 112.0, TEXEL * (1.0 + uDecay));
  color = mix(color, vec3(0.1, 0.07, 0.05), gap * 0.65);
  return color * (1.0 - 0.25 * uDecay);
}

// Handcrafted wood in its own colour with flowing cathedral ring-grain.
vec3 woodColor(vec3 base, vec3 at) {
  float wave = fbm(vec2(at.x + at.z, at.y) * 0.015) * 6.0;
  float rings = sin((at.y * 0.08 + at.x * 0.03) + wave) * 0.5 + 0.5;
  float fine = fbm(vec2(at.x + at.z, at.y) * vec2(0.014, 0.12)) * 0.6 +
    fbm(vec2(at.y + at.z, at.x) * vec2(0.014, 0.12)) * 0.4;
  float grain = mix(fine, rings, 0.38);
  vec3 color = base * (0.8 + 0.36 * grain);
  float value = dot(color, vec3(0.333));
  return mix(color, vec3(value) * vec3(0.72, 0.7, 0.68), uDecay * 0.7);
}

// Rich woven Nordic / kilim geometric medallion tapestry with fringed ends.
vec3 rugColor(vec2 uv) {
  vec3 crimson = vec3(0.74, 0.21, 0.17);
  vec3 cream = vec3(0.94, 0.88, 0.74);
  vec3 indigo = vec3(0.15, 0.25, 0.45);
  vec3 gold = vec3(0.89, 0.68, 0.24);
  vec3 teal = vec3(0.22, 0.48, 0.47);

  // Braided cream fringe along top and bottom short edges.
  if (uv.y < 0.045 || uv.y > 0.955) {
    float tassel = step(0.45, fract(uv.x * 38.0));
    vec3 fringe = mix(cream * 0.78, cream, tassel);
    float fv = dot(fringe, vec3(0.333));
    return mix(fringe, vec3(fv) * vec3(0.78, 0.72, 0.64), uDecay * 0.75);
  }

  vec2 inner = vec2(uv.x, (uv.y - 0.045) / 0.91);
  vec2 fromMid = abs(inner - 0.5) * 2.0;
  float border = max(fromMid.x, fromMid.y);

  // Base terracotta-crimson field with repeating stepped diamond medallions.
  vec3 color = crimson;
  vec2 tile = vec2(fract(inner.x * 3.0) - 0.5, fract(inner.y * 2.0) - 0.5);
  float manhattan = abs(tile.x) + abs(tile.y);
  color = mix(color, indigo, 1.0 - step(0.34, manhattan));
  color = mix(color, cream, 1.0 - step(0.25, manhattan));
  color = mix(color, gold, 1.0 - step(0.17, manhattan));
  color = mix(color, teal, 1.0 - step(0.085, manhattan));

  // Stepped inner guard stripe and zigzag accent border.
  float zig = 0.73 + 0.025 * sign(fract((inner.x + inner.y) * 14.0) - 0.5);
  color = mix(color, cream, step(zig, border));
  color = mix(color, teal, step(0.79, border));
  color = mix(color, gold, step(0.84, border));
  color = mix(color, indigo, step(0.89, border));

  // Woven warp/weft yarn stipple.
  float weave = noise(uv * vec2(180.0, 90.0)) * 0.5 + noise(uv * vec2(90.0, 200.0)) * 0.5;
  color *= 0.88 + 0.18 * weave;

  // It fades and gathers dirt as time slips away.
  float value = dot(color, vec3(0.333));
  color = mix(color, vec3(value) * vec3(0.8, 0.74, 0.66), uDecay * 0.78);
  return stained(color, fbm(uv * 3.0 + 80.0), mix(1.2, 0.42, uDecay), vec3(0.6, 0.52, 0.42));
}

// Framed coastal lighthouse & pine headland painting on canvas.
vec3 pictureColor(vec2 uv) {
  // Golden-amber horizon grading into crisp coastal blue sky.
  vec3 sky = mix(vec3(1.0, 0.82, 0.52), vec3(0.26, 0.52, 0.84), smoothstep(0.38, 0.96, uv.y));
  float clouds = smoothstep(0.55, 0.78, fbm(vec2(uv.x * 4.5, uv.y * 9.0) + 2.3)) *
    smoothstep(0.5, 0.72, uv.y);
  vec3 color = mix(sky, vec3(0.98, 0.92, 0.82), clouds * 0.65);

  // Low afternoon sun above the water.
  float sun = length((uv - vec2(0.72, 0.64)) * vec2(1.3, 1.0));
  color = mix(color, vec3(1.0, 0.93, 0.56), 1.0 - smoothstep(0.085, 0.105, sun));

  // Deep teal-cobalt ocean with sunlit ripple streaks.
  if (uv.y < 0.44) {
    vec3 sea = mix(vec3(0.11, 0.24, 0.42), vec3(0.19, 0.44, 0.54), uv.y / 0.44);
    float glint = (1.0 - smoothstep(0.02, 0.16, abs(uv.x - 0.72))) *
      step(0.52, fract(uv.y * 28.0 + sin(uv.x * 18.0) * 0.25));
    color = mix(sea, vec3(0.98, 0.84, 0.46), glint * 0.75);
  }

  // Rocky pine headland on the left and a striped coastal lighthouse.
  float cliff = 0.46 - 0.22 * smoothstep(0.14, 0.52, uv.x) + 0.03 * sin(uv.x * 16.0);
  color = mix(color, vec3(0.22, 0.32, 0.24), step(uv.y, cliff) * step(uv.x, 0.54));
  float tower = step(abs(uv.x - 0.26), 0.034 - (uv.y - 0.46) * 0.04) *
    step(0.45, uv.y) * step(uv.y, 0.73);
  vec3 stripe = mod(floor(uv.y * 16.0), 2.0) < 0.5 ? vec3(0.94, 0.91, 0.84) : vec3(0.84, 0.24, 0.2);
  color = mix(color, stripe, tower);
  float beacon = 1.0 - smoothstep(0.02, 0.038, length(uv - vec2(0.26, 0.75)));
  color = mix(color, vec3(1.0, 0.94, 0.55), beacon);

  // Foreground dark pine ridge along the bottom.
  float fore = 0.18 + 0.06 * sin(uv.x * 8.0 + 1.4) + 0.03 * sin(uv.x * 26.0);
  color = mix(color, vec3(0.12, 0.22, 0.16), step(uv.y, fore));

  // Subtle canvas weave; yellows and fox-spots as time goes by.
  color *= 0.94 + 0.08 * noise(uv * 110.0);
  float value = dot(color, vec3(0.333));
  color = mix(color, vec3(value) * vec3(0.78, 0.66, 0.46), uDecay * 0.85);
  return stained(color, fbm(uv * 2.5 + 40.0) + 0.1, mix(1.25, 0.5, uDecay), vec3(0.6, 0.5, 0.36));
}

// Woven upholstery, chunky knit blankets, and textured linen curtains.
vec3 fabricColor(vec3 base, vec3 at, vec3 n, float kind) {
  vec2 raw = abs(n.y) > 0.5 ? at.xz : (abs(n.x) > 0.5 ? at.zy : at.xy);
  vec2 uv = texels(raw, 3.5);
  vec3 color = base;
  if (kind < 0.5) {
    // Wide-wale ribbed corduroy (red couch).
    float wale = 0.5 + 0.5 * sin(uv.x * 0.58 + noise(uv * 0.04) * 0.5);
    float nap = noise(uv * 0.24);
    color *= (0.84 + 0.22 * wale) * (0.93 + 0.12 * nap);
  } else if (kind < 1.5) {
    // Chunky herringbone / cable-knit throw blanket.
    float col = floor(uv.x / 14.0);
    float dir = mod(col, 2.0) < 0.5 ? 1.0 : -1.0;
    float chevron = abs(fract((uv.y + uv.x * dir) / 14.0) - 0.5) * 2.0;
    float wool = noise(uv * 0.32);
    color *= (0.83 + 0.24 * chevron) * (0.92 + 0.14 * wool);
  } else {
    // Slubbed woven linen (curtains, pillows, wool coat).
    float warp = noise(vec2(uv.x * 0.38, uv.y * 0.05));
    float weft = noise(vec2(uv.x * 0.05, uv.y * 0.38));
    color *= 0.88 + 0.18 * (warp * 0.55 + weft * 0.45);
  }
  float value = dot(color, vec3(0.333));
  return mix(color, vec3(value) * vec3(0.8, 0.75, 0.69), uDecay * 0.68);
}

// Patchwork diamond-stitched cabin quilt draped seamlessly over the bed.
vec3 quiltColor(vec3 at, vec3 n) {
  vec2 raw = abs(n.y) > 0.5
    ? at.xz
    : (abs(n.x) > 0.5
      ? vec2(at.x + (224.0 - at.y) * sign(n.x), at.z)
      : vec2(at.x, at.z + (224.0 - at.y) * sign(n.z)));
  vec2 uv = texels(raw, 4.5);

  const float BLOCK = 84.0;
  vec2 cell = floor(uv / BLOCK);
  vec2 f = fract(uv / BLOCK);

  // Structured Nordic-cabin patchwork palette so adjacent squares contrast cleanly.
  int parity = int(mod(cell.x + cell.y, 2.0) + 0.5);
  float pick = hash12(cell * 1.7 + 13.0);
  vec3 patchCol;
  if (parity == 0) {
    patchCol = pick < 0.42
      ? vec3(0.92, 0.87, 0.76)   // warm ivory linen
      : (pick < 0.74 ? vec3(0.87, 0.65, 0.24) : vec3(0.41, 0.57, 0.43)); // ochre / sage
  } else {
    patchCol = pick < 0.46
      ? vec3(0.22, 0.35, 0.52)   // faded denim indigo
      : (pick < 0.8 ? vec3(0.76, 0.31, 0.22) : vec3(0.3, 0.48, 0.46));   // rust / teal
  }

  // Tiny woven check inside each patch + stitched border seam.
  float linen = noise(uv * 0.22);
  patchCol *= 0.91 + 0.14 * linen;
  float seam = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  patchCol *= mix(0.74, 1.0, smoothstep(0.0, 0.055, seam));

  // Diagonal quilted diamond stitching & gentle loft puffing.
  float d1 = abs(fract((uv.x + uv.y) / 42.0) - 0.5) * 2.0;
  float d2 = abs(fract((uv.x - uv.y) / 42.0) - 0.5) * 2.0;
  float stitch = 1.0 - smoothstep(0.0, 0.11, min(d1, d2));
  float puff = 0.94 + 0.09 * min(d1, d2);
  vec3 color = patchCol * puff;
  color = mix(color, color * 0.72, stitch * 0.55);

  float value = dot(color, vec3(0.333));
  return mix(color, vec3(value) * vec3(0.8, 0.75, 0.68), uDecay * 0.68);
}

// Running-bond kiln-fired brick chimney breast & heat shield with soot patina.
vec3 brickColor(vec3 at, vec3 n) {
  vec2 raw = abs(n.x) > 0.5 ? at.zy : at.xy;
  vec2 uv = texels(raw, 4.5);
  const float BW = 58.0;
  const float BH = 25.0;
  float row = floor(uv.y / BH);
  float stagger = mod(row, 2.0) * 0.5;
  float col = floor(uv.x / BW + stagger);
  float fx = fract(uv.x / BW + stagger);
  float fy = fract(uv.y / BH);

  float mortar = step(fx * BW, 4.5) + step(fy * BH, 4.0);
  if (mortar > 0.5) {
    float grit = noise(uv * 0.18);
    vec3 lime = vec3(0.62, 0.58, 0.52) * (0.86 + 0.22 * grit);
    return lime * (1.0 - 0.28 * uDecay);
  }

  float id = hash12(vec2(col, row) + 5.1);
  float grain = fbm(uv * 0.06 + id * 23.0);
  vec3 clayA = vec3(0.66, 0.28, 0.19);
  vec3 clayB = vec3(0.5, 0.22, 0.16);
  vec3 clinker = vec3(0.32, 0.2, 0.17);
  vec3 color = mix(clayA, clayB, id);
  color = mix(color, clinker, step(0.82, id) * 0.65);
  color *= 0.85 + 0.26 * grain;

  // Subtle dark hearth soot rising on the masonry above the wood stove.
  float sootX = 1.0 - smoothstep(35.0, 125.0, abs(at.z + 480.0));
  float sootY = smoothstep(260.0, 440.0, at.y) * (1.0 - smoothstep(520.0, 760.0, at.y));
  color *= 1.0 - sootX * sootY * (0.32 + 0.25 * uDecay);
  float value = dot(color, vec3(0.333));
  return mix(color, vec3(value) * vec3(0.75, 0.72, 0.68), uDecay * 0.5);
}

vec3 brickNormal(vec3 face, vec3 at) {
  vec2 raw = abs(face.x) > 0.5 ? at.zy : at.xy;
  vec2 uv = texels(raw, 4.5);
  const float BH = 25.0;
  float fy = fract(uv.y / BH);
  float lip = fy < 0.2 ? -0.35 : (fy > 0.85 ? 0.28 : 0.0);
  return normalize(face + vec3(0.0, lip, 0.0));
}

// Stone hearth tiles (kind 0) and glazed ceramic kitchenette backsplash (kind 1).
vec3 tileColor(vec3 at, vec3 n, float kind) {
  vec2 raw = abs(n.y) > 0.5 ? at.xz : (abs(n.x) > 0.5 ? at.zy : at.xy);
  vec2 uv = texels(raw, 4.0);
  float size = kind < 0.5 ? 48.0 : 38.0;
  vec2 cell = floor(uv / size);
  vec2 f = fract(uv / size);
  float grout = step(f.x * size, 3.6) + step(f.y * size, 3.6);
  if (grout > 0.5) {
    return (kind < 0.5 ? vec3(0.24, 0.22, 0.2) : vec3(0.68, 0.65, 0.58)) * (1.0 - 0.25 * uDecay);
  }
  float checker = mod(cell.x + cell.y, 2.0);
  float speck = noise(uv * 0.15 + hash12(cell) * 19.0);
  vec3 color;
  if (kind < 0.5) {
    // Charcoal slate & warm quarry terracotta hearth tiles.
    vec3 slate = vec3(0.23, 0.25, 0.28) * (0.86 + 0.24 * speck);
    vec3 quarry = vec3(0.63, 0.32, 0.22) * (0.88 + 0.22 * speck);
    color = mix(slate, quarry, checker);
  } else {
    // Glazed cream & celadon-sage ceramic backsplash tiles.
    vec3 cream = vec3(0.92, 0.88, 0.79) * (0.93 + 0.1 * speck);
    vec3 sage = vec3(0.52, 0.68, 0.59) * (0.92 + 0.12 * speck);
    color = mix(cream, sage, checker);
    // Subtle kiln-glaze darkening around tile edges.
    float rim = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
    color *= mix(0.86, 1.0, smoothstep(0.0, 0.14, rim));
  }
  float value = dot(color, vec3(0.333));
  return mix(color, vec3(value) * vec3(0.78, 0.75, 0.7), uDecay * 0.55);
}

// Brushed cast iron, burnished brass/copper, or smooth glossy enamel.
vec3 metalColor(vec3 base, vec3 at, float kind) {
  vec3 p = texels(at, 4.0);
  float grain = noise(vec2(p.x + p.z, p.y * 1.4) * 0.14);
  float modAmt = kind < 0.5 ? 0.22 : (kind < 1.5 ? 0.16 : 0.08);
  vec3 color = base * (1.0 - modAmt * 0.5 + modAmt * grain);
  float value = dot(color, vec3(0.333));
  return mix(color, vec3(value) * vec3(0.76, 0.74, 0.72), uDecay * (kind < 1.5 ? 0.45 : 0.55));
}

// How much of a cobweb is at this spot: threads out from the corner, and
// sagging threads between them. It grows from the corner.
float webAt(vec2 uv) {
  float r = length(uv);
  float turn = atan(uv.y, uv.x) / 1.5708 * 6.0;
  float off = abs(fract(turn + 0.5) - 0.5);
  float spoke = off / 6.0 * 1.5708 * r;
  float sagged = r + 0.028 * (1.0 - 4.0 * off * off);
  float ring = abs(fract(sagged * 8.0 + 0.5) - 0.5) / 8.0;
  float thread = 1.0 - step(0.013, min(spoke, ring));
  float grown = smoothstep(0.2, 0.85, uDecay) * 1.02;
  return thread * step(r, grown) * step(0.03, r);
}

// What you see through the window. Nothing in it moves: it is only lit
// differently as the day goes.
vec3 skyColor(vec2 uv) {
  float up = clamp((uv.y - 0.22) / 0.78, 0.0, 1.0);
  vec3 color = mix(uSkyLow, uSkyTop, pow(up, 0.6));

  float cloud = smoothstep(0.5, 0.78, fbm(vec2(uv.x * 2.6, uv.y * 8.0) + 4.0)) *
    smoothstep(0.3, 0.5, uv.y);
  vec3 cloudColor = mix(uSkyLow * 1.1 + 0.05, vec3(1.0), (1.0 - uNight) * uLand * 0.85);
  color = mix(color, cloudColor, cloud * 0.8);

  vec2 grid = uv * 46.0;
  vec2 cell = floor(grid);
  vec2 inCell = fract(grid) - 0.5 - (vec2(hash12(cell + 7.0), hash12(cell + 19.0)) - 0.5) * 0.6;
  float star = step(0.9, hash12(cell)) * (1.0 - smoothstep(0.05, 0.16, length(inCell)));
  color += star * uNight * (1.0 - cloud) * up;
  float moon = 1.0 - smoothstep(0.036, 0.042, length(uv - vec2(0.6, 0.74)));
  color = mix(color, vec3(0.93, 0.94, 0.86), moon * uNight);

  // Two rows of hills, the near one with pines on it.
  float far = 0.285 + 0.03 * sin(uv.x * 7.0 + 1.0) + 0.02 * noise(vec2(uv.x * 9.0, 2.0));
  vec3 farColor = mix(vec3(0.4, 0.6, 0.42), uSkyLow, 0.4) * uLand;
  color = mix(color, farColor, 1.0 - smoothstep(far - 0.003, far + 0.003, uv.y));
  float trunk = uv.x * 30.0;
  float pine = max(0.5 - 2.0 * abs(fract(trunk) - 0.5), 0.0) *
    step(0.4, hash12(vec2(floor(trunk), 3.0))) * (0.05 + 0.05 * hash12(vec2(floor(trunk), 5.0)));
  float near = 0.215 + 0.03 * sin(uv.x * 4.3 + 4.0) + 0.02 * noise(vec2(uv.x * 14.0, 7.0)) + pine;
  vec3 nearColor = vec3(0.2, 0.42, 0.22) * uLand;
  color = mix(color, nearColor, 1.0 - smoothstep(near - 0.003, near + 0.003, uv.y));

  // Distant surveillance mast on the far ridge, blinking red as night deepens.
  if (uDecay > 0.28) {
    float mast = step(abs(uv.x - 0.27), 0.004) * step(0.27, uv.y) * step(uv.y, 0.47);
    color = mix(color, vec3(0.05, 0.06, 0.09), mast * 0.85);
    float beacon = 1.0 - smoothstep(0.008, 0.017, length(uv - vec2(0.27, 0.475)));
    float blink = mix(0.2, 1.0, step(0.55, fract(uTime * 0.55 + 0.3)));
    color += vec3(1.5, 0.14, 0.12) * beacon * blink * smoothstep(0.28, 0.65, uDecay);
  }
  return color;
}

// --- Light ---

// How much of the beam through the window reaches this spot: follow the
// light back to the wall and see whether it came through a pane. The edge
// of the patch is softer the further the light has travelled.
float beamAt(vec3 at) {
  float travelled = (uWindowAt.z - at.z) / uBeamFrom.z;
  if (travelled <= 0.0) return 0.0;
  vec2 hit = at.xy + uBeamFrom.xy * travelled;
  float soft = 3.0 + travelled * 0.014;
  float inside =
    smoothstep(uWindow.x - soft, uWindow.x + soft, hit.x) *
    (1.0 - smoothstep(uWindow.z - soft, uWindow.z + soft, hit.x)) *
    smoothstep(uWindow.y - soft, uWindow.y + soft, hit.y) *
    (1.0 - smoothstep(uWindow.w - soft, uWindow.w + soft, hit.y));
  // The two bars across the window.
  vec2 fromBar = abs(hit - uWindowAt.xy);
  float bars = smoothstep(9.0 - soft, 9.0 + soft, fromBar.x) *
    smoothstep(9.0 - soft, 9.0 + soft, fromBar.y);
  return inside * bars;
}

// The corners of the hut are darker, and darker still as it decays.
float cornerShade(vec3 at) {
  float a = uRoom.x - abs(at.x);
  float b = uRoom.z - abs(at.z);
  // On a wall or the floor, this is how far the nearest corner is.
  float edge = max(min(a, b), min(max(a, b), at.y));
  return mix(mix(0.56, 0.34, uDecay), 1.0, smoothstep(0.0, mix(260.0, 440.0, uDecay), edge));
}

// --- Shadows ---

// Whether the way from a spot towards a light runs into one of the shadow
// casters: 0 if it does, 1 if it gets through. A box does not shade itself.
float clearTowards(vec3 at, vec3 way, float far) {
  // Nudged off zero, so no part of the way divides by nothing.
  vec3 inverse = 1.0 / (way + vec3(1e-5));
  for (int i = 0; i < CASTERS; i++) {
    vec3 a = (CASTER_MIN[i] - at) * inverse;
    vec3 b = (CASTER_MAX[i] - at) * inverse;
    vec3 near = min(a, b);
    vec3 farther = max(a, b);
    float enter = max(max(near.x, near.y), near.z);
    float leave = min(min(farther.x, farther.y), farther.z);
    if (enter < leave && enter > 2.0 && enter < far) return 0.0;
  }
  return 1.0;
}

// The dark patch right under each caster, on the floor: hard edged, with a
// lighter rim, and fainter under what stands higher. 1 is no shadow.
float underShade(vec3 at) {
  if (at.y > 2.0) return 1.0;
  float shade = 1.0;
  for (int i = 0; i < CASTERS; i++) {
    float high = CASTER_MIN[i].y;
    float rim = 10.0 + high * 0.1;
    vec2 lo = CASTER_MIN[i].xz;
    vec2 hi = CASTER_MAX[i].xz;
    vec2 out2 = max(max(lo - at.xz, at.xz - hi), 0.0);
    float away = max(out2.x, out2.y);
    float dark = mix(0.3, 0.55, smoothstep(0.0, 400.0, high));
    if (away <= 0.0) shade = min(shade, dark);
    else if (away < rim) shade = min(shade, mix(dark, 1.0, 0.5));
  }
  return shade;
}

// Light on an object in three flat steps instead of a smooth fall-off, like
// a cel-shaded model.
float banded(float facing) {
  return floor(facing * 3.0 + 0.5) / 3.0;
}

// How much of the screen's light falls on the hand that holds the phone.
// The hand is too near for the screen to be one point: the light comes from
// the part of the screen nearest to the spot, a little way in from its
// edge. So the sides of the fingers that face the screen catch it, and
// what is behind the phone gets none.
float screenOn(vec3 normal) {
  vec2 lit = uPhoneSize.xy - 6.0;
  vec3 to = vec3(clamp(vLocal.xy, -lit, lit), 0.0) - vLocal;
  float far = length(to);
  vec3 way = mat3(uModel) * (to / far);
  float facing = max(dot(normal, way) * 0.75 + 0.25, 0.0);
  float inFront = smoothstep(-3.0, 0.5, vLocal.z);
  return 0.9 * facing * inFront / (1.0 + far * far / (15.0 * 15.0));
}

vec3 lightAt(vec3 at, vec3 normal, float shade, bool object) {
  vec3 toWindow = uWindowAt - at;
  float far = length(toWindow);
  vec3 window = toWindow / far;
  // Everything that stands between a spot and the window throws a hard,
  // dark shadow over it, darker than real on purpose, like the drawn
  // shadows of an old game. And right under each thing it is darker still.
  float open = clearTowards(at + normal * 2.0, window, far);
  shade *= mix(0.4, 1.0, open) * underShade(at);

  // On objects, sides and undersides are darker than real, so every shape
  // reads clearly. The walls keep their light.
  float up = object ? 0.58 + 0.42 * normal.y
    : vMaterial == M_WALL ? 0.7 + 0.3 * normal.y : 0.82 + 0.18 * normal.y;
  // Stylized chromatic shadows: cast shadows and deep corners cool toward a
  // graphic indigo-plum by day and a bruised midnight-teal as decay deepens,
  // instead of flattening into muddy grey.
  float shadowMask = clamp(1.0 - open * underShade(at), 0.0, 1.0);
  vec3 coolShadow = mix(
    vec3(0.76, 0.8, 1.14),
    vec3(0.68, 0.82, 1.12),
    uNight
  );
  vec3 ambientTint = mix(vec3(1.0), coolShadow, shadowMask * 0.65);
  vec3 light = uAmbient * ambientTint * up * shade;

  float facing = max(dot(normal, window), 0.0);
  if (object) facing = banded(facing);
  light += uSkyLight * facing * max(-window.z, 0.0) * shade /
    (1.0 + far * far / (650.0 * 650.0));

  // The sun's patch has sharp shadows cut out of it, with a subtle warm rim.
  float sun = beamAt(at);
  if (sun > 0.0) sun *= clearTowards(at + normal * 2.0, uBeamFrom, 4000.0);
  float sunFacing = max(dot(normal, uBeamFrom), 0.0);
  if (object) sunFacing = banded(sunFacing);
  light += uBeam * sunFacing * sun;

  // The screen lights what is in front of it.
  if (uHeld > 0.5) {
    light += uGlow * screenOn(normal);
  } else {
    vec3 toPhone = uPhoneAt - at;
    float reach = length(toPhone);
    vec3 phone = toPhone / reach;
    float inFront = smoothstep(-0.15, 0.5, dot(-phone, uPhoneFacing));
    light += uGlow * max(dot(normal, phone) * 0.75 + 0.25, 0.0) * inFront /
      (1.0 + reach * reach / (40.0 * 40.0));
  }

  // And your face, lit by the screen, lights a little of what you look at.
  vec3 toEye = uEye - at;
  float near = length(toEye);
  vec3 viewDir = toEye / max(near, 1.0);
  light += uGlow * 0.45 * max(dot(normal, viewDir), 0.0) /
    (1.0 + near * near / (140.0 * 140.0));

  // The stove, while it burns. Positioned along the left wall facing inward,
  // its warm firelight washes across the hearth, rug, couch, and bed foot.
  vec3 toFire = uFireAt - at;
  float fireFar = length(toFire);
  light += uFire * max(dot(normal, toFire / fireFar) * 0.7 + 0.3, 0.0) /
    (1.0 + fireFar * fireFar / (360.0 * 360.0));

  // The CRT television: casts real, hard-edged flickering shadows across the
  // furniture and walls as daylight and the fire fade out, plus a crisp cel
  // rim-light on silhouettes facing the broadcast glow.
  vec3 toTv = uTvAt - at;
  float tvFar = length(toTv);
  vec3 tvDir = toTv / max(tvFar, 1.0);
  float tvFront = smoothstep(-0.22, 0.42, dot(-tvDir, uTvFacing));
  float tvClear = tvFront > 0.01
    ? clearTowards(at + normal * 2.5, tvDir, max(tvFar - 22.0, 0.0))
    : 0.0;
  float tvFace = max(dot(normal, tvDir) * 0.8 + 0.2, 0.0);
  if (object) tvFace = mix(tvFace, banded(tvFace), 0.65);
  float tvRadius = mix(420.0, 780.0, smoothstep(0.0, 0.8, uNight));
  float tvReach = 1.0 / (1.0 + tvFar * tvFar / (tvRadius * tvRadius));
  float tvDirect = tvFace * tvFront * tvReach * mix(0.14, 1.65, tvClear);
  // Two-step graphic rim highlight on furniture and your hand from the TV glow,
  // emerging naturally as dusk and night take over the room.
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 2.4);
  float rimStep = step(0.42, fresnel) * 0.5 + step(0.7, fresnel) * 0.5;
  float tvRim = (object || vMaterial == M_SKIN)
    ? rimStep * tvFront * tvClear * tvReach * smoothstep(0.08, 0.75, uNight) * 0.72
    : 0.0;
  light += uTvLight * (tvDirect + tvRim + 0.14 * tvReach * shade);
  return light;
}

// The light you see hanging in the air: walk from your eyes to the spot you
// look at, and add up the dust that is in the beam on the way. Each pixel
// starts its walk at a slightly different step, which turns the stripes
// that few steps would give into dots.
const int SHAFT_STEPS = 20;

float shaftTo(vec3 at) {
  vec3 stride = (at - uEye) / float(SHAFT_STEPS);
  float first = pattern(ivec2(gl_FragCoord.xy));
  float sum = 0.0;
  for (int i = 0; i < SHAFT_STEPS; i++) {
    vec3 p = uEye + stride * (float(i) + first);
    float lit = beamAt(p);
    if (lit <= 0.0) continue;
    // The light comes through the pane in streaks, brighter and fainter by
    // where it came in, so that you see rays and not a fog.
    float travelled = (uWindowAt.z - p.z) / uBeamFrom.z;
    vec2 cameIn = p.xy + uBeamFrom.xy * travelled;
    float ray = 0.2 + 1.7 * smoothstep(0.25, 0.75, noise(cameIn * vec2(0.05, 0.032) + 7.0));
    // And single specks of dust in it, sinking slowly.
    float speck = step(0.9975, hash13(floor((p + vec3(0.0, uTime * 3.0, 0.0)) / 10.0)));
    sum += lit * (ray + speck * 5.0);
  }
  return sum * length(stride);
}

float roundedBox(vec2 p, vec2 size, float radius) {
  vec2 q = abs(p) - size + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

// The colour of this spot, lit, and how solid it is.
vec4 surface() {
  if (vMaterial == M_SKY) return vec4(skyColor(squares(vExtra, vec2(128.0))), 1.0);
  if (vMaterial == M_DARK) return vec4(0.0, 0.0, 0.0, 1.0);
  if (vMaterial == M_TV) {
    vec2 uv = vec2(vExtra.x, 1.0 - vExtra.y);
    vec3 img = texture(uTvScreen, uv).rgb;
    vec2 edge = abs(uv - 0.5) * 2.0;
    float bezel = 1.0 - smoothstep(0.84, 1.03, max(edge.x, edge.y));
    // Alpha 0.72 flags visible, unoccluded CRT glass for the full-resolution
    // readable TV pass while still contributing its bright glow to room bloom.
    return vec4(img * (0.35 + 0.85 * bezel) * 1.15, 0.72);
  }
  if (vMaterial == M_LED) {
    float pulse = vExtra.x > 0.5
      ? mix(0.18, 1.0, step(0.45, fract(uTime * 0.85)))
      : 0.9;
    return vec4(vColor * pulse, 1.0);
  }
  if (vMaterial == M_FIRE) {
    vec2 uv = squares(vExtra, vec2(10.0));
    float flame = noise(vec2(uv.x * 4.0, uv.y * 3.0 - uTime * 1.6)) * (1.25 - uv.y);
    vec3 burning = mix(vec3(0.85, 0.2, 0.04), vec3(1.0, 0.86, 0.36), smoothstep(0.25, 0.7, flame));
    return vec4(mix(vec3(0.035, 0.03, 0.03), burning, uFlame), 1.0);
  }

  vec3 normal = normalize(vNormal);
  if (dot(normal, uEye - vWorld) < 0.0) normal = -normal;

  vec3 color = vColor;
  // Where the light is worked out for: on the big flat surfaces, for the
  // middle of a square, like their patterns.
  vec3 at = vWorld;
  float shade = 1.0;
  float alpha = 1.0;

  if (vMaterial == M_SCREEN) {
    color = vec3(0.1, 0.1, 0.11);
  } else if (vMaterial == M_WALL) {
    float id = vExtra.x;
    vec2 wallUv;
    if (mod(id, 2.0) > 0.5) {
      at.zy = texels(at.zy);
      wallUv = at.zy;
    } else {
      at.xy = texels(at.xy);
      wallUv = at.xy;
    }
    color = wallColor(wallUv, id);
    normal = wallNormal(normal, wallUv, id);
    shade = cornerShade(at) * wallShade(wallUv);
  } else if (vMaterial == M_FLOOR) {
    at.xz = texels(at.xz, FLOOR_TEXEL);
    color = floorColor(at.xz);
    shade = cornerShade(at);
  } else if (vMaterial == M_ROOF) {
    color = roofColor(texels(vec2(vWorld.z, abs(vWorld.x) * 1.147)));
    shade = mix(0.8, 0.5, uDecay);
  } else if (vMaterial == M_WOOD) {
    color = woodColor(vColor, texels(vLocal));
  } else if (vMaterial == M_FABRIC) {
    color = fabricColor(vColor, vLocal, normal, vExtra.x);
  } else if (vMaterial == M_QUILT) {
    color = quiltColor(vLocal, normal);
  } else if (vMaterial == M_BRICK) {
    color = brickColor(vLocal, normal);
    normal = brickNormal(normal, vLocal);
    shade = cornerShade(at);
  } else if (vMaterial == M_TILE) {
    color = tileColor(vLocal, normal, vExtra.x);
    shade = cornerShade(at);
  } else if (vMaterial == M_METAL) {
    color = metalColor(vColor, vLocal, vExtra.x);
  } else if (vMaterial == M_DUSTY) {
    float value = dot(color, vec3(0.333));
    color = mix(color, vec3(value) * vec3(0.8, 0.76, 0.7), uDecay * 0.65);
  } else if (vMaterial == M_SKIN) {
    // Flat faces, like a model with too few of them.
    normal = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    if (dot(normal, uEye - vWorld) < 0.0) normal = -normal;
    // Veins and blotches come up as the hand turns.
    float turned = vExtra.x;
    float vein = 1.0 - smoothstep(0.0, 0.06, abs(noise(vLocal.xy * 0.5 + vLocal.z * 0.3) - 0.5));
    color = mix(color, color * vec3(0.5, 0.55, 0.72), vein * turned * 0.6);
    float blotch = smoothstep(0.52, 0.75, fbm(vLocal.xy * 0.33 + 9.0));
    color = mix(color, color * vec3(0.62, 0.52, 0.5), blotch * turned * 0.7);
  } else if (vMaterial == M_RUG) {
    at.xz = texels(at.xz);
    color = rugColor(squares(vExtra, vec2(96.0, 80.0)));
    shade = cornerShade(at);
  } else if (vMaterial == M_PICTURE) {
    color = pictureColor(squares(vExtra, vec2(48.0, 36.0)));
  } else if (vMaterial == M_WEB) {
    if (webAt(squares(vExtra, vec2(48.0))) < 0.5) discard;
    color = vec3(0.86, 0.86, 0.84);
  } else if (vMaterial == M_JAR) {
    ivec2 pixel = ivec2(gl_FragCoord.xy);
    float along = abs(dot(normal, normalize(uEye - vWorld)));
    if (along > 0.5 && ((pixel.x | pixel.y) & 1) != 0) discard;
  } else if (vMaterial == M_GLASS) {
    // Dirt on the panes: most in the corners of each one.
    vec2 uv = squares(vExtra, vec2(44.0));
    vec2 pane = abs(fract(uv * 2.0) - 0.5) * 2.0;
    float corner = smoothstep(0.5, 1.0, max(pane.x, pane.y));
    float grime = fbm(uv * 5.0 + 12.0);
    alpha = clamp(0.03 + uDecay * (0.12 + 0.5 * grime + 0.3 * corner), 0.0, 0.85);
    color = vec3(0.5, 0.48, 0.42);
    normal = vec3(0.0, 0.0, 1.0);
  }

  // Your hand keeps its soft, warm light: it has to stand out.
  bool object = vMaterial == M_PLAIN || vMaterial == M_WOOD ||
    vMaterial == M_DUSTY || vMaterial == M_FABRIC ||
    vMaterial == M_QUILT || vMaterial == M_METAL;
  vec3 lit = color * lightAt(at, normal, shade, object);

  // Stylized two-step sheen on brushed metal, glazed tiles, and plush cloth.
  if (vMaterial == M_METAL || vMaterial == M_TILE) {
    vec3 viewDir = normalize(uEye - vWorld);
    vec3 hWin = normalize(normalize(uWindowAt - vWorld) + viewDir + vec3(0.0, 1e-4, 0.0));
    vec3 hFire = normalize(normalize(uFireAt - vWorld) + viewDir + vec3(0.0, 1e-4, 0.0));
    vec3 hTv = normalize(normalize(uTvAt - vWorld) + viewDir + vec3(0.0, 1e-4, 0.0));
    float power = vMaterial == M_TILE ? 18.0 : (vExtra.x < 0.5 ? 12.0 : 24.0);
    float strength = vMaterial == M_TILE ? 0.2 : (vExtra.x < 0.5 ? 0.28 : 0.62);
    float specWin = step(0.65, pow(max(dot(normal, hWin), 0.0001), power));
    float specFire = step(0.62, pow(max(dot(normal, hFire), 0.0001), power)) /
      (1.0 + dot(uFireAt - vWorld, uFireAt - vWorld) / (460.0 * 460.0));
    float specTv = step(0.64, pow(max(dot(normal, hTv), 0.0001), power)) /
      (1.0 + dot(uTvAt - vWorld, uTvAt - vWorld) / (760.0 * 760.0));
    vec3 specTint = mix(vec3(1.0), color + vec3(0.25), vMaterial == M_METAL ? 0.65 : 0.15);
    lit += specTint * strength * (
      uSkyLight * specWin * 0.75 +
      uFire * specFire * 1.1 +
      uTvLight * specTv * 0.65
    );
  } else if (vMaterial == M_FABRIC || vMaterial == M_QUILT) {
    // Soft plush velvet/wool wrap grazing sheen on upholstery and bedding.
    vec3 viewDir = normalize(uEye - vWorld);
    float graze = pow(max(1.0 - max(dot(normal, viewDir), 0.0), 0.0001), 2.8);
    lit += color * (uAmbient * 0.24 + uTvLight * 0.08) * step(0.52, graze) * 0.32;
  }

  lit *= mix(1.0, exp(-length(uEye - vWorld) * 0.00045), uGloom);
  return vec4(lit, alpha);
}

void main() {
  if (vMaterial == M_SCREEN) {
    float edge = roundedBox(vLocal.xy, uPhoneSize.xy, uPhoneSize.z);
    if (edge > 0.0) discard;
    // Nothing is drawn here: the real phone on the page shows through.
    if (edge < -uPhoneSize.w) {
      outColor = vec4(0.0);
      return;
    }
  }

  vec4 seen = surface();
  vec3 lit = seen.rgb;
  // The panes are see-through: the light in the air is on what is behind.
  if (vMaterial != M_GLASS && vMaterial != M_TV) {
    lit += uBeam * shaftTo(vWorld) * uHaze;
    // Faint dusty phosphor haze hanging in front of the CRT as night falls.
    vec3 seg = vWorld - uEye;
    float segLen = max(length(seg), 1.0);
    vec3 rayDir = seg / segLen;
    float proj = clamp(dot(uTvAt - uEye, rayDir), 0.0, segLen);
    vec3 closest = uEye + rayDir * proj;
    vec3 fromTv = closest - uTvAt;
    float coneDist = length(fromTv);
    float inCone = smoothstep(-0.05, 0.55, dot(fromTv / max(coneDist, 1.0), uTvFacing));
    float dust = 0.7 + 0.3 * hash13(floor((closest + vec3(0.0, uTime * 4.0, 0.0)) / 14.0));
    lit += uTvLight * inCone * dust * smoothstep(0.15, 0.85, uNight) * 0.12 /
      (1.0 + coneDist * coneDist / (240.0 * 240.0));
  }
  // Bright parts roll off instead of clipping to white.
  vec3 over = max(lit - 0.75, 0.0);
  lit = min(lit, 0.75) + over / (1.0 + over * 2.2);
  outColor = vec4(lit, seen.a);
}
`;

/** Covers the whole picture with one big triangle. */
export const SCREEN_VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Takes the small picture of the hut and makes the one you see: stylized
    big pixels with curated inks, dynamic cross-hatched shadows, delicate
    illustrated ink contours, mood-reactive bloom, and a full-resolution
    perspective-correct CRT window so the television news broadcast stays
    genuinely readable through the filter. */
export const SCREEN_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uScene;
// Live 640x480 broadcast texture sampled at full native resolution on TV glass.
uniform sampler2D uTvScreen;
// Inverse of the hut camera matrix, to intersect full-res rays with the TV plane.
uniform mat4 uInvCamera;
// World-space bottom-left corner and axis vectors of the CRT glass quad.
uniform vec3 uTvOrigin;
uniform vec3 uTvRight;
uniform vec3 uTvUp;
// How many pixels of the page one pixel of the hut covers.
uniform float uCell;
// How many shades of brightness there are.
uniform float uLevels;
// How much of the way between two shades or two colours is dotted.
uniform float uSpread;
// How far the colours are pulled to the two below: shadow and light.
uniform float uMono;
uniform vec3 uInk;
uniform vec3 uPaper;
// How dark the corners are, and how blotchy that dark is.
uniform float uVignette;
uniform float uGrime;
// How much the dots are shaken about, and a stepped clock for crawling grain.
uniform float uGrain;
uniform float uTick;
// Below 2, dark shades come out a little lighter than they went in.
uniform float uLift;
// How much light the bright things bleed around them.
uniform float uBloom;
// How dark the line under each row of pixels is.
uniform float uScan;
// Dynamic mood inputs driven by broadcast cuts, news bleakness, and time of day.
uniform float uGlitch;
uniform float uSeverity;
uniform float uNight;
uniform float uTime;

out vec4 outColor;

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float noise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash12(cell), hash12(cell + vec2(1.0, 0.0)), u.x),
    mix(hash12(cell + vec2(0.0, 1.0)), hash12(cell + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// The classic 4x4 pattern: which dots turn on first as a shade gets lighter.
float pattern(ivec2 cell) {
  const float order[16] = float[16](
    0.0, 8.0, 2.0, 10.0,
    12.0, 4.0, 14.0, 6.0,
    3.0, 11.0, 1.0, 9.0,
    15.0, 7.0, 13.0, 5.0
  );
  return (order[(cell.x & 3) + (cell.y & 3) * 4] + 0.5) / 16.0;
}

// Curated hut inks at full brightness: lime plaster, sage wainscoting, brick,
// burnished copper/brass, quilt fabrics, timber, stove fire, rug, red couch,
// hills, sky, skin, midnight indigo shadows, and CRT cyan/alert red.
const int INKS = 24;
const vec3 INK[24] = vec3[24](
  vec3(1.0, 1.0, 1.0),    // white
  vec3(0.86, 0.9, 1.0),   // cold grey
  vec3(1.0, 0.94, 0.8),   // cream plaster
  vec3(1.0, 0.87, 0.68),  // sand
  vec3(1.0, 0.8, 0.56),   // pale wood
  vec3(1.0, 0.66, 0.4),   // wood
  vec3(1.0, 0.58, 0.36),  // terracotta / burnished copper
  vec3(1.0, 0.5, 0.26),   // fire
  vec3(1.0, 0.34, 0.27),  // rug red
  vec3(0.96, 0.18, 0.24), // deep crimson (couch & breaking alert)
  vec3(1.0, 0.4, 0.58),   // pink
  vec3(1.0, 0.74, 0.64),  // skin
  vec3(1.0, 0.6, 0.62),   // skin in the screen's light
  vec3(1.0, 0.95, 0.58),  // sun
  vec3(1.0, 0.84, 0.38),  // antique brass / mustard
  vec3(0.88, 0.94, 0.62), // damp
  vec3(0.64, 0.88, 0.68), // cabin sage / celadon
  vec3(0.55, 1.0, 0.56),  // grass
  vec3(0.42, 1.0, 0.96),  // electric cyan
  vec3(0.6, 0.82, 1.0),   // sky
  vec3(0.42, 0.56, 1.0),  // deep blue
  vec3(0.32, 0.38, 0.82), // midnight indigo shadow
  vec3(0.74, 0.62, 1.0),  // violet
  vec3(0.8, 0.74, 0.9)    // dusk
);

// The nearest of the colours to this tint, and the one after it.
vec3 inksFor(vec3 tint) {
  float best = 1e9;
  float next = 1e9;
  int a = 0;
  int b = 0;
  for (int i = 0; i < INKS; i++) {
    vec3 d = (tint - INK[i]) * vec3(1.0, 1.2, 0.9);
    float far = dot(d, d);
    if (far < best) {
      next = best;
      b = a;
      best = far;
      a = i;
    } else if (far < next) {
      next = far;
      b = i;
    }
  }
  float toward = sqrt(best) / max(sqrt(best) + sqrt(next), 0.0001);
  return vec3(float(a), float(b), toward);
}

// Squeezes a dot threshold towards the middle, so that only the part of the
// way near the edge between two steps is dotted.
float spread(float threshold) {
  return 0.5 + (threshold - 0.5) * uSpread;
}

vec4 fetchCell(ivec2 cell) {
  ivec2 size = textureSize(uScene, 0);
  return texelFetch(uScene, clamp(cell, ivec2(0), size - 1), 0);
}

vec3 sceneAt(ivec2 cell) {
  return fetchCell(cell).rgb;
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// What is brighter than this bleeds light.
const float BRIGHT = 0.6;

vec3 bleed(vec3 color) {
  return max(color - BRIGHT, 0.0);
}

// Two-ring lumpy phosphor/sunlight bloom around bright sources.
vec3 bloomAt(ivec2 cell) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float turn = float(i) * 0.7854;
    vec2 way = vec2(cos(turn), sin(turn));
    sum += bleed(sceneAt(cell + ivec2(round(way * 3.0)))) * 0.62;
    sum += bleed(sceneAt(cell + ivec2(round(way * 7.0)))) * 0.38;
  }
  return sum / 8.0;
}

// Subtle architectural ink contour between neighbouring cells (never across
// the phone cutout or over the TV glass interior).
float contourAt(ivec2 cell, vec3 center) {
  vec4 nL = fetchCell(cell + ivec2(-1, 0));
  vec4 nR = fetchCell(cell + ivec2(1, 0));
  vec4 nU = fetchCell(cell + ivec2(0, 1));
  vec4 nD = fetchCell(cell + ivec2(0, -1));
  if (nL.a < 0.88 || nR.a < 0.88 || nU.a < 0.88 || nD.a < 0.88) return 0.0;
  float gx = abs(luma(nR.rgb) - luma(nL.rgb)) + length(nR.rgb - nL.rgb) * 0.25;
  float gy = abs(luma(nU.rgb) - luma(nD.rgb)) + length(nU.rgb - nD.rgb) * 0.25;
  float diff = max(gx, gy);
  // Stronger ink lines in mid-to-dark silhouettes, gentle on bright sun patches.
  float strength = mix(0.95, 0.45, smoothstep(0.25, 0.75, luma(center)));
  return smoothstep(0.16, 0.42, diff) * strength;
}

// Projects a full-resolution screen pixel onto the 3D CRT glass plane to get
// exact perspective-correct UVs even when the television sits at an angle.
vec2 projectTvUv(vec2 fragCoord, vec2 sceneSize) {
  vec2 targetNdc = (fragCoord / (sceneSize * uCell)) * 2.0 - 1.0;
  vec4 pNear = uInvCamera * vec4(targetNdc, -1.0, 1.0);
  vec4 pFar = uInvCamera * vec4(targetNdc, 1.0, 1.0);
  vec3 ro = pNear.xyz / pNear.w;
  vec3 rd = normalize(pFar.xyz / pFar.w - ro);

  vec3 planeN = cross(uTvRight, uTvUp);
  float denom = dot(rd, planeN);
  float safeDenom = abs(denom) > 1e-5 ? denom : (denom < 0.0 ? -1e-5 : 1e-5);
  float hitT = dot(uTvOrigin - ro, planeN) / safeDenom;
  vec3 hit = ro + rd * hitT;
  vec3 rel = hit - uTvOrigin;

  return vec2(
    dot(rel, uTvRight) / max(dot(uTvRight, uTvRight), 1e-5),
    1.0 - dot(rel, uTvUp) / max(dot(uTvUp, uTvUp), 1e-5)
  );
}

// Stylized CRT glass shader: stays genuinely readable while sharing the
// cabin's retro pixel aesthetic through glass-locked Bayer dithering, stepped
// phosphor quantization, local CRT halation, RGB aperture grille, scanlines,
// subtle tube burn-in/aging, and gentle broadcast sync roll.
vec3 renderTvGlass(vec2 sceneSize) {
  vec2 rawUv = projectTvUv(gl_FragCoord.xy, sceneSize);
  // Explicit analytical derivatives avoid 2x2 quad divergence along the bezel
  // and hand occlusion edges, keeping mipmap + anisotropic filtering crisp.
  vec2 dUvDx = projectTvUv(gl_FragCoord.xy + vec2(1.0, 0.0), sceneSize) - rawUv;
  vec2 dUvDy = projectTvUv(gl_FragCoord.xy + vec2(0.0, 1.0), sceneSize) - rawUv;

  // Subtle CRT glass barrel curvature (gentle enough that every line stays legible).
  vec2 centered = rawUv * 2.0 - 1.0;
  float r2 = dot(centered, centered);
  vec2 curved = centered * (1.0 + 0.032 * r2) * 0.5 + 0.5;

  // Subtle horizontal sync roll confined strictly to the CRT glass on report cuts.
  if (uGlitch > 0.005) {
    float wave = sin(curved.y * 36.0 + uTime * 28.0) * 0.006;
    float band = step(0.88, hash12(vec2(floor(curved.y * 28.0), floor(uTime * 18.0))));
    curved.x += (wave + (band * 0.018 - 0.004)) * uGlitch;
  }

  vec2 uv = clamp(curved, 0.0, 1.0);
  // Subtle RGB phosphor convergence offset (minimal at center so letters stay
  // crisp, slightly wider toward the curved tube corners and softly on report cuts).
  float chroma = 0.0012 + 0.0018 * r2 + uGlitch * 0.003;
  vec3 tv = vec3(
    textureGrad(uTvScreen, clamp(uv + vec2(chroma, 0.0), 0.0, 1.0), dUvDx, dUvDy).r,
    textureGrad(uTvScreen, uv, dUvDx, dUvDy).g,
    textureGrad(uTvScreen, clamp(uv - vec2(chroma, 0.0), 0.0, 1.0), dUvDx, dUvDy).b
  );

  // Tight local phosphor halation around bright text and graphics so the CRT
  // genuinely glows from inside the glass without blurring strokes together.
  vec2 haloStep = vec2(0.0055, 0.0072);
  vec3 halo = (
    max(textureGrad(uTvScreen, clamp(uv + vec2(haloStep.x, 0.0), 0.0, 1.0), dUvDx, dUvDy).rgb - 0.55, 0.0) +
    max(textureGrad(uTvScreen, clamp(uv - vec2(haloStep.x, 0.0), 0.0, 1.0), dUvDx, dUvDy).rgb - 0.55, 0.0) +
    max(textureGrad(uTvScreen, clamp(uv + vec2(0.0, haloStep.y), 0.0, 1.0), dUvDx, dUvDy).rgb - 0.55, 0.0) +
    max(textureGrad(uTvScreen, clamp(uv - vec2(0.0, haloStep.y), 0.0, 1.0), dUvDx, dUvDy).rgb - 0.55, 0.0)
  ) * 0.25;
  tv = clamp(tv + halo * (0.28 + 0.14 * uNight), 0.0, 1.0);

  // Glass-locked 4x4 Bayer dithering & stepped broadcast colour depth so the
  // TV shares the hut's retro shader language instead of looking flat/clean.
  // Locked to CRT UV cells so dots sit physically on the glass; bright text
  // gets gentler dithering so headlines stay razor sharp.
  ivec2 tvCell = ivec2(floor(curved * vec2(260.0, 195.0)));
  float tvBayer = pattern(tvCell) - 0.5;
  float tvSnow = (hash12(vec2(tvCell) + uTick * 19.0) - 0.5) *
    (0.035 + 0.09 * uGrime + 0.08 * uGlitch);
  float tvLum = luma(tv);
  float textProtect = smoothstep(0.65, 0.92, tvLum);
  float tvSteps = mix(11.0, 8.0, uGrime);
  vec3 dithered = floor(clamp(tv + (tvBayer * 0.75 + tvSnow) / tvSteps, 0.0, 1.0) * tvSteps + 0.5) / tvSteps;
  tv = mix(dithered, tv, textProtect * 0.65);

  // Subtle shadow-tone cohesion with the cabin's mood (cools the studio darks
  // and shifts lightly toward late-night noir as decay & severity climb).
  vec3 tvShadowTint = mix(
    vec3(0.84, 0.9, 1.08),
    mix(vec3(0.76, 0.88, 1.12), vec3(1.06, 0.78, 0.84), uSeverity * 0.5),
    uNight
  );
  tv *= mix(tvShadowTint, vec3(1.0), smoothstep(0.18, 0.72, tvLum));
  tv = mix(tv, mix(uInk, uPaper, luma(tv)), uMono * 0.32);

  // CRT phosphor scanlines + RGB aperture grille locked to the glass plane.
  float scan = 0.87 + 0.13 * sin(curved.y * 192.0 * 3.14159);
  float triadPhase = curved.x * 260.0 * 6.28318;
  vec3 grille = vec3(
    0.94 + 0.06 * cos(triadPhase),
    0.94 + 0.06 * cos(triadPhase - 2.0944),
    0.94 + 0.06 * cos(triadPhase + 2.0944)
  );
  tv *= scan * grille;

  // Recessed rounded CRT tube bezel shadow & slight aging corner burn-in.
  vec2 edge = abs(curved * 2.0 - 1.0);
  float boxEdge = 1.0 - smoothstep(0.91, 1.02, max(edge.x, edge.y));
  float cornerEdge = 1.0 - smoothstep(1.22, 1.43, length(edge));
  float tubeMask = boxEdge * cornerEdge;
  float tubeVignette = 1.0 - (0.14 + 0.16 * uGrime) * smoothstep(0.35, 1.35, r2);

  // Curved glass specular reflection (fainter at night) & slow rolling refresh hum bar.
  float glassSheen = smoothstep(0.42, 0.98, 1.0 - length(curved - vec2(0.24, 0.18))) *
    (1.0 - uNight * 0.65) * 0.095;
  float hum = smoothstep(0.06, 0.0, abs(fract(curved.y - uTime * 0.15) - 0.5)) * 0.055;
  vec3 glassTint = mix(vec3(0.84, 0.93, 1.0), vec3(1.0, 0.55, 0.62), uSeverity * 0.35);

  // Ground the CRT black floor into the cabin's inky shadow palette.
  vec3 shown = mix(uInk * 1.5, tv * tubeVignette, 0.94) * (0.12 + 0.94 * tubeMask) +
    glassTint * (glassSheen + hum) * tubeMask;
  return clamp(shown, 0.0, 1.0);
}

void main() {
  ivec2 sceneDims = textureSize(uScene, 0);
  ivec2 cell = ivec2(gl_FragCoord.xy / uCell);
  vec4 scene = texelFetch(uScene, clamp(cell, ivec2(0), sceneDims - 1), 0);

  // The hole for the phone stays a hole.
  if (scene.a < 0.25) {
    outColor = vec4(0.0);
    return;
  }

  // Visible CRT television glass: bypass chunky pixelation, grime, and coarse
  // ink dithering so the broadcast and carp anchor read clearly from the couch.
  if (scene.a < 0.88) {
    outColor = vec4(renderTvGlass(vec2(sceneDims)), 1.0);
    return;
  }

  vec2 uv = (vec2(cell) + 0.5) / vec2(sceneDims);
  vec2 fromMiddle = uv - 0.5;
  float corner = smoothstep(0.08, 1.0, dot(fromMiddle, fromMiddle) * 2.0);

  // Subtle peripheral analog-lens chromatic split near the viewport edges,
  // keeping the middle of the room sharp while adding eerie late-night depth.
  float edgeFringe = corner * (0.35 + uGrime * 0.95);
  ivec2 shift = ivec2(round(fromMiddle * edgeFringe * 2.6));
  vec4 tapPlus = fetchCell(cell + shift);
  vec4 tapMinus = fetchCell(cell - shift);
  vec3 base = vec3(
    tapPlus.a >= 0.88 ? tapPlus.r : scene.r,
    scene.g,
    tapMinus.a >= 0.88 ? tapMinus.b : scene.b
  );

  // Mood-reactive bloom: warm amber halation in afternoon sun, shifting to
  // electric cyan / crimson-alert phosphor glow as night and severity deepen.
  vec3 bloomTint = mix(
    vec3(1.06, 0.96, 0.84),
    mix(vec3(0.84, 0.98, 1.12), vec3(1.12, 0.72, 0.78), smoothstep(0.55, 1.0, uSeverity)),
    uNight
  );
  vec3 color = base + bloomAt(cell) * bloomTint * uBloom;

  // Delicate architectural ink contour lines along sharp silhouette edges.
  float contour = contourAt(cell, scene.rgb);
  vec3 inkLine = mix(
    vec3(0.08, 0.05, 0.06),
    mix(vec3(0.03, 0.04, 0.09), vec3(0.07, 0.02, 0.04), uSeverity * 0.6),
    uNight
  );
  color = mix(color, inkLine, contour * mix(0.32, 0.52, uGrime));

  // Dark creeps in from the corners, unevenly, like dirt on a lens.
  float blotch = noise(uv * 5.0 + 3.0) * 0.6 + noise(uv * 13.0) * 0.4;
  color *= 1.0 - uVignette * corner * (1.0 + uGrime * (blotch * 2.0 - 1.0));
  color *= 1.0 - uGrime * 0.24 * smoothstep(0.55, 0.82, blotch);

  // Stylized engraved cross-hatching in cast shadows & deep umbra!
  // Mid-shadows pick up crisp 45-degree diagonal hatching; deepest shadows
  // cross-hatch into woodcut/noir grain that moves dynamically as shadows shift.
  float rawLum = luma(color);
  float midShadow = 1.0 - smoothstep(0.14, 0.34, rawLum);
  float deepShadow = 1.0 - smoothstep(0.04, 0.16, rawLum);
  float hatchA = ((cell.x + cell.y) & 3) == 0 ? 1.0 : 0.0;
  float hatchB = ((cell.x - cell.y + 1024) & 3) == 0 ? 1.0 : 0.0;
  float hatchMask = max(hatchA * midShadow * 0.65, hatchB * deepShadow * 0.95);
  float hatchPower = mix(0.22, 0.38, max(uNight, uGrime));
  color *= 1.0 - hatchMask * hatchPower;

  float value = luma(color);
  color = mix(color, mix(uInk, uPaper, value), uMono);

  // Tonal-adaptive ordered dithering: crisp highlights, smooth stepped
  // midtones, and animated grain that crawls mainly inside the shadows.
  float bright = max(max(color.r, color.g), max(color.b, 0.0001));
  float shadowGrain = uGrain * mix(1.15, 0.35, smoothstep(0.15, 0.65, bright));
  float shaken = spread(pattern(cell)) +
    (hash12(vec2(cell) + uTick * 17.0) - 0.5) * shadowGrain;
  float shade = clamp(floor(sqrt(bright) * uLevels + shaken) / uLevels, 0.0, 1.0);

  // Curated ink quantization with rotated secondary dither only near boundaries.
  vec3 inks = inksFor(color / bright);
  float toSecond = smoothstep(0.5 - 0.12 * uSpread, 0.5, inks.z) * 0.5;
  float pick = pattern(cell.yx + ivec2(1, 2)) < toSecond ? inks.y : inks.x;
  vec3 tint = INK[int(pick)];

  // Dynamic split-tone temperature ramp: shadows lean rich indigo-violet (or
  // bruised teal-noir at night) while sunlit/lit highlights lean warm cream
  // by day and crisp phosphor-cool at night.
  vec3 shadowTone = mix(
    vec3(0.76, 0.8, 1.08),
    mix(vec3(0.7, 0.86, 1.12), vec3(0.88, 0.72, 0.96), uSeverity * 0.45),
    uNight
  );
  vec3 highlightTone = mix(
    vec3(1.03, 0.99, 0.93),
    vec3(0.95, 0.99, 1.04),
    uNight * 0.7
  );
  tint = mix(tint * shadowTone, tint * highlightTone, smoothstep(0.12, 0.78, shade));
  tint /= max(max(tint.r, tint.g), max(tint.b, 0.0001));

  vec3 shown = tint * pow(shade, uLift);
  // Subtle darker line under each row of pixels, balanced so brightness holds.
  float row = mod(gl_FragCoord.y, uCell);
  if (uCell >= 2.0 && row < 1.0) shown *= 1.0 - uScan;
  else shown *= 1.0 + uScan / max(uCell - 1.0, 1.0);
  outColor = vec4(shown, 1.0);
}
`;
