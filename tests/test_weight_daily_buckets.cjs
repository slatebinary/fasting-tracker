'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/js/33m-weight-daily-buckets.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { buildWeightDailyBuckets };', context, {filename:'33m-weight-daily-buckets.js'});
const build = context.api.buildWeightDailyBuckets;
const entries = [
  {id:'weight-a',when:'2026-11-18T08:00:00.000Z',kg:81.25},
  {id:'weight-b',when:'2026-11-19T08:00:00.000Z',kg:80.75}
];
const buckets = build(entries, entry => entry.when.slice(0,10));
assert.equal(buckets.length, 2);
assert.deepEqual(buckets.map(bucket => bucket.key), ['entry:weight-a','entry:weight-b']);
for (let i=0;i<entries.length;i++) {
  const bucket=buckets[i], entry=entries[i];
  assert.equal(bucket.count,1);
  assert.equal(bucket.sumKg,entry.kg);
  assert.equal(bucket.averageKg,entry.kg);
  assert.equal(bucket.lowKg,entry.kg);
  assert.equal(bucket.highKg,entry.kg);
  assert.equal(bucket.first,entry);
  assert.equal(bucket.latest,entry);
  assert.equal(bucket.entry,entry);
  assert.equal(bucket.calendarDay,entry.when.slice(0,10));
}
assert.deepEqual(entries.map(entry=>entry.id),['weight-a','weight-b'],'daily bucket construction must not mutate input');
assert.deepEqual(Array.from(build([])),[]);
for(const value of [null,{},'invalid']) assert.deepEqual(Array.from(build(value)),[]);
console.log('PASS: pure daily Weight bucket construction, values, references and input immutability');
