#!/usr/bin/env node
'use strict';

/**
 * Resume-safe batched Remotion render.
 *   node scripts/render-batches.js --size 300
 *
 * Writes an image sequence to out/frames, records the next frame in
 * out/.render-progress.json, and concatenates to out/zoom-out.mp4 when done.
 */

const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const FRAMES = path.join(OUT, 'frames');
const PROGRESS = path.join(OUT, '.render-progress.json');
const settings = require(path.join(ROOT, 'settings.json'));
const questions = require(path.join(ROOT, 'questions.json'));

function parseArgs(argv) {
  let size = 300;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--size' && argv[i + 1]) size = Math.max(1, parseInt(argv[++i], 10));
    else if (argv[i].startsWith('--size=')) size = Math.max(1, parseInt(argv[i].slice(7), 10));
  }
  return {size};
}

function totalFrames() {
  return require(path.join(ROOT, 'src', 'plan.cjs')).getTotalFrames(settings, questions);
}

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
  } catch {
    return {next: 0, done: false};
  }
}

function saveProgress(p) {
  fs.mkdirSync(OUT, {recursive: true});
  fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2));
}

function run(cmd, args) {
  console.log('$', cmd, args.join(' '));
  const r = spawnSync(cmd, args, {cwd: ROOT, stdio: 'inherit', env: process.env});
  if (r.status !== 0) process.exit(r.status || 1);
}

const {size} = parseArgs(process.argv.slice(2));
const total = totalFrames();
fs.mkdirSync(FRAMES, {recursive: true});
const progress = loadProgress();
let start = progress.next || 0;

if (progress.done && start >= total) {
  console.log('already complete');
  process.exit(0);
}

console.log(`render ${total} frames in batches of ${size}, resume at ${start}`);

while (start < total) {
  const end = Math.min(total, start + size) - 1;
  run('npx', [
    'remotion',
    'render',
    'ZoomOut',
    FRAMES,
    '--sequence',
    `--frames=${start}-${end}`,
    '--image-format=jpeg',
    '--overwrite',
  ]);
  start = end + 1;
  saveProgress({next: start, done: start >= total, total});
  console.log(`batch ok — next ${start}/${total}`);
}

const mp4 = path.join(OUT, 'zoom-out.mp4');
const ffmpeg = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-framerate',
    String(settings.fps),
    '-i',
    path.join(FRAMES, 'element-%012d.jpeg'),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    mp4,
  ],
  {cwd: ROOT, encoding: 'utf8'},
);

if (ffmpeg.status !== 0) {
  const alt = spawnSync(
    'npx',
    ['remotion', 'render', 'ZoomOut', mp4, '--overwrite'],
    {cwd: ROOT, stdio: 'inherit'},
  );
  if (alt.status !== 0) {
    console.warn('concat skipped — frames are in out/frames (run remotion render to mux)');
    process.exit(0);
  }
}

saveProgress({next: total, done: true, total});
console.log('wrote', mp4);
