// Procedural sound: everything is synthesized with WebAudio, no audio
// assets. Every call is guarded — headless browsers may have no audio
// device, and the game must keep running either way.

const AudioSys = {
  ctx: null,
  enabled: true,
  _engineOsc: null,
  _engineGain: null,
  _sirenOsc: null,
  _sirenGain: null,
  _sirenTimer: null,

  ensure() {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
    }
    return this.ctx;
  },

  resume() {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  },

  _noiseBuffer(seconds) {
    const ctx = this.ensure();
    if (!ctx) return null;
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  },

  _blip(freq, dur, type, vol, slideTo) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      gain.gain.setValueAtTime(vol || 0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + dur);
    } catch (e) { /* audio is cosmetic */ }
  },

  _noise(dur, vol, filterFreq) {
    const ctx = this.ensure();
    if (!ctx || !this.enabled) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = this._noiseBuffer(dur);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
    } catch (e) { /* audio is cosmetic */ }
  },

  shot() { this._noise(0.12, 0.35, 3000); this._blip(160, 0.08, 'square', 0.12, 60); },
  crash(strength) { this._noise(0.3, 0.15 + 0.25 * Math.min(1, strength), 900); },
  pickup() { this._blip(660, 0.09, 'sine', 0.16); setTimeout(() => this._blip(880, 0.12, 'sine', 0.16), 90); },
  jingle() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this._blip(n, 0.18, 'triangle', 0.18), i * 110));
  },
  denied() { this._blip(220, 0.15, 'sawtooth', 0.12, 180); },
  enterCar() { this._blip(300, 0.08, 'triangle', 0.12, 420); },

  engineStart() {
    const ctx = this.ensure();
    if (!ctx || this._engineOsc) return;
    try {
      this._engineOsc = ctx.createOscillator();
      this._engineGain = ctx.createGain();
      this._engineOsc.type = 'sawtooth';
      this._engineOsc.frequency.value = 55;
      this._engineGain.gain.value = 0.0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this._engineOsc.connect(filter).connect(this._engineGain).connect(ctx.destination);
      this._engineOsc.start();
    } catch (e) { /* audio is cosmetic */ }
  },

  engineSet(speedNorm, running) {
    if (!this._engineOsc || !this._engineGain || !this.ctx) return;
    try {
      const t = this.ctx.currentTime;
      this._engineOsc.frequency.setTargetAtTime(52 + 130 * speedNorm, t, 0.08);
      this._engineGain.gain.setTargetAtTime(running ? 0.045 + 0.03 * speedNorm : 0.0, t, 0.1);
    } catch (e) { /* audio is cosmetic */ }
  },

  sirenStart() {
    const ctx = this.ensure();
    if (!ctx || this._sirenOsc) return;
    try {
      this._sirenOsc = ctx.createOscillator();
      this._sirenGain = ctx.createGain();
      this._sirenOsc.type = 'triangle';
      this._sirenOsc.frequency.value = 700;
      this._sirenGain.gain.value = 0.0;
      this._sirenOsc.connect(this._sirenGain).connect(ctx.destination);
      this._sirenOsc.start();
      let high = true;
      this._sirenTimer = setInterval(() => {
        if (!this._sirenOsc) return;
        high = !high;
        try { this._sirenOsc.frequency.setTargetAtTime(high ? 950 : 650, ctx.currentTime, 0.05); } catch (e) {}
      }, 380);
      this._sirenGain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.2);
    } catch (e) { /* audio is cosmetic */ }
  },

  sirenStop() {
    if (this._sirenTimer) { clearInterval(this._sirenTimer); this._sirenTimer = null; }
    if (this._sirenOsc && this.ctx) {
      try {
        this._sirenGain.gain.setTargetAtTime(0.0, this.ctx.currentTime, 0.1);
        const osc = this._sirenOsc;
        setTimeout(() => { try { osc.stop(); } catch (e) {} }, 400);
      } catch (e) {}
    }
    this._sirenOsc = null;
    this._sirenGain = null;
  },
};

export default AudioSys;
