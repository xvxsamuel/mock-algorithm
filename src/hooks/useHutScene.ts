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
import {
  createHutLoader,
  createHutRenderer,
  hutPixel,
  type HutLoader,
  type HutRenderer,
} from "../scene/renderer";
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
  /** Lower the hand out of the way (e.g. when looking at the TV). */
  lowerHand: boolean;
  /** Videos you have swiped past. Drives clock, decay, tally, and camera. */
  videos: number;
  /** Index into NEWS_REPORTS currently shown on the CRT television. */
  reportIndex: number;
  /** How sure it is of each thing it has guessed about you, 0 to 1. */
  files: readonly number[];
  /** Coins your views were sold for. */
  coins: number;
  /** The colour of each video that was pushed at you. */
  leaflets: readonly string[];
  /** The colour of the video on screen, like "#ff8a00". */
  glow: string;
  /** The panel is open beside the phone: the view moves over for it. */
  aside: boolean;
  /** Whether the loading screen's logo has decoded and is ready to paint. */
  logoReady: boolean;
  /** Real startup progress, from 0 to 1. */
  onProgress: (progress: number) => void;
  /** Called once, when the hut has been drawn (or can't be). */
  onReady: () => void;
};

/** The pitch at which the phone is held up, and at which it has dropped. */
const HELD_AT = -18;
const DROPPED_AT = 0;
/** How fast the view catches up with where you look. */
const EASE = 6;
/** How long the thumb takes to come down on the glass, and to go back. */
const PRESS_MS = 60;
const LIFT_MS = 180;
/** The thumb drags the feed this far of the way to the next video. Then it
    lets go, and the feed runs on by itself. */
const STROKE = 0.85;
/** Where the tip goes along the glass in a swipe up, in the phone's space:
    from low on the screen to above its middle. */
const SWIPE_FROM: [number, number] = [8, -20];
const SWIPE_TO: [number, number] = [4, 8];
/** A tap: down on the glass, a moment on it, and off again. */
const TAP_DOWN_MS = 80;
const TAP_HOLD_MS = 60;
const TAP_UP_MS = 150;
/** Closer than this to a whole video, the feed counts as standing still. */
const STILL = 0.005;
/** How fast the tip follows where it should be on the glass. */
const TIP_EASE = 45;
/** Frames drawn before the hut counts as loaded: the first one is where the
    graphics card builds its programs, which can take seconds. */
const READY_AFTER = 2;
/** Never stall startup if web fonts take too long to settle. */
const FONTS_TIMEOUT_MS = 1000;

/** Turns a point upside down: the page counts down, the hut counts up. */
const FLIP = scaling(1, -1, 1);

/**
 * Runs the hut: every frame it turns the view to where you look, lets time
 * pass, draws the hut on the canvas, and moves the real phone on the page
 * to where your hand holds it. With the panel open beside the phone, the
 * middle of the view is half way between the page's left edge and the panel.
 *
 * `scrolled` is how far the feed is scrolled, in videos: 1.5 is half way
 * from the second video to the third. The thumb moves with it.
 *
 * Time in the hut only moves while you look at the phone. Look up and it
 * stands still, so you never see it pass: it is just later than it was.
 */
export function useHutScene(
  stage: RefObject<HTMLElement | null>,
  canvas: RefObject<HTMLCanvasElement | null>,
  phone: RefObject<HTMLElement | null>,
  panel: RefObject<HTMLElement | null>,
  scrolled: RefObject<number>,
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
    // Wait for the loading screen's logo and pixel fonts to paint before
    // running WebGL setup, then advance setup one real stage per frame so the
    // loading bar reflects actual work.
    let loader: HutLoader | null = null;
    let renderer: HutRenderer | null = null;
    let setupDone = false;
    let drawn = 0;
    let logoPaintFrames = 0;
    let lastProgress = -1;
    const reportProgress = (value: number) => {
      const clamped = clamp(value, 0, 1);
      if (clamped <= lastProgress) return;
      lastProgress = clamped;
      latest.current.onProgress(clamped);
    };

    let fontsReady = typeof document === "undefined" || !("fonts" in document);
    let fontTimer = 0;
    if (!fontsReady) {
      const markFonts = () => {
        fontsReady = true;
        window.clearTimeout(fontTimer);
      };
      fontTimer = window.setTimeout(markFonts, FONTS_TIMEOUT_MS);
      document.fonts.ready.then(markFonts, markFonts);
    }
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
    /** Smoothed reel pull count for hut clock and decay. Only advances when
        you pull another reel; taking a break freezes the room completely. */
    let pulls = latest.current.videos;
    /** 0: phone held up, 1: hand dropped out of the way. */
    let handDrop = latest.current.lowerHand ? 1 : 0;
    let glow = colorOf(latest.current.glow);
    /** The video the feed last stood still on. */
    let rested = Math.round(scrolled.current);
    let press = 0;
    let tip: [number, number] = [...SWIPE_FROM];
    /** Where the last tap on the screen landed, and when. */
    let tapAt: [number, number] = [0, 0];
    let tappedAt = -Infinity;
    let before = performance.now();

    // A press on the screen (a button, a video) is a tap of the thumb, where
    // it was pressed. The phone is held almost face on, so its box on the
    // page tells where on the glass that is.
    const screen = phoneElement.querySelector(".room-phone-body");
    const onTap = (event: MouseEvent) => {
      if (screen === null || still.matches) return;
      const box = screen.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      let x = event.clientX;
      let y = event.clientY;
      // From the keyboard, there is no pointer: tap the middle of what it
      // pressed.
      if (event.detail === 0 && event.target instanceof Element) {
        const pressed = event.target.getBoundingClientRect();
        x = pressed.left + pressed.width / 2;
        y = pressed.top + pressed.height / 2;
      }
      tapAt = [
        ((x - box.left) / box.width - 0.5) * PHONE.width,
        (0.5 - (y - box.top) / box.height) * PHONE.height,
      ];
      tappedAt = performance.now();
    };
    phoneElement.addEventListener("click", onTap, true);
    let request = 0;

    const frame = (now: number) => {
      request = requestAnimationFrame(frame);
      if (!setupDone) {
        before = now;
        if (!latest.current.logoReady || !fontsReady) {
          return;
        }
        // Two painted frames after logo + fonts are ready so the eye logo is
        // guaranteed on screen before any WebGL call touches the main thread.
        if (logoPaintFrames < 2) {
          logoPaintFrames += 1;
          if (logoPaintFrames === 1) reportProgress(1 / 12);
          return;
        }
        if (loader === null) {
          loader = createHutLoader(canvasElement);
        }
        const finished = loader.step(false);
        reportProgress(1 / 12 + loader.progress() * (9 / 12));
        if (!finished) return;
        setupDone = true;
        renderer = loader.renderer();
        if (renderer === null) {
          // No WebGL: there is nothing to wait for.
          reportProgress(1);
          latest.current.onReady();
        }
        return;
      }
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

      // Progression is strictly driven by reel pulls, never wall-clock time.
      // Clock hands and wall notches step per reel, while daylight and room
      // withering glide imperceptibly slowly toward the reel count so there
      // is never a visible pop or flash as you scroll—and stopping freezes all.
      const driftEase = calm ? 1 : 1 - Math.exp(-elapsed * 0.75);
      pulls += (want.videos - pulls) * driftEase;
      if (Math.abs(want.videos - pulls) < 0.001) pulls = want.videos;
      const decay = decayAfter(pulls);

      // Look up or switch to the TV and your hand drops, out of the way.
      const wantDrop = want.lowerHand
        ? 1
        : clamp((pitch - HELD_AT) / (DROPPED_AT - HELD_AT), 0, 1);
      handDrop += (wantDrop - handDrop) * ease;
      const dip = radians(lerp(HOLD_DEG, REST_DEG, handDrop));
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

      // The thumb swipes with the feed: down on the glass as soon as the
      // feed starts to move, and its tip goes up the glass exactly as far as
      // the feed has gone, for most of the way. Then it lets go.
      const at = scrolled.current;
      const whole = Math.round(at);
      if (Math.abs(at - whole) < STILL || Math.abs(at - rested) >= 1) {
        rested = whole;
      }
      const moved = at - rested;
      const moving = Math.abs(moved) >= STILL;
      const stroke = Math.min(Math.abs(moved) / STROKE, 1);
      const swiping = moving && stroke < 1 && !calm;
      if (moving) tappedAt = -Infinity;
      press = clamp(
        press + (elapsed * 1000) / (swiping ? PRESS_MS : -LIFT_MS),
        0,
        1,
      );
      let wantTip = tip;
      if (moving) {
        // Forwards it pushes the feed up; backwards it pulls it down.
        wantTip = mix2(SWIPE_FROM, SWIPE_TO, moved > 0 ? stroke : 1 - stroke);
      }
      // A tap, unless a swipe has taken over.
      const sinceTap = now - tappedAt;
      const tapLength = TAP_DOWN_MS + TAP_HOLD_MS + TAP_UP_MS;
      if (sinceTap >= 0 && sinceTap < tapLength) {
        wantTip = tapAt;
        const tapPress =
          sinceTap < TAP_DOWN_MS
            ? sinceTap / TAP_DOWN_MS
            : sinceTap < TAP_DOWN_MS + TAP_HOLD_MS
              ? 1
              : 1 - (sinceTap - TAP_DOWN_MS - TAP_HOLD_MS) / TAP_UP_MS;
        press = Math.max(press, tapPress);
      }
      // Off the glass, the tip is already where it will land.
      const follow = press === 0 ? 1 : 1 - Math.exp(-elapsed * TIP_EASE);
      tip = mix2(tip, wantTip, follow);

      glow = mix(glow, colorOf(want.glow), 1 - Math.exp(-elapsed * 1.4));

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
        props: {
          decay,
          hour: hourAfter(want.videos),
          videos: want.videos,
          files: want.files,
          coins: want.coins,
          leaflets: want.leaflets.map(colorOf),
        },
        hand: { turned: smoothstep(0.3, 1, decay), press, tip },
        dayHour: hourAfter(pulls),
        reportIndex: want.reportIndex,
        glow,
        time: beat,
      });
      if (drawn < READY_AFTER) {
        drawn += 1;
        reportProgress((10 + drawn) / 12);
        if (drawn === READY_AFTER) latest.current.onReady();
      }
    };
    request = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(request);
      window.clearTimeout(fontTimer);
      observer.disconnect();
      phoneElement.removeEventListener("click", onTap, true);
      canvasElement.removeEventListener("webglcontextlost", onLost);
      canvasElement.removeEventListener("webglcontextrestored", onRestored);
      loader?.dispose();
      renderer?.dispose();
    };
  }, [stage, canvas, phone, panel, scrolled]);
}

/** `by` of the way from one point on the glass to another. */
function mix2(
  from: readonly [number, number],
  to: readonly [number, number],
  by: number,
): [number, number] {
  return [lerp(from[0], to[0], by), lerp(from[1], to[1], by)];
}
