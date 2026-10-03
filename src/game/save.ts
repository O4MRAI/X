import {
  DEFAULT_SETTINGS,
  type MovementAbility,
  type Settings,
} from "./config";
export type Progress = {
  unlockedLevel: number;
  best: Record<string, number>;
  abilities: MovementAbility[];
  slowUnlocked: boolean;
};
const fresh = (): Progress => ({
  unlockedLevel: 1,
  best: {},
  abilities: ["none"],
  slowUnlocked: false,
});
export function readProgress(): Progress {
  try {
    const d = JSON.parse(localStorage.getItem("convoy-leap-progress") || "{}");
    const p = fresh();
    if (!d || typeof d !== "object") return p;
    p.unlockedLevel = Math.max(
      1,
      Math.min(
        10,
        Number.isFinite(d.unlockedLevel) ? Math.floor(d.unlockedLevel) : 1,
      ),
    );
    for (const [key, n] of Object.entries(d.best || {}))
      if (typeof n === "number" && Number.isFinite(n) && n > 0) p.best[key] = n;
    p.abilities = ["none"];
    if (p.unlockedLevel >= 2) p.abilities.push("double");
    if (p.unlockedLevel >= 5) p.abilities.push("dash");
    if (p.unlockedLevel >= 7) p.abilities.push("grapple");
    p.slowUnlocked = p.unlockedLevel >= 3;
    return p;
  } catch {
    return fresh();
  }
}
export function readSettings(): Settings {
  try {
    const d = JSON.parse(localStorage.getItem("convoy-leap-settings") || "{}");
    if (!d || typeof d !== "object") return { ...DEFAULT_SETTINGS };
    const s = { ...DEFAULT_SETTINGS };
    for (const k of ["sensitivity", "fov", "volume"] as const)
      if (Number.isFinite(d[k])) s[k] = d[k];
    s.sensitivity = Math.max(0.0005, Math.min(0.008, s.sensitivity));
    s.fov = Math.max(50, Math.min(100, s.fov));
    s.volume = Math.max(0, Math.min(1, s.volume));
    for (const k of ["shake", "sprintFov", "hints", "debug"] as const)
      if (typeof d[k] === "boolean") s[k] = d[k];
    if (["auto", "high", "low"].includes(d.quality)) s.quality = d.quality;
    const p = readProgress();
    if (p.abilities.includes(d.movement)) s.movement = d.movement;
    if (p.slowUnlocked && d.utility === "slow") s.utility = "slow";
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}
export function writeSettings(settings: Settings) {
  try {
    localStorage.setItem("convoy-leap-settings", JSON.stringify(settings));
  } catch {}
}
export function finishLevel(progress: Progress, id: number, time: number) {
  const p = { ...progress, best: { ...progress.best } };
  p.unlockedLevel = Math.min(10, Math.max(p.unlockedLevel, id + 1));
  p.best[id] = Math.min(p.best[id] || Infinity, time);
  p.abilities = ["none"];
  if (p.unlockedLevel >= 2) p.abilities.push("double");
  if (p.unlockedLevel >= 5) p.abilities.push("dash");
  if (p.unlockedLevel >= 7) p.abilities.push("grapple");
  p.slowUnlocked = p.unlockedLevel >= 3;
  try {
    localStorage.setItem("convoy-leap-progress", JSON.stringify(p));
  } catch {}
  return p;
}
