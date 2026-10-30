export function questionDuration(settings) {
  return settings.zoomStart + settings.zoomDuration + settings.hold;
}

export function buildScenes(settings, questions) {
  const qDur = questionDuration(settings);
  const scenes = [{type: 'intro', i: -1, d: settings.introDuration, label: 'Intro'}];
  questions.forEach((_, i) => {
    scenes.push({type: 'q', i, d: qDur, label: 'Q' + (i + 1)});
    scenes.push({type: 'r', i, d: settings.revealDuration, label: 'A' + (i + 1)});
  });
  scenes.push({type: 'outro', i: -1, d: settings.outroDuration, label: 'Score'});
  scenes.push({type: 'sting', i: -1, d: settings.stingDuration, label: 'Sting'});
  let acc = 0;
  scenes.forEach((s) => {
    s.start = acc;
    acc += s.d;
  });
  return {scenes, total: acc};
}

export function sceneAt(t, scenes) {
  for (let k = scenes.length - 1; k >= 0; k--) {
    if (t >= scenes[k].start) return k;
  }
  return 0;
}

export function getTotalSeconds(settings, questions) {
  return buildScenes(settings, questions).total;
}

export function getTotalFrames(settings, questions) {
  const total = getTotalSeconds(settings, questions);
  return Math.round(total * settings.fps);
}
