#!/usr/bin/env node
/**
 * scripts/voiceover-scan.js
 * ---------------------------------------------------------------------------
 * Finds your voiceover clips and measures them, so the video can fit around them.
 *
 *   public/voiceover/qq01.wav ... qq50.wav   the question-phase clip (plays before the zoom/timer)
 *   public/voiceover/q01.wav   ... q50.wav    the reveal clip (plays at the reveal moment)
 *   public/voiceover/intro.wav               the intro voiceover
 *   public/voiceover/outro.wav               the outro voiceover
 *   public/voiceover/sting.wav               the sting voiceover
 *   (.mp3 .wav .m4a .aac .ogg .flac all work)
 *
 * It writes src/voiceover-manifest.json:
 *   { q: { "1": { file, seconds } }, qq: {...}, intro: {...}, outro: {...}, sting: {...} }
 *
 * plan.cjs reads that file: each question scene stretches to fit its qq clip
 * (the clip plays first, then the zoom/timer starts), and each reveal scene
 * stretches to fit its q clip. A missing clip changes nothing.
 *
 *   npm run voiceover            # scan + coverage report
 *   (npm run render runs this automatically first)
 *
 * Durations: WAV is read directly; everything else uses ffprobe (PATH, or `npx remotion ffprobe`).
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const settings = require(path.join(ROOT, 'settings.json'));
const VO = settings.voiceover || { dir: 'voiceover', offset: 0.5, tail: 0.3, enabled: true };
const DIR = path.join(ROOT, 'public', VO.dir);
const MANIFEST = path.join(ROOT, 'src', 'voiceover-manifest.json');
const EXT = /\.(mp3|wav|m4a|aac|ogg|flac)$/i;

const wavSeconds = (file) => {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') return null;
  let pos = 12;
  let byteRate = 0;
  while (pos + 8 <= b.length) {
    const id = b.toString('ascii', pos, pos + 4);
    const size = b.readUInt32LE(pos + 4);
    if (id === 'fmt ') byteRate = b.readUInt32LE(pos + 16);
    if (id === 'data' && byteRate) return Math.min(size, b.length - pos - 8) / byteRate;
    pos += 8 + size + (size % 2);
  }
  return null;
};

const probeArgs = (file) => ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file];
const ffprobeSeconds = (file) => {
  const tries = [
    ['ffprobe', probeArgs(file)],
    [process.platform === 'win32' ? 'npx.cmd' : 'npx', ['remotion', 'ffprobe', ...probeArgs(file)]],
  ];
  for (const [bin, args] of tries) {
    const r = spawnSync(bin, args, { encoding: 'utf8', cwd: ROOT, shell: process.platform === 'win32' });
    const v = parseFloat(String(r.stdout || '').trim().split(/\s+/).pop());
    if (r.status === 0 && Number.isFinite(v)) return v;
  }
  return null;
};

const seconds = (file) => {
  if (/\.wav$/i.test(file)) {
    const s = wavSeconds(file);
    if (s) return s;
  }
  return ffprobeSeconds(file);
};

const main = () => {
  const manifest = { q: {}, qq: {}, bonusq: {}, bonus: {}, intro: null, outro: null, sting: null };
  const problems = [];
  if (fs.existsSync(DIR)) {
    for (const name of fs.readdirSync(DIR).sort()) {
      if (!EXT.test(name)) continue;

      const s = seconds(path.join(DIR, name));
      if (!s) {
        problems.push(`could not measure "${name}" (install ffmpeg/ffprobe, or use a .wav)`);
        continue;
      }
      const entry = { file: name, seconds: Math.round(s * 1000) / 1000 };

      // Numbered clips: qq##, q##, bonusq##, bonus##
      const m = /^(bonusq|qq|bonus|q)0*(\d+)\.[a-z0-9]+$/i.exec(name);
      if (m) {
        const kind = m[1].toLowerCase();
        const n = String(Number(m[2]));
        if (manifest[kind][n]) {
          problems.push(`two clips for ${kind} ${n}: keeping ${manifest[kind][n].file}, ignoring ${name}`);
          continue;
        }
        manifest[kind][n] = entry;
        continue;
      }

      // Named clips: intro, outro, sting
      const baseName = name.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
      if (baseName === 'intro') { manifest.intro = entry; continue; }
      if (baseName === 'outro') { manifest.outro = entry; continue; }
      if (baseName === 'sting') { manifest.sting = entry; continue; }

      problems.push(`ignored "${name}" (name it q01.wav, qq01.wav, intro.wav, outro.wav, or sting.wav)`);
    }
  }

  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  const questions = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions.json'), 'utf8'));
  const total = questions.length;
  const qn = Object.keys(manifest.q).length;
  const qqn = Object.keys(manifest.qq).length;
  const bonusTotal = ((settings.bonus || {}).rounds || []).length;
  const bqn = Object.keys(manifest.bonusq).length;
  const ban = Object.keys(manifest.bonus).length;

  console.log(`\n  voiceover: ${qn}/${total} reveal · ${qqn}/${total} question-phase · bonus ${bqn}/${bonusTotal} prompt · ${ban}/${bonusTotal} answer · intro ${manifest.intro ? '✓' : '✗'} · outro ${manifest.outro ? '✓' : '✗'} · sting ${manifest.sting ? '✓' : '✗'}  (${path.relative(ROOT, DIR)})`);
  if (qn + qqn + bqn + ban === 0 && !manifest.intro && !manifest.outro && !manifest.sting) {
    console.log('  no clips yet: the video renders exactly as before.');
  }

  const missing = [];
  for (let i = 1; i <= total; i++) {
    if (!manifest.q[String(i)]) missing.push(`q${i}`);
  }
  if (qn && missing.length) console.log(`  missing reveal clips: ${missing.join(', ')}`);
  const missingQq = [];
  for (let i = 1; i <= total; i++) {
    if (!manifest.qq[String(i)]) missingQq.push(`qq${i}`);
  }
  if (qqn && missingQq.length) console.log(`  missing question clips: ${missingQq.join(', ')}`);
  const missingBq = [];
  for (let i = 1; i <= bonusTotal; i++) {
    if (!manifest.bonusq[String(i)]) missingBq.push(`bonusq${i}`);
    if (!manifest.bonus[String(i)]) missingBq.push(`bonus${i}`);
  }
  if ((bqn || ban) && missingBq.length) console.log(`  missing bonus clips: ${missingBq.join(', ')}`);
  problems.forEach((p) => console.log(`  ! ${p}`));
  console.log('');
};

main();
