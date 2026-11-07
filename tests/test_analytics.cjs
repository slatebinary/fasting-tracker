'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync('js/fasting-analytics.js','utf8'), {window,Date,Math,Number,Object,Array,Infinity});
const analytics = window.FTAnalytics;
assert.ok(analytics, 'analytics service must be exposed');

const records = [
  {start:'2026-11-01T00:00:00Z',end:'2026-11-01T12:00:00Z',goal:true},
  {start:'2026-11-02T00:00:00Z',end:'2026-11-02T18:00:00Z',goal:false},
  {start:'2026-11-03T00:00:00Z',end:'2026-11-04T00:00:00Z',goal:true}
];
const summary = analytics.summarizeRecords(records,{
  durationGetter:r=>Date.parse(r.end)-Date.parse(r.start),
  goalGetter:r=>r.goal,
  streak:4
});
assert.deepEqual(JSON.parse(JSON.stringify(summary)),{
  count:3,total:54*3600000,average:18*3600000,longest:24*3600000,goalCount:2,streak:4
});
assert.deepEqual(JSON.parse(JSON.stringify(analytics.summarizeRecords([]))),{
  count:0,total:0,average:0,longest:0,goalCount:0,streak:0
});
assert.deepEqual(JSON.parse(JSON.stringify(analytics.rollingAverage([1,2,3],x=>x,2))),[1,1.5,2.5]);
assert.deepEqual(JSON.parse(JSON.stringify(analytics.cumulative([1,2,3],x=>x))),[1,3,6]);
assert.equal(analytics.relativeChange(120,100),20);
assert.equal(analytics.relativeChange(100,0),null);
assert.equal(analytics.durationBucketKey(24),'24to48');
assert.equal(analytics.startBucketKey(21),'7');
assert.equal(analytics.startBucketKey(24),null);

const monthBuckets=[{key:'2026-01',label:'Jan'},{key:'2026-02',label:'Feb'}];
const dailyTotals=new Map([
  ['2026-01-31',3600000],
  ['2026-02-13',7200000],
  ['2026-02-14',10800000],
  ['2026-02-20',14400000]
]);
const monthly=analytics.aggregateDailyTotalsByPeriod(monthBuckets,dailyTotals,{
  cutoff:Date.parse('2026-02-15T00:00:00Z')
});
// Cutoff retains daily totals within its one-day boundary and later entries;
// January and February 13 are excluded, February 14 and 20 are retained.
assert.deepEqual(JSON.parse(JSON.stringify(monthly)),[
  {key:'2026-01',label:'Jan',totalMs:0,hours:0},
  {key:'2026-02',label:'Feb',totalMs:25200000,hours:7}
]);
assert.deepEqual(JSON.parse(JSON.stringify(monthBuckets)),[
  {key:'2026-01',label:'Jan'},{key:'2026-02',label:'Feb'}
]);
console.log('PASS: pure statistics summary and analytics calculations');
