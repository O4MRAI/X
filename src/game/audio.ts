let context: AudioContext | null = null;
export function initAudio() { try { context ??= new AudioContext(); if (context.state === 'suspended') void context.resume(); } catch { /* Silent play remains available. */ } }
export function playTone(kind: 'jump' | 'gem' | 'over' | 'click', enabled: boolean) {
  if (!enabled || !context) return;
  const oscillator = context.createOscillator(); const gain = context.createGain();
  const now = context.currentTime; const frequencies = { jump: [240, 520], gem: [660, 1040], over: [160, 60], click: [440, 530] };
  oscillator.type = kind === 'over' ? 'triangle' : 'sine';
  oscillator.frequency.setValueAtTime(frequencies[kind][0], now);
  oscillator.frequency.exponentialRampToValueAtTime(frequencies[kind][1], now + .15);
  gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(.1, now + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, now + .2);
  oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now); oscillator.stop(now + .22);
}
