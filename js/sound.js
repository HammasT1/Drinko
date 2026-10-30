/**
 * Sound effects (OFF by default).
 * ---------------------------------------------------------------------------
 * Plays the files from config.SOUNDS. If a file is missing, unreadable, or the
 * page runs from file:// (where fetch is blocked), a short synthesized
 * "pssht" / fizz is generated with the Web Audio API instead, so the toggle
 * always does something and never throws.
 */
import { SOUNDS } from './config.js';

class SoundFX {
  constructor() {
    this.enabled = false;
    this.ctx = null;
    this.master = null;
    this.buffers = {};
    this.loading = null;
    this.noise = null;
  }

  /** Must be called from a user gesture (browser autoplay rules). */
  async enable() {
    this.enabled = true;
    if (!this.ensureContext()) return;
    await this.load();
  }

  disable() {
    this.enabled = false;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = SOUNDS.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  load() {
    this.loading ??= Promise.all(
      [['open', SOUNDS.openSrc], ['fizz', SOUNDS.fizzSrc]].map(async ([name, src]) => {
        if (!src) return;
        try {
          const response = await fetch(src);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.arrayBuffer();
          this.buffers[name] = await this.ctx.decodeAudioData(data);
        } catch (err) {
          console.info(`[Drinko] Sound "${src}" unavailable (${err.message}). Using synthesized ${name} sound.`);
        }
      }),
    );
    return this.loading;
  }

  play(name) {
    if (!this.enabled || !this.ctx) return;
    const buffer = this.buffers[name];
    if (buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(this.master);
      source.start();
    } else if (name === 'open') {
      this.synthOpen();
    } else if (name === 'fizz') {
      this.synthFizz();
    }
  }

  /* ---------- Synth fallbacks ---------- */

  noiseBuffer() {
    if (this.noise) return this.noise;
    const length = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return this.noise;
  }

  /** Filtered noise with an attack/decay envelope. */
  noiseBurst({ start, duration, peak, filterType, frequency, q = 1 }) {
    const source = this.ctx.createBufferSource();
    source.buffer = this.noiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start, Math.random());
    source.stop(start + duration + 0.05);
  }

  synthOpen() {
    const t = this.ctx.currentTime;
    // Metallic "click" of the tab
    this.noiseBurst({ start: t, duration: 0.04, peak: 0.9, filterType: 'highpass', frequency: 2500 });
    // Low "pop" as the seal breaks
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(220, t + 0.02);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    gain.gain.setValueAtTime(0.5, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    osc.connect(gain).connect(this.master);
    osc.start(t + 0.02);
    osc.stop(t + 0.16);
    // Escaping gas "pssht"
    this.noiseBurst({ start: t + 0.03, duration: 0.45, peak: 0.5, filterType: 'bandpass', frequency: 5200, q: 0.7 });
  }

  synthFizz() {
    const t = this.ctx.currentTime;
    this.noiseBurst({ start: t, duration: 1.3, peak: 0.12, filterType: 'highpass', frequency: 5000 });
    // Dozens of tiny bubble crackles
    for (let i = 0; i < 40; i++) {
      this.noiseBurst({
        start: t + Math.random() * 1.2,
        duration: 0.015 + Math.random() * 0.02,
        peak: 0.05 + Math.random() * 0.2,
        filterType: 'bandpass',
        frequency: 3000 + Math.random() * 5000,
        q: 4,
      });
    }
  }
}

export const sound = new SoundFX();
