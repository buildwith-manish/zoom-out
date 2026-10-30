#!/usr/bin/env node
'use strict';

/**
 * Drop broken / tiny raster fetches from progress, then re-run fetch-images.
 */

const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'images');
const PROGRESS = path.join(__dirname, '.image-progress.json');

function isBroken(file) {
  const p = path.join(DIR, file);
  if (!fs.existsSync(p)) return true;
  const st = fs.statSync(p);
  if (st.size < 4000) return true;
  const buf = Buffer.alloc(16);
  const fd = fs.openSync(p, 'r');
  fs.readSync(fd, buf, 0, 16, 0);
  fs.closeSync(fd);
  const jpg = buf[0] === 0xff && buf[1] === 0xd8;
  const png = buf[0] === 0x89 && buf[1] === 0x50;
  const webp = buf.slice(0, 4).toString() === 'RIFF';
  const svg = buf.slice(0, 5).toString().toLowerCase().includes('<?xml') || buf.slice(0, 4).toString().toLowerCase() === '<svg';
  if (svg) return false;
  return !(jpg || png || webp);
}

let progress = {};
try {
  progress = JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
} catch {
  progress = {};
}

let n = 0;
for (const [key, rec] of Object.entries(progress)) {
  const file = rec && rec.file;
  if (!rec.ok || !file || isBroken(file)) {
    console.log(`retry ${key}`);
    delete progress[key];
    n++;
    if (file) {
      const p = path.join(DIR, file);
      if (fs.existsSync(p) && /\.(jpe?g|png|webp)$/i.test(file)) {
        try {
          fs.unlinkSync(p);
        } catch {
          /* ignore */
        }
      }
    }
  }
}
fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 2));
console.log(`cleared ${n} broken entries, running fetch-images`);
const r = spawnSync(process.execPath, [path.join(__dirname, 'fetch-images.js')], {stdio: 'inherit'});
process.exit(r.status || 0);
