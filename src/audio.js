import React from 'react';
import {Audio, Sequence, staticFile, useVideoConfig} from 'remotion';
import {buildScenes, voManifest} from './timing';

const FILE = {
  swish: 'sounds/swish.wav',
  swishIn: 'sounds/swish-in.wav',
  words: 'sounds/words.wav',
  shutter: 'sounds/shutter.wav',
  zoomOut: 'sounds/riser.wav',
  zoomIntro: 'sounds/zoom-intro.wav',
  tick: 'sounds/tick.wav',
  tickHi: 'sounds/tick-hi.wav',
  hit: 'sounds/hit.wav',
  focus: 'sounds/focus.wav',
  expand: 'sounds/expand.wav',
  sparkle: 'sounds/sparkle.wav',
  chime: 'sounds/chime.wav',
};

export function buildSoundEvents(settings, questions) {
  const {scenes} = buildScenes(settings, questions);
  const ZS = settings.zoomStart;
  const HINT_AT = settings.hintAt;
  const EV = [];
  scenes.forEach((s) => {
    if (s.type !== 'r') EV.push({t: s.start + 0.02, name: 'swish'});
    if (s.type === 'intro' || s.type === 'r' || s.type === 'outro' || s.type === 'bonus') {
      EV.push({t: s.start + s.d - 0.6, name: 'swishIn'});
    }
    if (s.type === 'intro') {
      EV.push({t: s.start + 0.12, name: 'words'});
      EV.push({t: s.start + 0.9, name: 'shutter'});
      EV.push({t: s.start + 0.9, name: 'zoomIntro'});
    }
    if (s.type === 'q') {
      const ZD = s.zd;
      // Use the scene's effective zoomStart (delayed if a qq clip is playing)
      const zStart = s.zoomStart || ZS;
      EV.push({t: s.start + 0.12, name: 'words'});
      EV.push({t: s.start + 0.35, name: 'shutter'});
      EV.push({t: s.start + zStart, name: 'zoomOut'});
      for (let k = 1; k < ZD; k++) {
        EV.push({t: s.start + zStart + k, name: k >= ZD - 3 ? 'tickHi' : 'tick'});
      }
      EV.push({t: s.start + zStart + ZD * HINT_AT, name: 'sparkle'});
      EV.push({t: s.start + zStart + ZD, name: 'focus'});
    }
    if (s.type === 'r') {
      EV.push({t: s.start + 0.05, name: 'expand'});
      EV.push({t: s.start + 0.1, name: 'hit'});
      EV.push({t: s.start + 0.45, name: 'sparkle'});
    }
    if (s.type === 'bonus') {
      const B = settings.bonus || {};
      const clock = B.clock != null ? B.clock : 8;
      const cs = s.clockStart != null ? s.clockStart : 1.6;
      const revealAt = s.start + cs + clock;
      // pre-roll banner
      EV.push({t: s.start + 0.12, name: 'words'});
      EV.push({t: s.start + 0.55, name: 'hit'});
      // clock start + per-second ticks (high ticks on the last 3)
      EV.push({t: s.start + cs, name: 'focus'});
      for (let k = 1; k < clock; k++) {
        EV.push({t: s.start + cs + k, name: k >= clock - 3 ? 'tickHi' : 'tick'});
      }
      // reveal
      EV.push({t: revealAt + 0.05, name: 'expand'});
      EV.push({t: revealAt + 0.1, name: 'hit'});
      EV.push({t: revealAt + 0.45, name: 'sparkle'});
    }
    if (s.type === 'sting') EV.push({t: s.start + 0.15, name: 'chime'});
  });
  return EV;
}

/**
 * Final mastered mix: public/sounds/master.mp3, built by `npm run master`
 * (scripts/master-audio.js). It contains the voiceover (compressed + presence EQ),
 * the music bed sidechain-ducked ~10 dB under the voice, the SFX cues lightly ducked,
 * all normalised to -14 LUFS / -1.5 dBTP. One track, so there is no gain-staging
 * or clipping risk inside Remotion's own mixer.
 *
 * The raw stems (voiceover.wav, background.mp3, sfx.mp3) stay in public/sounds as
 * the source for re-mastering — see QuizAudioStems below.
 */
export function QuizAudio() {
  return <Audio src={staticFile('sounds/master.mp3')} />;
}

/** Unmastered stems, kept for A/B comparison. Not used by the composition. */
export function QuizAudioStems() {
  return (
    <>
      <Audio src={staticFile('sounds/voiceover.wav')} />
      <Audio src={staticFile('sounds/background.mp3')} />
      <Audio src={staticFile('sounds/sfx.mp3')} />
    </>
  );
}

/** Layered alternative — same cue list as the HTML `EV` array. */
export function QuizAudioLayered({settings, questions}) {
  const {fps} = useVideoConfig();
  const events = buildSoundEvents(settings, questions);
  return (
    <>
      <Audio src={staticFile('sounds/voiceover.wav')} />
      <Audio src={staticFile('sounds/background.mp3')} />
      {events.map((e, i) => {
        const from = Math.max(0, Math.round(e.t * fps));
        const src = FILE[e.name];
        if (!src) return null;
        return (
          <Sequence key={`${e.name}-${i}-${from}`} from={from} layout="none">
            <Audio src={staticFile(src)} />
          </Sequence>
        );
      })}
    </>
  );
}

/**
 * Per-clip voiceover (ported from Guess the Word).
 *
 * Reads src/voiceover-manifest.json (written by scripts/voiceover-scan.js) and
 * mounts each clip as a <Sequence><Audio/></Sequence> at its scene's start frame:
 *   - qq## : plays at the START of question scene i (before the zoom/timer)
 *   - q##  : plays at the START of reveal scene i (at the reveal moment)
 *   - intro/outro/sting : plays at the start of those scenes
 *
 * plan.cjs already stretched every scene to fit its clip, so each clip has room
 * to finish before the next scene begins. Missing clips are simply skipped.
 */
export function QuizVoiceover({settings, questions}) {
  const {fps} = useVideoConfig();
  const {scenes} = buildScenes(settings, questions);
  const VO_DIR = (settings.voiceover && settings.voiceover.dir) || 'voiceover';
  const VO_ENABLED = settings.voiceover ? settings.voiceover.enabled : false;
  if (!VO_ENABLED || !voManifest) return null;

  const clips = [];

  scenes.forEach((s) => {
    const startFrame = Math.round(s.start * fps);
    if (s.type === 'intro' && voManifest.intro) {
      clips.push({file: voManifest.intro.file, from: startFrame});
    }
    if (s.type === 'outro' && voManifest.outro) {
      clips.push({file: voManifest.outro.file, from: startFrame});
    }
    if (s.type === 'sting' && voManifest.sting) {
      clips.push({file: voManifest.sting.file, from: startFrame});
    }
    if (s.type === 'q') {
      const qq = voManifest.qq && voManifest.qq[String(s.i + 1)];
      if (qq) clips.push({file: qq.file, from: startFrame});
    }
    if (s.type === 'r') {
      const q = voManifest.q && voManifest.q[String(s.i + 1)];
      if (q) clips.push({file: q.file, from: startFrame});
    }
    if (s.type === 'bonus') {
      const n = String(s.bonusIndex + 1);
      const bq = voManifest.bonusq && voManifest.bonusq[n];
      if (bq) clips.push({file: bq.file, from: startFrame});
      const ba = voManifest.bonus && voManifest.bonus[n];
      if (ba) {
        const B = settings.bonus || {};
        const clock = B.clock != null ? B.clock : 8;
        const cs = s.clockStart != null ? s.clockStart : 1.6;
        clips.push({file: ba.file, from: startFrame + Math.round((cs + clock) * fps)});
      }
    }
  });

  return (
    <>
      {clips.map((c, i) => (
        <Sequence key={`vo-${i}-${c.from}`} from={c.from} layout="none">
          <Audio src={staticFile(`${VO_DIR}/${c.file}`)} />
        </Sequence>
      ))}
    </>
  );
}
