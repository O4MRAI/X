import { useEffect, useRef } from 'react';
import { GameEngine, type EngineOptions } from './engine';
export default function GameViewport({ options, onReady }: { options: EngineOptions; onReady: (engine: GameEngine | null) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const initialOptions = useRef(options);
  const ready = useRef(onReady);
  useEffect(() => {
    if (!ref.current) return;
    let engine: GameEngine;
    try { engine = new GameEngine(ref.current, initialOptions.current); ready.current(engine); }
    catch { initialOptions.current.onError('This browser could not start 3D graphics. Enable hardware acceleration or try Chrome on Android.'); return; }
    return () => { ready.current(null); engine.dispose(); };
  }, []);
  return <div className="game-canvas" ref={ref} />;
}
