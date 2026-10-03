export type Controls = {
  x: number;
  z: number;
  sprint: boolean;
  jump: boolean;
  movementAbility: boolean;
  utility: boolean;
  yaw: number;
  pitch: number;
};
export const idleInput = (): Controls => ({
  x: 0,
  z: 0,
  sprint: false,
  jump: false,
  movementAbility: false,
  utility: false,
  yaw: 0,
  pitch: -0.12,
});
export class Input {
  private keys = new Set<string>();
  private jump = false;
  private ability = false;
  private utility = false;
  yaw = 0;
  pitch = 0.035;
  sensitivity = 0.0022;
  private enabled = false;
  private touchX = 0;
  private touchZ = 0;
  private touchSprint = false;
  readonly touch = matchMedia("(pointer: coarse)").matches;
  constructor(
    private canvas: HTMLCanvasElement,
    private onPause: () => void,
    private onRestart: () => void,
    private onLockError: (text: string) => void,
  ) {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    document.addEventListener("mousemove", this.look);
    document.addEventListener("pointerlockchange", this.lockChanged);
    document.addEventListener("pointerlockerror", this.lockError);
    window.addEventListener("blur", this.blur);
    document.addEventListener("visibilitychange", this.visibility);
  }
  private down = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    if (
      [
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "Space",
        "ShiftLeft",
        "ShiftRight",
        "KeyE",
        "KeyQ",
        "KeyR",
        "Escape",
      ].includes(e.code)
    )
      e.preventDefault();
    this.keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Space") this.jump = true;
    if (e.code === "KeyE") this.ability = true;
    if (e.code === "KeyQ") this.utility = true;
    if (e.code === "KeyR") this.onRestart();
    if (e.code === "Escape") this.onPause();
  };
  private up = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private look = (e: MouseEvent) => {
    if (!this.enabled || document.pointerLockElement !== this.canvas) return;
    this.yaw -= e.movementX * this.sensitivity;
    this.pitch = Math.max(
      -1.4,
      Math.min(1.4, this.pitch - e.movementY * this.sensitivity),
    );
  };
  private lockChanged = () => {
    if (this.enabled && document.pointerLockElement !== this.canvas)
      this.onPause();
  };
  private lockError = () => {
    this.enabled = false;
    this.clear();
    this.onLockError(
      "Mouse capture was blocked. Click Resume in a browser tab to try again.",
    );
  };
  private blur = () => {
    if (this.enabled) this.onPause();
    this.clear();
  };
  private visibility = () => {
    if (document.hidden) this.blur();
  };
  async capture() {
    if (this.touch) {
      this.enabled = true;
      this.clear();
      return true;
    }
    try {
      await this.canvas.requestPointerLock();
      if (document.pointerLockElement !== this.canvas)
        throw new Error("No mouse capture");
      this.enabled = true;
      this.clear();
    } catch {
      this.lockError();
      return false;
    }
    return true;
  }
  release() {
    this.enabled = false;
    this.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }
  clear() {
    this.touchX = this.touchZ = 0;
    this.touchSprint = false;
    this.keys.clear();
    this.jump = this.ability = this.utility = false;
  }
  resetLook() {
    this.yaw = 0;
    this.pitch = 0.035;
    this.clear();
  }
  sample(): Controls {
    const data = {
      x:
        this.touchX +
        Number(this.keys.has("KeyD")) -
        Number(this.keys.has("KeyA")),
      z:
        this.touchZ +
        Number(this.keys.has("KeyS")) -
        Number(this.keys.has("KeyW")),
      sprint:
        this.touchSprint ||
        this.keys.has("ShiftLeft") ||
        this.keys.has("ShiftRight"),
      jump: this.jump,
      movementAbility: this.ability,
      utility: this.utility,
      yaw: this.yaw,
      pitch: this.pitch,
    };
    this.jump = this.ability = this.utility = false;
    return data;
  }
  touchMove(x: number, z: number) {
    if (this.enabled) {
      this.touchX = x;
      this.touchZ = z;
    }
  }
  touchLook(dx: number, dy: number) {
    if (!this.enabled) return;
    this.yaw -= dx * this.sensitivity * 2;
    this.pitch = Math.max(
      -1.4,
      Math.min(1.4, this.pitch - dy * this.sensitivity * 2),
    );
  }
  touchAction(
    action: "jump" | "ability" | "utility" | "sprint",
    pressed = true,
  ) {
    if (!this.enabled) return;
    if (action === "jump" && pressed) this.jump = true;
    if (action === "ability" && pressed) this.ability = true;
    if (action === "utility" && pressed) this.utility = true;
    if (action === "sprint") this.touchSprint = pressed;
  }
  dispose() {
    this.release();
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    document.removeEventListener("mousemove", this.look);
    document.removeEventListener("pointerlockchange", this.lockChanged);
    document.removeEventListener("pointerlockerror", this.lockError);
    window.removeEventListener("blur", this.blur);
    document.removeEventListener("visibilitychange", this.visibility);
  }
}
