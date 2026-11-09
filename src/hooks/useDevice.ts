import { useEffect, useState } from "react";

/**
 * What your own device tells any page or app, read for real in this
 * browser. Nothing leaves it. TikTok's privacy policy lists the same kind
 * of thing: "time zone settings", "screen resolution", "operating system",
 * "system language", "battery state".
 */
export type DeviceFact = { key: string; value: string };

/** Battery and other extras some browsers have and the DOM types lack. */
type Battery = EventTarget & { level: number; charging: boolean };
type ExtraNavigator = Navigator & {
  getBattery?: () => Promise<Battery>;
  deviceMemory?: number;
  userAgentData?: { platform: string; mobile: boolean };
};

/** The local clock is read again this often. */
const CLOCK_MS = 15_000;

export function useDevice(): DeviceFact[] {
  const [now, setNow] = useState(() => new Date());
  const [battery, setBattery] = useState<{
    level: number;
    charging: boolean;
  } | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), CLOCK_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const nav: ExtraNavigator = navigator;
    if (nav.getBattery === undefined) return;
    let found: Battery | null = null;
    let gone = false;
    const read = () => {
      if (found !== null) {
        setBattery({ level: found.level, charging: found.charging });
      }
    };
    nav
      .getBattery()
      .then((manager) => {
        if (gone) return;
        found = manager;
        read();
        manager.addEventListener("levelchange", read);
        manager.addEventListener("chargingchange", read);
      })
      .catch(() => setBattery(null));
    return () => {
      gone = true;
      found?.removeEventListener("levelchange", read);
      found?.removeEventListener("chargingchange", read);
    };
  }, []);

  return factsOf(now, battery);
}

function factsOf(
  now: Date,
  battery: { level: number; charging: boolean } | null,
): DeviceFact[] {
  const nav: ExtraNavigator = navigator;
  const facts: DeviceFact[] = [];
  facts.push({
    key: "time",
    value: now.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  });
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (zone) facts.push({ key: "zone", value: zone.replace(/_/g, " ") });
  const language = languageOf(nav.language);
  if (language !== null) facts.push({ key: "language", value: language });
  const system = systemOf(nav);
  if (system !== null) facts.push({ key: "system", value: system });
  facts.push({
    key: "screen",
    value: `${window.screen.width}×${window.screen.height}`,
  });
  if (battery !== null) {
    const level = Math.round(battery.level * 100);
    facts.push({
      key: "battery",
      value: `${level}% battery${battery.charging ? ", charging" : ""}`,
    });
  }
  return facts;
}

/** "nl-NL" as "Dutch (Netherlands)". */
function languageOf(tag: string): string | null {
  if (!tag) return null;
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** The operating system, from what the browser says it runs on. */
function systemOf(nav: ExtraNavigator): string | null {
  const platform = nav.userAgentData?.platform;
  if (platform) return platform === "macOS" ? "Mac" : platform;
  const agent = nav.userAgent;
  if (/iPhone/.test(agent)) return "iPhone";
  if (/iPad/.test(agent)) return "iPad";
  if (/Android/.test(agent)) return "Android";
  if (/Mac OS X/.test(agent)) return "Mac";
  if (/Windows/.test(agent)) return "Windows";
  if (/Linux/.test(agent)) return "Linux";
  return null;
}
