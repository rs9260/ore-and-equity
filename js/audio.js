// All sound is synthesised with the Web Audio API.

const MATERIALS = {
  stone: { type: 'bandpass', freq: 2100, q: 1.1, dur: 0.11, gain: 0.5, tone: 130 },
  dirt: { type: 'lowpass', freq: 850, q: 0.7, dur: 0.13, gain: 0.7 },
  grass: { type: 'bandpass', freq: 1500, q: 0.6, dur: 0.13, gain: 0.55 },
  sand: { type: 'highpass', freq: 1300, q: 0.5, dur: 0.17, gain: 0.35 },
  wood: { type: 'bandpass', freq: 650, q: 2.5, dur: 0.1, gain: 0.6, knock: 190 },
  leaves: { type: 'highpass', freq: 2800, q: 0.4, dur: 0.12, gain: 0.35 },
  glass: { type: 'highpass', freq: 3500, q: 0.8, dur: 0.22, gain: 0.45, glass: true },
  cloth: { type: 'lowpass', freq: 520, q: 0.5, dur: 0.12, gain: 0.6 },
};

const CHORDS = [
  [48, 55, 59, 64], // Cmaj7
  [45, 52, 55, 60], // Am7
  [41, 48, 52, 57], // Fmaj7
  [43, 50, 55, 59], // G
];
const SCALE = [0, 2, 4, 7, 9];
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try { this.muted = localStorage.getItem('oe_muted') === '1'; } catch {}
    this.listeners = [];
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.5; this.music.connect(this.master);
    // simple echo for the music bus
    const delay = ctx.createDelay(1.0); delay.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const wet = ctx.createGain(); wet.gain.value = 0.4;
    this.musicIn = ctx.createGain();
    this.musicIn.connect(this.music);
    this.musicIn.connect(delay); delay.connect(fb).connect(delay); delay.connect(wet).connect(this.music);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem('oe_muted', m ? '1' : '0'); } catch {}
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
    this.listeners.forEach((f) => f(m));
  }
  toggleMute() { this.setMuted(!this.muted); }
  onMute(f) { this.listeners.push(f); }

  get ok() { return !!this.ctx && this.ctx.state === 'running'; }

  // ---------- primitives ----------
  noiseBurst(t, { type, freq, q, dur, gain }, dest = this.sfx, rate = 1) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }
  tone(t, { type = 'sine', f0, f1 = f0, dur, gain, attack = 0.005 }, dest = this.sfx) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------- sound effects ----------
  material(name, scale = 1, final = false) {
    if (!this.ok) return;
    const m = MATERIALS[name] || MATERIALS.stone;
    const t = this.ctx.currentTime;
    const v = 0.85 + Math.random() * 0.3;
    this.noiseBurst(t, { ...m, dur: m.dur * (final ? 1.8 : 1), gain: m.gain * scale, freq: m.freq * v }, this.sfx, v);
    if (m.tone) this.tone(t, { type: 'triangle', f0: m.tone * v, f1: m.tone * 0.5, dur: final ? 0.16 : 0.07, gain: 0.35 * scale });
    if (m.knock) this.tone(t, { type: 'triangle', f0: m.knock * v * 1.6, f1: m.knock * 0.7, dur: 0.09, gain: 0.5 * scale });
    if (m.glass && final) for (let i = 0; i < 5; i++) this.tone(t + i * 0.025, { f0: 2500 + Math.random() * 3000, dur: 0.15, gain: 0.08 });
    if (final) this.noiseBurst(t + 0.03, { ...m, freq: m.freq * 0.6, dur: m.dur * 1.4, gain: m.gain * 0.5 * scale }, this.sfx, 0.7);
  }
  hit(mat) { this.material(mat, 0.35); }
  breakBlock(mat) { this.material(mat, 1, true); }
  place(mat) { this.material(mat, 0.7); }
  step(mat) { this.material(mat, 0.18); }

  pop() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const p = 1 + Math.random() * 0.3;
    this.tone(t, { f0: 520 * p, f1: 1250 * p, dur: 0.09, gain: 0.28 });
  }
  click() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'square', f0: 1400, f1: 900, dur: 0.035, gain: 0.06 });
  }
  cashRegister() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    // key clack + drawer roll
    this.noiseBurst(t, { type: 'highpass', freq: 3000, q: 0.7, dur: 0.03, gain: 0.5 });
    this.noiseBurst(t + 0.04, { type: 'bandpass', freq: 450, q: 1.5, dur: 0.18, gain: 0.5 }, this.sfx, 0.6);
    this.tone(t + 0.04, { type: 'triangle', f0: 90, f1: 60, dur: 0.15, gain: 0.25 });
    // bell
    for (const [f, g] of [[2637, 0.22], [3951, 0.12], [5274, 0.05]]) this.tone(t + 0.13, { f0: f, dur: 0.8, gain: g });
    for (const [f, g] of [[3520, 0.18], [5274, 0.07]]) this.tone(t + 0.21, { f0: f, dur: 0.9, gain: g });
  }
  coins() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this.tone(t + i * 0.06 + Math.random() * 0.03, { f0: 2200 + Math.random() * 1800, dur: 0.18, gain: 0.1 });
  }
  alert(good) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const notes = good ? [72, 76, 79] : [76, 72, 67];
    notes.forEach((n, i) => this.tone(t + i * 0.12, { type: 'triangle', f0: midi(n), dur: 0.4, gain: 0.18 }));
  }
  // A short vocal "ooh": a falling buzzy voice shaped by the formants of an "oo" vowel.
  hurt() {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = 0.92 + Math.random() * 0.16;
    const voice = ctx.createOscillator(); voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(205 * p, t);
    voice.frequency.linearRampToValueAtTime(235 * p, t + 0.05);
    voice.frequency.exponentialRampToValueAtTime(140 * p, t + 0.32);
    const vib = ctx.createOscillator(); vib.frequency.value = 6;
    const vg = ctx.createGain(); vg.gain.value = 4;
    vib.connect(vg).connect(voice.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.5, t + 0.025);
    env.gain.setValueAtTime(0.5, t + 0.16);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    const out = ctx.createGain(); out.gain.value = 1;
    for (const [f, q, g] of [[330, 7, 1], [780, 9, 0.35], [2400, 10, 0.05]]) {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f * (0.97 + Math.random() * 0.06); bp.Q.value = q;
      const bg = ctx.createGain(); bg.gain.value = g * 2.2;
      env.connect(bp).connect(bg).connect(out);
    }
    voice.connect(env);
    out.connect(this.sfx);
    voice.start(t); vib.start(t); voice.stop(t + 0.4); vib.stop(t + 0.4);
    this.noiseBurst(t, { type: 'lowpass', freq: 500, q: 0.5, dur: 0.06, gain: 0.15 });
  }
  sizzle() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, { type: 'highpass', freq: 2500, q: 0.6, dur: 0.35, gain: 0.25 });
    this.tone(t, { type: 'sine', f0: 120, f1: 60, dur: 0.12, gain: 0.12 });
  }
  screech(vol = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'sawtooth', f0: 1900, f1: 900, dur: 0.22, gain: 0.05 * vol });
    this.tone(t + 0.05, { type: 'square', f0: 1400, f1: 2300, dur: 0.12, gain: 0.03 * vol });
  }
  toss() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, { type: 'bandpass', freq: 1200, q: 0.8, dur: 0.12, gain: 0.18 });
  }
  shieldBlock() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'triangle', f0: 420, f1: 300, dur: 0.12, gain: 0.25 });
    this.noiseBurst(t, { type: 'bandpass', freq: 600, q: 1.2, dur: 0.1, gain: 0.35 });
  }
  // a rapid run of tooth clacks
  chomp(vol = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      this.noiseBurst(t + i * 0.085, { type: 'bandpass', freq: 2600 + Math.random() * 900, q: 3, dur: 0.035, gain: 0.32 * vol });
      this.tone(t + i * 0.085, { type: 'square', f0: 900, f1: 500, dur: 0.03, gain: 0.05 * vol });
    }
  }
  // the wings snapping open
  wingsOpen() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.noiseBurst(t, { type: 'lowpass', freq: 900, q: 0.7, dur: 0.25, gain: 0.35 });
    this.noiseBurst(t + 0.05, { type: 'bandpass', freq: 1800, q: 1, dur: 0.12, gain: 0.15 });
  }
  growl(vol = 1) {
    if (!this.ok) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(70 + Math.random() * 30, t);
    o.frequency.linearRampToValueAtTime(45, t + 0.5);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 18;
    const lg = ctx.createGain(); lg.gain.value = 12;
    lfo.connect(lg).connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18 * vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
    o.connect(f).connect(g).connect(this.sfx);
    o.start(t); lfo.start(t); o.stop(t + 0.6); lfo.stop(t + 0.6);
  }
  mobHit() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.tone(t, { type: 'square', f0: 180, f1: 90, dur: 0.12, gain: 0.12 });
    this.noiseBurst(t, { type: 'bandpass', freq: 900, q: 1, dur: 0.08, gain: 0.4 });
  }
  levelUp() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    [67, 72, 76, 79, 84].forEach((n, i) => this.tone(t + i * 0.08, { type: 'triangle', f0: midi(n), dur: 0.35, gain: 0.14 }));
  }

  // ---------- ambient music: soft pad + generative piano ----------
  startMusic() {
    const ctx = this.ctx;
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass'; this.padFilter.frequency.value = 650; this.padFilter.Q.value = 0.4;
    this.padGain = ctx.createGain(); this.padGain.gain.value = 0.05;
    this.padFilter.connect(this.padGain).connect(this.musicIn);
    this.padVoices = [];
    for (let i = 0; i < 4; i++) {
      const g = ctx.createGain(); g.gain.value = 0.25; g.connect(this.padFilter);
      const oscs = [-7, 6].map((det) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = det; o.connect(g); o.start(); return o;
      });
      this.padVoices.push(oscs);
    }
    this.chord = 0;
    this.setChord(0);
    this.nextChord = ctx.currentTime + 9;
    this.nextNote = ctx.currentTime + 2;
    this.night = 0;
    this.musicTimer = setInterval(() => this.musicTick(), 120);
  }
  setChord(i) {
    const t = this.ctx.currentTime;
    CHORDS[i].forEach((m, v) => this.padVoices[v].forEach((o) => o.frequency.setTargetAtTime(midi(m), t, 1.2)));
  }
  musicTick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime;
    if (t > this.nextChord) {
      this.chord = (this.chord + 1) % CHORDS.length;
      this.setChord(this.chord);
      this.nextChord = t + 9;
    }
    if (t > this.nextNote) {
      const root = CHORDS[this.chord][0] + 24;
      const n = root + SCALE[(Math.random() * SCALE.length) | 0] + (Math.random() < 0.3 ? 12 : 0) - (this.night > 0.5 ? 12 : 0);
      this.piano(t + 0.02, midi(n), 0.11);
      if (Math.random() < 0.25) this.piano(t + 0.3, midi(n + (Math.random() < 0.5 ? 4 : 7)), 0.07);
      this.nextNote = t + 1.6 + Math.random() * 2.8;
    }
  }
  piano(t, f, gain) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(gain * 0.3, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 3.2);
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2400;
    g.connect(f2).connect(this.musicIn);
    for (const [mult, amp, type] of [[1, 1, 'triangle'], [2, 0.35, 'sine'], [3, 0.12, 'sine'], [4.01, 0.05, 'sine']]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mult;
      const og = ctx.createGain(); og.gain.value = amp;
      o.connect(og).connect(g);
      o.start(t); o.stop(t + 3.3);
    }
  }
  setNight(n) {
    if (!this.ctx || Math.abs(n - this.night) < 0.02) return;
    this.night = n;
    this.padFilter.frequency.setTargetAtTime(650 - n * 280, this.ctx.currentTime, 2);
  }
}
