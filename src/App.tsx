import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Lock,
  Pause,
  RotateCcw,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import TouchControls from "./game/TouchControls";
import GameViewport from "./game/GameViewport";
import { GameEngine, type Snapshot } from "./game/engine";
import { type Settings } from "./game/config";
import { LEVELS } from "./game/levels";
import {
  readProgress,
  readSettings,
  writeSettings,
  finishLevel,
} from "./game/save";
const clock = (n: number) =>
  `${Math.floor(n / 60)
    .toString()
    .padStart(2, "0")}:${(n % 60).toFixed(2).padStart(5, "0")}`;
const names = {
  none: "Basic movement",
  double: "Double jump",
  dash: "Air dash",
  grapple: "Grappling hook",
};
declare global {
  interface Window {
    __CONVOY__?: () => Snapshot | undefined;
  }
}
export default function App() {
  const engine = useRef<GameEngine | null>(null),
    progressRef = useRef(readProgress());
  const [progress, setProgress] = useState(progressRef.current),
    [settings, setSettings] = useState(readSettings),
    [state, setState] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [panel, setPanel] = useState<"play" | "levels" | "settings" | "loadout">(
      "play",
    );
  const settingsRef = useRef(settings);
  const ready = useCallback((e: GameEngine | null) => {
    engine.current = e;
  }, []);
  useEffect(() => {
    settingsRef.current = settings;
    writeSettings(settings);
    engine.current?.setSettings(settings);
  }, [settings]);
  useEffect(() => {
    if (import.meta.env.DEV)
      window.__CONVOY__ = () => engine.current?.snapshot();
    return () => {
      delete window.__CONVOY__;
    };
  }, []);
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setSettings((s) => ({ ...s, [key]: value }));
  const options = useRef({
    settings: settingsRef.current,
    onState: setState,
    onError: setError,
    onComplete: (id: number, time: number) => {
      const p = finishLevel(progressRef.current, id, time);
      progressRef.current = p;
      setProgress(p);
    },
  });
  const phase = state?.phase || "Loading",
    level = LEVELS[(state?.level || 1) - 1],
    playing = phase === "Playing",
    entry = phase === "MainMenu" && panel === "play",
    completed = phase === "Completed",
    failed = phase === "Failed";
  const start = () => {
    setPanel("play");
    void engine.current?.play();
  };
  const retry = () => {
    engine.current?.retry();
    start();
  };
  const touch = matchMedia("(pointer: coarse)").matches;
  const unlock =
    level.id === 1
      ? "Double jump unlocked"
      : level.id === 2
        ? "Slow motion unlocked"
        : level.id === 4
          ? "Air dash unlocked"
          : level.id === 6
            ? "Grappling hook unlocked"
            : "";
  return (
    <main className={`game-shell ${playing || entry ? "scene-view" : ""}`}>
      <GameViewport options={options.current} onReady={ready} />
      <div className="vignette" />
      <header className="hud">
        <div className="identity">
          <span className="monogram">
            CL
            <span>
              <ArrowUpRight size={20} />
            </span>
          </span>
          <div>
            <strong>CONVOY LEAP</strong>
            <span>
              DESERT / {String(level.id).padStart(2, "0")} — {level.name}
            </span>
          </div>
        </div>
        <div className="hud-right">
          <span className="timer">{clock(state?.time || 0)}</span>
          <button
            className="icon-button"
            aria-label={settings.volume ? "Mute sound" : "Unmute sound"}
            onClick={() => update("volume", settings.volume ? 0 : 0.3)}
          >
            {settings.volume ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          {playing && (
            <button
              className="icon-button"
              aria-label="Pause game"
              onPointerDown={(e) => {
                if (e.pointerType === "touch") {
                  e.preventDefault();
                  engine.current?.pause();
                }
              }}
              onClick={() => engine.current?.pause()}
            >
              <Pause size={18} />
            </button>
          )}
        </div>
      </header>
      {(playing || entry) && (
        <div className="level-banner" aria-label={`World 1, level ${level.id}`}>
          LEVEL 1:{level.id}
        </div>
      )}
      {entry && (
        <section className="start-prompt" aria-label="Game menu">
          <span className="start-title">CONVOY LEAP</span>
          <button className="primary-button" onClick={start}>
            PLAY LEVEL <ArrowRight size={19} />
          </button>
          <div className="start-controls">
            {touch
              ? "Left stick move/sprint · Drag right look · Jump"
              : "WASD move · Mouse look · Space jump · Shift sprint"}
          </div>
          <div className="menu-actions">
            <button onClick={() => setPanel("levels")}>
              Levels <ChevronRight size={15} />
            </button>
            <button onClick={() => setPanel("loadout")}>
              Abilities <ChevronRight size={15} />
            </button>
            <button
              onClick={() => setPanel("settings")}
              aria-label="Game settings"
            >
              <Settings2 size={16} />
            </button>
          </div>
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
        </section>
      )}
      {playing && (
        <>
          <TouchControls getEngine={() => engine.current} settings={settings} />
          <div className="crosshair" />
          {(settings.movement !== "none" || settings.utility !== "none") && (
            <div className="ability-hud">
              {settings.movement !== "none" && (
                <div>
                  <span>{names[settings.movement]}</span>
                  <small>
                    {settings.movement === "double"
                      ? "SPACE · IN AIR"
                      : `E · ${state!.cooldown > 0 ? state!.cooldown.toFixed(1) + "s" : "READY"}`}
                  </small>
                </div>
              )}
              {settings.utility === "slow" && (
                <div>
                  <span>Slow motion</span>
                  <small>
                    Q ·{" "}
                    {state!.scale < 0.8
                      ? "ACTIVE"
                      : state!.slow > 0.98
                        ? "READY"
                        : "CHARGING"}
                  </small>
                  <div className="meter">
                    <i style={{ width: `${state!.slow * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          )}
          {settings.hints && (state?.time || 0) < 5 && (
            <div className="playing-hint">
              <span className="hint-dot" />
              Sprint toward the edge, then jump to another roof.
              <small>
                {touch
                  ? "Full stick to sprint · Drag right to look · Jump to leap"
                  : "WASD move · Mouse look · Space jump · Shift sprint · R retry"}
              </small>
            </div>
          )}
        </>
      )}
      {!playing && !entry && (
        <div className="menu-layer">
          <section
            className={`game-menu ${panel === "levels" ? "wide-menu" : ""}`}
            aria-label="Game menu"
          >
            <div className="menu-top">
              <span className="eyebrow">
                {phase === "Loading"
                  ? "STARTING PHYSICS"
                  : completed
                    ? "LEVEL COMPLETE"
                    : failed
                      ? "RUN ENDED"
                      : phase === "Paused"
                        ? "GAME PAUSED"
                        : "FIRST-PERSON / PHYSICS PLATFORMER"}
              </span>
              {panel !== "play" && (
                <button
                  className="icon-button"
                  aria-label="Close panel"
                  onClick={() => setPanel("play")}
                >
                  <X size={17} />
                </button>
              )}
            </div>
            {panel === "play" ? (
              <>
                <h1>
                  {completed
                    ? "Perfect landing."
                    : failed
                      ? "One more leap."
                      : phase === "Paused"
                        ? "Take a breath."
                        : phase === "Loading"
                          ? "Loading game…"
                          : "Stay off the ground."}
                </h1>
                <p className="menu-description">
                  {completed
                    ? `${level.name} · ${clock(state?.time || 0)}${unlock ? " · " + unlock : ""}`
                    : failed
                      ? state?.reason
                      : phase === "Paused"
                        ? "The convoy will wait. Resume when you are ready."
                        : "Sprint, leap between moving trucks, and reach the finish."}
                </p>
                <div className="level-strip">
                  <span className="level-number">
                    {String(level.id).padStart(2, "0")}
                  </span>
                  <div>
                    <strong>{level.name}</strong>
                    <small>{level.subtitle}</small>
                  </div>
                  {progress.best[level.id] && (
                    <span className="best">
                      BEST
                      <br />
                      {clock(progress.best[level.id])}
                    </span>
                  )}
                </div>
                {completed && level.id < 10 ? (
                  <button
                    className="primary-button"
                    onClick={() => {
                      engine.current?.selectLevel(level.id + 1);
                      start();
                    }}
                  >
                    NEXT LEVEL
                    <ArrowRight size={19} />
                  </button>
                ) : completed ? (
                  <button
                    className="primary-button"
                    onClick={() => setPanel("levels")}
                  >
                    10 LEVELS COMPLETE
                    <Check size={19} />
                  </button>
                ) : (
                  <button
                    disabled={phase === "Loading"}
                    className="primary-button"
                    onClick={failed ? retry : start}
                  >
                    {phase === "Loading"
                      ? "LOADING…"
                      : failed
                        ? "RETRY LEVEL"
                        : phase === "Paused"
                          ? "RESUME"
                          : "PLAY LEVEL"}
                    {failed ? (
                      <RotateCcw size={18} />
                    ) : (
                      <ArrowRight size={19} />
                    )}
                  </button>
                )}
                <div className="menu-actions">
                  <button onClick={() => setPanel("levels")}>
                    Levels
                    <ChevronRight size={15} />
                  </button>
                  <button onClick={() => setPanel("loadout")}>
                    Abilities
                    <ChevronRight size={15} />
                  </button>
                  <button
                    onClick={() => setPanel("settings")}
                    aria-label="Game settings"
                  >
                    <Settings2 size={16} />
                  </button>
                  {(phase === "Paused" || completed) && (
                    <button onClick={retry} aria-label="Restart level">
                      <RotateCcw size={16} />
                    </button>
                  )}
                </div>
                {touch ? (
                  <div className="touch-guide">
                    Left stick to move · Drag right to look
                    <br />
                    Full stick to sprint · Jump to leap
                    <br />
                    Landscape recommended
                  </div>
                ) : (
                  <div className="controls-guide">
                    <span>
                      <kbd>W A S D</kbd> Move
                    </span>
                    <span>
                      <kbd>MOUSE</kbd> Look
                    </span>
                    <span>
                      <kbd>SPACE</kbd> Jump
                    </span>
                    <span>
                      <kbd>SHIFT</kbd> Sprint
                    </span>
                    <span>
                      <kbd>R</kbd> Retry
                    </span>
                    <span>
                      <kbd>ESC</kbd> Pause
                    </span>
                  </div>
                )}
              </>
            ) : panel === "levels" ? (
              <>
                <h2>Choose your leap.</h2>
                <p className="menu-description">
                  10 authored levels. Finish each to unlock the next.
                </p>
                <div className="level-grid">
                  {LEVELS.map((l) => (
                    <button
                      key={l.id}
                      disabled={l.id > progress.unlockedLevel}
                      className={l.id === level.id ? "selected" : ""}
                      onClick={() => {
                        engine.current?.selectLevel(l.id);
                        setPanel("play");
                      }}
                    >
                      <span>
                        {String(l.id).padStart(2, "0")}
                        {l.id > progress.unlockedLevel ? (
                          <Lock size={15} />
                        ) : progress.best[l.id] ? (
                          <Check size={15} />
                        ) : (
                          <ArrowRight size={15} />
                        )}
                      </span>
                      <strong>{l.name}</strong>
                      <small>
                        {progress.best[l.id]
                          ? clock(progress.best[l.id])
                          : l.id > progress.unlockedLevel
                            ? "Locked"
                            : "Ready to run"}
                      </small>
                    </button>
                  ))}
                </div>
              </>
            ) : panel === "loadout" ? (
              <>
                <h2>A little extra lift.</h2>
                <p className="menu-description">
                  Equip a movement ability and a utility. Basic mode is always
                  available.
                </p>
                <label className="setting">
                  Movement
                  <select
                    aria-label="Movement ability"
                    value={settings.movement}
                    onChange={(e) =>
                      update("movement", e.target.value as Settings["movement"])
                    }
                  >
                    {Object.entries(names).map(([key, name]) => (
                      <option
                        key={key}
                        value={key}
                        disabled={
                          !progress.abilities.includes(
                            key as Settings["movement"],
                          )
                        }
                      >
                        {name}
                        {!progress.abilities.includes(
                          key as Settings["movement"],
                        )
                          ? " · locked"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="setting">
                  Utility
                  <select
                    aria-label="Utility ability"
                    value={settings.utility}
                    onChange={(e) =>
                      update("utility", e.target.value as Settings["utility"])
                    }
                  >
                    <option value="none">None</option>
                    <option value="slow" disabled={!progress.slowUnlocked}>
                      Slow motion{!progress.slowUnlocked ? " · locked" : ""}
                    </option>
                  </select>
                </label>
                <p className="ability-explanation">
                  Double jump: Space again in the air.
                  <br />
                  Dash: E for a forward impulse.
                  <br />
                  Grapple: aim at a truck within 36m, press E.
                  <br />
                  Slow motion: Q slows the entire simulation.
                </p>
                <small className="unlock-note">
                  Unlock double jump after 01, slow motion after 02, dash after
                  04, and grapple after 06.
                </small>
              </>
            ) : (
              <>
                <h2>Make it yours.</h2>
                <div className="settings-list">
                  <label className="setting">
                    Sensitivity{" "}
                    <span>{(settings.sensitivity * 1000).toFixed(1)}</span>
                    <input
                      type="range"
                      min=".0005"
                      max=".008"
                      step=".0001"
                      value={settings.sensitivity}
                      onChange={(e) => update("sensitivity", +e.target.value)}
                    />
                  </label>
                  <label className="setting">
                    Field of view <span>{settings.fov}°</span>
                    <input
                      type="range"
                      min="50"
                      max="100"
                      value={settings.fov}
                      onChange={(e) => update("fov", +e.target.value)}
                    />
                  </label>
                  <label className="setting">
                    Volume <span>{Math.round(settings.volume * 100)}%</span>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step=".05"
                      value={settings.volume}
                      onChange={(e) => update("volume", +e.target.value)}
                    />
                  </label>
                  <label className="setting">
                    Graphics
                    <select
                      value={settings.quality}
                      onChange={(e) =>
                        update("quality", e.target.value as Settings["quality"])
                      }
                    >
                      <option value="auto">Auto</option>
                      <option value="high">High</option>
                      <option value="low">Low · simple shadows</option>
                    </select>
                  </label>
                  {(["shake", "sprintFov", "hints", "debug"] as const).map(
                    (k) => (
                      <label key={k} className="toggle">
                        <span>
                          {k === "shake"
                            ? "Subtle landing shake"
                            : k === "sprintFov"
                              ? "Sprint field of view"
                              : k === "hints"
                                ? "Control hints"
                                : "Physics debug overlay"}
                        </span>
                        <input
                          type="checkbox"
                          checked={settings[k]}
                          onChange={(e) => update(k, e.target.checked)}
                        />
                      </label>
                    ),
                  )}
                </div>
              </>
            )}
            {error && (
              <div className="error-message" role="alert">
                {error}
                {phase === "Loading" && (
                  <button
                    className="primary-button"
                    onClick={() => location.reload()}
                  >
                    Reload game
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
      )}
      {playing && settings.debug && state && (
        <pre className="debug">
          {Math.round(state.fps)} fps · {state.drawCalls} draws · {state.bodies}{" "}
          bodies{"\n"}world {state.speed.toFixed(2)} m/s · relative{" "}
          {state.relativeSpeed.toFixed(2)} m/s{"\n"}grounded{" "}
          {String(state.grounded)} · support {state.support ?? "none"} · normal{" "}
          {state.normal.toFixed(2)}
          {"\n"}transfers {state.landings} · time scale {state.scale.toFixed(2)}
        </pre>
      )}
    </main>
  );
}
