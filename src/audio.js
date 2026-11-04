import React from 'react';
import {Audio, Sequence, staticFile, useVideoConfig} from 'remotion';
import {buildScenes} from './timing';

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
    if (s.type === 'intro' || s.type === 'r' || s.type === 'outro') {
      EV.push({t: s.start + s.d - 0.6, name: 'swishIn'});
    }
    if (s.type === 'intro') {
      EV.push({t: s.start + 0.12, name: 'words'});
      EV.push({t: s.start + 0.9, name: 'shutter'});
      EV.push({t: s.start + 0.9, name: 'zoomIntro'});
    }
    if (s.type === 'q') {
      const ZD = s.zd;
      EV.push({t: s.start + 0.12, name: 'words'});
      EV.push({t: s.start + 0.35, name: 'shutter'});
      EV.push({t: s.start + ZS, name: 'zoomOut'});
      for (let k = 1; k < ZD; k++) {
        EV.push({t: s.start + ZS + k, name: k >= ZD - 3 ? 'tickHi' : 'tick'});
      }
      EV.push({t: s.start + ZS + ZD * HINT_AT, name: 'sparkle'});
      EV.push({t: s.start + ZS + ZD, name: 'focus'});
    }
    if (s.type === 'r') {
      EV.push({t: s.start + 0.05, name: 'expand'});
      EV.push({t: s.start + 0.1, name: 'hit'});
      EV.push({t: s.start + 0.45, name: 'sparkle'});
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
