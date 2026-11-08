/**
 * Scene plan (single source of truth). CommonJS on purpose: the Remotion bundle (src/timing.js re-exports it)
 * AND the node scripts (synth-audio, render-batches) read exactly the same timeline.
 *
 * Voiceover support (ported from Guess the Word):
 *   - public/voiceover/qq01.wav ... qq50.wav  plays BEFORE the zoom/timer of each question
 *   - public/voiceover/q01.wav   ... q50.wav   plays AT the reveal moment
 *   - public/voiceover/intro.wav, outro.wav, sting.wav  play during those scenes
 *   - src/voiceover-manifest.json (written by scripts/voiceover-scan.js) holds each clip's duration
 *   - plan.cjs stretches every scene to fit its clip, so nothing is ever cut off
 *   - audio.js mounts each clip as a <Sequence><Audio/></Sequence> at the scene's start frame
 *
 * The key timing rule (matching Guess the Word):
 *   Question scene: [qq clip plays] → [zoom/timer starts] → [hold]
 *     questionDuration = max(zoomStart, qqClipDuration + offset) + zoomDuration + hold
 *   Reveal scene: [reveal + q clip play simultaneously]
 *     revealDuration = max(defaultRevealDuration, qClipDuration + offset + tail)
 */
// Read the voiceover manifest. Use require() for the JSON so it works both in
// Node (scripts) and in Remotion's webpack bundle (browser). The try/catch
// handles the case where the manifest hasn't been generated yet.
let voManifest = { q: {}, qq: {}, intro: null, outro: null, sting: null };
try {
  voManifest = require('./voiceover-manifest.json');
} catch (e) {
  // manifest not built yet — no voiceover, everything runs at default durations
}

const VO_SETTINGS = require('../settings.json');
const VO = VO_SETTINGS.voiceover || { offset: 0.15, tail: 0.3, enabled: false };

/** Duration (seconds) of a numbered voiceover clip, or 0 if missing. */
function voSeconds(kind, n) {
  const e = voManifest[kind] && voManifest[kind][String(n)];
  return e ? e.seconds : 0;
}

/** Duration (seconds) of a named voiceover clip (intro/outro/sting), or 0 if missing. */
function voNamedSeconds(kind) {
  const e = voManifest[kind];
  return e ? e.seconds : 0;
}

/** Zoom length for one question: per-level value from settings.retention.zoomByLevel, else the global zoomDuration. */
function zoomFor(settings, q) {
  const byLevel = (settings.retention && settings.retention.zoomByLevel) || {};
  return q && q.level && byLevel[q.level] != null ? byLevel[q.level] : settings.zoomDuration;
}

/**
 * Question scene duration.
 *
 * Without voiceover: zoomStart + zoomDuration + hold
 *   (zoomStart = the pause before the zoom begins; zoomDuration = the zoom + timer; hold = locked hold)
 *
 * With a qq## clip: the clip plays FIRST, then the zoom/timer starts.
 *   The zoomStart is stretched to fit the clip: max(zoomStart, qqClip + offset)
 *   So: max(zoomStart, qqClip + offset) + zoomDuration + hold
 */
function questionDuration(settings, zd, questionIndex) {
  const qqDur = voSeconds('qq', questionIndex + 1);
  const zoomStart = qqDur > 0
    ? Math.max(settings.zoomStart, qqDur + VO.offset)
    : settings.zoomStart;
  return zoomStart + (zd != null ? zd : settings.zoomDuration) + settings.hold;
}

/**
 * The effective zoomStart for a question (when the zoom/timer actually begins).
 * With a qq clip, this is delayed until the clip finishes.
 */
function effectiveZoomStart(settings, questionIndex) {
  const qqDur = voSeconds('qq', questionIndex + 1);
  return qqDur > 0
    ? Math.max(settings.zoomStart, qqDur + VO.offset)
    : settings.zoomStart;
}

function buildScenes(settings, questions) {
  const scenes = [{type: 'intro', i: -1, d: introDuration(settings), label: 'Intro'}];
  let prevLevel = null;
  const lvlOver = settings.levelDurationOverrides || {};
  const revOver = settings.revealDurationOverrides || {};
  questions.forEach((q, i) => {
    if (settings.levelCards !== false && settings.levelDuration > 0 && q.level && q.level !== prevLevel) {
      const d = lvlOver[q.level] != null ? lvlOver[q.level] : settings.levelDuration;
      scenes.push({type: 'level', i, level: q.level, d, label: 'Level ' + q.level});
      prevLevel = q.level;
    }
    const zd = zoomFor(settings, q);
    const qd = questionDuration(settings, zd, i);
    const zStart = effectiveZoomStart(settings, i);
    scenes.push({type: 'q', i, level: q.level, zd, d: qd, zoomStart: zStart, label: 'Q' + (i + 1)});
    const rd = revealDuration(settings, i, revOver);
    scenes.push({type: 'r', i, level: q.level, d: rd, label: 'A' + (i + 1)});
  });
  scenes.push({type: 'outro', i: -1, d: outroDuration(settings), label: 'Score'});
  scenes.push({type: 'sting', i: -1, d: stingDuration(settings), label: 'Sting'});
  let acc = 0;
  scenes.forEach((s) => {
    s.start = acc;
    acc += s.d;
  });
  return {scenes, total: acc};
}

/** Intro duration: stretched to fit the intro voiceover clip if one exists. */
function introDuration(settings) {
  const clipDur = voNamedSeconds('intro');
  if (clipDur <= 0) return settings.introDuration;
  return Math.max(settings.introDuration, clipDur + VO.offset + VO.tail);
}

/** Outro duration: stretched to fit the outro voiceover clip if one exists. */
function outroDuration(settings) {
  const clipDur = voNamedSeconds('outro');
  if (clipDur <= 0) return settings.outroDuration;
  return Math.max(settings.outroDuration, clipDur + VO.offset + VO.tail);
}

/** Sting duration: stretched to fit the sting voiceover clip if one exists. */
function stingDuration(settings) {
  const clipDur = voNamedSeconds('sting');
  if (clipDur <= 0) return settings.stingDuration;
  return Math.max(settings.stingDuration, clipDur + VO.offset + VO.tail);
}

/**
 * Reveal duration: stretched to fit the q## voiceover clip if one exists.
 * The clip plays at the reveal moment (start of the reveal scene).
 */
function revealDuration(settings, questionIndex, revOver) {
  const base = revOver[String(questionIndex + 1)] != null ? revOver[String(questionIndex + 1)] : settings.revealDuration;
  const clipDur = voSeconds('q', questionIndex + 1);
  if (clipDur <= 0) return base;
  return Math.max(base, clipDur + VO.offset + VO.tail);
}

function sceneAt(t, scenes) {
  for (let k = scenes.length - 1; k >= 0; k--) {
    if (t >= scenes[k].start) return k;
  }
  return 0;
}

function getTotalSeconds(settings, questions) {
  return buildScenes(settings, questions).total;
}

function getTotalFrames(settings, questions) {
  const total = getTotalSeconds(settings, questions);
  return Math.round(total * settings.fps);
}

function levelInfo(questions, level) {
  const order = [];
  questions.forEach((q) => {
    if (q.level && !order.includes(q.level)) order.push(q.level);
  });
  const idx = questions.map((q, i) => (q.level === level ? i : -1)).filter((i) => i >= 0);
  return {
    ord: order.indexOf(level) + 1,
    total: order.length,
    count: idx.length,
    first: idx[0] + 1,
    last: idx[idx.length - 1] + 1,
    order,
  };
}

module.exports = {
  zoomFor,
  questionDuration,
  effectiveZoomStart,
  revealDuration,
  introDuration,
  outroDuration,
  stingDuration,
  buildScenes,
  sceneAt,
  getTotalSeconds,
  getTotalFrames,
  levelInfo,
  voManifest,
};
