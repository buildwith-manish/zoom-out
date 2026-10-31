#!/usr/bin/env node
'use strict';

/**
 * Normalize raster quiz photos to 1920×1080 with ffmpeg
 * (cover-crop, yuv420p jpeg/png). SVG drawings are left alone.
 */

const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'public', 'images');
const W = 1920;
const H = 1080;

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', args, {encoding: 'utf8'});
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout || 'ffmpeg failed');
  }
}

fs.mkdirSync(DIR, {recursive: true});
const files = fs.readdirSync(DIR).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
if (!files.length) {
  console.log('no raster images to resize (svg drawings are already sized at render)');
  process.exit(0);
}

for (const f of files) {
  const src = path.join(DIR, f);
  const tmp = path.join(DIR, `.tmp-${f.replace(/\s+/g, '-')}.jpg`);
  console.log(`resize ${f} → ${W}x${H}`);
  ffmpeg([
    '-y',
    '-i',
    src,
    '-vf',
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`,
    '-q:v',
    '3',
    tmp,
  ]);
  const dest = path.join(DIR, f.replace(/\.[^.]+$/, '.jpg'));
  fs.renameSync(tmp, dest);
  if (dest !== src && fs.existsSync(src)) {
    try {
      fs.unlinkSync(src);
    } catch {
      /* keep */
    }
  }
}
console.log(`resized ${files.length} image(s) to ${W}x${H}`);
