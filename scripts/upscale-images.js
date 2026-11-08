#!/usr/bin/env node
/**
 * upscale-images.js — re-fetches all food images at higher quality via z-ai image-search,
 * then resizes them to 2560×1440 at maximum JPEG quality.
 *
 * Usage: node scripts/upscale-images.js
 */
'use strict';

const {spawnSync} = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'images');
const QUESTIONS = path.join(ROOT, 'questions.json');
const W = 2560;
const H = 1440;

function search(query) {
  // Use --no-rank for speed (no captioning), --count 5 for options
  // Write to temp file to avoid stdout parsing issues
  const tmpOut = path.join(require('os').tmpdir(), `zai-search-${Date.now()}.json`);
  const r = spawnSync('z-ai', ['image-search', '-q', query, '--count', '5', '--no-rank', '--gl', 'us', '-o', tmpOut], {
    encoding: 'utf8',
    timeout: 120000,
  });
  if (r.status !== 0) {
    throw new Error(`image-search failed: ${r.stderr || r.stdout || r.error}`);
  }
  try {
    const data = JSON.parse(fs.readFileSync(tmpOut, 'utf8'));
    fs.unlinkSync(tmpOut);
    return data;
  } catch (e) {
    throw new Error(`could not parse search output: ${e.message}`);
  }
}

function pickBest(results) {
  // Pick the result with the largest dimensions (area)
  let best = null;
  let bestArea = 0;
  for (const r of (results || [])) {
    const w = parseInt((r.original_width || '0').replace('px', ''), 10);
    const h = parseInt((r.original_height || '0').replace('px', ''), 10);
    const area = w * h;
    if (area > bestArea && r.original_url) {
      bestArea = area;
      best = r;
    }
  }
  return best;
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {headers: {'User-Agent': 'zoom-out-upscale/1.0'}, timeout: 30000},
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return download(res.headers.location, dest).then(resolve, reject);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
        file.on('error', reject);
      },
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

function ffmpegResize(src, dest) {
  const r = spawnSync('ffmpeg', [
    '-y', '-i', src,
    '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}`,
    '-q:v', '2', // highest JPEG quality
    dest,
  ], {encoding: 'utf8'});
  if (r.status !== 0) {
    throw new Error(`ffmpeg failed: ${r.stderr || r.stdout}`);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, {recursive: true});
  const questions = JSON.parse(fs.readFileSync(QUESTIONS, 'utf8'));
  let success = 0;
  let failed = 0;
  const tmpDir = path.join(OUT_DIR, '.tmp-upscale');
  fs.mkdirSync(tmpDir, {recursive: true});

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const key = String(q.art || q.id);
    const outputFile = path.join(OUT_DIR, q.image);

    // Skip if we already processed it (resume-safe)
    if (process.env.SKIP_EXISTING && fs.existsSync(outputFile)) {
      const stat = fs.statSync(outputFile);
      if (stat.size > 200000) {
        console.log(`  [${i + 1}/50] skip ${key} (already high quality)`);
        success++;
        continue;
      }
    }

    const query = `${q.answer} food photograph high resolution close-up`;
    console.log(`  [${i + 1}/50] ${key}: searching "${query}"...`);

    try {
      const result = search(query);
      if (!result.success || !result.results || result.results.length === 0) {
        console.log(`    ✗ no results`);
        failed++;
        continue;
      }

      const best = pickBest(result.results);
      if (!best) {
        console.log(`    ✗ no usable URL`);
        failed++;
        continue;
      }

      const w = best.original_width || '?';
      const h = best.original_height || '?';
      console.log(`    found ${w}x${h} from ${best.source || 'unknown'}`);

      // Download to temp file
      const tmpFile = path.join(tmpDir, `${key}.orig`);
      await download(best.original_url, tmpFile);
      const dlSize = fs.statSync(tmpFile).size;
      if (dlSize < 4000) {
        console.log(`    ✗ downloaded file too small (${dlSize} bytes)`);
        fs.unlinkSync(tmpFile);
        failed++;
        continue;
      }

      // Resize to 2560x1440 at max quality
      ffmpegResize(tmpFile, outputFile);
      fs.unlinkSync(tmpFile);

      const outSize = fs.statSync(outputFile).size;
      console.log(`    ✓ saved ${q.image} (${(outSize / 1024).toFixed(0)}KB)`);
      success++;
    } catch (e) {
      console.log(`    ✗ ${e.message}`);
      failed++;
    }
  }

  // Cleanup temp dir
  try { fs.rmSync(tmpDir, {recursive: true}); } catch {}

  console.log(`\nDone: ${success} upscaled, ${failed} failed`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
