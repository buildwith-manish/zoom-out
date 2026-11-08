#!/usr/bin/env node
/**
 * scripts/voiceover-script.js
 * ---------------------------------------------------------------------------
 * Prints the voiceover lines to record, one per clip, with the file name to
 * save each clip as. This is just a reference for the voice talent — the actual
 * timing is dynamic (plan.cjs stretches each scene to fit its clip).
 *
 *   npm run voiceover:script
 *
 * Output: voiceover-script.txt
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const questions = JSON.parse(fs.readFileSync(path.join(ROOT, 'questions.json'), 'utf8'));
const settings = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings.json'), 'utf8'));

const lines = [];

lines.push('VOICEOVER SCRIPT  (save each clip in public/voiceover/ with the file name shown)');
lines.push('');
lines.push('=== INTRO ===');
lines.push(`intro.wav   ${settings.introHeadline ? settings.introHeadline.join(' ') : 'Only 1 in 20 can name all 50'} ${settings.introSub || ''}`);
lines.push('');

lines.push('=== QUESTIONS ===');
questions.forEach((q, i) => {
  const n = String(i + 1).padStart(2, '0');
  // Question-phase clip: the prompt that plays BEFORE the zoom/timer starts
  lines.push(`qq${n}.wav   ${q.question.join(' ')}  [${q.level.toUpperCase()}]`);
  // Reveal clip: the answer that plays AT the reveal moment
  lines.push(`q${n}.wav    ${q.answer}!`);
});
lines.push('');

lines.push('=== OUTRO ===');
lines.push(`outro.wav   ${settings.outroSub || 'Drop your score below'}`);
lines.push('');

lines.push('=== STING ===');
lines.push(`sting.wav   ${settings.stingWords ? settings.stingWords.join(' ') : 'QUIZ MATRIX'}`);
lines.push('');

lines.push('---');
lines.push('Naming convention:');
lines.push('  qq01.wav ... qq50.wav  = question-phase clips (plays before the zoom/timer)');
lines.push('  q01.wav  ... q50.wav   = reveal clips (plays at the reveal moment)');
lines.push('  intro.wav, outro.wav, sting.wav = intro/outro/sting clips');
lines.push('  (.mp3 .wav .m4a .aac .ogg .flac all work)');
lines.push('');
lines.push('After recording, run:');
lines.push('  npm run voiceover    # scan clips + build src/voiceover-manifest.json');
lines.push('  The video timeline auto-stretches to fit each clip.');

const out = path.join(ROOT, 'voiceover-script.txt');
fs.writeFileSync(out, lines.join('\n'));
console.log(lines.slice(0, 15).join('\n'));
console.log('  ...');
console.log('  full script: ' + path.relative(ROOT, out));
