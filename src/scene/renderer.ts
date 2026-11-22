import { NEWS_REPORTS } from "../data/news";
import { buildHand, type HandState } from "./hand";
import { buildGlass, buildHut, buildProps, type PropsState } from "./hut";
import {
  EAVE,
  EYE,
  FOCAL,
  HALF_DEPTH,
  HALF_WIDTH,
  PHONE,
  PHONE_CORNER,
  PHONE_RIM,
  STOVE,
  STOVE_YAW,
  TV_FACING,
  TV_LIGHT_AT,
  WINDOW,
} from "./layout";
import {
  IDENTITY,
  clamp,
  invert,
  lerp,
  mix,
  multiply,
  normalize,
  perspective,
  scale,
  scaling,
  smoothstep,
  sub,
  transformDirection,
  transformPoint,
  translation,
  type Mat4,
  type Vec3,
} from "./math";
import { clearMesh, createMesh, VERTEX_SIZE, type Mesh } from "./mesh";
import {
  HUT_FRAGMENT,
  HUT_VERTEX,
  MATERIAL,
  SCREEN_FRAGMENT,
  SCREEN_VERTEX,
} from "./shaders";
import { daylightAt } from "./time";
import { createTvScreen, TV_HEIGHT, TV_WIDTH, tvLightFor } from "./tvScreen";

/* Draws the hut with WebGL, in two steps: first the hut itself into a small
   picture off screen, then that picture onto the page in big pixels and few
   colours. Where the phone's screen is, the page is left see-through, so the
   real phone underneath shows. */

/** The most pixels of the page drawn on, however big or sharp it is. */
const MAX_PIXELS = 2_200_000;
/** About how many rows the small picture has: well over an old console's,
    and still few enough to see its pixels. */
const ROWS = 720;
/** Nothing nearer or further than this is drawn. */
const NEAR = 6;
const FAR = 6000;
/** The way to the sun: up and far to the left, out through the window. Its
    light crosses the hut in front of the couch and lands on the rug. */
const BEAM_FROM = normalize([-0.82, 0.72, -0.58]);
/** How strong the screen's light is. By day you do not notice it. */
const GLOW = 0.55;
/** The fire in the stove: where its light comes from, and its colour. */
const FIRE_AT: Vec3 = [
  STOVE[0] + Math.sin(STOVE_YAW) * 112,
  STOVE[1] + 145,
  STOVE[2] + Math.cos(STOVE_YAW) * 112,
];
const FIRE: Vec3 = [1.05, 0.56, 0.2];
/** The two colours a ruined hut ends up between: shadow and bone. */
const INK: Vec3 = [0.015, 0.02, 0.03];
const PAPER: Vec3 = [0.86, 0.8, 0.64];

/** How the page is cut into the hut's pixels. The page is drawn on `sharp`
    times as sharp as CSS counts, up to a limit, and each pixel of the hut
    covers a square of `cell` of those. */
function gridOf(width: number, height: number) {
  const sharp = Math.min(
    window.devicePixelRatio,
    2,
    Math.sqrt(MAX_PIXELS / (width * height)),
  );
  const cell = Math.max(
    2,
    Math.round((Math.min(width, height) / ROWS) * sharp),
  );
  return { sharp, cell };
}

/** How big one pixel of the hut is on a page of this size, in CSS pixels. */
export function hutPixel(width: number, height: number): number {
  const { sharp, cell } = gridOf(width, height);
  return cell / sharp;
}

export type HutFrame = {
  /** The size of the picture on the page, in CSS pixels. */
  width: number;
  height: number;
  /** Turns the hut to where you look: from the hut's space to your eyes'. */
  view: Mat4;
  /** How far the middle of the view is moved sideways, in page widths:
      -0.25 puts it half way between the left edge and the middle. */
  shift: number;
  /** Where the phone is: from the phone's space to the hut's. */
  phone: Mat4;
  props: PropsState;
  hand: HandState;
  /** Smoothly eased hour driving daylight & sky, separate from crisp per-reel clock hands. */
  dayHour: number;
  /** Index into NEWS_REPORTS currently broadcast on the CRT TV. */
  reportIndex: number;
  /** The colour of the light from the phone's screen. */
  glow: Vec3;
  /** Seconds since the page opened. At 0 the fire, the dust and the grain
      in the dark hold still. */
  time: number;
};

export type HutRenderer = {
  draw: (frame: HutFrame) => void;
  /** Frees everything it made on the graphics card. */
  dispose: () => void;
};

export type HutLoader = {
  /**
   * Runs the next piece of setup. Returns true once setup has finished (either
   * with a renderer or after failing). Pass `blocking: true` to finish shaders
   * without polling parallel compilation across frames.
   */
  step: (blocking?: boolean) => boolean;
  /** How much of WebGL setup is done, from 0 to 1. */
  progress: () => number;
  /** The finished renderer once `step()` returns true, or null if WebGL failed. */
  renderer: () => HutRenderer | null;
  /** Frees any partial GPU resources if cancelled before finishing. */
  dispose: () => void;
};

/** A mesh on the graphics card. */
type Layer = {
  mesh: Mesh;
  shape: WebGLVertexArrayObject;
  vertices: WebGLBuffer;
  indices: WebGLBuffer;
};

/** The small picture off screen that the hut is drawn into. */
type Target = {
  width: number;
  height: number;
  drawn: WebGLFramebuffer;
  texture: WebGLTexture;
  depth: WebGLRenderbuffer;
};

type PendingProgram = {
  vertex: WebGLShader;
  fragment: WebGLShader;
  program: WebGLProgram;
};

/**
 * Starts compiling and linking a program without querying status, so drivers
 * with KHR_parallel_shader_compile can do the heavy work off the main thread.
 */
function startProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): PendingProgram | null {
  const vertex = gl.createShader(gl.VERTEX_SHADER);
  const fragment = gl.createShader(gl.FRAGMENT_SHADER);
  const program = gl.createProgram();
  if (vertex === null || fragment === null || program === null) {
    if (vertex !== null) gl.deleteShader(vertex);
    if (fragment !== null) gl.deleteShader(fragment);
    if (program !== null) gl.deleteProgram(program);
    return null;
  }
  gl.shaderSource(vertex, vertexSource);
  gl.compileShader(vertex);
  gl.shaderSource(fragment, fragmentSource);
  gl.compileShader(fragment);
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  return { vertex, fragment, program };
}

function deletePendingProgram(
  gl: WebGL2RenderingContext,
  pending: PendingProgram,
): void {
  gl.deleteShader(pending.vertex);
  gl.deleteShader(pending.fragment);
  gl.deleteProgram(pending.program);
}

function finishProgram(
  gl: WebGL2RenderingContext,
  pending: PendingProgram,
): WebGLProgram | null {
  const { vertex, fragment, program } = pending;
  const linked = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  if (!linked) {
    if (gl.getShaderParameter(vertex, gl.COMPILE_STATUS) !== true) {
      console.error("Hut shader:", gl.getShaderInfoLog(vertex));
    }
    if (gl.getShaderParameter(fragment, gl.COMPILE_STATUS) !== true) {
      console.error("Hut shader:", gl.getShaderInfoLog(fragment));
    }
    console.error("Hut shader:", gl.getProgramInfoLog(program));
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    gl.deleteProgram(program);
    return null;
  }
  // The program keeps what it needs of them.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  return program;
}

/** Sets a program's numbers by name. The program has to be in use. */
function inputsOf(gl: WebGL2RenderingContext, program: WebGLProgram) {
  const places = new Map<string, WebGLUniformLocation | null>();
  const matrix = new Float32Array(16);
  function at(name: string): WebGLUniformLocation | null {
    let place = places.get(name);
    if (place === undefined) {
      place = gl.getUniformLocation(program, name);
      places.set(name, place);
    }
    return place;
  }
  return {
    int: (name: string, value: number) => gl.uniform1i(at(name), value),
    number: (name: string, value: number) => gl.uniform1f(at(name), value),
    pair: (name: string, x: number, y: number) => gl.uniform2f(at(name), x, y),
    vector: (name: string, v: Vec3) => gl.uniform3f(at(name), v[0], v[1], v[2]),
    four: (name: string, x: number, y: number, z: number, w: number) =>
      gl.uniform4f(at(name), x, y, z, w),
    matrix: (name: string, m: Mat4) => {
      matrix.set(m);
      gl.uniformMatrix4fv(at(name), false, matrix);
    },
  };
}

/** Puts a mesh on the graphics card. One that will be rebuilt gets room for
    all it can hold. */
function createLayer(
  gl: WebGL2RenderingContext,
  mesh: Mesh,
  rebuilt: boolean,
): Layer | null {
  const shape = gl.createVertexArray();
  const vertices = gl.createBuffer();
  const indices = gl.createBuffer();
  if (shape === null || vertices === null || indices === null) return null;
  gl.bindVertexArray(shape);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
  if (rebuilt) {
    gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices.byteLength, gl.DYNAMIC_DRAW);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      mesh.indices.byteLength,
      gl.DYNAMIC_DRAW,
    );
  } else {
    gl.bufferData(
      gl.ARRAY_BUFFER,
      mesh.vertices.subarray(0, mesh.vertexCount * VERTEX_SIZE),
      gl.STATIC_DRAW,
    );
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      mesh.indices.subarray(0, mesh.indexCount),
      gl.STATIC_DRAW,
    );
  }
  // The parts of a corner, in the order mesh.ts writes them.
  const stride = VERTEX_SIZE * 4;
  const parts = [3, 3, 3, 1, 2];
  let offset = 0;
  parts.forEach((size, slot) => {
    gl.enableVertexAttribArray(slot);
    gl.vertexAttribPointer(slot, size, gl.FLOAT, false, stride, offset * 4);
    offset += size;
  });
  gl.bindVertexArray(null);
  return { mesh, shape, vertices, indices };
}

/** Sends a rebuilt mesh to the graphics card. */
function refresh(gl: WebGL2RenderingContext, layer: Layer): void {
  const { mesh } = layer;
  gl.bindVertexArray(layer.shape);
  gl.bindBuffer(gl.ARRAY_BUFFER, layer.vertices);
  gl.bufferSubData(
    gl.ARRAY_BUFFER,
    0,
    mesh.vertices,
    0,
    mesh.vertexCount * VERTEX_SIZE,
  );
  gl.bufferSubData(
    gl.ELEMENT_ARRAY_BUFFER,
    0,
    mesh.indices,
    0,
    mesh.indexCount,
  );
}

function drawLayer(gl: WebGL2RenderingContext, layer: Layer): void {
  gl.bindVertexArray(layer.shape);
  gl.drawElements(gl.TRIANGLES, layer.mesh.indexCount, gl.UNSIGNED_SHORT, 0);
}

function deleteLayer(gl: WebGL2RenderingContext, layer: Layer): void {
  gl.deleteVertexArray(layer.shape);
  gl.deleteBuffer(layer.vertices);
  gl.deleteBuffer(layer.indices);
}

function createTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): Target | null {
  const drawn = gl.createFramebuffer();
  const texture = gl.createTexture();
  const depth = gl.createRenderbuffer();
  if (drawn === null || texture === null || depth === null) return null;
  // Its pixels are shown as they are: hard squares, nothing smoothed.
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, drawn);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER,
    depth,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { width, height, drawn, texture, depth };
}

function deleteTarget(gl: WebGL2RenderingContext, target: Target): void {
  gl.deleteFramebuffer(target.drawn);
  gl.deleteTexture(target.texture);
  gl.deleteRenderbuffer(target.depth);
}

type TvQuad = {
  origin: Vec3;
  right: Vec3;
  up: Vec3;
};

/**
 * Extracts the world-space CRT glass rectangle directly from the built hut
 * mesh so full-resolution TV sampling stays locked to the screen regardless
 * of where or at what angle the television sits in the room.
 */
function extractTvQuad(mesh: Mesh): TvQuad {
  let bl: Vec3 | null = null;
  let br: Vec3 | null = null;
  let tl: Vec3 | null = null;
  const v = mesh.vertices;
  for (let i = 0; i < mesh.vertexCount; i++) {
    const at = i * VERTEX_SIZE;
    if (Math.round(v[at + 9]) !== MATERIAL.tv) continue;
    const p: Vec3 = [v[at], v[at + 1], v[at + 2]];
    const mu = v[at + 10];
    const mv = v[at + 11];
    if (mu < 0.5 && mv < 0.5) bl = p;
    else if (mu > 0.5 && mv < 0.5) br = p;
    else if (mu < 0.5 && mv > 0.5) tl = p;
  }
  if (bl !== null && br !== null && tl !== null) {
    return { origin: bl, right: sub(br, bl), up: sub(tl, bl) };
  }
  return { origin: [0, 0, 0], right: [1, 0, 0], up: [0, 1, 0] };
}

type RendererResources = {
  hutProgram: WebGLProgram;
  screenProgram: WebGLProgram;
  hut: Layer;
  glass: Layer;
  props: Layer;
  hand: Layer;
  nothing: WebGLVertexArrayObject;
  tvScreen: ReturnType<typeof createTvScreen>;
  tvTexture: WebGLTexture;
  tvQuad: TvQuad;
};

function createRendererHandle(
  canvas: HTMLCanvasElement,
  gl: WebGL2RenderingContext,
  resources: RendererResources,
): HutRenderer {
  const {
    hutProgram,
    screenProgram,
    hut,
    glass,
    props,
    hand,
    nothing,
    tvScreen,
    tvTexture,
    tvQuad,
  } = resources;
  const hutInputs = inputsOf(gl, hutProgram);
  const screenInputs = inputsOf(gl, screenProgram);

  let target: Target | null = null;
  // What the rebuilt meshes were last built for.
  let propsKey = "";
  let handKey = "";
  let lastReport = -1;
  let reportChangedAt = -10;
  let lastTvDraw = -10;
  let lastFrameTime = -1;
  let currentTvLight: Vec3 | null = null;
  let currentSeverity = 0;

  const draw = (frame: HutFrame): void => {
    if (gl.isContextLost()) return;
    if (frame.width < 1 || frame.height < 1) return;

    // The hut is a much smaller picture than the page it is drawn on.
    const { sharp, cell } = gridOf(frame.width, frame.height);
    const pageWidth = Math.max(1, Math.round(frame.width * sharp));
    const pageHeight = Math.max(1, Math.round(frame.height * sharp));
    const width = Math.ceil(pageWidth / cell);
    const height = Math.ceil(pageHeight / cell);
    if (canvas.width !== pageWidth || canvas.height !== pageHeight) {
      canvas.width = pageWidth;
      canvas.height = pageHeight;
    }
    if (target === null || target.width !== width || target.height !== height) {
      if (target !== null) deleteTarget(gl, target);
      target = createTarget(gl, width, height);
      if (target === null) return;
    }

    const { decay, hour, videos, files, coins, leaflets } = frame.props;
    const nextProps = [
      videos,
      Math.floor(hour * 60),
      Math.round(decay * 250),
      files.map((sure) => Math.round(sure * 100)).join(),
      coins,
      leaflets.join(),
    ].join(" ");
    if (nextProps !== propsKey) {
      propsKey = nextProps;
      clearMesh(props.mesh);
      buildProps(props.mesh, frame.props);
      refresh(gl, props);
    }
    const { turned, press, tip } = frame.hand;
    const nextHand = `${Math.round(turned * 400)} ${Math.round(press * 100)} ${Math.round(tip[0] * 4)} ${Math.round(tip[1] * 4)}`;
    if (nextHand !== handKey) {
      handKey = nextHand;
      clearMesh(hand.mesh);
      buildHand(hand.mesh, frame.hand);
      refresh(gl, hand);
    }

    const safeReport = clamp(frame.reportIndex, 0, NEWS_REPORTS.length - 1);
    const report = NEWS_REPORTS[safeReport];
    if (safeReport !== lastReport) {
      if (lastReport !== -1) reportChangedAt = frame.time;
      lastReport = safeReport;
    }
    const glitch = clamp(1 - (frame.time - reportChangedAt) / 0.35, 0, 1);
    if (lastTvDraw < 0 || glitch > 0 || frame.time - lastTvDraw >= 0.05) {
      lastTvDraw = frame.time;
      tvScreen.render({ report, time: frame.time, glitch, decay });
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, tvTexture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,
        0,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        tvScreen.canvas,
      );
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    // --- The hut, into the picture off screen ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.drawn);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const light = daylightAt(frame.dayHour);
    const dt =
      lastFrameTime < 0 ? 0 : clamp(frame.time - lastFrameTime, 0, 0.1);
    lastFrameTime = frame.time;
    const moodEase = dt === 0 ? 1 : 1 - Math.exp(-dt * 0.9);
    const wantTvLight = tvLightFor(report, decay, light.night, frame.time);
    currentTvLight =
      currentTvLight === null
        ? wantTvLight
        : mix(currentTvLight, wantTvLight, moodEase);
    currentSeverity =
      dt === 0
        ? report.severity
        : lerp(currentSeverity, report.severity, moodEase);
    gl.useProgram(hutProgram);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tvTexture);
    hutInputs.int("uTvScreen", 1);
    hutInputs.vector("uTvAt", TV_LIGHT_AT);
    hutInputs.vector("uTvFacing", TV_FACING);
    hutInputs.vector("uTvLight", currentTvLight);
    // The small picture's squares stick out past the right and top of the
    // page by part of a square. The view is fitted to the page, not to
    // them, so that the hole stays over the real phone.
    const fitX = pageWidth / (width * cell);
    const fitY = pageHeight / (height * cell);
    const camera = [
      translation([2 * frame.shift, 0, 0]),
      translation([fitX - 1, fitY - 1, 0]),
      scaling(fitX, fitY, 1),
      perspective(FOCAL, pageWidth / pageHeight, NEAR, FAR),
      frame.view,
    ].reduce(multiply);
    hutInputs.matrix("uCamera", camera);
    hutInputs.vector("uEye", EYE);
    hutInputs.number("uDecay", decay);
    hutInputs.vector("uAmbient", light.ambient);
    hutInputs.vector("uSkyLight", light.skyLight);
    hutInputs.vector("uBeam", light.beam);
    hutInputs.vector("uBeamFrom", BEAM_FROM);
    hutInputs.four("uWindow", WINDOW.x0, WINDOW.y0, WINDOW.x1, WINDOW.y1);
    hutInputs.vector("uWindowAt", [
      (WINDOW.x0 + WINDOW.x1) / 2,
      (WINDOW.y0 + WINDOW.y1) / 2,
      -HALF_DEPTH,
    ]);
    hutInputs.vector("uSkyTop", light.skyTop);
    hutInputs.vector("uSkyLow", light.skyLow);
    hutInputs.number("uNight", light.night);
    hutInputs.number("uLand", light.land);
    hutInputs.vector("uPhoneAt", transformPoint(frame.phone, [0, 0, 0]));
    hutInputs.vector(
      "uPhoneFacing",
      normalize(transformDirection(frame.phone, [0, 0, 1])),
    );
    hutInputs.vector("uGlow", scale(frame.glow, GLOW));
    hutInputs.four(
      "uPhoneSize",
      PHONE.width / 2,
      PHONE.height / 2,
      PHONE_CORNER,
      PHONE_RIM,
    );
    hutInputs.vector("uRoom", [HALF_WIDTH, EAVE, HALF_DEPTH]);
    hutInputs.number(
      "uGloom",
      smoothstep(0.2, 1, decay) * (0.35 + 0.65 * light.night),
    );
    // The fire burns down as the hut goes, and flickers while it lasts.
    const flame = 1 - smoothstep(0.1, 0.5, decay);
    const flicker =
      1 +
      0.07 * Math.sin(frame.time * 11) +
      0.05 * Math.sin(frame.time * 17.3 + 1);
    hutInputs.vector("uFireAt", FIRE_AT);
    hutInputs.vector("uFire", scale(FIRE, flame * flicker));
    hutInputs.number("uFlame", flame);
    // More dust hangs in the air as the hut goes. Moonlight shows less of it.
    hutInputs.number(
      "uHaze",
      lerp(0.0016, 0.002, decay) * lerp(1, 0.4, light.night),
    );
    hutInputs.number("uTime", frame.time);

    // The hut's corners jump to whole pixels. The hand's do not: the real
    // phone moves smoothly, and the hole has to stay on it.
    hutInputs.matrix("uModel", IDENTITY);
    hutInputs.pair("uSnap", width / 2, height / 2);
    hutInputs.number("uHeld", 0);
    drawLayer(gl, hut);
    drawLayer(gl, props);
    hutInputs.matrix("uModel", frame.phone);
    hutInputs.pair("uSnap", 0, 0);
    hutInputs.number("uHeld", 1);
    drawLayer(gl, hand);

    // The panes go on top of what is behind them, and hide nothing.
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.depthMask(false);
    hutInputs.matrix("uModel", IDENTITY);
    hutInputs.pair("uSnap", width / 2, height / 2);
    hutInputs.number("uHeld", 0);
    drawLayer(gl, glass);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // --- That picture, in big pixels and few colours, onto the page ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, pageWidth, pageHeight);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(screenProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tvTexture);
    const gone = smoothstep(0.15, 1, decay);
    screenInputs.int("uScene", 0);
    screenInputs.int("uTvScreen", 1);
    screenInputs.matrix("uInvCamera", invert(camera));
    screenInputs.vector("uTvOrigin", tvQuad.origin);
    screenInputs.vector("uTvRight", tvQuad.right);
    screenInputs.vector("uTvUp", tvQuad.up);
    screenInputs.number("uCell", cell);
    // Enough shades that light and shadow fall off in small steps, not in
    // big flat clumps.
    screenInputs.number("uLevels", lerp(18, 10, gone));
    // Dots only near the edge between two steps at first, so that little
    // of the pattern slides over the hut as you look around. A ruined hut
    // is dotted all over, like a bad signal.
    screenInputs.number("uSpread", lerp(0.4, 1, gone));
    screenInputs.number("uMono", smoothstep(0.3, 1, decay) * 0.34);
    screenInputs.vector("uInk", INK);
    screenInputs.vector("uPaper", PAPER);
    screenInputs.number("uVignette", lerp(0.22, 0.56, gone));
    screenInputs.number("uGrime", gone);
    // No shaking while the hut is cosy. Later the dots shake, a few times a
    // second rather than every frame.
    screenInputs.number("uGrain", 0.3 * smoothstep(0.25, 1, decay));
    screenInputs.number("uTick", Math.floor(frame.time * 5) % 1000);
    screenInputs.number("uLift", lerp(2, 1.35, smoothstep(0.3, 0.9, decay)));
    screenInputs.number("uBloom", lerp(0.48, 0.42, gone));
    screenInputs.number("uScan", 0.09);
    screenInputs.number("uGlitch", glitch);
    screenInputs.number("uSeverity", currentSeverity);
    screenInputs.number("uNight", light.night);
    screenInputs.number("uTime", frame.time);
    gl.bindVertexArray(nothing);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  const dispose = (): void => {
    for (const layer of [hut, glass, props, hand]) deleteLayer(gl, layer);
    gl.deleteVertexArray(nothing);
    gl.deleteTexture(tvTexture);
    if (target !== null) deleteTarget(gl, target);
    gl.deleteProgram(hutProgram);
    gl.deleteProgram(screenProgram);
  };

  return { draw, dispose };
}

/**
 * Sets the hut up on this canvas in real, incremental steps so the loading
 * screen can advance as each stage completes and drivers with
 * KHR_parallel_shader_compile can build shaders off the main thread.
 */
export function createHutLoader(canvas: HTMLCanvasElement): HutLoader {
  let gl: WebGL2RenderingContext | null = null;
  let parallel: KHR_parallel_shader_compile | null = null;
  let screenPending: PendingProgram | null = null;
  let hutPending: PendingProgram | null = null;
  let screenProgram: WebGLProgram | null = null;
  let hutProgram: WebGLProgram | null = null;
  let hut: Layer | null = null;
  let glass: Layer | null = null;
  let props: Layer | null = null;
  let hand: Layer | null = null;
  let nothing: WebGLVertexArrayObject | null = null;
  let tvScreen: ReturnType<typeof createTvScreen> | null = null;
  let tvTexture: WebGLTexture | null = null;
  let tvQuad: TvQuad | null = null;

  let stage = 0;
  let currentProgress = 0;
  let done = false;
  let result: HutRenderer | null = null;

  const cleanupPartial = (): void => {
    if (gl === null) return;
    if (screenPending !== null) {
      deletePendingProgram(gl, screenPending);
      screenPending = null;
    }
    if (hutPending !== null) {
      deletePendingProgram(gl, hutPending);
      hutPending = null;
    }
    if (screenProgram !== null) {
      gl.deleteProgram(screenProgram);
      screenProgram = null;
    }
    if (hutProgram !== null) {
      gl.deleteProgram(hutProgram);
      hutProgram = null;
    }
    if (hut !== null) {
      deleteLayer(gl, hut);
      hut = null;
    }
    if (glass !== null) {
      deleteLayer(gl, glass);
      glass = null;
    }
    if (props !== null) {
      deleteLayer(gl, props);
      props = null;
    }
    if (hand !== null) {
      deleteLayer(gl, hand);
      hand = null;
    }
    if (nothing !== null) {
      gl.deleteVertexArray(nothing);
      nothing = null;
    }
    if (tvTexture !== null) {
      gl.deleteTexture(tvTexture);
      tvTexture = null;
    }
  };

  const fail = (): true => {
    cleanupPartial();
    currentProgress = 1;
    done = true;
    return true;
  };

  const step = (blocking = false): boolean => {
    if (done) return true;
    if (gl !== null && gl.isContextLost()) return fail();

    switch (stage) {
      case 0: {
        gl = canvas.getContext("webgl2", {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
          depth: false,
        });
        if (gl === null) return fail();
        parallel = gl.getExtension("KHR_parallel_shader_compile");
        // Kick off both shaders right away so GPU worker threads compile while
        // CPU mesh building runs in the next steps.
        screenPending = startProgram(gl, SCREEN_VERTEX, SCREEN_FRAGMENT);
        hutPending = startProgram(gl, HUT_VERTEX, HUT_FRAGMENT);
        if (screenPending === null || hutPending === null) return fail();
        currentProgress = 1 / 9;
        stage = 1;
        return false;
      }

      case 1: {
        if (gl === null) return fail();
        const hutMesh = createMesh(42000);
        buildHut(hutMesh);
        tvQuad = extractTvQuad(hutMesh);
        hut = createLayer(gl, hutMesh, false);
        if (hut === null) return fail();
        currentProgress = 2 / 9;
        stage = 2;
        return false;
      }

      case 2: {
        if (gl === null) return fail();
        const glassMesh = createMesh(8);
        buildGlass(glassMesh);
        glass = createLayer(gl, glassMesh, false);
        props = createLayer(gl, createMesh(12000), true);
        hand = createLayer(gl, createMesh(6000), true);
        if (glass === null || props === null || hand === null) return fail();
        currentProgress = 3 / 9;
        stage = 3;
        return false;
      }

      case 3: {
        if (gl === null) return fail();
        // The second program draws one triangle it makes up itself.
        nothing = gl.createVertexArray();
        tvScreen = createTvScreen();
        tvTexture = gl.createTexture();
        if (nothing === null || tvTexture === null) return fail();
        gl.bindTexture(gl.TEXTURE_2D, tvTexture);
        const tvMips = Math.floor(Math.log2(Math.max(TV_WIDTH, TV_HEIGHT))) + 1;
        gl.texStorage2D(gl.TEXTURE_2D, tvMips, gl.RGBA8, TV_WIDTH, TV_HEIGHT);
        gl.texParameteri(
          gl.TEXTURE_2D,
          gl.TEXTURE_MIN_FILTER,
          gl.LINEAR_MIPMAP_LINEAR,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const aniso = gl.getExtension("EXT_texture_filter_anisotropic");
        if (aniso !== null) {
          const maxAniso = Number(
            gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT),
          );
          if (Number.isFinite(maxAniso) && maxAniso > 1) {
            gl.texParameterf(
              gl.TEXTURE_2D,
              aniso.TEXTURE_MAX_ANISOTROPY_EXT,
              Math.min(4, maxAniso),
            );
          }
        }
        gl.bindTexture(gl.TEXTURE_2D, null);
        currentProgress = 4 / 9;
        stage = 4;
        return false;
      }

      case 4: {
        if (gl === null || screenPending === null) return fail();
        if (
          !blocking &&
          parallel !== null &&
          gl.getProgramParameter(
            screenPending.program,
            parallel.COMPLETION_STATUS_KHR,
          ) === false
        ) {
          return false;
        }
        const pending = screenPending;
        screenPending = null;
        screenProgram = finishProgram(gl, pending);
        if (screenProgram === null) return fail();
        currentProgress = 6 / 9;
        stage = 5;
        return false;
      }

      case 5: {
        if (
          gl === null ||
          hutPending === null ||
          screenProgram === null ||
          hut === null ||
          glass === null ||
          props === null ||
          hand === null ||
          nothing === null ||
          tvScreen === null ||
          tvTexture === null ||
          tvQuad === null
        ) {
          return fail();
        }
        if (
          !blocking &&
          parallel !== null &&
          gl.getProgramParameter(
            hutPending.program,
            parallel.COMPLETION_STATUS_KHR,
          ) === false
        ) {
          return false;
        }
        const pending = hutPending;
        hutPending = null;
        hutProgram = finishProgram(gl, pending);
        if (hutProgram === null) return fail();
        result = createRendererHandle(canvas, gl, {
          hutProgram,
          screenProgram,
          hut,
          glass,
          props,
          hand,
          nothing,
          tvScreen,
          tvTexture,
          tvQuad,
        });
        currentProgress = 1;
        done = true;
        return true;
      }

      default:
        done = true;
        return true;
    }
  };

  return {
    step,
    progress: () => currentProgress,
    renderer: () => result,
    dispose: () => {
      if (result === null) cleanupPartial();
      done = true;
    },
  };
}

/**
 * Sets the hut up on this canvas synchronously. Null if the browser cannot do
 * it (no WebGL 2): the page then shows the phone on its own.
 */
export function createHutRenderer(
  canvas: HTMLCanvasElement,
): HutRenderer | null {
  const loader = createHutLoader(canvas);
  while (!loader.step(true)) {
    // Run every setup stage synchronously (e.g. after WebGL context restore).
  }
  return loader.renderer();
}
