export const CATEGORIES = [
  "comedy",
  "pets",
  "cooking",
  "fitness",
  "gaming",
  "finance",
  "beauty",
  "travel",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Background gradient for each category. Stands in for the real video. */
export const CATEGORY_COLORS: Record<Category, readonly [string, string]> = {
  comedy: ["#ff8a00", "#e52e71"],
  pets: ["#56ab2f", "#a8e063"],
  cooking: ["#f12711", "#f5af19"],
  fitness: ["#232526", "#c31432"],
  gaming: ["#4a00e0", "#e100ff"],
  finance: ["#134e5e", "#71b280"],
  beauty: ["#b24592", "#f15f79"],
  travel: ["#2193b0", "#6dd5ed"],
};
