'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/js/33d-weight-rolling-series.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\\nthis.api = { buildWeightRollingAverageBuckets };', context, {filename:'33d-weight-rolling-series.js'});
const build = context.api.buildWeightRollingAverageBuckets;
const records = [
  {id:'third',when:'2026-11-10T09:00:00.000Z',kg:78},
  {id:'first',when:'2026-11-01T09:00:00.000Z',kg:80},
  {id:'second',when:'2026-11-03T09:00:00.000Z',kg:82},
];
const before = JSON.stringify(records);
const dayForEntry = entry => entry.when.slice(0,10);
const keyForDay = day => day.slice(0,7);
const calendarBuckets = new Map([['2026-11',{key:'2026-11',count:3}]]);
const result = build(records,'month',calendarBuckets,dayForEntry,keyForDay,7,'2026-11-12');
assert.equal(result.length,12);
assert.deepEqual(Array.from(result,point=>point.calendarDay),[
  '2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06',
  '2026-11-07','2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12'
]);
assert.equal(result[0].count,1);
assert.equal(result[0].averageKg,80);
assert.equal(result[2].count,2);
assert.equal(result[2].averageKg,81);
assert.equal(result[7].count,1);
assert.equal(result[7].averageKg,82);
assert.equal(result[9].count,2);
assert.equal(result[9].averageKg,80);
assert.equal(result[11].count,1);
assert.equal(result[11].averageKg,78);
assert.equal(result[11].lowKg,78);
assert.equal(result[11].highKg,78);
assert.equal(result[11].first.id,'third');
assert.equal(result[11].latest.id,'third');
assert.equal(result[11].calendarBucket,calendarBuckets.get('2026-11'));
assert.equal(result[0].key,'rolling:month:2026-11-01');
assert.equal(result[0].windowStartDay,'2026-10-26');
assert.equal(result[11].windowEndDay,'2026-11-12');
assert.deepEqual(build([], 'month', calendarBuckets, dayForEntry, keyForDay, 7, '2026-11-12'), []);
assert.deepEqual(build(records, 'month', calendarBuckets, () => 'invalid', keyForDay, 7, '2026-11-12'), []);
assert.deepEqual(build(records, 'month', calendarBuckets, dayForEntry, keyForDay, 0, '2026-11-12'), []);
assert.deepEqual(build(records, 'month', calendarBuckets, dayForEntry, keyForDay, 7, 'invalid').map(x=>x.calendarDay), ['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08','2026-11-09','2026-11-10']);
assert.equal(JSON.stringify(records),before,'rolling aggregation must not mutate source records');
console.log('PASS: isolated rolling Weight series, trailing-window continuity, extrema, calendar context, empty input and immutability');
