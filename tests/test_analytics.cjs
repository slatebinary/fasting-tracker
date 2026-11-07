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
  count:3,total:56*3600000,average:(56/3)*3600000,longest:24*3600000,goalCount:2,streak:4
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
console.log('PASS: pure statistics summary and analytics calculations');
