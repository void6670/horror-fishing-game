import { CONFIG } from '../config.js';

// Fully procedural WebAudio sound engine. No audio files: wind, water, monsters, the alarm clock and the
// recurring lullaby motif are all synthesized.
const LULLABY = [76, 79, 81, 79, 76, 74, 76, 0, 72, 74, 76, 74, 72, 71, 69]; // MIDI, 0 = rest
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.loops = {};
    this.ready = false;
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this._timers = [];
    this.voices = [];
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = CONFIG.masterVolume;
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4;
    this.muffle.connect(this.master);
    this.master.connect(comp);
    comp.connect(ctx.destination);
    const bus = () => { const g = ctx.createGain(); g.connect(this.muffle); return g; };
    this.sfx = bus(); this.amb = bus(); this.music = bus(); this.voice = bus();
    this.music.gain.value = 0.55;
    // reverb send
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(3.2, 2.6);
    this.revSend = ctx.createGain();
    this.revSend.gain.value = 0.25;
    this.revSend.connect(this.reverb);
    this.reverb.connect(this.muffle);
    this.sfx.connect(this.revSend);
    this.music.connect(this.revSend);
    // noise buffers
    const len = ctx.sampleRate * 3;
    this.white = ctx.createBuffer(1, len, ctx.sampleRate);
    this.brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const w = this.white.getChannelData(0), b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const r = Math.random() * 2 - 1;
      w[i] = r;
      last = (last + 0.02 * r) / 1.02;
      b[i] = last * 3.5;
    }
    this.ready = true;
    if (window.speechSynthesis) {
      const load = () => { this.voices = window.speechSynthesis.getVoices(); };
      load();
      window.speechSynthesis.onvoiceschanged = load;
    }
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }
  setVolume(v) { if (this.master) this.master.gain.value = v; }
  setReverb(v) { if (this.revSend) this.revSend.gain.setTargetAtTime(v, this.t, 0.5); }
  setMuffle(freq) { if (this.muffle) this.muffle.frequency.setTargetAtTime(freq, this.t, 0.2); }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  updateListener(camera) {
    if (!this.ready) return;
    const L = this.ctx.listener;
    const p = camera.position;
    this.listenerPos = { x: p.x, y: p.y, z: p.z };
    const f = { x: 0, y: 0, z: -1 };
    const e = camera.matrixWorld.elements;
    f.x = -e[8]; f.y = -e[9]; f.z = -e[10];
    if (L.positionX) {
      const t = this.t;
      L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
      L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
      L.upX.setValueAtTime(e[4], t); L.upY.setValueAtTime(e[5], t); L.upZ.setValueAtTime(e[6], t);
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, e[4], e[5], e[6]);
    }
  }

  // Returns a destination node; positional if pos is given.
  _out(pos, bus = this.sfx, refDist = 4) {
    if (!pos) return bus;
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = refDist;
    p.maxDistance = 400;
    p.rolloffFactor = 1.1;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(bus);
    setTimeout(() => { try { p.disconnect(); } catch (e) { /* */ } }, 12000);
    return p;
  }

  _noise(buf = this.white, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf; s.loop = loop;
    s.loopStart = Math.random(); // decorrelate
    return s;
  }
  _filter(type, freq, Q = 1) { const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = Q; return f; }
  _gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  _lfo(freq, depth, target) {
    const o = this.ctx.createOscillator(); o.frequency.value = freq;
    const g = this._gain(depth); o.connect(g); g.connect(target); o.start(); return o;
  }

  // ---------- ambience loops ----------
  _makeLoop(name) {
    const ctx = this.ctx;
    const out = this._gain(0);
    out.connect(this.amb);
    const nodes = [];
    const src = (buf) => { const s = this._noise(buf); s.start(0, Math.random() * 2); nodes.push(s); return s; };
    switch (name) {
      case 'wind': {
        const s = src(this.brown); const f = this._filter('bandpass', 380, 0.6);
        nodes.push(this._lfo(0.07, 220, f.frequency));
        const g = this._gain(0.8); nodes.push(this._lfo(0.11, 0.35, g.gain));
        s.connect(f); f.connect(g); g.connect(out); break;
      }
      case 'gale': {
        const s = src(this.white); const f = this._filter('bandpass', 900, 0.8);
        nodes.push(this._lfo(0.13, 500, f.frequency));
        const g = this._gain(0.25); nodes.push(this._lfo(0.21, 0.18, g.gain));
        s.connect(f); f.connect(g); g.connect(out); break;
      }
      case 'water': {
        const s = src(this.white); const f = this._filter('lowpass', 520, 0.7);
        const g = this._gain(0.25); nodes.push(this._lfo(0.31, 0.15, g.gain)); nodes.push(this._lfo(0.53, 0.1, g.gain));
        s.connect(f); f.connect(g); g.connect(out); break;
      }
      case 'waves': {
        const s = src(this.brown); const f = this._filter('lowpass', 700, 0.5);
        nodes.push(this._lfo(0.09, 300, f.frequency));
        const g = this._gain(0.6); nodes.push(this._lfo(0.12, 0.5, g.gain));
        s.connect(f); f.connect(g); g.connect(out); break;
      }
      case 'rain': {
        const s = src(this.white); const hp = this._filter('highpass', 900); const lp = this._filter('lowpass', 6500);
        const g = this._gain(0.22); s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(out); break;
      }
      case 'crickets': {
        const o = ctx.createOscillator(); o.frequency.value = 4300; o.start(); nodes.push(o);
        const am = this._gain(0); nodes.push(this._lfo(32, 0.5, am.gain));
        const pulse = this._gain(0.04);
        const p = ctx.createOscillator(); p.type = 'square'; p.frequency.value = 1.7; p.start(); nodes.push(p);
        const pg = this._gain(0.04); p.connect(pg); pg.connect(pulse.gain);
        o.connect(am); am.connect(pulse); pulse.connect(out);
        const o2 = ctx.createOscillator(); o2.frequency.value = 3900; o2.start(); nodes.push(o2);
        const am2 = this._gain(0); nodes.push(this._lfo(27, 0.4, am2.gain));
        const pul2 = this._gain(0.02); nodes.push(this._lfo(1.1, 0.02, pul2.gain));
        o2.connect(am2); am2.connect(pul2); pul2.connect(out);
        break;
      }
      case 'underwater': {
        const s = src(this.brown); const f = this._filter('lowpass', 260, 0.8);
        const g = this._gain(1.0); nodes.push(this._lfo(0.05, 0.4, g.gain));
        s.connect(f); f.connect(g); g.connect(out);
        const o = ctx.createOscillator(); o.frequency.value = 43; o.start(); nodes.push(o);
        const og = this._gain(0.08); o.connect(og); og.connect(out); break;
      }
      case 'drone': {
        const lp = this._filter('lowpass', 320, 0.5);
        [36.7, 36.9, 55.0, 73.6].forEach((fr, i) => {
          const o = ctx.createOscillator(); o.type = i < 2 ? 'sawtooth' : 'sine'; o.frequency.value = fr; o.start(); nodes.push(o);
          const g = this._gain(i < 2 ? 0.12 : 0.18); o.connect(g); g.connect(lp);
        });
        nodes.push(this._lfo(0.03, 140, lp.frequency));
        lp.connect(out); break;
      }
      case 'tension': {
        const lp = this._filter('bandpass', 1200, 2);
        [622, 659, 698, 932].forEach((fr) => {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = Math.random() * 20 - 10; o.start(); nodes.push(o);
          nodes.push(this._lfo(5 + Math.random() * 2, 8, o.detune));
          const g = this._gain(0.03); o.connect(g); g.connect(lp);
        });
        lp.connect(out); break;
      }
      case 'heartbeat': {
        // handled by scheduler in update()
        break;
      }
      case 'swamp': {
        const s = src(this.white); const f = this._filter('bandpass', 2600, 4);
        const g = this._gain(0.05); nodes.push(this._lfo(6, 0.05, g.gain));
        s.connect(f); f.connect(g); g.connect(out); break;
      }
      case 'hum': { // fluorescent / power hum (real world)
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60; o.start(); nodes.push(o);
        const f = this._filter('lowpass', 400); const g = this._gain(0.05); o.connect(f); f.connect(g); g.connect(out); break;
      }
      case 'monitor': { // hospital heart monitor - handled by scheduler
        break;
      }
      default: break;
    }
    return { name, out, nodes, target: 0 };
  }

  // levels: {wind:0..1, water:.., ...}. Missing names fade to zero.
  setAmbience(levels, fade = 2) {
    if (!this.ready) return;
    const t = this.t;
    for (const name of Object.keys(levels)) if (!this.loops[name]) this.loops[name] = this._makeLoop(name);
    for (const [name, L] of Object.entries(this.loops)) {
      const v = levels[name] || 0;
      L.target = v;
      L.out.gain.cancelScheduledValues(t);
      L.out.gain.setTargetAtTime(v, t, fade / 3);
    }
  }
  setLoop(name, v, fade = 1) {
    if (!this.ready) return;
    if (!this.loops[name]) this.loops[name] = this._makeLoop(name);
    const L = this.loops[name];
    L.target = v;
    L.out.gain.setTargetAtTime(v, this.t, fade / 3);
  }
  loopLevel(name) { return this.loops[name] ? this.loops[name].target : 0; }

  // ---------- scheduled rhythmic things ----------
  update(dt, state) {
    if (!this.ready) return;
    // heartbeat when afraid
    this._hb = (this._hb || 0) - dt;
    if (state.fear > 0.45 && this._hb <= 0) {
      const rate = 0.95 - state.fear * 0.45;
      this._hb = rate;
      this.thump(0.25 + state.fear * 0.35);
      setTimeout(() => this.thump(0.18 + state.fear * 0.2), 160);
    }
    // monitor beep (coma motif) when requested
    if (state.monitor) {
      this._mon = (this._mon || 0) - dt;
      if (this._mon <= 0) { this._mon = state.monitorRate || 1.0; this.beep(state.monitor); }
    }
  }

  // ---------- one-shots ----------
  _env(g, t, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }
  _oneNoise({ pos, buf, type = 'bandpass', freq = 1000, freqEnd, Q = 1, a = 0.005, d = 0.3, vol = 0.5, bus, ref, delay = 0 }) {
    if (!this.ready) return;
    const t = this.t + delay;
    const s = this._noise(buf || this.white, false);
    const f = this._filter(type, freq, Q);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + a + d);
    const g = this._gain(0);
    this._env(g, t, a, vol, d);
    s.connect(f); f.connect(g); g.connect(this._out(pos, bus, ref));
    s.start(t, Math.random() * 2); s.stop(t + a + d + 0.05);
  }
  _oneTone({ pos, type = 'sine', freq = 440, freqEnd, a = 0.005, d = 0.3, vol = 0.3, bus, delay = 0, ref, detune = 0 }) {
    if (!this.ready) return;
    const t = this.t + delay;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + a + d);
    const g = this._gain(0);
    this._env(g, t, a, vol, d);
    o.connect(g); g.connect(this._out(pos, bus, ref));
    o.start(t); o.stop(t + a + d + 0.05);
  }

  thump(v = 0.3) { this._oneTone({ freq: 60, freqEnd: 38, d: 0.18, vol: v, bus: this.music }); }
  beep(v = 0.15) { this._oneTone({ freq: 1000, d: 0.12, vol: v, bus: this.music }); }
  click(v = 0.12) { this._oneTone({ type: 'square', freq: 2400, d: 0.015, vol: v }); }
  uiClick() { this._oneTone({ type: 'triangle', freq: 900, freqEnd: 600, d: 0.05, vol: 0.08 }); }
  pickup() { this._oneTone({ type: 'triangle', freq: 520, freqEnd: 780, d: 0.12, vol: 0.12 }); this._oneNoise({ freq: 3000, d: 0.08, vol: 0.1 }); }
  reelClick(speed = 1) { this._oneTone({ type: 'square', freq: 2600 + Math.random() * 400, d: 0.008, vol: 0.05 * speed }); }
  whoosh() { this._oneNoise({ freq: 600, freqEnd: 2500, Q: 2, a: 0.08, d: 0.25, vol: 0.25 }); }
  lineZip(v = 0.15) { this._oneNoise({ freq: 3500, freqEnd: 5000, Q: 6, a: 0.01, d: 0.2, vol: v }); }
  snap() {
    this._oneNoise({ freq: 5000, Q: 0.7, d: 0.06, vol: 0.6 });
    this._oneTone({ freq: 1400, freqEnd: 90, d: 0.25, vol: 0.25, type: 'triangle' });
  }
  plop(pos, v = 0.4) {
    this._oneTone({ pos, freq: 700, freqEnd: 140, d: 0.12, vol: v });
    this._oneNoise({ pos, freq: 1200, Q: 1.5, d: 0.15, vol: v * 0.5 });
  }
  splash(pos, size = 1) {
    this._oneNoise({ pos, freq: 1800, freqEnd: 350, Q: 0.8, a: 0.01, d: 0.25 + size * 0.5, vol: 0.25 + size * 0.35, ref: 3 + size * 4 });
    this._oneNoise({ pos, buf: this.brown, type: 'lowpass', freq: 400, d: 0.3 + size * 0.4, vol: 0.4 * size, ref: 3 + size * 4 });
  }
  bubble(pos) { this._oneTone({ pos, freq: 300 + Math.random() * 300, freqEnd: 1200 + Math.random() * 600, d: 0.08, vol: 0.12 }); }
  footstep(surface = 'grass', vol = 0.25, pos) {
    const v = vol;
    switch (surface) {
      case 'wood':
        this._oneTone({ pos, freq: 110, freqEnd: 70, d: 0.08, vol: v * 0.9 });
        this._oneNoise({ pos, freq: 600, Q: 2, d: 0.06, vol: v * 0.5 }); break;
      case 'snow': this._oneNoise({ pos, freq: 2800, Q: 0.8, a: 0.03, d: 0.18, vol: v * 0.7 }); break;
      case 'ice':
        this._oneNoise({ pos, freq: 4000, type: 'highpass', d: 0.03, vol: v * 0.5 });
        this._oneTone({ pos, freq: 160, freqEnd: 120, d: 0.06, vol: v * 0.5 }); break;
      case 'water': this._oneNoise({ pos, freq: 1300, freqEnd: 500, Q: 1, a: 0.02, d: 0.25, vol: v * 1.2 }); break;
      case 'metal':
        this._oneTone({ pos, freq: 420, freqEnd: 400, d: 0.25, vol: v * 0.3, type: 'triangle' });
        this._oneNoise({ pos, freq: 900, Q: 3, d: 0.08, vol: v * 0.6 }); break;
      case 'carpet': this._oneNoise({ pos, freq: 300, type: 'lowpass', d: 0.07, vol: v * 0.6 }); break;
      case 'sand': this._oneNoise({ pos, freq: 1500, Q: 0.6, a: 0.02, d: 0.12, vol: v * 0.5 }); break;
      case 'seabed': this._oneNoise({ pos, buf: this.brown, type: 'lowpass', freq: 200, d: 0.25, vol: v * 0.8 }); break;
      default: // grass/dirt
        this._oneNoise({ pos, freq: 1100, Q: 0.7, a: 0.01, d: 0.1, vol: v * 0.6 });
        this._oneNoise({ pos, buf: this.brown, type: 'lowpass', freq: 250, d: 0.08, vol: v * 0.5 });
    }
  }
  branchSnap(pos) {
    this._oneNoise({ pos, freq: 2500, Q: 1, d: 0.04, vol: 0.7, ref: 8 });
    this._oneNoise({ pos, freq: 1200, Q: 2, d: 0.08, vol: 0.4, delay: 0.05, ref: 8 });
  }
  monsterStep(pos, v = 0.6) {
    this._oneTone({ pos, freq: 70, freqEnd: 40, d: 0.25, vol: v, ref: 6 });
    this._oneNoise({ pos, buf: this.brown, type: 'lowpass', freq: 300, d: 0.2, vol: v * 0.6, ref: 6 });
  }
  wadeStep(pos, v = 0.5) { this._oneNoise({ pos, freq: 900, freqEnd: 300, Q: 0.8, a: 0.05, d: 0.45, vol: v, ref: 6 }); }
  growl(pos, pitch = 1, dur = 1.6, v = 0.5) {
    if (!this.ready) return;
    const t = this.t;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 62 * pitch;
    o.frequency.linearRampToValueAtTime(48 * pitch, t + dur);
    const o2 = this.ctx.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 93 * pitch;
    const lp = this._filter('lowpass', 500 * pitch, 3);
    const trem = this._gain(0.6); const lfo = this._lfo(11, 0.4, trem.gain);
    const g = this._gain(0); this._env(g, t, 0.25, v, dur);
    const n = this._noise(this.brown, false); const nf = this._filter('bandpass', 300 * pitch, 1);
    o.connect(lp); o2.connect(lp); n.connect(nf); nf.connect(lp);
    lp.connect(trem); trem.connect(g); g.connect(this._out(pos, this.sfx, 8));
    o.start(t); o2.start(t); n.start(t); const e = t + dur + 0.4; o.stop(e); o2.stop(e); n.stop(e); lfo.stop(e);
  }
  shriek(pos, v = 0.5) {
    this._oneTone({ pos, type: 'sawtooth', freq: 900, freqEnd: 2600, a: 0.1, d: 0.6, vol: v * 0.4, ref: 10 });
    this._oneTone({ pos, type: 'sawtooth', freq: 1250, freqEnd: 1900, a: 0.1, d: 0.7, vol: v * 0.3, detune: 30, ref: 10 });
    this._oneNoise({ pos, freq: 3000, Q: 2, a: 0.05, d: 0.6, vol: v * 0.5, ref: 10 });
  }
  clicks(pos, n = 6) { // blind harbor creatures echolocate
    for (let i = 0; i < n; i++) this._oneNoise({ pos, freq: 2200 + Math.random() * 800, Q: 8, d: 0.03, vol: 0.5, delay: i * (0.05 + Math.random() * 0.08), ref: 6 });
  }
  creak(pos, v = 0.35) {
    if (!this.ready) return;
    const t = this.t, d = 0.6 + Math.random() * 0.8;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 160 + Math.random() * 80;
    o.frequency.linearRampToValueAtTime(120 + Math.random() * 150, t + d);
    const f = this._filter('bandpass', 700, 8); const g = this._gain(0); this._env(g, t, 0.1, v, d);
    const am = this._gain(0.5); const l = this._lfo(23, 0.5, am.gain);
    o.connect(f); f.connect(am); am.connect(g); g.connect(this._out(pos, this.sfx, 5));
    o.start(t); o.stop(t + d + 0.2); l.stop(t + d + 0.2);
  }
  bump(pos, v = 0.9) {
    this._oneTone({ pos, freq: 48, freqEnd: 28, d: 0.9, vol: v, ref: 10 });
    this._oneNoise({ pos, buf: this.brown, type: 'lowpass', freq: 180, d: 0.7, vol: v, ref: 10 });
    this.creak(pos, 0.3);
  }
  knock(pos, n = 3, v = 0.5) {
    for (let i = 0; i < n; i++) {
      this._oneTone({ pos, freq: 140, freqEnd: 90, d: 0.1, vol: v, delay: i * 0.32 });
      this._oneNoise({ pos, freq: 500, Q: 2, d: 0.05, vol: v * 0.6, delay: i * 0.32 });
    }
  }
  iceCrack(pos, v = 0.6) {
    this._oneNoise({ pos, freq: 3500, type: 'highpass', d: 0.05, vol: v, ref: 10 });
    this._oneTone({ pos, freq: 2800, freqEnd: 180, d: 1.2, vol: v * 0.35, ref: 14 });
    this._oneTone({ pos, freq: 1900, freqEnd: 120, d: 1.5, vol: v * 0.2, delay: 0.06, ref: 14 });
  }
  thunder(delay = 0, v = 0.9) {
    this._oneNoise({ buf: this.brown, type: 'lowpass', freq: 220, a: 0.05, d: 3.5, vol: v, delay, bus: this.amb });
    this._oneNoise({ type: 'lowpass', freq: 1200, a: 0.01, d: 0.6, vol: v * 0.3, delay, bus: this.amb });
  }
  drill(dur = 3) { // ice auger
    if (!this.ready) return;
    const t = this.t;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 90;
    const n = this._noise(this.white, true); const nf = this._filter('bandpass', 1600, 1.2);
    const g = this._gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.25, t + 0.2);
    g.gain.setValueAtTime(0.25, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const am = this._gain(0.6); const l = this._lfo(15, 0.3, am.gain);
    o.connect(am); n.connect(nf); nf.connect(am); am.connect(g); g.connect(this.sfx);
    o.start(t); n.start(t); o.stop(t + dur + 0.1); n.stop(t + dur + 0.1); l.stop(t + dur + 0.1);
  }
  door(open = true) {
    this.creak(null, 0.3);
    if (!open) this._oneTone({ freq: 90, freqEnd: 50, d: 0.2, vol: 0.4, delay: 0.5 });
  }
  sting(v = 0.5) { // dissonant swell for reveals
    if (!this.ready) return;
    const t = this.t;
    const lp = this._filter('lowpass', 300, 1); lp.frequency.exponentialRampToValueAtTime(4000, t + 1.4);
    const g = this._gain(0); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    [220, 233, 311, 466, 494].forEach((f) => {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = Math.random() * 30;
      o.connect(lp); o.start(t); o.stop(t + 3.3);
    });
    lp.connect(g); g.connect(this.music);
  }
  hit() { // impact for jumpscares / damage
    this._oneNoise({ buf: this.brown, type: 'lowpass', freq: 600, d: 0.5, vol: 0.9 });
    this._oneTone({ type: 'sawtooth', freq: 180, freqEnd: 40, d: 0.5, vol: 0.4 });
  }
  scream(v = 0.6) { // reserved for rare jumpscares
    this._oneTone({ type: 'sawtooth', freq: 700, freqEnd: 1500, a: 0.02, d: 0.9, vol: v * 0.35, detune: 40 });
    this._oneTone({ type: 'square', freq: 1040, freqEnd: 600, a: 0.02, d: 0.9, vol: v * 0.2 });
    this._oneNoise({ freq: 2500, Q: 1, a: 0.01, d: 1.0, vol: v * 0.6 });
  }
  engine(level) { // boat engine loop
    if (!this.ready) return;
    if (!this._eng) {
      const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 40;
      const n = this._noise(this.brown); const f = this._filter('lowpass', 300, 2);
      const g = this._gain(0); const am = this._gain(0.7); this._lfo(24, 0.3, am.gain);
      o.connect(f); n.connect(f); f.connect(am); am.connect(g); g.connect(this.sfx);
      o.start(); n.start();
      this._eng = { o, f, g };
    }
    const t = this.t;
    this._eng.g.gain.setTargetAtTime(level > 0 ? 0.12 + level * 0.18 : 0, t, 0.2);
    this._eng.o.frequency.setTargetAtTime(38 + level * 30, t, 0.3);
    this._eng.f.frequency.setTargetAtTime(250 + level * 500, t, 0.3);
  }
  phoneRing(times = 3) {
    for (let r = 0; r < times; r++) for (let i = 0; i < 20; i++) {
      this._oneTone({ freq: i % 2 ? 440 : 480, d: 0.05, vol: 0.12, delay: r * 3 + i * 0.05, type: 'triangle' });
    }
  }
  radioStatic(dur = 2, v = 0.2) {
    this._oneNoise({ freq: 2200, Q: 0.6, a: 0.05, d: dur, vol: v });
    for (let i = 0; i < dur * 8; i++) this._oneNoise({ freq: 4000, type: 'highpass', d: 0.01, vol: 0.3 * Math.random(), delay: Math.random() * dur });
  }

  // The alarm clock: a mechanical double-bell hit by a fast hammer. `warp` (0..1) detunes it into something wrong.
  alarm(duration = 3, { warp = 0, vol = 0.35, pos = null } = {}) {
    if (!this.ready) return;
    const strikes = Math.floor(duration * 17);
    const out = this._out(pos, this.sfx, 3);
    for (let i = 0; i < strikes; i++) {
      const t = this.t + i / 17;
      const bell = i % 2 === 0 ? 1 : 1.19;
      const w = 1 - warp * (0.35 * (i / strikes));
      [2093, 2717, 3520, 5274].forEach((f, k) => {
        const o = this.ctx.createOscillator(); o.frequency.value = f * bell * w;
        const g = this._gain(0);
        g.gain.setValueAtTime(vol / (k + 1.5), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09 + warp * 0.2);
        o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.35);
      });
    }
  }

  // The lullaby motif (music box). variant: 'clean' | 'broken' | 'low' | 'reverse'
  motif(variant = 'clean', vol = 0.18) {
    if (!this.ready) return;
    let notes = LULLABY.slice();
    if (variant === 'reverse') notes.reverse();
    const step = variant === 'low' ? 0.62 : 0.42;
    notes.forEach((m, i) => {
      if (!m) return;
      let midi = m - (variant === 'low' ? 24 : 0);
      let detune = 0;
      if (variant === 'broken') { detune = (Math.random() - 0.5) * 120 + i * -6; if (Math.random() < 0.15) return; }
      const t = i * step * (variant === 'broken' ? 1 + Math.random() * 0.25 : 1);
      const f = mtof(midi);
      this._oneTone({ freq: f, d: 1.4, vol, delay: t, bus: this.music, detune });
      this._oneTone({ freq: f * 2.01, d: 0.6, vol: vol * 0.35, delay: t, bus: this.music, detune });
      this._oneTone({ freq: f * 3.98, d: 0.25, vol: vol * 0.12, delay: t, bus: this.music, type: 'triangle' });
    });
  }

  // Formant-filtered noise whisper; optionally also speech synthesis.
  whisper(pos, text = null, v = 0.35) {
    if (!this.ready) return;
    const syll = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < syll; i++) {
      const fr = 1200 + Math.random() * 1800;
      this._oneNoise({ pos, freq: fr, Q: 6, a: 0.04, d: 0.12 + Math.random() * 0.1, vol: v, delay: i * 0.17, ref: 2 });
      this._oneNoise({ pos, freq: fr * 1.8, Q: 8, a: 0.03, d: 0.1, vol: v * 0.5, delay: i * 0.17 + 0.02, ref: 2 });
    }
    if (text) this.say(text, { pitch: 0.4, rate: 0.7, volume: 0.35 });
  }

  say(text, { pitch = 1, rate = 0.9, volume = 0.8 } = {}) {
    if (!CONFIG.voiceSynthesis || !window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.pitch = pitch; u.rate = rate; u.volume = volume * CONFIG.masterVolume;
      const en = this.voices.filter((v) => /^en/i.test(v.lang));
      if (en.length) u.voice = en[0];
      window.speechSynthesis.speak(u);
    } catch (e) { /* speech is optional */ }
  }
  stopSpeech() { if (window.speechSynthesis) window.speechSynthesis.cancel(); }

  silenceAll(fade = 0.05) {
    if (!this.ready) return;
    for (const L of Object.values(this.loops)) L.out.gain.setTargetAtTime(0, this.t, fade);
    if (this._eng) this._eng.g.gain.setTargetAtTime(0, this.t, fade);
  }
}

export const audio = new AudioSys();
