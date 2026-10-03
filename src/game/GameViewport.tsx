import { useEffect, useRef } from "react";
import { GameEngine, type EngineOptions } from "./engine";
export default function GameViewport({
  options,
  onReady,
}: {
  options: EngineOptions;
  onReady: (engine: GameEngine | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    initial = useRef(options),
    ready = useRef(onReady);
  useEffect(() => {
    let dead = false;
    let engine: GameEngine | null = null;
    if (ref.current)
      void GameEngine.create(ref.current, initial.current)
        .then((e) => {
          if (dead) e.dispose();
          else {
            engine = e;
            ready.current(e);
          }
        })
        .catch((e) => {
          console.error(e);
          initial.current.onError(
            "Could not load the 3D game. Enable WebGL and reload this tab.",
          );
        });
    return () => {
      dead = true;
      ready.current(null);
      engine?.dispose();
    };
  }, []);
  return <div className="game-canvas" ref={ref} />;
}
