export function questionDuration(settings) {
  return settings.zoomStart + settings.zoomDuration + settings.hold;
}

export function buildScenes(settings, questions) {
  const qDur = questionDuration(settings);
  const scenes = [{type: 'intro', i: -1, d: settings.introDuration, label: 'Intro'}];
  let prevLevel = null;
  // Optional per-clip duration overrides (data-driven, so a single clip can be
  // lengthened/shortened without touching every clip of that type). Keys:
  //   levelDurationOverrides  -> { "<level>": <seconds> }   e.g. {"hard": 3.0}
  //   revealDurationOverrides -> { "<Q-number>": <seconds> } e.g. {"35": 2.5}  (1-indexed)
  // When absent for a clip, the global levelDuration / revealDuration is used.
  const lvlOver = settings.levelDurationOverrides || {};
  const revOver = settings.revealDurationOverrides || {};
  questions.forEach((q, i) => {
    if (settings.levelCards !== false && settings.levelDuration > 0 && q.level && q.level !== prevLevel) {
      const d = lvlOver[q.level] != null ? lvlOver[q.level] : settings.levelDuration;
      scenes.push({type: 'level', i, level: q.level, d, label: 'Level ' + q.level});
      prevLevel = q.level;
    }
    scenes.push({type: 'q', i, d: qDur, label: 'Q' + (i + 1)});
    const rd = revOver[String(i + 1)] != null ? revOver[String(i + 1)] : settings.revealDuration;
    scenes.push({type: 'r', i, d: rd, label: 'A' + (i + 1)});
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

export function levelInfo(questions, level) {
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
