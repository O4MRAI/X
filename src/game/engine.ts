import { FixedClock } from "./clock";
import { initPhysics, Simulation } from "./physics";
import { GameRenderer } from "./renderer";
import { Input, idleInput, type Controls } from "./input";
import { GameAudio } from "./audio";
import { type Settings, type GamePhase } from "./config";
import { LEVELS } from "./levels";
export type Snapshot = {
  phase: GamePhase;
  level: number;
  time: number;
  simulationTime: number;
  grounded: boolean;
  support: number | null;
  speed: number;
  relativeSpeed: number;
  fps: number;
  steps: number;
  bodies: number;
  drawCalls: number;
  geometries: number;
  textures: number;
  slow: number;
  cooldown: number;
  scale: number;
  position: { x: number; y: number; z: number };
  jumps: number;
  landings: number;
  visited: number;
  reason: string;
  look: { yaw: number; pitch: number };
  normal: number;
};
export type EngineOptions = {
  settings: Settings;
  onState: (s: Snapshot) => void;
  onError: (message: string) => void;
  onComplete: (level: number, time: number) => void;
};
export class GameEngine {
  phase: GamePhase = "Loading";
  private sim!: Simulation;
  private render!: GameRenderer;
  private input!: Input;
  private audio = new GameAudio();
  private disposed = false;
  private frame = 0;
  private previousTime = 0;
  private clock = new FixedClock();
  private fps = 60;
  private uiTime = 0;
  private lastRender = 0;
  private jumps = 0;
  private landings = 0;
  private crashes = 0;
  private steps = 0;
  private pending: Controls = idleInput();
  private constructor(
    private host: HTMLElement,
    private options: EngineOptions,
  ) {}
  static async create(host: HTMLElement, options: EngineOptions) {
    const engine = new GameEngine(host, options);
    try {
      await initPhysics();
      engine.load(1);
      engine.input = new Input(
        engine.render.canvas,
        () => engine.pause(),
        () => engine.retry(),
        (message) => {
          engine.pause();
          options.onError(message);
        },
      );
      engine.input.sensitivity = options.settings.sensitivity;
      engine.phase = "MainMenu";
      engine.notify();
      engine.frame = requestAnimationFrame(engine.loop);
      return engine;
    } catch (error) {
      engine.dispose();
      throw error;
    }
  }
  private load(level: number) {
    this.render?.dispose();
    this.sim?.dispose();
    this.sim = new Simulation(LEVELS[level - 1], this.options.settings);
    this.render = new GameRenderer(this.host, this.sim, this.options.settings);
    this.clock.reset();
    this.pending = idleInput();
    this.jumps = this.landings = this.crashes = 0;
    this.steps = 0;
  }
  async play() {
    if (this.disposed) return;
    this.options.onError("");
    if (await this.input.capture()) {
      this.phase = "Playing";
      this.previousTime = performance.now();
      this.clock.reset();
      this.audio.activate(this.options.settings.volume);
      this.notify();
    }
  }
  pause() {
    if (this.phase !== "Playing") return;
    this.phase = "Paused";
    this.input.release();
    this.audio.pause();
    this.clock.reset();
    this.notify();
  }
  retry() {
    const wasPlaying = this.phase === "Playing";
    this.audio.pause();
    const { level, formation } = this.sim,
      renderer = this.render.renderer;
    this.render.dispose(true);
    this.sim.dispose();
    this.sim = new Simulation(level, this.options.settings, formation);
    this.render = new GameRenderer(
      this.host,
      this.sim,
      this.options.settings,
      renderer,
    );
    this.input.resetLook();
    this.clock.reset();
    this.pending = idleInput();
    this.jumps = this.landings = this.crashes = this.steps = 0;
    // Draw/upload the restored convoy before resuming the simulation clock.
    this.render.render(1, this.input.yaw, this.input.pitch, false);
    this.previousTime = performance.now();
    this.lastRender = this.previousTime;
    this.phase = wasPlaying ? "Playing" : "Paused";
    if (wasPlaying) this.audio.activate(this.options.settings.volume);
    this.notify();
  }

  selectLevel(id: number) {
    this.pause();
    if (id === this.sim.level.id && this.phase === "MainMenu") return;
    this.input.dispose();
    this.load(id);
    this.input = new Input(
      this.render.canvas,
      () => this.pause(),
      () => this.retry(),
      (m) => {
        this.pause();
        this.options.onError(m);
      },
    );
    this.input.sensitivity = this.options.settings.sensitivity;
    this.phase = "MainMenu";
    this.notify();
  }
  touchMove(x: number, z: number) {
    this.input.touchMove(x, z);
  }
  touchLook(dx: number, dy: number) {
    this.input.touchLook(dx, dy);
  }
  touchAction(
    action: "jump" | "ability" | "utility" | "sprint",
    pressed = true,
  ) {
    this.input.touchAction(action, pressed);
  }
  setSettings(settings: Settings) {
    this.options.settings = settings;
    this.sim.settings = settings;
    this.input.sensitivity = settings.sensitivity;
    this.render.update(settings);
    this.audio.setVolume(settings.volume);
  }
  snapshot(): Snapshot {
    const p = this.sim.player;
    return {
      phase: this.phase,
      level: this.sim.level.id,
      time: this.sim.activeTime,
      simulationTime: this.sim.time,
      grounded: p.grounded,
      support: p.support ? this.sim.trucks.indexOf(p.support) : null,
      speed: p.worldVelocity.length(),
      relativeSpeed: p.relativeVelocity.length(),
      fps: this.fps,
      steps: this.steps,
      bodies: this.sim.world.bodies.len(),
      drawCalls: this.render.stats().drawCalls,
      geometries: this.render.stats().geometries,
      textures: this.render.stats().textures,
      slow: this.sim.slowCharge,
      cooldown: this.sim.abilityCooldown,
      scale: this.sim.timeScale,
      position: { x: p.position.x, y: p.position.y, z: p.position.z },
      jumps: p.jumps,
      landings: p.landings,
      visited: p.visited.size,
      reason: this.sim.reason,
      look: { yaw: this.input?.yaw ?? 0, pitch: this.input?.pitch ?? 0.035 },
      normal: p.supportNormal.y,
    };
  }
  private notify() {
    this.options.onState(this.snapshot());
  }
  private loop = (now: number) => {
    if (this.disposed) return;
    const elapsed = Math.max(0, (now - this.previousTime) / 1000);
    this.previousTime = now;
    if (elapsed > 0 && this.phase === "Playing")
      this.fps += (1 / elapsed - this.fps) * 0.04;
    if (this.phase === "Playing") {
      const input = this.input.sample();
      this.pending = {
        ...input,
        jump: this.pending.jump || input.jump,
        movementAbility: this.pending.movementAbility || input.movementAbility,
        utility: this.pending.utility || input.utility,
      };
      this.sim.updateActive(elapsed, input);
      this.steps += this.clock.advance(elapsed, this.sim.timeScale, () => {
        this.sim.step(this.pending);
        this.pending = {
          ...this.pending,
          jump: false,
          movementAbility: false,
          utility: false,
        };
        return !this.sim.outcome;
      });
      if (this.sim.player.jumps > this.jumps) {
        this.audio.cue("jump");
        this.jumps = this.sim.player.jumps;
      }
      if (this.sim.player.landings > this.landings) {
        this.audio.cue("land");
        this.landings = this.sim.player.landings;
      }
      if (this.sim.crashes > this.crashes) {
        this.audio.cue("crash");
        this.crashes = this.sim.crashes;
      }
      this.audio.update(this.sim.player.worldVelocity.length());
      if (this.sim.outcome) {
        this.phase = this.sim.outcome === "failed" ? "Failed" : "Completed";
        this.input.release();
        this.audio.pause();
        this.audio.cue(this.sim.outcome === "failed" ? "fail" : "complete");
        if (this.sim.outcome === "completed")
          this.options.onComplete(this.sim.level.id, this.sim.activeTime);
        this.notify();
      }
    }
    if (this.phase === "Playing" || now - this.lastRender >= 100) {
      this.render.adapt(this.fps, elapsed);
      this.render.render(
        this.phase === "Playing" ? this.clock.alpha : 1,
        this.input?.yaw ?? 0,
        this.input?.pitch ?? 0.035,
        this.pending.sprint && this.phase === "Playing",
      );
      this.lastRender = now;
    }
    this.uiTime += elapsed;
    if (this.uiTime > 0.1) {
      this.uiTime = 0;
      this.notify();
    }
    this.frame = requestAnimationFrame(this.loop);
  };
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.input?.dispose();
    this.audio.dispose();
    this.render?.dispose();
    this.sim?.dispose();
  }
}
