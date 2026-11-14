/* The programs the graphics card runs: one colours the hut, one turns that
   picture into the dithered one you see. They are written in GLSL, the
   language WebGL takes them in. */

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
} as const;

const MATERIAL_NAMES = Object.entries(MATERIAL)
  .map(([name, id]) => `const int M_${name.toUpperCase()} = ${id};`)
  .join("\n");

export const HUT_VERTEX = `#version 300 es
layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in float aMaterial;
layout(location = 4) in vec2 aExtra;

uniform mat4 uCamera;
uniform mat4 uModel;

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
  gl_Position = uCamera * world;
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
// Half the hut's width, the height of its walls, half its depth.
uniform vec3 uRoom;
// How much the dark swallows what is far away.
uniform float uGloom;

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
  float along = uv.x / 660.0 + hash12(vec2(row, id + 1.0)) * 9.0;
  float fx = fract(along);
  float piece = hash12(vec2(floor(along) + id * 13.0, row));
  float seam = min(min(fy, 1.0 - fy) * 96.0, min(fx, 1.0 - fx) * 660.0);
  float grain = fbm(vec2(uv.x * 0.005, uv.y * 0.12) + piece * 40.0);

  vec3 paint = vec3(0.95, 0.91, 0.82) * (0.95 + 0.07 * piece) * (0.96 + 0.07 * grain);
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

  float gap = 1.0 - smoothstep(0.5 + 2.0 * uDecay, 1.8 + 4.0 * uDecay, seam);
  color = mix(color, vec3(0.1, 0.08, 0.06), gap * (0.4 + 0.55 * uDecay));
  return color * (1.0 - 0.2 * uDecay);
}

// Floorboards running away from you. Dust settles, and it stains from the
// walls inwards.
vec3 floorColor(vec2 uv) {
  float board = uv.x / 132.0;
  float column = floor(board);
  float fx = fract(board);
  float along = uv.y / 900.0 + hash12(vec2(column, 4.0)) * 5.0;
  float fz = fract(along);
  float piece = hash12(vec2(column, floor(along)));
  float seam = min(min(fx, 1.0 - fx) * 132.0, min(fz, 1.0 - fz) * 900.0);
  float grain = fbm(vec2(uv.x * 0.09, uv.y * 0.0045) + piece * 50.0);

  vec3 color = mix(vec3(0.8, 0.6, 0.38), vec3(0.64, 0.45, 0.27), grain) *
    (0.9 + 0.16 * piece);

  float edge = min(uRoom.x - abs(uv.x), uRoom.z - abs(uv.y));
  float field = fbm(uv * 0.004 + 60.0) * 0.75 + (1.0 - smoothstep(0.0, 380.0, edge)) * 0.4;
  color = stained(color, field, mix(1.2, 0.36, uDecay), vec3(0.6, 0.53, 0.45));
  color = mix(color, vec3(0.42, 0.4, 0.37), uDecay * 0.45);
  float grit = step(0.95 - 0.1 * uDecay, hash12(floor(uv / 3.0))) * uDecay;
  color = mix(color, vec3(0.12, 0.1, 0.08), grit * 0.6);

  float gap = 1.0 - smoothstep(0.8, 2.4 + 3.0 * uDecay, seam);
  return mix(color, vec3(0.12, 0.08, 0.05), gap * 0.7);
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
  float gap = 1.0 - smoothstep(0.01, 0.03 + 0.03 * uDecay, min(fy, 1.0 - fy));
  color = mix(color, vec3(0.1, 0.07, 0.05), gap * 0.7);
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
  float thread = 1.0 - smoothstep(0.0035, 0.007, min(spoke, ring));
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

vec3 lightAt(vec3 at, vec3 normal, float shade) {
  vec3 light = uAmbient * (0.82 + 0.18 * normal.y) * shade;

  vec3 toWindow = uWindowAt - at;
  float far = length(toWindow);
  vec3 window = toWindow / far;
  light += uSkyLight * max(dot(normal, window), 0.0) * max(-window.z, 0.0) * shade /
    (1.0 + far * far / (650.0 * 650.0));

  light += uBeam * max(dot(normal, uBeamFrom), 0.0) * beamAt(at);

  // The screen lights what is in front of it.
  vec3 toPhone = uPhoneAt - at;
  float reach = length(toPhone);
  vec3 phone = toPhone / reach;
  float inFront = smoothstep(-0.15, 0.5, dot(-phone, uPhoneFacing));
  light += uGlow * max(dot(normal, phone) * 0.75 + 0.25, 0.0) * inFront /
    (1.0 + reach * reach / (40.0 * 40.0));

  // And your face, lit by the screen, lights a little of what you look at.
  vec3 toEye = uEye - at;
  float near = length(toEye);
  light += uGlow * 0.45 * max(dot(normal, toEye / near), 0.0) /
    (1.0 + near * near / (140.0 * 140.0));
  return light;
}

float roundedBox(vec2 p, vec2 size, float radius) {
  vec2 q = abs(p) - size + radius;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

void main() {
  if (vMaterial == M_SKY) {
    outColor = vec4(skyColor(vExtra), 1.0);
    return;
  }
  if (vMaterial == M_DARK) {
    outColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 normal = normalize(vNormal);
  if (dot(normal, uEye - vWorld) < 0.0) normal = -normal;

  vec3 color = vColor;
  float shade = 1.0;
  float alpha = 1.0;

  if (vMaterial == M_SCREEN) {
    float edge = roundedBox(vLocal.xy, uPhoneSize.xy, uPhoneSize.z);
    if (edge > 0.0) discard;
    // Nothing is drawn here: the real phone on the page shows through.
    if (edge < -uPhoneSize.w) {
      outColor = vec4(0.0);
      return;
    }
    color = vec3(0.1, 0.1, 0.11);
  } else if (vMaterial == M_WALL) {
    float id = vExtra.x;
    bool side = mod(id, 2.0) > 0.5;
    color = wallColor(vec2(side ? vWorld.z : vWorld.x, vWorld.y), id);
    shade = cornerShade(vWorld);
  } else if (vMaterial == M_FLOOR) {
    color = floorColor(vWorld.xz);
    shade = cornerShade(vWorld);
  } else if (vMaterial == M_ROOF) {
    color = roofColor(vec2(vWorld.z, abs(vWorld.x) * 1.147));
    shade = mix(0.8, 0.5, uDecay);
  } else if (vMaterial == M_WOOD) {
    color = woodColor(vColor, vLocal);
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
    color = rugColor(vExtra);
    shade = cornerShade(vWorld);
  } else if (vMaterial == M_PICTURE) {
    color = pictureColor(vExtra);
  } else if (vMaterial == M_WEB) {
    if (webAt(vExtra) < 0.5) discard;
    color = vec3(0.86, 0.86, 0.84);
  } else if (vMaterial == M_GLASS) {
    // Dirt on the panes: most in the corners of each one.
    vec2 pane = abs(fract(vExtra * 2.0) - 0.5) * 2.0;
    float corner = smoothstep(0.5, 1.0, max(pane.x, pane.y));
    float grime = fbm(vExtra * 5.0 + 12.0);
    alpha = clamp(0.03 + uDecay * (0.12 + 0.5 * grime + 0.3 * corner), 0.0, 0.85);
    color = vec3(0.5, 0.48, 0.42);
    normal = vec3(0.0, 0.0, 1.0);
  }

  vec3 lit = color * lightAt(vWorld, normal, shade);
  lit *= mix(1.0, exp(-length(uEye - vWorld) * 0.00045), uGloom);
  // Bright parts roll off instead of clipping to white.
  vec3 over = max(lit - 0.75, 0.0);
  lit = min(lit, 0.75) + over / (1.0 + over * 2.2);
  outColor = vec4(lit, alpha);
}
`;

/** Covers the whole picture with one big triangle. */
export const SCREEN_VERTEX = `#version 300 es
void main() {
  vec2 corner = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(corner * 2.0 - 1.0, 0.0, 1.0);
}
`;

/** Takes the hut as drawn and makes the picture you see: darker in the
    corners, drained of colour, and broken into a few shades of coarse
    dots. How much of each is up to the numbers it is given. */
export const DITHER_FRAGMENT = `#version 300 es
precision highp float;

uniform sampler2D uScene;
// The picture's size in pixels, and how many pixels wide one dot is.
uniform vec2 uSize;
uniform float uCell;
// 0: the picture as drawn. 1: all dots.
uniform float uDither;
// How many shades each colour gets.
uniform float uLevels;
// How far the colours are pulled to the two below: shadow and light.
uniform float uMono;
uniform vec3 uInk;
uniform vec3 uPaper;
uniform float uVignette;
// How much the dots are shaken about, and a number that changes a few times
// a second, so that the dark crawls like a bad signal.
uniform float uGrain;
uniform float uTick;

out vec4 outColor;

float hash12(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
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

vec3 grade(vec3 color, vec2 uv) {
  vec2 fromMiddle = uv - 0.5;
  float corner = dot(fromMiddle, fromMiddle) * 2.0;
  color *= 1.0 - uVignette * smoothstep(0.1, 1.0, corner);
  float value = dot(color, vec3(0.299, 0.587, 0.114));
  return mix(color, mix(uInk, uPaper, value), uMono);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 fine = texture(uScene, uv);

  // The average of the dot this pixel is in.
  vec2 cell = floor(gl_FragCoord.xy / uCell);
  vec2 middle = (cell + 0.5) * uCell / uSize;
  vec2 quarter = vec2(uCell * 0.25) / uSize;
  vec4 coarse = 0.25 * (
    texture(uScene, middle + quarter * vec2(1.0, 1.0)) +
    texture(uScene, middle + quarter * vec2(-1.0, 1.0)) +
    texture(uScene, middle + quarter * vec2(1.0, -1.0)) +
    texture(uScene, middle + quarter * vec2(-1.0, -1.0))
  );

  // The hole for the phone is see-through: its colour is not a colour.
  vec3 smooth_ = grade(fine.rgb / max(fine.a, 0.001), uv) * fine.a;
  vec3 dots = grade(coarse.rgb / max(coarse.a, 0.001), middle);
  // Only the brightness is cut into shades, so the dots keep their colour.
  // Its square root is, so that the dark gets most of the shades; and the
  // darkest shades come out a little lighter than they went in, so that
  // there is still something to see in a dark room.
  float value = max(max(dots.r, dots.g), max(dots.b, 0.0001));
  float shaken = pattern(ivec2(cell)) + (hash12(cell + uTick * 17.0) - 0.5) * uGrain;
  float shade = floor(sqrt(value) * uLevels + shaken) / uLevels;
  dots *= pow(shade, mix(2.0, 1.3, uDither)) / value;
  float solid = step(0.5, coarse.a);

  outColor = mix(vec4(smooth_, fine.a), vec4(clamp(dots, 0.0, 1.0), 1.0) * solid, uDither);
}
`;
