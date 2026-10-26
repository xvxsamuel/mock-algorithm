export type PlaceholderComment = {
  user: string;
  text: string;
  likes: number;
  /** How long ago it was posted, e.g. "2d". */
  age: string;
};

/** Generic comments that fit under any video. */
export const PLACEHOLDER_COMMENTS: readonly PlaceholderComment[] = [
  { user: "lena.k", text: "the ending 😭😭", likes: 12_400, age: "2d" },
  { user: "jonasss", text: "why is this so accurate", likes: 8_930, age: "1d" },
  {
    user: "mia_writes",
    text: "commenting so I can come back to this later",
    likes: 5_210,
    age: "3d",
  },
  {
    user: "noah.rt",
    text: "the algorithm knows me too well",
    likes: 4_870,
    age: "5h",
  },
  { user: "sophiee", text: "part 2 please!!", likes: 3_640, age: "6h" },
  {
    user: "tim_b",
    text: "I've watched this 10 times now",
    likes: 2_980,
    age: "1d",
  },
  {
    user: "ella.m",
    text: "not me watching this at 3am",
    likes: 2_150,
    age: "12h",
  },
  { user: "max.olsen", text: "this is literally me", likes: 1_730, age: "4d" },
  {
    user: "anouk",
    text: "who else is here from the for you page",
    likes: 960,
    age: "2h",
  },
  {
    user: "ravi.p",
    text: "okay but the sound is so good",
    likes: 640,
    age: "8h",
  },
  {
    user: "julia.vb",
    text: "sending this to my group chat",
    likes: 410,
    age: "3h",
  },
  {
    user: "finn",
    text: "first time seeing this and I'm hooked",
    likes: 85,
    age: "1h",
  },
];

/** People you can "send" a video to in the share sheet. */
export const SHARE_FRIENDS: readonly string[] = [
  "alex",
  "mia",
  "jonas",
  "lea",
  "sam",
  "noah",
];
