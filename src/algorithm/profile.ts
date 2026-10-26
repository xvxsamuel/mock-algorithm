import type { Category } from "../data/categories";
import type { Impression } from "./impression";
import { readSignals } from "./signals";

/** Each newer impression shrinks the weight of older ones by this factor. */
export const MEMORY_DECAY = 0.93;

/** What the algorithm believes the user likes. Higher = more interested. */
export type InterestProfile = {
  topics: Map<Category, number>;
  creators: Map<string, number>;
};

export function buildProfile(
  impressions: readonly Impression[],
): InterestProfile {
  const topics = new Map<Category, number>();
  const creators = new Map<string, number>();

  impressions.forEach((impression, i) => {
    const weight = MEMORY_DECAY ** (impressions.length - 1 - i);
    const { category, creator } = impression.video;
    for (const signal of readSignals(impression)) {
      add(topics, category, signal.topic * weight);
      add(creators, creator, signal.creator * weight);
    }
  });

  return { topics, creators };
}

function add<K>(map: Map<K, number>, key: K, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}
