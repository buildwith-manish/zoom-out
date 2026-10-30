#!/usr/bin/env node
'use strict';

/**
 * Fetch a photo for each round via `z-ai image-search`.
 * Shutterstock URLs are always skipped. Progress is resume-safe
 * (scripts/.image-progress.json).
 */

const {spawnSync} = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'public', 'images');
const PROGRESS = path.join(__dirname, '.image-progress.json');
const QUESTIONS = path.join(ROOT, 'questions.json');

function loadProgress() {
  try {
    return JSON.parse(fs.readFileSync(PROGRESS, 'utf8'));
  } catch {
    return {};
  }
}

function saveProgress(p) {
  fs.writeFileSync(PROGRESS, JSON.stringify(p, null, 2));
}

function search(query) {
  const attempts = [
    ['z-ai', ['image-search', query, '--count', '5']],
    ['z-ai', ['image-search', query, '--json']],
    ['z-ai', ['image-search', query]],
  ];
  let lastErr = '';
  for (const [bin, args] of attempts) {
    const r = spawnSync(bin, args, {encoding: 'utf8', timeout: 90000});
    if (r.status === 0 && r.stdout && r.stdout.trim()) return r.stdout;
    lastErr = (r.stderr || r.stdout || r.error || '').toString();
  }
  throw new Error(`z-ai image-search failed for "${query}": ${lastErr}`);
}

function extractUrls(text) {
  const urls = [];
  const re = /https?:\/\/[^\s"'<>\\]+/gi;
  let m;
  while ((m = re.exec(text))) urls.push(m[0].replace(/[),.;]+$/, ''));
  try {
    const walk = (o) => {
      if (!o) return;
      if (typeof o === 'string' && /^https?:\/\//i.test(o)) urls.push(o);
      else if (Array.isArray(o)) o.forEach(walk);
      else if (typeof o === 'object') Object.values(o).forEach(walk);
    };
    walk(JSON.parse(text));
  } catch {
    /* not json */
  }
  return [...new Set(urls)].filter((u) => !/shutterstock\.com/i.test(u));
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {'User-Agent': 'zoom-out-fetch/1.0'},
        timeout: 30000,
      },
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
    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, {recursive: true});
  const questions = JSON.parse(fs.readFileSync(QUESTIONS, 'utf8'));
  const progress = loadProgress();
  let changed = false;

  for (const q of questions) {
    const key = String(q.art || q.id);
    if (progress[key] && progress[key].ok && fs.existsSync(path.join(OUT_DIR, progress[key].file))) {
      console.log(`skip ${key} (already fetched)`);
      continue;
    }
    const query = `${q.answer} photograph close-up -shutterstock`;
    console.log(`search ${key}: ${query}`);
    let urls = [];
    try {
      urls = extractUrls(search(query));
    } catch (e) {
      console.warn(e.message);
      progress[key] = {ok: false, error: String(e.message)};
      saveProgress(progress);
      continue;
    }
    urls = urls.filter((u) => /^https?:\/\//i.test(u) && !/shutterstock\.com/i.test(u));
    let saved = null;
    for (const url of urls) {
      if (/shutterstock\.com/i.test(url)) continue;
      const ext = (url.match(/\.(jpe?g|png|webp)/i) || ['.jpg'])[0].replace('jpeg', 'jpg');
      const file = `${key}.jpg`;
      const dest = path.join(OUT_DIR, file);
      try {
        await download(url, dest);
        const st = fs.statSync(dest);
        if (st.size < 4000) {
          fs.unlinkSync(dest);
          continue;
        }
        saved = file;
        q.image = file;
        changed = true;
        progress[key] = {ok: true, file, url};
        saveProgress(progress);
        console.log(`saved ${file} from ${url}`);
        break;
      } catch (e) {
        console.warn(`fail ${url}: ${e.message}`);
      }
    }
    if (!saved) {
      progress[key] = {ok: false, error: 'no usable URL (shutterstock excluded)'};
      saveProgress(progress);
    }
  }

  if (changed) {
    fs.writeFileSync(QUESTIONS, JSON.stringify(questions, null, 2) + '\n');
    console.log('updated questions.json image fields');
  }
  console.log('done');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
