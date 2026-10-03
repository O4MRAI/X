import { ArrowUpRight } from "lucide-react";
import { useRef, useState, type PointerEvent } from "react";
import { type GameEngine } from "./engine";
import { type Settings } from "./config";
export default function TouchControls({
  getEngine,
  settings,
}: {
  getEngine: () => GameEngine | null;
  settings: Settings;
}) {
  const origin = useRef({ x: 0, y: 0 }),
    look = useRef({ x: 0, y: 0 }),
    sprintSources = useRef({ stick: false, button: false }),
    [sprinting, setSprinting] = useState(false),
    [stick, setStick] = useState({ x: 0, y: 0 });
  if (!matchMedia("(pointer: coarse)").matches) return null;
  const releaseLook = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const syncSprint = () => {
    const active = sprintSources.current.stick || sprintSources.current.button;
    getEngine()?.touchAction("sprint", active);
    setSprinting(active);
  };
  const releaseSprintButton = () => {
    sprintSources.current.button = false;
    syncSprint();
  };
  const reset = () => {
    sprintSources.current.stick = false;
    syncSprint();
    getEngine()?.touchMove(0, 0);
    setStick({ x: 0, y: 0 });
  };
  return (
    <div className="touch-controls">
      <div
        className="look-pad"
        aria-label="Drag to look"
        onPointerUp={releaseLook}
        onPointerCancel={releaseLook}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          look.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          getEngine()?.touchLook(
            e.clientX - look.current.x,
            e.clientY - look.current.y,
          );
          look.current = { x: e.clientX, y: e.clientY };
        }}
      />
      <div
        className="joystick"
        aria-label="Move joystick"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          origin.current = { x: e.clientX, y: e.clientY };
        }}
        onPointerMove={(e) => {
          if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
          let x = (e.clientX - origin.current.x) / 40,
            y = (e.clientY - origin.current.y) / 40;
          const n = Math.hypot(x, y);
          // Full stick travel enables sprint so moving + jumping needs two thumbs.
          sprintSources.current.stick = n >= 0.85;
          syncSprint();
          if (n > 1) {
            x /= n;
            y /= n;
          }
          setStick({ x: x * 30, y: y * 30 });
          getEngine()?.touchMove(x, y);
        }}
        onPointerUp={reset}
        onPointerCancel={reset}
        onLostPointerCapture={reset}
      >
        <span style={{ transform: `translate(${stick.x}px,${stick.y}px)` }} />
      </div>
      <div className="touch-buttons">
        <button
          aria-label="Sprint"
          aria-pressed={sprinting}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            sprintSources.current.button = true;
            syncSprint();
          }}
          onPointerUp={releaseSprintButton}
          onPointerCancel={releaseSprintButton}
          onLostPointerCapture={releaseSprintButton}
        >
          SPRINT
        </button>
        <button
          className="touch-jump"
          aria-label="Jump"
          onPointerDown={() => getEngine()?.touchAction("jump")}
        >
          JUMP <ArrowUpRight size={16} />
        </button>
        {settings.movement !== "none" && settings.movement !== "double" && (
          <button
            aria-label="Use movement ability"
            onPointerDown={() => getEngine()?.touchAction("ability")}
          >
            ABILITY
          </button>
        )}
        {settings.utility === "slow" && (
          <button
            aria-label="Slow motion"
            onPointerDown={() => getEngine()?.touchAction("utility")}
          >
            SLOW
          </button>
        )}
      </div>
    </div>
  );
}
