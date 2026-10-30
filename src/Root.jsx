import React from 'react';
import {Composition} from 'remotion';
import {Round} from './Round';
import {getTotalFrames} from './timing';
import questions from '../questions.json';
import settings from '../settings.json';

export const RemotionRoot = () => {
  const durationInFrames = getTotalFrames(settings, questions);
  return (
    <>
      <Composition
        id="ZoomOut"
        component={Round}
        durationInFrames={durationInFrames}
        fps={settings.fps}
        width={settings.width}
        height={settings.height}
        defaultProps={{questions, settings}}
      />
    </>
  );
};
