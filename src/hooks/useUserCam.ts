import { useEffect, useRef, useState } from "react";
import {
  readAppearance,
  smoothReading,
  type AppearanceReading,
} from "../algorithm/appearance";

/** How often a camera frame gets scored. */
const SAMPLE_MS = 300;
/** Frames are shrunk to this size before scoring. Plenty for a mock model. */
const SAMPLE_WIDTH = 96;
const SAMPLE_HEIGHT = 72;

export type CamStatus =
  | "off"
  | "starting"
  | "on"
  /** The person (or the browser) said no to camera access. */
  | "blocked"
  /** No camera, or the page is not allowed to use one. */
  | "unavailable";

/**
 * The webcam for the user cam. Off until `start` is called. Frames are scored
 * on this device and thrown away: nothing is uploaded or saved.
 */
export function useUserCam() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<CamStatus>("off");
  const [reading, setReading] = useState<AppearanceReading | null>(null);

  // Show the stream in the <video>, and switch the camera off when the
  // stream is replaced or the page goes away.
  useEffect(() => {
    const video = videoRef.current;
    if (video !== null) video.srcObject = stream;
    if (stream === null) return;

    // The camera can also stop on its own, e.g. when it is unplugged or the
    // permission is taken back.
    const tracks = stream.getVideoTracks();
    const handleEnded = () => {
      setStream(null);
      setStatus("off");
      setReading(null);
    };
    tracks.forEach((track) => track.addEventListener("ended", handleEnded));
    return () => {
      tracks.forEach((track) => {
        track.removeEventListener("ended", handleEnded);
        track.stop();
      });
    };
  }, [stream]);

  // Score a small copy of the current frame a few times per second.
  useEffect(() => {
    if (stream === null) return;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE_WIDTH;
    canvas.height = SAMPLE_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context === null) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (video === null || video.videoWidth === 0) return;
      const crop = centerCrop(video.videoWidth, video.videoHeight);
      context.drawImage(
        video,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        SAMPLE_WIDTH,
        SAMPLE_HEIGHT,
      );
      const frame = context.getImageData(0, 0, SAMPLE_WIDTH, SAMPLE_HEIGHT);
      const next = readAppearance(frame);
      setReading((previous) => smoothReading(previous, next));
    }, SAMPLE_MS);
    return () => window.clearInterval(timer);
  }, [stream]);

  async function start() {
    // Missing on plain-http pages and in some embedded browsers.
    if (typeof navigator.mediaDevices?.getUserMedia !== "function") {
      setStatus("unavailable");
      return;
    }
    setStatus("starting");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });
      setStream(media);
      setStatus("on");
    } catch (error) {
      const blocked =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "SecurityError");
      setStatus(blocked ? "blocked" : "unavailable");
    }
  }

  function stop() {
    setStream(null);
    setStatus("off");
    setReading(null);
  }

  return { videoRef, status, reading, start, stop };
}

/** The biggest 4:3 area in the middle of the video, the part the user sees. */
function centerCrop(width: number, height: number) {
  const ratio = SAMPLE_WIDTH / SAMPLE_HEIGHT;
  const cropWidth = Math.min(width, height * ratio);
  const cropHeight = cropWidth / ratio;
  return {
    x: (width - cropWidth) / 2,
    y: (height - cropHeight) / 2,
    width: cropWidth,
    height: cropHeight,
  };
}
