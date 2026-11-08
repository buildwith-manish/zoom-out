#!/usr/bin/env node
'use strict';

/**
 * Resume-safe clip-by-clip Remotion render for the zoom-out video.
 *
 * Mirrors character-silhoutte's render-batches.js: the video is split into 61
 * clips at scene boundaries (intro, level cards, 50 question+reveal pairs, 5
 * bonus rounds, outro, sting) and each clip is rendered as its own MP4 using
 *   npx remotion render ZoomOut out/clips/<name>.mp4 --frames=START-END
 * Resume-safe: existing clips are skipped. --concat joins them into the final
 * video with sample-accurate audio (each clip's AAC encoder delay is trimmed
 * so there is no drift over 61 clips).
 *
 * Usage:
 *   node scripts/render-clips.js                      # render all clips (resume-safe), auto-concat when done
 *   node scripts/render-clips.js --only q01,q02        # render specific clips
 *   node scripts/render-clips.js --concat              # concat existing clips only
 *   node scripts/render-clips.js --list                # list clips and exit
 *   node scripts/render-clips.js --quality 1080p       # 1080p (default 1440p)
 *   node scripts/render-clips.js --concurrency 4       # remotion concurrency (default 4)
 *   node scripts/render-clips.js --overwrite           # re-render even if clip exists
 *
 * The clip list is computed from src/plan.cjs buildScenes(), so it always
 * matches the current scene plan (questions, bonus rounds, level cards).
 */

const {spawnSync} = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'out');
const CLIPS_DIR = path.join(OUT, 'clips');
const settings = require(path.join(ROOT, 'settings.json'));
const questions = require(path.join(ROOT, 'questions.json'));
const plan = require(path.join(ROOT, 'src', 'plan.cjs'));

// ---------- args ----------
function flag(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}
const onlyArg = flag('only', null);
const onlyNames = onlyArg && onlyArg !== true ? String(onlyArg).split(',').map((s) => s.trim()) : null;
const doConcat = flag('concat', false) === true;
const doList = flag('list', false) === true;
const quality = flag('quality', '1440p');
const concurrency = String(flag('concurrency', '2'));
const overwrite = flag('overwrite', false) === true;

// ---------- clip list (from the scene plan) ----------
function buildClips() {
  const {scenes} = plan.buildScenes(settings, questions);
  const fps = settings.fps;
  const clips = [];
  let i = 0;
  while (i < scenes.length) {
    const s = scenes[i];
    // group a question scene with its matching reveal scene into one clip
    if (s.type === 'q') {
      const next = scenes[i + 1];
      if (next && next.type === 'r' && next.i === s.i) {
        const startFrame = Math.round(s.start * fps);
        const endFrame = Math.round((next.start + next.d) * fps) - 1;
        clips.push({
          name: 'q' + String(s.i + 1).padStart(2, '0'),
          label: 'Q' + (s.i + 1),
          startFrame, endFrame,
          dur: Number((next.start + next.d - s.start).toFixed(3)),
        });
        i += 2;
        continue;
      }
    }
    const startFrame = Math.round(s.start * fps);
    const endFrame = Math.round((s.start + s.d) * fps) - 1;
    const name =
      s.type === 'intro' ? 'intro' :
      s.type === 'outro' ? 'outro' :
      s.type === 'sting' ? 'sting' :
      s.type === 'level' ? 'level-' + s.level :
      s.type === 'bonus' ? 'bonus-' + (s.bonusIndex + 1) :
      s.type + '-' + i;
    clips.push({name, label: s.label || s.type, startFrame, endFrame, dur: Number(s.d.toFixed(3))});
    i++;
  }
  return clips;
}

const ALL_CLIPS = buildClips();
const clips = onlyNames ? ALL_CLIPS.filter((c) => onlyNames.includes(c.name)) : ALL_CLIPS;

// ---------- --list ----------
if (doList) {
  const totalFrames = ALL_CLIPS[ALL_CLIPS.length - 1].endFrame + 1;
  console.log(ALL_CLIPS.length + ' clips, ' + totalFrames + ' frames (' + (totalFrames / settings.fps).toFixed(1) + 's)');
  console.log('  name            frames         dur    label');
  for (const c of ALL_CLIPS) {
    const sel = onlyNames && onlyNames.includes(c.name) ? '→' : ' ';
    console.log(sel + ' ' + c.name.padEnd(14) + ' ' + String(c.startFrame).padStart(5) + '-' + String(c.endFrame).padEnd(5) + '  ' + c.dur.toFixed(1) + 's  ' + c.label);
  }
  process.exit(0);
}

// ---------- render ----------
fs.mkdirSync(CLIPS_DIR, {recursive: true});

function renderClip(clip) {
  const file = path.join(CLIPS_DIR, clip.name + '.mp4');
  if (!overwrite && fs.existsSync(file) && fs.statSync(file).size > 50000) {
    console.log('  ✓ ' + clip.name + ' exists (' + (fs.statSync(file).size / 1e6).toFixed(1) + 'MB), skipping');
    return 'skip';
  }
  const tmp = path.join(CLIPS_DIR, '.tmp-' + clip.name + '.mp4');
  const scaleFlag = quality === '1080p' ? ['--scale=0.75'] : [];
  const args = [
    'remotion', 'render', 'ZoomOut', tmp,
    '--frames=' + clip.startFrame + '-' + clip.endFrame,
    '--codec=h264', '--crf=18', '--x264-preset=fast',
    '--concurrency=' + concurrency,
    '--log=error',
  ].concat(scaleFlag);
  if (overwrite) args.push('--overwrite');
  console.log('  rendering ' + clip.name + ' (' + clip.startFrame + '-' + clip.endFrame + 'f, ' + clip.dur + 's)...');
  const r = spawnSync('npx', args, {cwd: ROOT, stdio: 'inherit'});
  if (r.status !== 0) {
    fs.rmSync(tmp, {force: true});
    console.error('  ✗ ' + clip.name + ' FAILED (exit ' + r.status + ')');
    return 'fail';
  }
  fs.renameSync(tmp, file);
  console.log('  ✓ ' + clip.name + ' done (' + (fs.statSync(file).size / 1e6).toFixed(1) + 'MB)');
  return 'ok';
}

if (!doConcat) {
  console.log('\n[render] ' + clips.length + ' clips, ' + quality + ', concurrency=' + concurrency);
  let ok = 0, skip = 0, fail = 0;
  const t0 = Date.now();
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    console.log('[' + (i + 1) + '/' + clips.length + '] ' + c.label);
    const res = renderClip(c);
    if (res === 'ok') ok++;
    else if (res === 'skip') skip++;
    else fail++;
  }
  console.log('\n[render] ' + ok + ' rendered, ' + skip + ' skipped, ' + fail + ' failed, ' + ((Date.now() - t0) / 1000).toFixed(0) + 's');
  if (fail > 0) process.exit(1);
}

// ---------- concat ----------
// Runs when --concat is passed, or auto-runs after a full render if all clips exist.
(function concatAll() {
  const missing = ALL_CLIPS.filter((c) => !fs.existsSync(path.join(CLIPS_DIR, c.name + '.mp4')));
  if (missing.length) {
    if (doConcat) {
      console.error('[concat] missing ' + missing.length + ' clips: ' + missing.map((c) => c.name).join(', '));
      process.exit(1);
    }
    return; // auto-concat after render: not all clips ready, skip
  }

  console.log('\n[concat] joining ' + ALL_CLIPS.length + ' clips → out/zoom-out.mp4');
  // Sample-accurate concat (same approach as character-silhoutte): each clip's
  // audio is decoded, trimmed to the exact clip duration, and joined. Copying
  // AAC streams directly leaves a small gap/offset at each join (encoder delay),
  // which drifts ~7ms/clip → ~430ms over 61 clips.
  const clipFiles = ALL_CLIPS.map((c) => path.resolve(CLIPS_DIR, c.name + '.mp4'));
  const filterGraph =
    clipFiles.map((_, i) => '[' + (i + 1) + ':a]atrim=duration=' + ALL_CLIPS[i].dur + ',asetpts=PTS-STARTPTS[a' + i + ']').join(';') +
    ';' +
    clipFiles.map((_, i) => '[a' + i + ']').join('') +
    'concat=n=' + clipFiles.length + ':v=0:a=1[aout]';

  const filterFile = path.join(OUT, '.concat-filter.txt');
  fs.writeFileSync(filterFile, filterGraph);
  const listFile = path.join(OUT, '.concat-list.txt');
  fs.writeFileSync(listFile, clipFiles.map((f) => "file '" + f.replace(/\\/g, '/').replace(/'/g, "'\\''") + "'").join('\n') + '\n');

  const finalFile = path.join(OUT, 'zoom-out.mp4');
  const args = ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile];
  clipFiles.forEach((f) => args.push('-i', f));
  args.push('-filter_complex_script', filterFile, '-map', '0:v', '-map', '[aout]');
  args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '384k', '-movflags', '+faststart', finalFile);

  const r = spawnSync('ffmpeg', args, {cwd: ROOT, stdio: 'inherit'});
  if (r.status !== 0) {
    console.error('[concat] ffmpeg failed');
    process.exit(1);
  }
  const sz = fs.statSync(finalFile).size;
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', finalFile], {encoding: 'utf8'});
  console.log('[concat] wrote ' + finalFile + ' (' + (sz / 1e6).toFixed(1) + 'MB, ' + probe.stdout.trim() + 's)');
})();
