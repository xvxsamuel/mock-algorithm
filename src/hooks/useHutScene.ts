import { useEffect, useRef, type RefObject } from "react";
import {
  ARM,
  EYE,
  FOCAL,
  HOLD_DEG,
  PHONE,
  PHONE_PIXELS,
  REST_DEG,
} from "../scene/layout";
import {
  clamp,
  colorOf,
  lerp,
  mix,
  multiply,
  radians,
  rotationX,
  rotationY,
  rotationZ,
  scale,
  scaling,
  smoothstep,
  translation,
  type Mat4,
} from "../scene/math";
import { createHutRenderer, hutPixel } from "../scene/renderer";
import { decayAfter, hourAfter } from "../scene/time";

/** Where your head is turned, in degrees. */
export type Look = {
  /** Positive is to the right. */
  yaw: number;
  /** Positive is up. */
  pitch: number;
};

type HutInput = {
  /** Where you want to look. The view eases to it. */
  look: Look;
  /** You are dragging the view around: it follows at once. */
  dragging: boolean;
  /** The feed is running. Time only passes in the hut while it is. */
  running: boolean;
  /** Videos you have swiped past. */
  videos: number;
  /** The colour of the video on screen, like "#ff8a00". */
  glow: string;
  /** The panel is open beside the phone: the view moves over for it. */
  aside: boolean;
};

/** The pitch at which the phone is held up, and at which it has dropped. */
const HELD_AT = -20;
const DROPPED_AT = 0;
/** How fast the view catches up with where you look. */
const EASE = 6;
/** How long the thumb takes over one swipe. */
const SWIPE_MS = 520;
/** Turns a point upside down: the page counts down, the hut counts up. */
const FLIP = scaling(1, -1, 1);

/**
 * Runs the hut: every frame it turns the view to where you look, lets time
 * pass, draws the hut on the canvas, and moves the real phone on the page
 * to where your hand holds it. With the panel open beside the phone, the
 * middle of the view is half way between the page's left edge and the panel.
 *
 * Time in the hut only moves while you look at the phone. Look up and it
 * stands still, so you never see it pass: it is just later than it was.
 */
export function useHutScene(
  stage: RefObject<HTMLElement | null>,
  canvas: RefObject<HTMLCanvasElement | null>,
  phone: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  input: HutInput,
): void {
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });

  useEffect(() => {
    const stageElement = stage.current;
    const canvasElement = canvas.current;
    const phoneElement = phone.current;
    const panelElement = panel.current;
    if (
      stageElement === null ||
      canvasElement === null ||
      phoneElement === null
    ) {
      return;
    }
    let renderer = createHutRenderer(canvasElement);
    // The graphics card can drop the picture (e.g. the tab was asleep for a
    // long time). Asking to get it back means setting the hut up again.
    const onLost = (event: Event) => event.preventDefault();
    const onRestored = () => {
      renderer = createHutRenderer(canvasElement);
    };
    canvasElement.addEventListener("webglcontextlost", onLost);
    canvasElement.addEventListener("webglcontextrestored", onRestored);
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");

    let width = stageElement.clientWidth;
    let height = stageElement.clientHeight;
    // Where the panel starts, from the left of the page.
    let panelLeft = panelElement?.offsetLeft ?? width;
    // The dots on the phone's screen are as big on the page as the hut's
    // pixels. The phone is laid out bigger than it is shown, so in its own
    // px they are bigger too.
    const sizeDots = () => {
      if (width < 1 || height < 1) return;
      const shown = ((PHONE.height / PHONE_PIXELS) * FOCAL * height) / 2 / ARM;
      const dot = hutPixel(width, height) / shown;
      phoneElement.style.setProperty("--room-dot", `${dot.toFixed(2)}px`);
    };
    sizeDots();
    const observer = new ResizeObserver(() => {
      width = stageElement.clientWidth;
      height = stageElement.clientHeight;
      panelLeft = panelElement?.offsetLeft ?? width;
      sizeDots();
    });
    observer.observe(stageElement);
    if (panelElement !== null) observer.observe(panelElement);

    let { yaw, pitch } = latest.current.look;
    /** How far the middle of the view is from the middle of the page, in
        page widths. Not known until the first frame. */
    let shift: number | null = null;
    /** Seconds you have looked at the phone while the feed ran. */
    let seconds = 0;
    let glow = colorOf(latest.current.glow);
    let videos = latest.current.videos;
    let swipedAt = -SWIPE_MS;
    let before = performance.now();
    let request = 0;

    const frame = (now: number) => {
      request = requestAnimationFrame(frame);
      const elapsed = Math.min((now - before) / 1000, 0.1);
      before = now;
      const want = latest.current;
      const calm = still.matches;

      const ease = want.dragging || calm ? 1 : 1 - Math.exp(-elapsed * EASE);
      yaw += (want.look.yaw - yaw) * ease;
      pitch += (want.look.pitch - pitch) * ease;

      const wantShift =
        want.aside && width > 0 ? panelLeft / (2 * width) - 0.5 : 0;
      shift =
        shift === null || calm
          ? wantShift
          : shift + (wantShift - shift) * (1 - Math.exp(-elapsed * EASE));

      // How far, in degrees, you look away from where your hand holds the
      // phone up. Time passes while you look at it.
      const off =
        Math.acos(
          clamp(
            Math.cos(radians(yaw)) *
              Math.cos(radians(pitch)) *
              Math.cos(radians(HOLD_DEG)) -
              Math.sin(radians(pitch)) * Math.sin(radians(HOLD_DEG)),
            -1,
            1,
          ),
        ) *
        (180 / Math.PI);
      const attention = 1 - smoothstep(6, 20, off);
      if (want.running) seconds += elapsed * attention;
      const decay = decayAfter(seconds);

      // Look up and your hand drops, out of the way of the room.
      const lowered = clamp((pitch - HELD_AT) / (DROPPED_AT - HELD_AT), 0, 1);
      const dip = radians(lerp(HOLD_DEG, REST_DEG, lowered));
      // A hand is never quite still.
      const beat = calm ? 0 : now / 1000;
      const held = multiply(
        translation([
          EYE[0] + Math.sin(beat * 0.9) * 0.2,
          EYE[1] - ARM * Math.sin(dip) + Math.sin(beat * 1.3) * 0.3,
          EYE[2] - ARM * Math.cos(dip),
        ]),
        multiply(
          rotationX(-dip),
          rotationZ(radians(Math.sin(beat * 0.7) * 0.35)),
        ),
      );

      if (want.videos !== videos) {
        videos = want.videos;
        if (!calm) swipedAt = now;
      }
      const swipe = clamp((now - swipedAt) / SWIPE_MS, 0, 1);

      glow = mix(glow, colorOf(want.glow), 1 - Math.exp(-elapsed * 3));

      const view = multiply(
        rotationX(radians(-pitch)),
        multiply(rotationY(radians(yaw)), translation(scale(EYE, -1))),
      );

      // The real phone, put where the hut draws the hole for it. CSS and
      // WebGL agree on everything except which way is up.
      const depth = (FOCAL * height) / 2;
      const size = PHONE.height / PHONE_PIXELS;
      const onPage: Mat4 = [
        translation([0, 0, depth]),
        FLIP,
        view,
        held,
        FLIP,
        scaling(size, size, size),
      ].reduce(multiply);
      phoneElement.style.left = `${(50 + shift * 100).toFixed(3)}%`;
      phoneElement.style.transform = `perspective(${depth}px) matrix3d(${onPage
        .map((value) => value.toFixed(6))
        .join(",")})`;

      renderer?.draw({
        width,
        height,
        view,
        shift,
        phone: held,
        props: { decay, hour: hourAfter(seconds), videos },
        hand: { turned: smoothstep(0.3, 1, decay), swipe },
        glow,
        time: beat,
      });
    };
    request = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      canvasElement.removeEventListener("webglcontextlost", onLost);
      canvasElement.removeEventListener("webglcontextrestored", onRestored);
      renderer?.dispose();
    };
  }, [stage, canvas, phone, panel]);
}
