import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronRight, CircleHelp, Diamond, Flag, Footprints, Gamepad2, Heart, Maximize, Pause, Play, RotateCcw, Settings2, ShieldCheck, Smartphone, Sparkles, Trophy, Volume2, VolumeX, X, Zap } from 'lucide-react';
import type { GameEngine, FrameStats } from './game/engine';
import type { CharacterId, Phase, Quality, Run } from './game/core';
import { initAudio, playTone } from './game/audio';
import { readSave, saveProgress, type SaveData } from './game/storage';
const GameViewport = lazy(() => import('./game/GameViewport'));
const characters: { id: CharacterId; name: string; title: string; color: string; quote: string }[] = [
  { id: 'nova', name: 'Nova', title: 'The rooftop rebel', color: '#b7a0ef', quote: 'Big dreams. Bigger jumps.' },
  { id: 'dash', name: 'Dash', title: 'The speed chaser', color: '#f0ad7f', quote: 'Catch me if you can.' },
  { id: 'pixel', name: 'Pixel', title: 'Your tiny co-pilot', color: '#8ec8bc', quote: 'Small bot. Unlimited courage.' },
];
const initialStats: FrameStats = { score: 0, distance: 0, gems: 0, jumps: 0, landings: 0, edge: 8, airborne: false };
type Dialog = 'help' | 'characters' | 'settings' | 'records' | null;
function readPreferences() {
  try { const data = JSON.parse(localStorage.getItem('rooftop-rush-preferences') || '{}'); return data && typeof data === 'object' ? data : {}; } catch { return {}; }
}
function Modal({ title, eyebrow, children, onClose, wide = false }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
      if (e.key === 'Tab') {
        const targets = panel.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a, select, input, [tabindex="0"]');
        if (!targets?.length) return;
        const first = targets[0]; const last = targets[targets.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', key, true); panel.current?.querySelector('button')?.focus();
    return () => { document.removeEventListener('keydown', key, true); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={panel}>
      <button className="icon-button close-modal" aria-label="Close dialog" onClick={onClose}><X size={20} /></button>
      <span className="eyebrow">{eyebrow}</span><h2 id="dialog-title">{title}</h2>{children}
    </div>
  </div>;
}
function RunOverlay({ children, label }: { children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector('button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const buttons = ref.current?.querySelectorAll<HTMLButtonElement>('button');
      if (!buttons?.length) return;
      if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[buttons.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="game-overlay" ref={ref} role="dialog" aria-modal="true" aria-label={label}>{children}</div>;
}
function Portrait({ id, className = '' }: { id: CharacterId; className?: string }) {
  return <span role="img" aria-label={`${characters.find(c => c.id === id)?.name} character`} className={`portrait portrait-${id} ${className}`} />;
}
function TouchButton({ direction, engine }: { direction: number; engine: React.RefObject<GameEngine | null> }) {
  const release = () => engine.current?.move(0);
  return <button className="touch-steer" aria-label={direction === -1 ? 'Move left' : 'Move right'}
    onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); engine.current?.move(direction); }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>{direction === -1 ? <ArrowLeft /> : <ArrowRight />}</button>;
}
export default function App() {
  const prefs = useRef(readPreferences()).current;
  const [phase, setPhase] = useState<Phase>('menu');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [character, setCharacter] = useState<CharacterId>(characters.some(c => c.id === prefs.character) ? prefs.character : 'nova');
  const [sound, setSound] = useState<boolean>(prefs.sound ?? false);
  const [quality, setQuality] = useState<Quality>(['auto', 'high', 'low'].includes(prefs.quality) ? prefs.quality : 'auto');
  const [chill, setChill] = useState<boolean>(prefs.chill ?? false);
  const [save, setSave] = useState<SaveData>(readSave);
  const saveRef = useRef(save);
  const [stats, setStats] = useState(initialStats);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<Run | null>(null);
  const [newBest, setNewBest] = useState(false);
  const engine = useRef<GameEngine | null>(null);
  const phaseRef = useRef<Phase>('menu');
  const [fullscreen, setFullscreen] = useState(false);
  const selected = characters.find(c => c.id === character)!;
  const closeDialog = useCallback(() => setDialog(null), []);
  const pause = useCallback(() => { if (phaseRef.current === 'playing') { phaseRef.current = 'paused'; engine.current?.setPhase('paused'); setPhase('paused'); } }, []);
  const over = useCallback((run: Run) => {
    phaseRef.current = 'over'; setPhase('over'); setResult({ ...run });
    const previous = saveRef.current;
    const updated: SaveData = { ...previous, best: Math.max(previous.best, run.score), bestDistance: Math.max(previous.bestDistance, Math.floor(run.distance)), totalGems: previous.totalGems + run.gems, runs: previous.runs + 1 };
    setNewBest(run.score > previous.best); saveRef.current = updated; setSave(updated); saveProgress(updated);
  }, []);
  const engineReady = useCallback((game: GameEngine | null) => { engine.current = game; setReady(!!game); }, []);
  const start = useCallback(() => {
    if (!engine.current || error) return;
    initAudio(); playTone('click', sound); setDialog(null); setStats(initialStats); setResult(null); setNewBest(false);
    phaseRef.current = 'playing'; engine.current.start(chill); setPhase('playing');
  }, [chill, sound, error]);
  const resume = () => { initAudio(); phaseRef.current = 'playing'; engine.current?.setPhase('playing'); setPhase('playing'); };
  const home = () => { phaseRef.current = 'menu'; engine.current?.menu(); setPhase('menu'); setResult(null); if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); };
  const toggleFullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* Fullscreen is optional in browser embeds. */ } };
  useEffect(() => {
    engine.current?.setCharacter(character); engine.current?.setSound(sound); engine.current?.setQuality(quality);
    try { localStorage.setItem('rooftop-rush-preferences', JSON.stringify({ character, sound, quality, chill })); } catch { /* Play is available without storage. */ }
  }, [character, sound, quality, chill, ready]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (dialog) return;
      if (e.code === 'Escape' && phaseRef.current === 'playing') pause();
      else if (e.code === 'Escape' && phaseRef.current === 'paused') resume();
      if (e.code === 'KeyR' && phaseRef.current === 'over') start();
    };
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    window.addEventListener('keydown', key); document.addEventListener('fullscreenchange', onFullscreen);
    return () => { window.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', onFullscreen); };
  }, [dialog, pause, start]);
  const isHome = phase === 'menu';
  return <div className={`app ${!isHome ? 'is-playing' : ''}`}>
    <header className="site-header">
      <button className="brand" onClick={home} aria-label="Rooftop Rush home"><span className="brand-mark"><Zap fill="currentColor" size={22} /></span><span>rooftop<span className="brand-bottom">RUSH<span className="brand-dot">.</span></span></span></button>
      <nav aria-label="Main navigation"><button className="nav-active" onClick={home}><Gamepad2 size={16} /> Play</button><button onClick={() => setDialog('characters')}>The crew</button><button onClick={() => setDialog('help')}>How to play <ArrowUp size={13} className="diagonal" /></button></nav>
      <div className="header-actions"><span className="gem-wallet" title="Gems collected on this device"><Diamond size={16} /><b>{save.totalGems}</b></span><button className="icon-button" aria-label={sound ? 'Mute sound' : 'Enable sound'} onClick={() => { initAudio(); setSound(s => !s); }}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="icon-button" aria-label="Open settings" onClick={() => setDialog('settings')}><Settings2 size={19} /></button><span className="header-divider" /><button className="player-badge" onClick={() => setDialog('records')} aria-label="Your run records"><Portrait id={character} /><span>PLAYER 01<small>Ready for takeoff</small></span></button></div>
    </header>
    <main className="main-content">
      <div className="page-intro"><div><span className="eyebrow"><span className="live-dot" /> YOUR NEXT ADVENTURE STARTS HERE</span><h1>Good day for a <span>great leap.</span></h1></div><button className="text-link" onClick={() => setDialog('records')}><Trophy size={16} /> Personal best <b>{save.bestDistance} m</b><ChevronRight size={15} /></button></div>
      <section className={`hero-stage ${!isHome ? 'game-stage' : ''}`} aria-label="Rooftop Rush game">
        <Suspense fallback={<div className="scene-loading"><span className="spinner" /><span>Building your world…</span></div>}>
          <GameViewport options={{ onStats: setStats, onOver: over, onPause: pause, onError: setError, character, quality, sound }} onReady={engineReady} />
        </Suspense>
        {isHome && <>
          <div className="hero-gradient" />
          <div className="hero-copy"><div className="hero-label"><span className="tiny-flag"><Flag size={12} fill="currentColor" /></span> BIG LEAPS. ZERO BRAKES.</div>
            <h2>Stay off<br />the <span>ground<svg viewBox="0 0 330 16" preserveAspectRatio="none" aria-hidden="true"><path d="M3 11C90 0 199 0 326 9" /></svg></span>.</h2>
            <p>The road is lava. The trucks are moving.<br />{' '}One brave runner. How far will you go?</p>
            <button className="button button-dark play-button" onClick={start} disabled={!ready || !!error}><Play size={18} fill="currentColor" />{ready ? 'Let’s run' : 'Loading game…'}<ArrowRight size={19} /></button>
            <span className="hero-footnote"><ShieldCheck size={13} /> Free to play <span>·</span> No downloads needed</span>
          </div>
          <span className="scene-badge"><span /> ENDLESS ADVENTURE</span>
          <div className="scene-caption"><span className="caption-marker"><Footprints size={17} /></span><span>Meet {selected.name}<small>{selected.title}</small></span><button onClick={() => setDialog('characters')} aria-label="Change runner"><ArrowRight size={17} /></button></div>
          <div className="scene-controls"><span><Smartphone size={13} /> Touch-ready</span><span><Gamepad2 size={14} /> Keyboard-friendly</span></div>
        </>}
        {!isHome && <>
          <div className="game-topbar"><div className="run-logo"><Zap size={18} fill="currentColor" /> ROOFTOP RUSH</div><div className="game-tools"><button className="game-icon" aria-label={sound ? 'Mute sound' : 'Enable sound'} onClick={() => { initAudio(); setSound(s => !s); }}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button className="game-icon fullscreen-button" aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'} onClick={() => void toggleFullscreen()}><Maximize size={18} /></button><button className="game-icon" aria-label="Pause game" onClick={pause}><Pause size={19} fill="currentColor" /></button></div></div>
          <div className="run-hud"><div className="score-pill"><span>DISTANCE</span><strong>{Math.floor(stats.distance)}<small>m</small></strong></div><div className="gem-pill"><Diamond size={19} /><b>{stats.gems}</b></div><span className="mode-pill">{chill ? 'CHILL RUN' : 'FREE RUN'}</span></div>
          {phase === 'playing' && <>
            <div className={`jump-prompt ${stats.edge < 2.9 && !stats.airborne ? 'jump-now' : ''}`}><span>{stats.edge < 2.9 && !stats.airborne ? 'JUMP NOW!' : stats.airborne ? 'Aim for the next roof' : 'Stay on the rooftops'}</span>{stats.distance < 30 && <small><span className="keyboard-tip">Hold ← → to steer · Space to jump</span><span className="touch-tip">Hold arrows to steer · Tap Jump to leap</span></small>}</div>
            <div className="touch-controls"><div className="steer-group"><TouchButton direction={-1} engine={engine} /><TouchButton direction={1} engine={engine} /></div><button className="touch-jump" aria-label="Jump" onPointerDown={e => { e.preventDefault(); engine.current?.jump(); }}><ArrowUp size={29} /><span>JUMP</span></button></div>
            <div className="desktop-controls"><span><kbd>A</kbd><kbd>D</kbd> steer</span><span><kbd>SPACE</kbd> jump</span><span><kbd>ESC</kbd> pause</span></div>
          </>}
          {phase === 'paused' && <RunOverlay label="Game paused"><div className="run-dialog"><span className="dialog-symbol"><Pause size={25} fill="currentColor" /></span><span className="eyebrow">TAKE A BREATHER</span><h2>World on pause.</h2><p>Your next rooftop can wait.</p><button className="button button-dark" onClick={resume}><Play size={17} fill="currentColor" /> Keep running</button><button className="button button-outline" onClick={start}><RotateCcw size={17} /> Start a new run</button><button className="text-link" onClick={home}>Back to the lobby</button></div></RunOverlay>}
          {phase === 'over' && result && <RunOverlay label="Run results"><div className="run-dialog result-dialog"><span className={`dialog-symbol ${newBest ? 'best-symbol' : ''}`}>{newBest ? <Trophy size={27} /> : <Flag size={27} />}</span><span className="eyebrow">{newBest ? 'A NEW PERSONAL BEST!' : 'EVERY LEAP IS A NEW CHANCE'}</span><h2>{newBest ? 'Look at you go.' : 'One more leap?'}</h2><p>{result.reason === 'truck' ? 'A truck caught you. Try landing on its roof.' : 'The road got you. Time your next jump.'}</p><div className="result-distance">{Math.floor(result.distance)}<span>meters</span></div><div className="result-stats"><span><Diamond size={16} /><b>{result.gems}</b> gems</span><span><Footprints size={16} /><b>{result.landings}</b> roofs</span><span><Zap size={16} /><b>{result.score}</b> score</span></div><button className="button button-dark" onClick={start}><RotateCcw size={17} /> Run it back <span className="button-key">R</span></button><button className="text-link" onClick={home}>Back to the lobby <ArrowRight size={15} /></button></div></RunOverlay>}
        </>}
        {error && <div className="game-error" role="alert"><CircleHelp size={24} /><h3>Let’s get you back on track.</h3><p>{error}</p><button className="button button-dark" onClick={() => location.reload()}>Reload game</button></div>}
      </section>
      <section className="below-hero"><div className="crew-card"><div className="section-top"><div><span className="eyebrow">YOUR ADVENTURE, YOUR RUNNER</span><h2>Pick your partner in climb.</h2></div><span className="small-tag">3 runners. All yours.</span></div><div className="runner-list">{characters.map(c => <button key={c.id} className={`runner-card ${character === c.id ? 'selected' : ''}`} onClick={() => { setCharacter(c.id); playTone('click', sound); }} aria-pressed={character === c.id}><Portrait id={c.id} /><span className="runner-info"><strong>{c.name}</strong><small>{c.title}</small></span><span className="runner-check">{character === c.id ? <Check size={13} strokeWidth={3} /> : <ArrowUp size={13} className="diagonal" />}</span></button>)}</div></div>
        <div className="milestone-card"><div className="milestone-heading"><span className="milestone-icon"><Flag size={21} /></span><span className="eyebrow">A LITTLE FURTHER</span><span className="small-tag">YOUR NEXT MILESTONE</span></div><h2>The 250-meter club.</h2><p>Find your rhythm. Make the rooftops your runway.</p><div className="progress-caption"><span>{save.bestDistance >= 250 ? 'Milestone reached. Beautifully done.' : `${Math.min(save.bestDistance, 250)} / 250 meters`}</span><b>{Math.min(100, Math.floor(save.bestDistance / 250 * 100))}%</b></div><div className="progress-track"><span style={{ width: `${Math.min(100, save.bestDistance / 250 * 100)}%` }} /></div><button className="text-link" onClick={() => setDialog('help')}>A few tips for the trip <ArrowRight size={14} /></button></div>
      </section>
      <section className="how-strip"><div><span className="how-icon"><ArrowUp size={23} /></span><span><b>A leap of faith. A game of timing.</b><small>Jump between roofs, grab gems, and keep the streak alive.</small></span></div><button className="text-link" onClick={() => setDialog('help')}>Learn the ropes <ArrowRight size={16} /></button></section>
      <footer><span><span className="footer-dot" /> MADE FOR LITTLE BREAKS & BIG ADVENTURES</span><span>Play anywhere. Stay curious. <Heart size={12} /></span></footer>
    </main>
    {dialog === 'help' && <Modal title="A few tips. Big leaps." eyebrow="WELCOME TO THE ROOFTOPS" onClose={closeDialog}>
      <div className="help-steps"><div><span>01</span><section><h3>The road is lava.</h3><p>You run forward automatically. Land on the flat tops of trucks. Falling onto the road or hitting a truck’s side ends your run.</p></section></div><div><span>02</span><section><h3>Jump before the edge.</h3><p>Tap Jump or press Space. Wait until you’re near the front of your truck, then leap toward the next rooftop. Watch for the “Jump now” cue.</p></section></div><div><span>03</span><section><h3>Find your lane.</h3><p>Hold the left and right controls, A / D, or arrow keys to steer — even in the air. Stay centered for a clean landing.</p></section></div><div><span>04</span><section><h3>Go a little further.</h3><p>Collect lime gems for 25 bonus points each. Your best distance and score are saved on this device. Try Chill mode in settings for a slower start.</p></section></div></div><div className="control-guide"><span><kbd>←</kbd><kbd>→</kbd> Steer</span><span><kbd>SPACE</kbd> Jump</span><span><kbd>ESC</kbd> Pause</span></div><button className="button button-dark" onClick={start} disabled={!ready || !!error}>Got it. Let’s run <ArrowRight size={17} /></button>
    </Modal>}
    {dialog === 'characters' && <Modal title="Meet your rooftop crew." eyebrow="THREE WAYS TO TAKE THE LEAP" onClose={closeDialog} wide>
      <p className="modal-description">Same moves. Different energy. Every runner is ready to go.</p><div className="crew-gallery">{characters.map(c => <button key={c.id} className={`gallery-card ${character === c.id ? 'selected' : ''}`} onClick={() => setCharacter(c.id)} aria-pressed={character === c.id}><Portrait id={c.id} /><span className="gallery-name">{c.name}{character === c.id && <Check size={18} />}</span><small>{c.title}</small><p>“{c.quote}”</p><span className="gallery-select">{character === c.id ? 'Your current runner' : 'Choose runner'}<ArrowRight size={15} /></span></button>)}</div><button className="button button-dark" onClick={closeDialog}>Looking good <Check size={17} /></button>
    </Modal>}
    {dialog === 'settings' && <Modal title="Your kind of adventure." eyebrow="MAKE YOURSELF AT HOME" onClose={closeDialog}>
      <div className="setting-row"><div><h3>Sound effects</h3><p>A little extra joy with every jump.</p></div><button role="switch" aria-checked={sound} aria-label="Sound effects" className={`switch ${sound ? 'on' : ''}`} onClick={() => { initAudio(); setSound(s => !s); }}><span /></button></div>
      <div className="setting-row"><div><h3>Chill mode</h3><p>A slower pace, more time to find your feet.<br />Applies when you start your next run.</p></div><button role="switch" aria-checked={chill} aria-label="Chill mode" className={`switch ${chill ? 'on' : ''}`} onClick={() => setChill(c => !c)}><span /></button></div>
      <div className="setting-row"><div><h3>Graphics quality</h3><p>Auto adapts to your device as you play.</p></div><select aria-label="Graphics quality" value={quality} onChange={e => setQuality(e.target.value as Quality)}><option value="auto">Auto</option><option value="high">High</option><option value="low">Battery saver</option></select></div>
      <div className="settings-note"><Smartphone size={21} /><p>Made for browser and Android touchscreens. Add this game to your home screen from your browser’s menu when hosted over HTTPS.</p></div><button className="button button-dark" onClick={closeDialog}>All set <Check size={17} /></button>
    </Modal>}
    {dialog === 'records' && <Modal title="Every run counts." eyebrow="YOUR LITTLE HALL OF FAME" onClose={closeDialog}>
      <div className="records-grid"><div><Trophy size={23} /><strong>{save.bestDistance}<small>m</small></strong><span>Best distance</span></div><div><Zap size={23} /><strong>{save.best}</strong><span>Best score</span></div><div><Diamond size={23} /><strong>{save.totalGems}</strong><span>Total gems</span></div><div><Flag size={23} /><strong>{save.runs}</strong><span>Runs completed</span></div></div><p className="records-note">Saved in this browser, on this device. A fresh start is always one leap away.</p><button className="button button-dark" onClick={start} disabled={!ready || !!error}>Make the next one count <ArrowRight size={17} /></button>
    </Modal>}
  </div>;
}
