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
  WINDOW,
} from "./layout";
import {
  IDENTITY,
  lerp,
  multiply,
  normalize,
  perspective,
  scale,
  smoothstep,
  transformDirection,
  transformPoint,
  type Mat4,
  type Vec3,
} from "./math";
import { clearMesh, createMesh, VERTEX_SIZE, type Mesh } from "./mesh";
import {
  DITHER_FRAGMENT,
  HUT_FRAGMENT,
  HUT_VERTEX,
  SCREEN_VERTEX,
} from "./shaders";
import { daylightAt } from "./time";

/* Draws the hut with WebGL, in two steps: first the hut itself into a
   picture off screen, then that picture onto the page through the dither
   shader. Where the phone's screen is, the page is left see-through, so the
   real phone underneath shows. */

/** The most pixels drawn, however big or sharp the screen is. */
const MAX_PIXELS = 2_200_000;
/** How wide one dither dot is, in CSS pixels. */
const DOT = 3;
/** Nothing nearer or further than this is drawn. */
const NEAR = 6;
const FAR = 6000;
/** The way to the sun: up, to the left, and out through the window. */
const BEAM_FROM = normalize([-0.3, 0.72, -1]);
/** How strong the screen's light is. By day you do not notice it. */
const GLOW = 0.55;
/** The two colours everything ends up between: shadow and bone. */
const INK: Vec3 = [0.015, 0.02, 0.03];
const PAPER: Vec3 = [0.86, 0.8, 0.64];

export type HutFrame = {
  /** The size of the picture on the page, in CSS pixels. */
  width: number;
  height: number;
  /** Turns the hut to where you look: from the hut's space to your eyes'. */
  view: Mat4;
  /** Where the phone is: from the phone's space to the hut's. */
  phone: Mat4;
  props: PropsState;
  hand: HandState;
  /** The colour of the light from the phone's screen. */
  glow: Vec3;
  /** Seconds since the page opened. At 0 the grain in the dark holds still. */
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

/** The pictures off screen: one drawn into (with smoothed edges), and a
    plain copy of it that the dither shader can read. */
type Target = {
  width: number;
  height: number;
  drawn: WebGLFramebuffer;
  color: WebGLRenderbuffer;
  depth: WebGLRenderbuffer;
  copied: WebGLFramebuffer;
  texture: WebGLTexture;
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
  const color = gl.createRenderbuffer();
  const depth = gl.createRenderbuffer();
  const copied = gl.createFramebuffer();
  const texture = gl.createTexture();
  if (
    drawn === null ||
    color === null ||
    depth === null ||
    copied === null ||
    texture === null
  ) {
    return null;
  }
  // Four samples a pixel smooth the edges, where the card can do that.
  const samples = Math.min(4, Number(gl.getParameter(gl.MAX_SAMPLES)));
  gl.bindRenderbuffer(gl.RENDERBUFFER, color);
  gl.renderbufferStorageMultisample(
    gl.RENDERBUFFER,
    samples,
    gl.RGBA8,
    width,
    height,
  );
  gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
  gl.renderbufferStorageMultisample(
    gl.RENDERBUFFER,
    samples,
    gl.DEPTH_COMPONENT24,
    width,
    height,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, drawn);
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.RENDERBUFFER,
    color,
  );
  gl.framebufferRenderbuffer(
    gl.FRAMEBUFFER,
    gl.DEPTH_ATTACHMENT,
    gl.RENDERBUFFER,
    depth,
  );

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, copied);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { width, height, drawn, color, depth, copied, texture };
}

function deleteTarget(gl: WebGL2RenderingContext, target: Target): void {
  gl.deleteFramebuffer(target.drawn);
  gl.deleteRenderbuffer(target.color);
  gl.deleteRenderbuffer(target.depth);
  gl.deleteFramebuffer(target.copied);
  gl.deleteTexture(target.texture);
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
  const ditherProgram = link(gl, SCREEN_VERTEX, DITHER_FRAGMENT);
  if (hutProgram === null || ditherProgram === null) return null;
  const hutInputs = inputsOf(gl, hutProgram);
  const ditherInputs = inputsOf(gl, ditherProgram);

  const hutMesh = createMesh(6000);
  buildHut(hutMesh);
  const glassMesh = createMesh(8);
  buildGlass(glassMesh);
  const hut = createLayer(gl, hutMesh, false);
  const glass = createLayer(gl, glassMesh, false);
  const props = createLayer(gl, createMesh(2500), true);
  const hand = createLayer(gl, createMesh(6000), true);
  // The dither shader draws one triangle it makes up itself.
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

    // As sharp as the screen, up to a limit.
    const sharp = Math.min(
      window.devicePixelRatio,
      2,
      Math.sqrt(MAX_PIXELS / (frame.width * frame.height)),
    );
    const width = Math.max(1, Math.round(frame.width * sharp));
    const height = Math.max(1, Math.round(frame.height * sharp));
    if (target === null || target.width !== width || target.height !== height) {
      if (target !== null) deleteTarget(gl, target);
      canvas.width = width;
      canvas.height = height;
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
    const { turned, swipe } = frame.hand;
    const nextHand = `${Math.round(turned * 400)} ${Math.round(swipe * 100)}`;
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
    hutInputs.matrix(
      "uCamera",
      multiply(perspective(FOCAL, width / height, NEAR, FAR), frame.view),
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

    hutInputs.matrix("uModel", IDENTITY);
    drawLayer(gl, hut);
    drawLayer(gl, props);
    hutInputs.matrix("uModel", frame.phone);
    drawLayer(gl, hand);

    // The panes go on top of what is behind them, and hide nothing.
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.depthMask(false);
    hutInputs.matrix("uModel", IDENTITY);
    drawLayer(gl, glass);
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // --- That picture, through the dither shader, onto the page ---
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, target.drawn);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.copied);
    gl.blitFramebuffer(
      0,
      0,
      width,
      height,
      0,
      0,
      width,
      height,
      gl.COLOR_BUFFER_BIT,
      gl.NEAREST,
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(ditherProgram);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    ditherInputs.pair("uSize", width, height);
    ditherInputs.number("uCell", Math.max(2, Math.round(DOT * sharp)));
    ditherInputs.number("uDither", smoothstep(0.15, 0.8, decay) * 0.95);
    ditherInputs.number("uLevels", lerp(16, 4, smoothstep(0.15, 1, decay)));
    ditherInputs.number("uMono", smoothstep(0.35, 1, decay) * 0.7);
    ditherInputs.vector("uInk", INK);
    ditherInputs.vector("uPaper", PAPER);
    ditherInputs.number("uVignette", lerp(0.1, 0.6, smoothstep(0.2, 1, decay)));
    ditherInputs.number("uGrain", smoothstep(0.35, 1, decay) * 0.32);
    ditherInputs.number("uTick", Math.floor(frame.time * 10) % 1000);
    gl.bindVertexArray(nothing);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  };

  const dispose = (): void => {
    for (const layer of [hut, glass, props, hand]) deleteLayer(gl, layer);
    gl.deleteVertexArray(nothing);
    if (target !== null) deleteTarget(gl, target);
    gl.deleteProgram(hutProgram);
    gl.deleteProgram(ditherProgram);
  };

  return { draw, dispose };
}
