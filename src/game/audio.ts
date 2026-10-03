export class GameAudio {
  private ctx: AudioContext | null = null;
  private gain: GainNode | null = null;
  private engine: OscillatorNode | null = null;
  private wind: AudioBufferSourceNode | null = null;
  private windGain: GainNode | null = null;
  private voices = new Set<OscillatorNode>();
  activate(volume: number) {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    void this.ctx.resume();
    this.setVolume(volume);
    this.start();
  }
  private start() {
    if (!this.ctx || !this.gain || this.engine) return;
    const ctx = this.ctx,
      osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 55;
    gain.gain.value = 0.065;
    osc.connect(gain).connect(this.gain);
    osc.start();
    this.engine = osc;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate),
      data = buffer.getChannelData(0);
    let filtered = 0;
    for (let i = 0; i < data.length; i++) {
      filtered = (filtered + (Math.random() * 2 - 1) * 0.02) / 1.02;
      data[i] = filtered * 3;
    }
    const source = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      windGain = ctx.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 900;
    windGain.gain.value = 0.02;
    source.connect(filter).connect(windGain).connect(this.gain);
    source.start();
    this.wind = source;
    this.windGain = windGain;
  }
  setVolume(n: number) {
    if (this.gain && this.ctx)
      this.gain.gain.setTargetAtTime(n, this.ctx.currentTime, 0.03);
  }
  update(speed: number) {
    if (this.engine && this.ctx)
      this.engine.frequency.setTargetAtTime(
        45 + Math.min(60, speed * 2),
        this.ctx.currentTime,
        0.15,
      );
    if (this.windGain && this.ctx)
      this.windGain.gain.setTargetAtTime(
        Math.min(0.15, speed * 0.003),
        this.ctx.currentTime,
        0.15,
      );
  }
  cue(type: "jump" | "land" | "crash" | "fail" | "complete") {
    if (!this.ctx || !this.gain) return;
    const ctx = this.ctx,
      osc = ctx.createOscillator(),
      g = ctx.createGain();
    const pitches = {
      jump: [180, 370],
      land: [100, 40],
      crash: [75, 24],
      fail: [140, 25],
      complete: [440, 880],
    };
    const [a, b] = pitches[type];
    osc.type =
      type === "crash" ? "sawtooth" : type === "land" ? "triangle" : "sine";
    osc.frequency.setValueAtTime(a, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(b, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.13, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
    osc.connect(g).connect(this.gain);
    this.voices.add(osc);
    osc.onended = () => {
      this.voices.delete(osc);
      osc.disconnect();
      g.disconnect();
    };
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }
  pause() {
    this.engine?.stop();
    this.engine?.disconnect();
    this.engine = null;
    this.wind?.stop();
    this.wind?.disconnect();
    this.wind = null;
    this.windGain?.disconnect();
    this.windGain = null;
    for (const voice of this.voices) {
      voice.stop();
      voice.disconnect();
    }
    this.voices.clear();
  }
  dispose() {
    this.pause();
    void this.ctx?.close();
    this.ctx = null;
  }
}
