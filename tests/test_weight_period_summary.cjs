'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/js/33e-weight-period-summary.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { summarizeWeightPeriodEntries };', context, {filename:'33e-weight-period-summary.js'});
const summarize = context.api.summarizeWeightPeriodEntries;
const entries = [
  {id:'a',when:'2026-11-01T08:00:00.000Z',kg:82.5},
  {id:'b',when:'2026-11-04T08:00:00.000Z',kg:80},
  {id:'c',when:'2026-11-09T08:00:00.000Z',kg:81.5},
];
const before = JSON.stringify(entries);
const result = summarize(entries);
assert.equal(result.first, entries[0]);
assert.equal(result.latest, entries[2]);
assert.equal(result.count, 3);
assert.equal(result.totalKg, 244);
assert.equal(result.changeKg, -1);
assert.equal(result.averageKg, 244/3);
assert.equal(result.lowKg, 80);
assert.equal(result.highKg, 82.5);
const single = summarize([entries[1]]);
assert.equal(single.first, entries[1]);
assert.equal(single.latest, entries[1]);
assert.equal(single.count, 1);
assert.equal(single.changeKg, 0);
assert.equal(single.averageKg, 80);
assert.equal(single.lowKg, 80);
assert.equal(single.highKg, 80);
assert.equal(summarize([]), null);
assert.equal(summarize(null), null);
assert.equal(summarize(undefined), null);
assert.equal(summarize({length:1}), null);
assert.equal(JSON.stringify(entries), before, 'period summary must not mutate source records');
console.log('PASS: pure Weight period summary, first/latest, change, average, extrema, empty input and immutability');
