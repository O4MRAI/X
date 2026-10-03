export const WORLD = { halfWidth: 256 } as const;
export const MOVEMENT = {
  step: 1 / 60,
  maxSteps: 6,
  height: 1.8,
  radius: 0.35,
  eyeHeight: 1.68,
  walk: 9,
  sprint: 14,
  acceleration: 85,
  braking: 95,
  airAcceleration: 16,
  jump: 14,
  gravity: 28,
  terminalFall: 60,
  coyote: 0.1,
  jumpBuffer: 0.12,
  supportNormal: 0.72,
  supportProbe: 0.3,
  slowScale: 0.28,
  slowDuration: 3,
  slowRecharge: 7,
} as const;
export type MovementAbility = "none" | "double" | "dash" | "grapple";
export type GamePhase =
  "Loading" | "MainMenu" | "Playing" | "Paused" | "Failed" | "Completed";
export type Settings = {
  sensitivity: number;
  fov: number;
  volume: number;
  quality: "auto" | "high" | "low";
  shake: boolean;
  sprintFov: boolean;
  hints: boolean;
  debug: boolean;
  movement: MovementAbility;
  utility: "none" | "slow";
};
export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 0.0022,
  fov: 65,
  volume: 0.3,
  quality: "auto",
  shake: true,
  sprintFov: true,
  hints: true,
  debug: false,
  movement: "none",
  utility: "none",
};
