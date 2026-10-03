import { MOVEMENT } from "./config";
/** Simulation advances at 60Hz; discard excess catch-up after a long stall. */
export class FixedClock {
  private accumulated = 0;
  get alpha() {
    return this.accumulated / MOVEMENT.step;
  }
  reset() {
    this.accumulated = 0;
  }
  advance(realDelta: number, scale: number, step: () => boolean | void) {
    this.accumulated = Math.min(
      this.accumulated + Math.max(0, realDelta) * scale,
      MOVEMENT.step * MOVEMENT.maxSteps,
    );
    let n = 0;
    while (this.accumulated + 1e-10 >= MOVEMENT.step && n < MOVEMENT.maxSteps) {
      this.accumulated = Math.max(0, this.accumulated - MOVEMENT.step);
      n++;
      if (step() === false) {
        this.reset();
        break;
      }
    }
    return n;
  }
}
