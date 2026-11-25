#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/js/19z-stop-riddle-bank.js', 'utf8');
const sandbox = {};
vm.runInNewContext(source + '\nglobalThis.__bank = STOP_ACTIVITY_PUZZLES;', sandbox, { timeout: 2000 });
const bank = sandbox.__bank;
assert.equal(bank.length, 1000, 'the riddle bank must contain exactly 1,000 entries');
assert.equal(new Set(bank.map(item => item.id)).size, 1000, 'riddle IDs must be unique');
const ids = Array.from(bank, item => item.id).sort((a,b) => a-b);
assert.deepEqual(ids, Array.from({length:1000}, (_,i) => i+1));
for (const language of ['en','bg','es']) {
  const questions = bank.map(item => item[language]?.[0]);
  assert.ok(questions.every(question => typeof question === 'string' && question.trim()), language + ' questions must all be present');
  assert.ok(bank.every(item => typeof item[language]?.[1] === 'string' && item[language][1].trim()), language + ' answers must all be present');
  assert.equal(new Set(questions).size, 1000, language + ' questions must be unique');
}
console.log('PASS: 1,000 unique riddles with questions and answers in English, Bulgarian and Spanish');
