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
  WINDOW,
} from "./layout";
import {
  IDENTITY,
  lerp,
  multiply,
  normalize,
  perspective,
  scale,
  scaling,
  smoothstep,
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
  SCREEN_FRAGMENT,
  SCREEN_VERTEX,
} from "./shaders";
import { daylightAt } from "./time";

/* Draws the hut with WebGL, in two steps: first the hut itself into a small
   picture off screen, then that picture onto the page in big pixels and few
   colours. Where the phone's screen is, the page is left see-through, so the
   real phone underneath shows. */

/** The most pixels of the page drawn on, however big or sharp it is. */
const MAX_PIXELS = 2_200_000;
/** About how many rows the small picture has: more than an old console's,
    and still few enough to see its pixels. */
const ROWS = 360;
/** Nothing nearer or further than this is drawn. */
const NEAR = 6;
const FAR = 6000;
/** The way to the sun: up and far to the left, out through the window. Its
    light crosses the hut in front of you and lands on the rug. */
const BEAM_FROM = normalize([-1, 0.75, -0.45]);
/** How strong the screen's light is. By day you do not notice it. */
const GLOW = 0.55;
/** The fire in the stove: where its light comes from, and its colour. */
const FIRE_AT: Vec3 = [STOVE[0], STOVE[1] + 145, STOVE[2] + 112];
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

function compile(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (shader === null) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) !== true) {
    console.error("Hut shader:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function link(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (vertex === null || fragment === null || program === null) return null;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  // The program keeps what it needs of them.
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    console.error("Hut shader:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
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

/**
 * Sets the hut up on this canvas. Null if the browser cannot do it (no
 * WebGL 2): the page then shows the phone on its own.
 */
export function createHutRenderer(
  canvas: HTMLCanvasElement,
): HutRenderer | null {
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
  });
  if (gl === null) return null;

  const hutProgram = link(gl, HUT_VERTEX, HUT_FRAGMENT);
  const screenProgram = link(gl, SCREEN_VERTEX, SCREEN_FRAGMENT);
  if (hutProgram === null || screenProgram === null) return null;
  const hutInputs = inputsOf(gl, hutProgram);
  const screenInputs = inputsOf(gl, screenProgram);

  const hutMesh = createMesh(6000);
  buildHut(hutMesh);
  const glassMesh = createMesh(8);
  buildGlass(glassMesh);
  const hut = createLayer(gl, hutMesh, false);
  const glass = createLayer(gl, glassMesh, false);
  const props = createLayer(gl, createMesh(2500), true);
  const hand = createLayer(gl, createMesh(6000), true);
  // The second program draws one triangle it makes up itself.
  const nothing = gl.createVertexArray();
  if (
    hut === null ||
    glass === null ||
    props === null ||
    hand === null ||
    nothing === null
  ) {
    return null;
  }

  let target: Target | null = null;
  // What the rebuilt meshes were last built for.
  let propsKey = "";
  let handKey = "";

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

    const { decay, hour, videos } = frame.props;
    const nextProps = `${videos} ${Math.floor(hour * 60)} ${Math.round(decay * 500)}`;
    if (nextProps !== propsKey) {
      propsKey = nextProps;
      clearMesh(props.mesh);
      buildProps(props.mesh, frame.props);
      refresh(gl, props);
    }
    const { turned, press, slide } = frame.hand;
    const nextHand = `${Math.round(turned * 400)} ${Math.round(press * 100)} ${Math.round(slide * 200)}`;
    if (nextHand !== handKey) {
      handKey = nextHand;
      clearMesh(hand.mesh);
      buildHand(hand.mesh, frame.hand);
      refresh(gl, hand);
    }

    // --- The hut, into the picture off screen ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.drawn);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const light = daylightAt(hour);
    gl.useProgram(hutProgram);
    // The small picture's squares stick out past the right and top of the
    // page by part of a square. The view is fitted to the page, not to
    // them, so that the hole stays over the real phone.
    const fitX = pageWidth / (width * cell);
    const fitY = pageHeight / (height * cell);
    hutInputs.matrix(
      "uCamera",
      [
        translation([2 * frame.shift, 0, 0]),
        translation([fitX - 1, fitY - 1, 0]),
        scaling(fitX, fitY, 1),
        perspective(FOCAL, pageWidth / pageHeight, NEAR, FAR),
        frame.view,
      ].reduce(multiply),
    );
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
    const gone = smoothstep(0.15, 1, decay);
    screenInputs.number("uCell", cell);
    screenInputs.number("uLevels", lerp(14, 8, gone));
    screenInputs.number("uMono", smoothstep(0.3, 1, decay) * 0.45);
    screenInputs.vector("uInk", INK);
    screenInputs.vector("uPaper", PAPER);
    screenInputs.number("uVignette", lerp(0.22, 0.55, gone));
    screenInputs.number("uGrime", gone);
    screenInputs.number("uGrain", lerp(0.06, 0.34, gone));
    screenInputs.number("uTick", Math.floor(frame.time * 10) % 1000);
    screenInputs.number("uLift", lerp(2, 1.25, smoothstep(0.3, 0.9, decay)));
    gl.bindVertexArray(nothing);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  const dispose = (): void => {
    for (const layer of [hut, glass, props, hand]) deleteLayer(gl, layer);
    gl.deleteVertexArray(nothing);
    if (target !== null) deleteTarget(gl, target);
    gl.deleteProgram(hutProgram);
    gl.deleteProgram(screenProgram);
  };

  return { draw, dispose };
}
