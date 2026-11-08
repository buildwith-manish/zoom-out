#!/usr/bin/env node
'use strict';

/**
 * Offline port of the HTML Web Audio sound design.
 * Writes individual SFX plus a full-length soundtrack that Remotion plays.
 *
 *   node scripts/synth-audio.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'sounds');
const settings = require(path.join(ROOT, 'settings.json'));
const questions = require(path.join(ROOT, 'questions.json'));

const SR = 44100;
const MASTER = 0.9;
const ZS = settings.zoomStart;
const ZD = settings.zoomDuration;
const HINT_AT = settings.hintAt;

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

const plan = require(path.join(ROOT, 'src', 'plan.cjs'));

function buildScenes() {
  return plan.buildScenes(settings, questions);
}

function sceneAt(t, scenes) {
  for (let k = scenes.length - 1; k >= 0; k--) {
    if (t >= scenes[k].start) return scenes[k];
  }
  return scenes[0];
}

function buildEvents(scenes) {
  const EV = [];
  scenes.forEach((s) => {
    const tcue = (lv, closing) => {
      const k = ((settings.retention || {}).transitions || {})[lv] || 'iris';
      return k === 'wipe' ? 'swishWipe' : k === 'blinds' ? 'swishGlitch' : closing ? 'swishIn' : 'swish';
    };
    if (s.type === 'q') EV.push([s.start + 0.02, tcue(s.level, false)]);
    else if (s.type !== 'r') EV.push([s.start + 0.02, 'swish']);
    if (s.type === 'r') EV.push([s.start + s.d - 0.6, tcue(s.level, true)]);
    else if (s.type === 'intro' || s.type === 'outro' || s.type === 'level' || s.type === 'bonus') EV.push([s.start + s.d - 0.6, 'swishIn']);
    if (s.type === 'intro') {
      EV.push([s.start + (settings.introHookDelay ?? 0.12), 'words'], [s.start + (settings.introZoomDelay ?? 0.9), 'shutter'], [s.start + (settings.introZoomDelay ?? 0.9), 'zoomIntro']);
    }
    if (s.type === 'q') {
      const zd = s.zd;
      EV.push([s.start + 0.12, 'words'], [s.start + 0.35, 'shutter'], [s.start + ZS, 'zoomOut', zd]);
      for (let k = 1; k < zd; k++) EV.push([s.start + ZS + k, k >= zd - 3 ? 'tickHi' : 'tick']);
      EV.push([s.start + ZS + zd * HINT_AT, 'sparkle'], [s.start + ZS + zd, 'focus']);
    }
    if (s.type === 'r') EV.push([s.start + 0.05, 'expand'], [s.start + 0.1, 'hit'], [s.start + 0.45, 'sparkle']);
    if (s.type === 'bonus') {
      const BS = settings.bonus || {};
      const bclock = BS.clock != null ? BS.clock : 8;
      const cs = s.clockStart != null ? s.clockStart : 1.6;
      const revealAt = s.start + cs + bclock;
      EV.push([s.start + 0.12, 'words'], [s.start + 0.55, 'hit']);
      EV.push([s.start + cs, 'focus']);
      for (let k = 1; k < bclock; k++) EV.push([s.start + cs + k, k >= bclock - 3 ? 'tickHi' : 'tick']);
      EV.push([revealAt + 0.05, 'expand'], [revealAt + 0.1, 'hit'], [revealAt + 0.45, 'sparkle']);
    }
    if (s.type === 'level') EV.push([s.start + 0.12, 'words'], [s.start + 0.4, 'hit'], [s.start + 0.8, 'sparkle']);
    if (s.type === 'intro') EV.push([s.start + 0.05, 'jingle']);
    if (s.type === 'sting') EV.push([s.start + 0.1, 'jingleEnd']);
  });
  return EV;
}

/* ---------- wavetable / oscillators (PolyBLEP saw & square ≈ Web Audio) ---------- */

function polyblep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) {
    const x = t / dt;
    return x + x - x * x - 1;
  }
  if (t > 1 - dt) {
    const x = (t - 1) / dt;
    return x * x + x + x + 1;
  }
  return 0;
}

function oscSample(type, phase, freq) {
  const p = phase - Math.floor(phase);
  const dt = freq / SR;
  if (type === 'sine') return Math.sin(p * Math.PI * 2);
  if (type === 'sawtooth') return 2 * p - 1 - polyblep(p, dt);
  if (type === 'square') {
    let s = p < 0.5 ? 1 : -1;
    s += polyblep(p, dt);
    let p2 = p + 0.5;
    p2 -= Math.floor(p2);
    s -= polyblep(p2, dt);
    return s;
  }
  if (type === 'triangle') {
    const sp = p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
    return sp;
  }
  return Math.sin(p * Math.PI * 2);
}

/* ---------- biquad (Web Audio lowpass / bandpass) ---------- */

class Biquad {
  constructor() {
    this.b0 = 1;
    this.b1 = 0;
    this.b2 = 0;
    this.a1 = 0;
    this.a2 = 0;
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
  set(type, freq, Q) {
    const f0 = clamp(freq, 10, SR * 0.45);
    const w0 = (2 * Math.PI * f0) / SR;
    const cos = Math.cos(w0);
    const sin = Math.sin(w0);
    const q = Math.max(0.0001, Q);
    const alpha = sin / (2 * q);
    let b0;
    let b1;
    let b2;
    let a0;
    let a1;
    let a2;
    if (type === 'lowpass') {
      b0 = (1 - cos) / 2;
      b1 = 1 - cos;
      b2 = (1 - cos) / 2;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
      a0 = 1 + alpha;
      a1 = -2 * cos;
      a2 = 1 - alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }
  process(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

/* ---------- noise (deterministic 2s loop, like the HTML buffer) ---------- */

function makeNoise(seconds) {
  const n = Math.floor(seconds * SR);
  const buf = new Float64Array(n);
  let s = 20261030;
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    buf[i] = (s / 4294967295) * 2 - 1;
  }
  return buf;
}

const NOISE = makeNoise(2);

function noiseAt(i) {
  return NOISE[i % NOISE.length];
}

/* ---------- mix buffer ---------- */

class Mix {
  constructor(seconds) {
    this.n = Math.ceil(seconds * SR) + SR;
    this.a = new Float64Array(this.n);
  }
  addTone(f, t0, dur, vol, type, f2) {
    const start = Math.floor(t0 * SR);
    const end = Math.min(this.n, Math.ceil((t0 + dur + 0.05) * SR));
    let phase = 0;
    const attack = 0.008;
    for (let i = start; i < end; i++) {
      if (i < 0) continue;
      const t = (i - start) / SR;
      let freq = f;
      if (f2 && f > 0 && f2 > 0) {
        const u = clamp(t / dur, 0, 1);
        freq = f * Math.pow(f2 / f, u);
      }
      let g = 0;
      if (t < attack) g = vol * (t / attack);
      else if (t <= dur) {
        const u = (t - attack) / Math.max(1e-6, dur - attack);
        g = vol * Math.pow(0.0008 / Math.max(vol, 1e-6), u);
      } else {
        g = 0.0008;
      }
      phase += freq / SR;
      this.a[i] += oscSample(type || 'sine', phase, freq) * g;
    }
  }
  addNoise(t0, dur, vol, f1, f2, q) {
    const start = Math.floor(t0 * SR);
    const end = Math.min(this.n, Math.ceil((t0 + dur + 0.05) * SR));
    const bq = new Biquad();
    bq.set('bandpass', f1, q || 1.2);
    let ni = Math.floor(t0 * SR);
    for (let i = start; i < end; i++) {
      if (i < 0) continue;
      const t = (i - start) / SR;
      let freq = f1;
      if (f1 > 0 && f2 > 0) {
        const u = clamp(t / dur, 0, 1);
        freq = f1 * Math.pow(f2 / f1, u);
      }
      bq.set('bandpass', freq, q || 1.2);
      const y = bq.process(noiseAt(ni++));
      let g = 0;
      if (t < dur * 0.55) g = vol * (t / (dur * 0.55));
      else if (t < dur) g = vol * (1 - (t - dur * 0.55) / (dur * 0.45));
      this.a[i] += y * g;
    }
  }
}

function expThenLin(t, dur, g0, gPeak, cut) {
  const tPeak = dur - cut;
  if (t <= tPeak) {
    const u = clamp(t / tPeak, 0, 1);
    return g0 * Math.pow(gPeak / g0, u);
  }
  if (t >= dur) return 0;
  const u = (t - tPeak) / cut;
  return gPeak * (1 - u);
}

function addRiser(mix, n, D) {
  const start = Math.floor(n * SR);
  const end = Math.min(mix.n, Math.ceil((n + D + 0.05) * SR));
  const bp = new Biquad();
  const lp = new Biquad();
  let phase = 0;
  let ni = start;
  for (let i = start; i < end; i++) {
    const t = (i - start) / SR;
    const u = clamp(t / D, 0, 1);
    const bpF = 250 * Math.pow(7000 / 250, u);
    const lpF = 300 * Math.pow(4000 / 300, u);
    const sawF = 90 * Math.pow(900 / 90, u);
    bp.set('bandpass', bpF, 2.4);
    lp.set('lowpass', lpF, 0.8);
    const ng = expThenLin(t, D, 0.0001, 0.2, 0.08);
    const og = expThenLin(t, D, 0.0001, 0.075, 0.08);
    mix.a[i] += bp.process(noiseAt(ni++)) * ng;
    phase += sawF / SR;
    mix.a[i] += lp.process(oscSample('sawtooth', phase, sawF)) * og;
  }
  let tt = D - 6;
  let iv = 1;
  while (tt < D - 0.25) {
    mix.addTone(62, n + tt, 0.22, 0.3, 'sine', 38);
    tt += iv;
    iv = Math.max(0.2, iv * 0.85);
  }
}

const SFX = {
  swish(mix, n) {
    mix.addNoise(n, 0.6, 0.4, 300, 5200, 0.9);
    mix.addTone(260, n, 0.5, 0.16, 'sine', 900);
    mix.addTone(90, n, 0.3, 0.22, 'sine', 50);
  },
  swishWipe(mix, n) {
    mix.addNoise(n, 0.55, 0.34, 300, 3200, 0.9);
    mix.addTone(220, n, 0.45, 0.1, 'sine', 700);
  },
  swishGlitch(mix, n) {
    [0, 0.05, 0.11, 0.17].forEach((d, i) => mix.addNoise(n + d, 0.04, 0.34, 900 + i * 700, 5200 - i * 600, 2));
    mix.addTone(110, n, 0.3, 0.22, 'sawtooth', 38);
    mix.addTone(1900, n + 0.02, 0.05, 0.09, 'square', 400);
  },
  swishIn(mix, n) {
    mix.addNoise(n, 0.5, 0.3, 4200, 300, 0.9);
    mix.addTone(700, n, 0.4, 0.1, 'sine', 200);
  },
  words(mix, n) {
    for (let k = 0; k < 4; k++) mix.addTone(520 + k * 95, n + k * 0.09, 0.08, 0.07, 'triangle');
  },
  shutter(mix, n) {
    mix.addNoise(n, 0.05, 0.4, 4200, 1500, 2);
    mix.addTone(1800, n, 0.025, 0.12, 'square');
    mix.addNoise(n + 0.06, 0.07, 0.25, 2500, 900, 2);
    mix.addTone(110, n + 0.06, 0.12, 0.2, 'sine', 60);
  },
  zoomOut(mix, n, zd) {
    addRiser(mix, n, zd || ZD);
  },
  zoomIntro(mix, n) {
    mix.addNoise(n, 4.2, 0.2, 3200, 260, 1.1);
    mix.addTone(240, n, 4.2, 0.03, 'sine', 640);
  },
  tick(mix, n) {
    mix.addTone(1250, n, 0.05, 0.08, 'triangle');
  },
  tickHi(mix, n) {
    mix.addTone(2100, n, 0.06, 0.16, 'square');
    mix.addTone(1050, n, 0.08, 0.1, 'triangle');
  },
  lock(mix, n) {
    mix.addTone(170, n, 0.35, 0.5, 'sine', 55);
    mix.addNoise(n, 0.08, 0.25, 2000, 700, 2);
  },
  hit(mix, n) {
    mix.addTone(120, n, 0.5, 0.6, 'sine', 45);
    mix.addTone(880, n + 0.04, 0.5, 0.16, 'sine');
    mix.addTone(1320, n + 0.1, 0.55, 0.14, 'sine');
    mix.addNoise(n, 0.35, 0.18, 1200, 6000, 0.8);
  },
  focus(mix, n) {
    mix.addTone(1568, n, 0.5, 0.14, 'sine');
    mix.addTone(2349, n + 0.06, 0.6, 0.1, 'sine');
    mix.addTone(130, n, 0.25, 0.3, 'sine', 70);
  },
  expand(mix, n) {
    mix.addNoise(n, 0.6, 0.22, 300, 2400, 1);
    mix.addTone(200, n, 0.6, 0.1, 'sine', 520);
  },
  sparkle(mix, n) {
    [1320, 1760, 2200, 2640].forEach((f, k) => mix.addTone(f, n + k * 0.07, 0.4, 0.07, 'sine'));
  },
  // Signature jingle (start): rising G-C-E-G, then a bright held C6. Same notes every video.
  jingle(mix, n) {
    mix.addNoise(n, 0.5, 0.1, 400, 6000, 0.9);
    [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36]].forEach((f) => {
      mix.addTone(f[0], n + f[1], 0.5, 0.16, 'sine');
      mix.addTone(f[0] * 2, n + f[1], 0.25, 0.05, 'triangle');
    });
    mix.addTone(1047, n + 0.5, 1.5, 0.17, 'sine');
    mix.addTone(2093, n + 0.52, 1.0, 0.05, 'sine');
    mix.addTone(262, n + 0.5, 1.5, 0.1, 'sine');
  },
  // Signature jingle (end): same melody falling back home, finishing on a full C major chord.
  jingleEnd(mix, n) {
    [[1047, 0], [784, 0.14], [659, 0.28], [523, 0.42]].forEach((f) => {
      mix.addTone(f[0], n + f[1], 0.5, 0.15, 'sine');
      mix.addTone(f[0] * 2, n + f[1], 0.25, 0.05, 'triangle');
    });
    [523, 659, 784, 1047].forEach((f) => mix.addTone(f, n + 0.6, 1.9, 0.12, 'sine'));
    mix.addTone(262, n + 0.6, 1.9, 0.1, 'sine');
    mix.addTone(2093, n + 0.62, 1.2, 0.04, 'sine');
    mix.addNoise(n + 0.6, 0.5, 0.08, 800, 5000, 1);
  },
  chime(mix, n) {
    [
      [660, 0],
      [990, 0.08],
      [1320, 0.16],
      [1760, 0.26],
    ].forEach((f) => mix.addTone(f[0], n + f[1], 0.9, 0.17, 'sine'));
    mix.addNoise(n, 0.5, 0.12, 800, 5000, 1);
  },
};

const SFX_LEN = {
  swish: 0.7,
  swishIn: 0.6,
  swishWipe: 0.7,
  swishGlitch: 0.4,
  words: 0.5,
  shutter: 0.3,
  zoomOut: ZD + 0.1,
  zoomIntro: 4.4,
  tick: 0.15,
  tickHi: 0.2,
  lock: 0.45,
  hit: 0.75,
  focus: 0.75,
  expand: 0.7,
  sparkle: 0.75,
  chime: 1.3,
  jingle: 2.2,
  jingleEnd: 2.7,
};

function musicTargets(t, scenes) {
  const s = sceneAt(t, scenes);
  const l = t - s.start;
  let g = 0.09;
  let cut = 520;
  let rate = 1.4;
  let tv = 0;
  if (s.type === 'intro') {
    g = 0.07;
    cut = 650;
  } else if (s.type === 'q') {
    const ZDs = s.zd || ZD;
    const p = Math.max(0, Math.min(1, (l - ZS) / ZDs));
    g = 0.08 + 0.06 * p;
    cut = 420 + p * p * 2600;
    rate = 1.4 + p * 3.4;
    tv = 0.06 * p;
    if (l >= ZS + ZDs - 0.1) {
      g = 0.012;
      cut = 300;
      tv = 0;
    }
  } else if (s.type === 'r') {
    cut = 900;
    if (l < 1.1) {
      g = 0.012;
      cut = 300;
    }
  } else if (s.type === 'bonus') {
    // pre-roll: quiet suspense. puzzle: tension ramp. reveal: drop out.
    const bclock = (settings.bonus && settings.bonus.clock != null) ? settings.bonus.clock : 8;
    const cs = s.clockStart != null ? s.clockStart : 1.6;
    const revealAt = cs + bclock;
    if (l < cs) {
      g = 0.05;
      cut = 480;
    } else if (l < revealAt) {
      const p = clamp((l - cs) / (revealAt - cs), 0, 1);
      g = 0.07 + 0.055 * p;
      cut = 420 + p * p * 2400;
      rate = 1.4 + p * 3.0;
      tv = 0.05 * p;
    } else {
      g = 0.012;
      cut = 300;
    }
  } else if (s.type === 'sting') {
    g = 0.04;
  }
  return {g, cut, rate, tv};
}

function renderMusic(seconds, scenes) {
  const n = Math.ceil(seconds * SR);
  const out = new Float64Array(n);
  const voices = [
    {f: 55, detune: 0, g: 0.5, type: 'sine', phase: 0},
    {f: 55, detune: 6, g: 0.3, type: 'sine', phase: 0},
    {f: 82.4, detune: -5, g: 0.12, type: 'sawtooth', phase: 0},
    {f: 110, detune: 4, g: 0.12, type: 'sawtooth', phase: 0},
    {f: 130.8, detune: -6, g: 0.1, type: 'sawtooth', phase: 0},
    {f: 164.8, detune: 5, g: 0.08, type: 'sawtooth', phase: 0},
  ];
  const tens = [
    {f: 233.1, detune: -7, phase: 0},
    {f: 311.1, detune: 7, phase: 0},
  ];
  voices.forEach((v) => {
    v.hz = v.f * Math.pow(2, v.detune / 1200);
  });
  tens.forEach((v) => {
    v.hz = v.f * Math.pow(2, v.detune / 1200);
  });
  const lp = new Biquad();
  let g = 0;
  let cut = 450;
  let rate = 1.4;
  let tv = 0;
  let lastG = 0;
  let lfoPhase = 0;
  const kGFast = 1 - Math.exp(-1 / (SR * 0.012));
  const kGSlow = 1 - Math.exp(-1 / (SR * 0.4));
  const k15 = 1 - Math.exp(-1 / (SR * 0.15));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const tgt = musicTargets(t, scenes);
    const kG = tgt.g < lastG ? kGFast : kGSlow;
    lastG = tgt.g;
    g += (tgt.g - g) * kG;
    cut += (tgt.cut - cut) * k15;
    rate += (tgt.rate - rate) * k15;
    tv += (tgt.tv - tv) * k15;
    let pulse = 0;
    for (const v of voices) {
      v.phase += v.hz / SR;
      pulse += oscSample(v.type, v.phase, v.hz) * v.g;
    }
    let ten = 0;
    for (const v of tens) {
      v.phase += v.hz / SR;
      ten += oscSample('sawtooth', v.phase, v.hz);
    }
    const lfo = Math.sin(lfoPhase * Math.PI * 2);
    lfoPhase += rate / SR;
    const pulseGain = 0.72 + 0.26 * lfo;
    lp.set('lowpass', cut, 0.8);
    out[i] = lp.process((pulse + ten * tv) * pulseGain) * g;
  }
  return out;
}

function readWav(file) {
  const buf = fs.readFileSync(file);
  let off = 12;
  let ch = 1;
  let sr = SR;
  let bits = 16;
  let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    off += 8;
    if (id === 'fmt ') {
      ch = buf.readUInt16LE(off + 2);
      sr = buf.readUInt32LE(off + 4);
      bits = buf.readUInt16LE(off + 14);
    } else if (id === 'data') {
      data = buf.slice(off, off + size);
      break;
    }
    off += size + (size % 2);
  }
  if (!data) throw new Error('no data chunk in ' + file);
  const n = Math.floor(data.length / (ch * (bits / 8)));
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  if (bits !== 16) throw new Error('need 16-bit pcm');
  for (let i = 0; i < n; i++) {
    const l = data.readInt16LE(i * ch * 2) / 32768;
    const r = ch > 1 ? data.readInt16LE(i * ch * 2 + 2) / 32768 : l;
    L[i] = l;
    R[i] = r;
  }
  return {L, R, sr, n};
}

function writeStereoWav(file, L, R) {
  const n = Math.min(L.length, R.length);
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const clip = (x) => {
      if (x > 0.95) x = 0.95 + 0.05 * Math.tanh((x - 0.95) / 0.05);
      else if (x < -0.95) x = -0.95 - 0.05 * Math.tanh((-x - 0.95) / 0.05);
      x = clamp(x, -1, 1);
      return x < 0 ? Math.round(x * 32768) : Math.round(x * 32767);
    };
    buf.writeInt16LE(clip(L[i]), 44 + i * 4);
    buf.writeInt16LE(clip(R[i]), 44 + i * 4 + 2);
  }
  fs.writeFileSync(file, buf);
}

function writeStereoMix(file, bgPath, sfxMono) {
  const bg = readWav(bgPath);
  const n = Math.max(bg.n, sfxMono.length);
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = i < sfxMono.length ? sfxMono[i] : 0;
    L[i] = (i < bg.n ? bg.L[i] : 0) + s;
    R[i] = (i < bg.n ? bg.R[i] : 0) + s;
  }
  writeStereoWav(file, L, R);
}

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    let x = samples[i];
    if (x > 0.95) x = 0.95 + 0.05 * Math.tanh((x - 0.95) / 0.05);
    else if (x < -0.95) x = -0.95 - 0.05 * Math.tanh((-x - 0.95) / 0.05);
    x = clamp(x, -1, 1);
    buf.writeInt16LE(x < 0 ? Math.round(x * 32768) : Math.round(x * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

function trimMix(mix, seconds) {
  const n = Math.min(mix.n, Math.ceil(seconds * SR));
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = mix.a[i];
  return out;
}

function scale(buf, g) {
  for (let i = 0; i < buf.length; i++) buf[i] *= g;
  return buf;
}

function main() {
  fs.mkdirSync(OUT, {recursive: true});
  const {scenes, total} = buildScenes();
  const EV = buildEvents(scenes);
  console.log(`timeline ${total.toFixed(2)}s, ${EV.length} sfx events`);

  const names = Object.keys(SFX);
  for (const name of names) {
    const mix = new Mix(SFX_LEN[name] || 1);
    SFX[name](mix, 0);
    const samples = scale(trimMix(mix, (SFX_LEN[name] || 1) + 0.05), MASTER);
    const file = name === 'swishIn' ? 'swish-in.wav' : name === 'zoomOut' ? 'riser.wav' : name === 'zoomIntro' ? 'zoom-intro.wav' : name === 'tickHi' ? 'tick-hi.wav' : `${name}.wav`;
    writeWav(path.join(OUT, file), samples);
    console.log('  ', file);
  }

  console.log('sfx mix…');
  const mix = new Mix(total + 0.3);
  for (const [t, name, arg] of EV) SFX[name](mix, t, arg);
  const sfx = scale(trimMix(mix, total + 0.05), MASTER);
  writeWav(path.join(OUT, 'sfx.wav'), sfx);

  const bgPath = path.join(OUT, 'background.wav');
  if (fs.existsSync(bgPath)) {
    console.log('soundtrack = background.wav + sfx…');
    writeStereoMix(path.join(OUT, 'soundtrack.wav'), bgPath, sfx);
  } else {
    console.log('music bed (no background.wav)…');
    const music = renderMusic(total + 0.2, scenes);
    writeWav(path.join(OUT, 'music.wav'), music);
    const n = Math.min(sfx.length, music.length);
    const score = new Float64Array(Math.ceil((total + 0.05) * SR));
    for (let i = 0; i < score.length; i++) {
      score[i] = (i < n ? sfx[i] : 0) + (i < music.length ? music[i] : 0);
    }
    writeWav(path.join(OUT, 'soundtrack.wav'), score);
  }
  console.log('wrote public/sounds/sfx.wav and soundtrack.wav');
}

main();
