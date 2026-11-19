'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/js/33c-weight-calendar-aggregation.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { aggregateWeightCalendarBuckets };', context, {filename:'33c-weight-calendar-aggregation.js'});
const aggregate = context.api.aggregateWeightCalendarBuckets;
const entries = [
  {id:'late',when:'2026-11-19T12:00:00.000Z',kg:82},
  {id:'early',when:'2026-11-18T08:00:00.000Z',kg:80},
  {id:'middle',when:'2026-11-19T09:00:00.000Z',kg:78},
  {id:'other',when:'2026-11-20T09:00:00.000Z',kg:85},
  {id:'invalid',when:'2026-11-20T10:00:00.000Z',kg:70}
];
const before = JSON.stringify(entries);
const dayForEntry = entry => entry.id === 'invalid' ? 'invalid' : entry.when.slice(0,10);
const keyForDay = (day, mode) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return mode === 'month' ? day.slice(0,7) : day;
};
const buckets = aggregate(entries,'month',dayForEntry,keyForDay);
assert.deepEqual(Array.from(buckets.keys()), ['2026-11']);
const month = buckets.get('2026-11');
assert.equal(month.key,'2026-11');
assert.equal(month.count,4);
assert.equal(month.sumKg,325);
assert.equal(month.averageKg,81.25);
assert.equal(month.lowKg,78);
assert.equal(month.highKg,85);
assert.equal(month.first.id,'early');
assert.equal(month.latest.id,'other');
const daily = aggregate(entries,'daily',dayForEntry,keyForDay);
assert.deepEqual(Array.from(daily.keys()), ['2026-11-19','2026-11-18','2026-11-20']);
assert.equal(daily.get('2026-11-19').count,2);
assert.equal(daily.get('2026-11-19').first.id,'middle');
assert.equal(daily.get('2026-11-19').latest.id,'late');
assert.equal(aggregate([], 'month', dayForEntry, keyForDay).size,0);
assert.equal(aggregate(entries, 'month', null, keyForDay).size,0);
assert.equal(aggregate(entries, 'month', dayForEntry, null).size,0);
assert.equal(JSON.stringify(entries),before,'aggregation must not mutate source records');
console.log('PASS: isolated Weight calendar-bucket aggregation, averages, extrema, chronology and input immutability');
