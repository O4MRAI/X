import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { readProgress, readSettings, finishLevel, writeSettings } from "./save";
import { DEFAULT_SETTINGS } from "./config";
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => values.get(k) || null,
    setItem: (k: string, v: string) => values.set(k, v),
  });
});
afterEach(() => vi.unstubAllGlobals());
it("recovers from malformed saves and denies locked equipment", () => {
  values.set("convoy-leap-progress", "broken");
  values.set(
    "convoy-leap-settings",
    JSON.stringify({
      movement: "grapple",
      utility: "slow",
      fov: 999,
      sensitivity: -1,
      volume: 3,
    }),
  );
  expect(readProgress().unlockedLevel).toBe(1);
  const s = readSettings();
  expect(s.movement).toBe("none");
  expect(s.utility).toBe("none");
  expect(s.fov).toBe(100);
  expect(s.sensitivity).toBe(0.0005);
  expect(s.volume).toBe(1);
});
it("saves actual completion, preserves the best time, and derives ability unlocks", () => {
  let p = finishLevel(readProgress(), 1, 30);
  expect(p.unlockedLevel).toBe(2);
  expect(p.abilities).toContain("double");
  p = finishLevel(p, 1, 35);
  expect(readProgress().best[1]).toBe(30);
  p = finishLevel(p, 2, 32);
  expect(p.slowUnlocked).toBe(true);
  p = finishLevel(p, 6, 28);
  expect(readProgress().abilities).toContain("grapple");
  writeSettings({
    ...DEFAULT_SETTINGS,
    movement: "grapple",
    utility: "slow",
    volume: 0,
  });
  expect(readSettings().movement).toBe("grapple");
  expect(readSettings().volume).toBe(0);
});
it("falls back safely when storage is unavailable", () => {
  vi.stubGlobal("localStorage", {
    getItem: () => {
      throw Error("denied");
    },
    setItem: () => {
      throw Error("denied");
    },
  });
  expect(readProgress().unlockedLevel).toBe(1);
  expect(() => writeSettings(DEFAULT_SETTINGS)).not.toThrow();
  expect(finishLevel(readProgress(), 1, 28).unlockedLevel).toBe(2);
});
