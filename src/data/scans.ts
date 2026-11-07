import type { Video } from "./videos";

/**
 * What a content model "sees" in each mock video. Made up, in the shape of
 * what platforms describe: objects and scenes, the text on screen, and the
 * face of whoever is on camera (TikTok estimates age and gender from faces in
 * posted videos, per Canada's privacy commissioners, 2025).
 */
export type FaceReading = {
  /** Who is on camera, as an emoji. */
  emoji: string;
  /** The age band it guesses. */
  age: string;
  /** Its mock "attractiveness", 3 to 9. */
  looks: number;
};

export type VideoScan = {
  /** What its vision model says the video shows. */
  sees: string;
  /** How sure it is, 0-1. */
  sure: number;
  /** The creator's face, or null when nobody is on camera. */
  face: FaceReading | null;
};

const SCANS: Partial<Record<string, VideoScan>> = {
  "comedy-1": {
    sees: "laughing face",
    sure: 0.97,
    face: f("25–34", 6.4, "👨‍🦱"),
  },
  "comedy-2": { sees: "clown makeup", sure: 0.91, face: f("25–34", 5.8, "👩‍🦰") },
  "comedy-3": { sees: "self-checkout", sure: 0.94, face: f("65+", 4.6, "👵") },
  "comedy-4": {
    sees: "people, wincing",
    sure: 0.88,
    face: f("18–24", 6.1, "👩"),
  },
  "comedy-5": { sees: "outfits", sure: 0.83, face: f("18–24", 7.9, "🧑‍🦱") },
  "comedy-6": {
    sees: "bedroom, night",
    sure: 0.86,
    face: f("18–24", 7.2, "👨"),
  },
  "pets-1": { sees: "dog", sure: 0.99, face: null },
  "pets-2": { sees: "cat, printer", sure: 0.98, face: null },
  "pets-3": { sees: "goat kids", sure: 0.96, face: null },
  "pets-4": { sees: "parrot", sure: 0.98, face: null },
  "pets-5": { sees: "dog, thin", sure: 0.93, face: null },
  "pets-6": { sees: "snake, toilet", sure: 0.95, face: null },
  "cooking-1": { sees: "pasta", sure: 0.97, face: f("25–34", 7.4, "🧑") },
  "cooking-2": { sees: "sandwiches", sure: 0.95, face: f("35–44", 5.5, "👩‍🍳") },
  "cooking-3": { sees: "apple pie", sure: 0.96, face: f("65+", 4.9, "👵") },
  "cooking-4": { sees: "knife, onion", sure: 0.94, face: null },
  "cooking-5": { sees: "street food", sure: 0.92, face: f("25–34", 6.6, "👩") },
  "cooking-6": { sees: "burgers", sure: 0.96, face: f("25–34", 5.2, "👨‍🦰") },
  "fitness-1": { sees: "yoga pose", sure: 0.95, face: f("25–34", 8.1, "🧑‍🦱") },
  "fitness-2": { sees: "barbell", sure: 0.97, face: f("18–24", 7.6, "👩‍🦰") },
  "fitness-3": { sees: "salad", sure: 0.94, face: f("25–34", 8.4, "👩‍🦱") },
  "fitness-4": { sees: "bare chest", sure: 0.96, face: f("25–34", 8.2, "👨") },
  "fitness-5": {
    sees: "plate, timer",
    sure: 0.82,
    face: f("35–44", 6.0, "🧑‍🦲"),
  },
  "fitness-6": {
    sees: "mirror selfie",
    sure: 0.93,
    face: f("18–24", 8.8, "🧑‍🦰"),
  },
  "gaming-1": { sees: "game: farm", sure: 0.9, face: null },
  "gaming-2": { sees: "pixel drawing", sure: 0.92, face: null },
  "gaming-3": { sees: "game: race", sure: 0.88, face: f("18–24", 5.9, "👩‍🦱") },
  "gaming-4": { sees: "game: shooter", sure: 0.91, face: null },
  "gaming-5": { sees: "loot boxes", sure: 0.9, face: f("25–34", 5.4, "👨‍🦱") },
  "gaming-6": { sees: "angry face", sure: 0.95, face: f("18–24", 5.6, "👨‍🦱") },
  "finance-1": { sees: "banknotes", sure: 0.93, face: f("35–44", 6.2, "👨‍💼") },
  "finance-2": { sees: "chart", sure: 0.96, face: f("35–44", 5.7, "👩‍💼") },
  "finance-3": { sees: "piggy bank", sure: 0.94, face: f("18–24", 6.9, "🧑") },
  "finance-4": { sees: "laptop", sure: 0.95, face: f("25–34", 7.8, "👩‍🦰") },
  "finance-5": {
    sees: "beach, laptop",
    sure: 0.9,
    face: f("18–24", 8.0, "👩"),
  },
  "finance-6": {
    sees: "rocket, chart",
    sure: 0.87,
    face: f("18–24", 6.3, "🧑‍🦱"),
  },
  "beauty-1": {
    sees: "skin, close-up",
    sure: 0.96,
    face: f("18–24", 8.7, "👨"),
  },
  "beauty-2": { sees: "jacket", sure: 0.95, face: f("25–34", 7.7, "🧑") },
  "beauty-3": { sees: "nails", sure: 0.98, face: null },
  "beauty-4": { sees: "makeup", sure: 0.97, face: f("18–24", 8.5, "👩‍🦰") },
  "beauty-5": {
    sees: "bedroom, dawn",
    sure: 0.85,
    face: f("18–24", 8.3, "🧑‍🦰"),
  },
  "beauty-6": {
    sees: "face, close-up",
    sure: 0.94,
    face: f("18–24", 7.0, "👩‍🦱"),
  },
  "travel-1": { sees: "mountains", sure: 0.97, face: null },
  "travel-2": {
    sees: "noodles, street",
    sure: 0.93,
    face: f("25–34", 7.1, "👩"),
  },
  "travel-3": { sees: "van", sure: 0.96, face: f("25–34", 7.5, "👨‍🦰") },
  "travel-4": { sees: "airplane", sure: 0.95, face: f("18–24", 6.8, "👨‍🦱") },
  "travel-5": { sees: "beach", sure: 0.97, face: null },
  "travel-6": {
    sees: "volcano, road",
    sure: 0.89,
    face: f("25–34", 6.7, "🧑‍🦱"),
  },
};

/** What the content model makes of a video. */
export function scanOf(video: Video): VideoScan {
  return SCANS[video.id] ?? { sees: video.category, sure: 0.8, face: null };
}

function f(age: string, looks: number, emoji: string): FaceReading {
  return { emoji, age, looks };
}
