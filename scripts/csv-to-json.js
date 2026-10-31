#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CSV = path.join(ROOT, 'rounds.csv');
const OUT_Q = path.join(ROOT, 'questions.json');
const OUT_ROUNDS = path.join(ROOT, 'src', 'rounds.json');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQ = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQ = true;
    } else if (c === ',') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur);
      if (row.some((x) => x.length)) rows.push(row);
      row = [];
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.length || row.length) {
    row.push(cur);
    if (row.some((x) => x.length)) rows.push(row);
  }
  return rows;
}

const raw = fs.readFileSync(CSV, 'utf8');
const rows = parseCsv(raw);
if (!rows.length) {
  console.error('rounds.csv is empty');
  process.exit(1);
}
const header = rows[0].map((h) => h.trim());
const questions = rows.slice(1).map((cols) => {
  const o = {};
  header.forEach((h, i) => {
    o[h] = (cols[i] || '').trim();
  });
  const words = o.question.split(/\s+/).filter(Boolean);
  const answer = o.answer;
  const hint =
    o.hint || `${answer.length} LETTERS · STARTS WITH ${String(answer.charAt(0) || '').toUpperCase()}`;
  return {
    id: Number(o.id) || 0,
    question: words,
    highlight: Number(o.highlight) || 1,
    answer,
    image: o.image,
    art: o.art,
    pic: o.pic,
    fx: o.fx,
    fy: o.fy,
    z0: Number(o.z0) || 12,
    level: (o.level || '').toLowerCase(),
    hint,
  };
});

const json = JSON.stringify(questions, null, 2) + '\n';
fs.writeFileSync(OUT_Q, json);
fs.mkdirSync(path.dirname(OUT_ROUNDS), {recursive: true});
fs.writeFileSync(OUT_ROUNDS, json);
console.log(`Wrote ${questions.length} rounds → questions.json and src/rounds.json`);
