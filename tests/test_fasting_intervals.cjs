'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/js/43a-fasting-intervals.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { buildFastingIntervals };', context, {filename:'43a-fasting-intervals.js'});
const build = context.api.buildFastingIntervals;
const sanitizeGoal = (value, fallback) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 && number <= 120
    ? Math.round(number * 1000) / 1000
    : fallback;
};
const base = Date.parse('2026-11-20T00:00:00.000Z');
const records = [
  {id:'later',start:'2026-11-18T10:00:00.000Z',end:'2026-11-18T20:00:00.000Z',goalHours:18},
  {id:'earlier',start:'2026-11-17T08:00:00.000Z',end:'2026-11-17T16:00:00.000Z',goalHours:'16.5'},
  {id:'outside-before',start:'2026-11-15T00:00:00.000Z',end:'2026-11-16T00:00:00.000Z'},
  {id:'outside-after',start:'2026-11-21T00:00:00.000Z',end:'2026-11-21T12:00:00.000Z'},
  {id:'invalid',start:'not-a-date',end:'2026-11-19T12:00:00.000Z'},
  {id:'non-positive',start:'2026-11-19T12:00:00.000Z',end:'2026-11-19T12:00:00.000Z'}
];
const before = JSON.stringify(records);
const all = build({records,activeStart:'2026-11-19T10:00:00.000Z',activeGoalHours:20,defaultGoalHours:16,nowMs:base,sanitizeGoal});
assert.deepEqual(Array.from(all, item => [item.start,item.end,item.goalHours,item.active]), [
  [Date.parse('2026-11-17T08:00:00.000Z'),Date.parse('2026-11-17T16:00:00.000Z'),16.5,false],
  [Date.parse('2026-11-18T10:00:00.000Z'),Date.parse('2026-11-18T20:00:00.000Z'),18,false],
  [Date.parse('2026-11-19T10:00:00.000Z'),base,20,true]
]);
assert.equal(all[0].sourceStart, all[0].start);
assert.equal(all[0].sourceEnd, all[0].end);
assert.equal(all[2].sourceStart, all[2].start);
assert.equal(all[2].sourceEnd, all[2].end);
assert.deepEqual(JSON.parse(JSON.stringify(records)),JSON.parse(before),'interval construction must not mutate source records');

const bounded = build({
  records,
  defaultGoalHours:16,
  rangeStart:Date.parse('2026-11-18T20:00:00.000Z'),
  rangeEnd:Date.parse('2026-11-19T11:00:00.000Z'),
  nowMs:base,
  sanitizeGoal
});
assert.deepEqual(Array.from(bounded, item => item.start),[Date.parse('2026-11-19T10:00:00.000Z')]);
assert.deepEqual(Array.from(build({records:null,defaultGoalHours:16,nowMs:base,sanitizeGoal})),[]);
assert.deepEqual(Array.from(build({records,defaultGoalHours:16,nowMs:base})),[],'missing sanitizer must fail safely');
assert.deepEqual(
  Array.from(build({records,activeStart:'2026-11-19T10:00:00.000Z',activeGoalHours:20,defaultGoalHours:16,nowMs:NaN,sanitizeGoal}),
    item => [item.start,item.end,item.goalHours,item.active]),
  [
    [Date.parse('2026-11-17T08:00:00.000Z'),Date.parse('2026-11-17T16:00:00.000Z'),16.5,false],
    [Date.parse('2026-11-18T10:00:00.000Z'),Date.parse('2026-11-18T20:00:00.000Z'),18,false]
  ]
);
console.log('PASS: pure fasting interval construction, range boundaries, active interval, ordering and immutability');
