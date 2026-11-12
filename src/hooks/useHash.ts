import { useSyncExternalStore } from "react";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The "#..." part of the address ("" when there is none), kept up to date. */
export function useHash(): string {
  return useSyncExternalStore(subscribe, () => window.location.hash);
}
