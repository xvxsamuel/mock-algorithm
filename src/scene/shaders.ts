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
} as const;

const MATERIAL_NAMES = Object.entries(MATERIAL)
  .map(([name, id]) => `const int M_${name.toUpperCase()} = ${id};`)
  .join("\n");

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
    vMaterial == M_RUG || vMaterial == M_PICTURE || vMaterial == M_MARK
  ) {
    at.z -= PULL * at.w;
  }
  gl_Position = at;
}
`;

export const HUT_FRAGMENT = `#version 300 es
precision highp float;

${MATERIAL_NAMES}

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
const float TEXEL = 8.0;

vec2 texels(vec2 uv) {
  return (floor(uv / TEXEL) + 0.5) * TEXEL;
}

// Shifted a little, so that no face of a box lies on the edge of a square.
vec3 texels(vec3 at) {
  return (floor((at + 3.1) / TEXEL) + 0.5) * TEXEL - 3.1;
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

// Painted boards. The damp comes down from the roof and up from the floor,
// the paint flakes off the wood, and the gaps between the boards open.
vec3 wallColor(vec2 uv, float id) {
  float board = uv.y / 96.0;
  float row = floor(board);
  float fy = fract(board);
  float along = uv.x / 656.0 + hash12(vec2(row, id + 1.0)) * 9.0;
  float fx = fract(along);
  float piece = hash12(vec2(floor(along) + id * 13.0, row));
  // How far into its board this square is: the first one is the gap.
  float seam = min(fy * 96.0, fx * 656.0);
  float grain = fbm(vec2(uv.x * 0.005, uv.y * 0.12) + piece * 40.0);

  vec3 paint = vec3(0.96, 0.9, 0.76) * (0.93 + 0.1 * piece) * (0.94 + 0.1 * grain);
  vec3 wood = mix(vec3(0.42, 0.3, 0.2), vec3(0.25, 0.2, 0.16), grain);
  wood = mix(wood, vec3(0.2, 0.19, 0.17), uDecay * 0.6);

  float blot = fbm(uv * 0.0032 + id * 9.1);
  float drip = fbm(vec2(uv.x * 0.018, uv.y * 0.0016) + id * 3.7);
  float high = smoothstep(250.0, 1000.0, uv.y);
  float low = 1.0 - smoothstep(0.0, 300.0, uv.y);
  float field = blot * 0.62 + drip * 0.38 + high * 0.3 + low * 0.34;
  float reach = mix(1.18, 0.4, uDecay);
  vec3 color = stained(paint, field, reach, vec3(0.8, 0.68, 0.48));

  // Mould, in the wettest parts.
  float soaked = smoothstep(reach + 0.16, reach + 0.36, field);
  float speck = smoothstep(0.6, 0.78, noise(uv * 0.085 + 5.0)) *
    smoothstep(0.3, 0.6, noise(uv * 0.013 + 2.0));
  color = mix(color, vec3(0.06, 0.08, 0.05), speck * soaked * 0.85);

  float flake = fbm(uv * 0.0105 + 31.0 + id * 2.0) * 0.75 + field * 0.35;
  float peelAt = mix(1.3, 0.58, smoothstep(0.22, 1.0, uDecay));
  float peel = smoothstep(peelAt, peelAt + 0.02, flake);
  float lip = smoothstep(peelAt - 0.035, peelAt, flake) * (1.0 - peel);
  color = mix(color * (1.0 - 0.3 * lip), wood, peel);

  float gap = step(seam, TEXEL * (1.0 + 0.6 * uDecay));
  color = mix(color, vec3(0.1, 0.08, 0.06), gap * (0.28 + 0.5 * uDecay));
  return color * (1.0 - 0.2 * uDecay);
}

// Floorboards running away from you. Dust settles, and it stains from the
// walls inwards.
vec3 floorColor(vec2 uv) {
  float board = uv.x / 128.0;
  float column = floor(board);
  float fx = fract(board);
  float along = uv.y / 896.0 + hash12(vec2(column, 4.0)) * 5.0;
  float fz = fract(along);
  float piece = hash12(vec2(column, floor(along)));
  float seam = min(fx * 128.0, fz * 896.0);
  float grain = fbm(vec2(uv.x * 0.09, uv.y * 0.0045) + piece * 50.0);

  vec3 color = mix(vec3(0.84, 0.6, 0.34), vec3(0.62, 0.42, 0.24), grain) *
    (0.86 + 0.22 * piece);

  float edge = min(uRoom.x - abs(uv.x), uRoom.z - abs(uv.y));
  float field = fbm(uv * 0.004 + 60.0) * 0.75 + (1.0 - smoothstep(0.0, 380.0, edge)) * 0.4;
  color = stained(color, field, mix(1.2, 0.36, uDecay), vec3(0.6, 0.53, 0.45));
  color = mix(color, vec3(0.42, 0.4, 0.37), uDecay * 0.45);
  float grit = step(0.95 - 0.1 * uDecay, hash12(floor(uv / TEXEL))) * uDecay;
  color = mix(color, vec3(0.12, 0.1, 0.08), grit * 0.6);

  float gap = step(seam, TEXEL * (1.0 + uDecay));
  return mix(color, vec3(0.12, 0.08, 0.05), gap * (0.45 + 0.3 * uDecay));
}

// The underside of the roof: bare boards, the first to get wet.
vec3 roofColor(vec2 uv) {
  float board = uv.y / 120.0;
  float fy = fract(board);
  float piece = hash12(vec2(floor(board), 8.0));
  float grain = fbm(vec2(uv.x * 0.005, uv.y * 0.1) + piece * 30.0);
  vec3 color = mix(vec3(0.7, 0.53, 0.35), vec3(0.54, 0.39, 0.25), grain) *
    (0.9 + 0.14 * piece);
  float field = fbm(uv * 0.004 + 20.0) * 0.8 + 0.25;
  color = stained(color, field, mix(1.15, 0.32, uDecay), vec3(0.55, 0.5, 0.42));
  float gap = step(fy * 120.0, TEXEL * (1.0 + uDecay));
  color = mix(color, vec3(0.1, 0.07, 0.05), gap * 0.6);
  return color * (1.0 - 0.25 * uDecay);
}

// Bare wood in its own colour. It greys.
vec3 woodColor(vec3 base, vec3 at) {
  float grain = fbm(vec2(at.x + at.z, at.y) * vec2(0.012, 0.11)) * 0.6 +
    fbm(vec2(at.y + at.z, at.x) * vec2(0.012, 0.11)) * 0.4;
  vec3 color = base * (0.84 + 0.3 * grain);
  float value = dot(color, vec3(0.333));
  return mix(color, vec3(value) * vec3(0.72, 0.7, 0.68), uDecay * 0.7);
}

vec3 rugColor(vec2 uv) {
  vec3 red = vec3(0.76, 0.21, 0.17);
  vec3 cream = vec3(0.93, 0.87, 0.72);
  vec3 blue = vec3(0.16, 0.26, 0.45);
  vec2 fromMiddle = abs(uv - 0.5) * 2.0;
  float border = max(fromMiddle.x, fromMiddle.y);
  vec3 color = red;
  // Stripes across the middle.
  float stripe = abs(fract(uv.y * 5.0) - 0.5);
  color = mix(color, cream, 1.0 - step(0.1, stripe));
  color = mix(color, cream, step(0.8, border));
  color = mix(color, blue, step(0.88, border));
  color *= 0.92 + 0.08 * noise(uv * 240.0);
  // It fades and gets dirty.
  float value = dot(color, vec3(0.333));
  color = mix(color, vec3(value) * vec3(0.8, 0.74, 0.66), uDecay * 0.78);
  return stained(color, fbm(uv * 3.0 + 80.0), mix(1.2, 0.42, uDecay), vec3(0.6, 0.52, 0.42));
}

// The picture on the wall: a sunny day, which yellows.
vec3 pictureColor(vec2 uv) {
  vec3 color = mix(vec3(1.0, 0.87, 0.62), vec3(0.36, 0.66, 0.95), smoothstep(0.3, 0.95, uv.y));
  float sun = length((uv - vec2(0.68, 0.72)) * vec2(1.3, 1.0));
  color = mix(color, vec3(1.0, 0.94, 0.6), 1.0 - smoothstep(0.1, 0.115, sun));
  color = mix(color, vec3(0.4, 0.7, 0.36), step(uv.y, 0.38 + 0.1 * sin(uv.x * 5.0 + 0.6)));
  color = mix(color, vec3(0.24, 0.54, 0.3), step(uv.y, 0.22 + 0.08 * sin(uv.x * 3.4 + 2.5)));
  float value = dot(color, vec3(0.333));
  color = mix(color, vec3(value) * vec3(0.78, 0.66, 0.46), uDecay * 0.85);
  return stained(color, fbm(uv * 2.5 + 40.0) + 0.1, mix(1.25, 0.5, uDecay), vec3(0.6, 0.5, 0.36));
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
  return mix(color, nearColor, 1.0 - smoothstep(near - 0.003, near + 0.003, uv.y));
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
  return mix(mix(0.74, 0.4, uDecay), 1.0, smoothstep(0.0, mix(220.0, 420.0, uDecay), edge));
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

vec3 lightAt(vec3 at, vec3 normal, float shade) {
  vec3 light = uAmbient * (0.82 + 0.18 * normal.y) * shade;

  vec3 toWindow = uWindowAt - at;
  float far = length(toWindow);
  vec3 window = toWindow / far;
  light += uSkyLight * max(dot(normal, window), 0.0) * max(-window.z, 0.0) * shade /
    (1.0 + far * far / (650.0 * 650.0));

  light += uBeam * max(dot(normal, uBeamFrom), 0.0) * beamAt(at);

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
  light += uGlow * 0.45 * max(dot(normal, toEye / near), 0.0) /
    (1.0 + near * near / (140.0 * 140.0));

  // The stove, while it burns.
  vec3 toFire = uFireAt - at;
  float fireFar = length(toFire);
  light += uFire * max(dot(normal, toFire / fireFar) * 0.7 + 0.3, 0.0) /
    (1.0 + fireFar * fireFar / (280.0 * 280.0));
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
    if (mod(id, 2.0) > 0.5) {
      at.zy = texels(at.zy);
      color = wallColor(at.zy, id);
    } else {
      at.xy = texels(at.xy);
      color = wallColor(at.xy, id);
    }
    shade = cornerShade(at);
  } else if (vMaterial == M_FLOOR) {
    at.xz = texels(at.xz);
    color = floorColor(at.xz);
    shade = cornerShade(at);
  } else if (vMaterial == M_ROOF) {
    color = roofColor(texels(vec2(vWorld.z, abs(vWorld.x) * 1.147)));
    shade = mix(0.8, 0.5, uDecay);
  } else if (vMaterial == M_WOOD) {
    color = woodColor(vColor, texels(vLocal));
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
    color = rugColor(squares(vExtra, vec2(80.0, 72.0)));
    shade = cornerShade(at);
  } else if (vMaterial == M_PICTURE) {
    color = pictureColor(squares(vExtra, vec2(40.0, 30.0)));
  } else if (vMaterial == M_WEB) {
    if (webAt(squares(vExtra, vec2(48.0))) < 0.5) discard;
    color = vec3(0.86, 0.86, 0.84);
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

  vec3 lit = color * lightAt(at, normal, shade);
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
  if (vMaterial != M_GLASS) lit += uBeam * shaftTo(vWorld) * uHaze;
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

/** Takes the small picture of the hut and makes the one you see: each of
    its pixels a square of the page, in the few colours an old console had,
    with dots where one of those is not enough. Decay makes it dimmer,
    greyer, darker in the corners and noisier, through the numbers below. */
export const SCREEN_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uScene;
// How many pixels of the page one pixel of the hut covers.
uniform float uCell;
// How many shades of brightness there are.
uniform float uLevels;
// How far the colours are pulled to the two below: shadow and light.
uniform float uMono;
uniform vec3 uInk;
uniform vec3 uPaper;
// How dark the corners are, and how blotchy that dark is.
uniform float uVignette;
uniform float uGrime;
// How much the dots are shaken about, and a number that changes a few times
// a second, so that the dark crawls like a bad signal.
uniform float uGrain;
uniform float uTick;
// Below 2, dark shades come out a little lighter than they went in, so
// that there is still something to see in a dark room.
uniform float uLift;

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

void main() {
  ivec2 cell = ivec2(gl_FragCoord.xy / uCell);
  vec4 scene = texelFetch(uScene, cell, 0);
  // The hole for the phone stays a hole.
  if (scene.a < 0.5) {
    outColor = vec4(0.0);
    return;
  }
  vec3 color = scene.rgb;
  vec2 uv = (vec2(cell) + 0.5) / vec2(textureSize(uScene, 0));

  // Dark creeps in from the corners, unevenly, like dirt on a lens.
  vec2 fromMiddle = uv - 0.5;
  float corner = smoothstep(0.1, 1.0, dot(fromMiddle, fromMiddle) * 2.0);
  float blotch = noise(uv * 5.0 + 3.0) * 0.6 + noise(uv * 13.0) * 0.4;
  color *= 1.0 - uVignette * corner * (1.0 + uGrime * (blotch * 2.0 - 1.0));
  color *= 1.0 - uGrime * 0.25 * smoothstep(0.55, 0.8, blotch);

  float value = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(color, mix(uInk, uPaper, value), uMono);

  // Few shades: the brightness is cut into steps, and the dots decide which
  // of the two nearest a pixel gets. Its square root is cut, so that the
  // dark gets most of the steps. The tint is left alone: cutting red, green
  // and blue each on their own speckles the picture with stray colours.
  float bright = max(max(color.r, color.g), max(color.b, 0.0001));
  float shaken = pattern(cell) +
    (hash12(vec2(cell) + uTick * 17.0) - 0.5) * uGrain;
  float shade = clamp(floor(sqrt(bright) * uLevels + shaken) / uLevels, 0.0, 1.0);
  outColor = vec4(color / bright * pow(shade, uLift), 1.0);
}
`;
