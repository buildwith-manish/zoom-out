#!/usr/bin/env node
/**
 * Master the final mix -> public/sounds/master.mp3
 *
 *   voiceover.wav  (lead)   high-pass, gentle compression, presence lift
 *   background.mp3 (music)  sidechain-ducked under the voice, mid-range carved out
 *   sfx.mp3        (cues)   lightly ducked under the voice so ticks/hits stay audible
 *
 * then a two-pass EBU R128 normalisation to -14 LUFS integrated / -1.5 dBTP (the
 * YouTube playback reference), with a lookahead limiter as a safety net.
 *
 * Requires ffmpeg >= 4.4 (amix normalize=0). Tweak the constants below to taste.
 * Run: npm run master   (also runs at the end of `npm run audio`)
 */
const {spawnSync} = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const snd = (f) => path.join(root, 'public', 'sounds', f);

// ---- mix constants -------------------------------------------------------
const TARGET_LUFS = -14; // YouTube reference loudness
const TARGET_TP = -1.5; // dBTP ceiling
const TARGET_LRA = 11;
const MUSIC_GAIN_DB = -3; // music bed level before ducking
const SFX_GAIN_DB = 0;
const MUSIC_DUCK = {threshold: 0.05, ratio: 3, attack: 15, release: 450}; // ~10 dB under speech
const SFX_DUCK = {threshold: 0.15, ratio: 2, attack: 5, release: 150}; // ~3 dB under speech

// ---- helpers ---------------------------------------------------------------
function totalSeconds() {
  const out = spawnSync('node', ['--input-type=module', '-e', `
    import {getTotalSeconds} from './src/timing.js';
    import fs from 'fs';
    const q = JSON.parse(fs.readFileSync('questions.json'));
    const s = JSON.parse(fs.readFileSync('settings.json'));
    console.log(getTotalSeconds(s, q));
  `], {cwd: root, encoding: 'utf8'});
  const v = parseFloat(out.stdout.trim());
  return Number.isFinite(v) ? v : 722;
}

function ffmpeg(args, capture = false) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...args], {encoding: 'utf8', maxBuffer: 1 << 28});
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error('ffmpeg failed');
  }
  return capture ? r.stderr : '';
}

const dur = totalSeconds();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zo-master-'));
const pre = path.join(tmp, 'premaster.wav');
console.log(`Video length ${dur.toFixed(3)}s`);

// ---- 1. voice chain + ducked music/sfx -> premaster ---------------------------
const duck = (d) => `threshold=${d.threshold}:ratio=${d.ratio}:attack=${d.attack}:release=${d.release}:makeup=1:knee=3`;
const filter = [
  // voice: clean low end, even out dynamics, add presence
  `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,highpass=f=70,` +
    `acompressor=threshold=-21dB:ratio=3:attack=6:release=90:makeup=3,` +
    `equalizer=f=3200:t=q:w=0.9:g=2.5,apad,atrim=0:${dur},asplit=2[voice][vkey1]`,
  `[vkey1]asplit=2[vkeyM][vkeyS]`,
  // music: pad/trim to video length, carve the speech range, then duck under voice
  `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${dur},` +
    `volume=${MUSIC_GAIN_DB}dB,equalizer=f=2200:t=q:w=0.7:g=-3[music]`,
  `[music][vkeyM]sidechaincompress=${duck(MUSIC_DUCK)}[musicD]`,
  // sfx: pad/trim, light duck so cues are never masked by the voice
  `[2:a]aformat=sample_rates=48000:channel_layouts=stereo,apad,atrim=0:${dur},volume=${SFX_GAIN_DB}dB[sfx]`,
  `[sfx][vkeyS]sidechaincompress=${duck(SFX_DUCK)}[sfxD]`,
  `[voice][musicD][sfxD]amix=inputs=3:normalize=0:duration=longest[mix]`,
].join(';');

console.log('1/3 mixing + ducking ...');
ffmpeg([
  '-i', snd('voiceover.wav'), '-i', snd('background.mp3'), '-i', snd('sfx.mp3'),
  '-filter_complex', filter, '-map', '[mix]', '-c:a', 'pcm_f32le', '-ar', '48000', pre,
]);

// ---- 2. measure loudness ---------------------------------------------------
console.log('2/3 measuring loudness ...');
const log = ffmpeg([
  '-i', pre, '-af', `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}:print_format=json`,
  '-f', 'null', '-',
], true);
const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
console.log(`   measured: ${m.input_i} LUFS, TP ${m.input_tp} dBTP, LRA ${m.input_lra}`);

// ---- 3. linear loudness normalisation + safety limiter -> mp3 ---------------------------
console.log('3/3 normalising + encoding ...');
const out = snd('master.mp3');
ffmpeg([
  '-i', pre, '-af',
  `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=${TARGET_LRA}` +
    `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true,` +
    `alimiter=limit=${Math.pow(10, (TARGET_TP + 0.3) / 20).toFixed(4)}:level=disabled`,
  '-ar', '48000', '-c:a', 'libmp3lame', '-b:a', '320k', out,
]);

fs.rmSync(tmp, {recursive: true, force: true});
console.log(`Wrote ${path.relative(root, out)} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB)`);
