/** The person using the mock app. */
export type User = {
  name: string;
  handle: string;
};

/** Placeholder until there is an onboarding screen that asks for a name. */
export const USER: User = {
  name: "John Smith",
  handle: "johnsmith",
};
