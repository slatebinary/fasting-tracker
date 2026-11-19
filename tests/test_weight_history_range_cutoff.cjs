'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const source = fs.readFileSync('src/app/js/33k-weight-history-range-cutoff.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { resolveWeightHistoryRangeCutoff };', context, {filename:'33k-weight-history-range-cutoff.js'});
const cutoff = context.api.resolveWeightHistoryRangeCutoff;
const timestamp = value => new Date(value).getTime();

assert.equal(cutoff('month', new Date('2024-03-31T15:45:00.000Z')), timestamp('2024-02-29T00:00:00.000Z'));
assert.equal(cutoff('halfyear', new Date('2024-03-31T15:45:00.000Z')), timestamp('2023-09-30T00:00:00.000Z'));
assert.equal(cutoff('year', new Date('2024-03-31T15:45:00.000Z')), timestamp('2023-03-31T00:00:00.000Z'));
assert.equal(cutoff('month', new Date('2025-01-31T18:30:00.000Z')), timestamp('2024-12-31T00:00:00.000Z'));
assert.equal(cutoff('month', new Date('2025-03-30T18:30:00.000Z')), timestamp('2025-02-28T00:00:00.000Z'));
assert.equal(cutoff('month', new Date('2024-03-30T18:30:00.000Z')), timestamp('2024-02-29T00:00:00.000Z'));
assert.equal(cutoff('unknown', new Date('2026-11-19T15:45:00.000Z')), null);
assert.equal(cutoff(null, new Date('2026-11-19T15:45:00.000Z')), null);
assert.ok(Number.isNaN(cutoff('month', new Date(NaN))));
const input = new Date('2024-03-31T15:45:00.000Z');
const before = input.getTime();
cutoff('month', input);
assert.equal(input.getTime(), before, 'cutoff calculation must not mutate its input date');
console.log('PASS: pure Weight History range cutoffs, leap/month-end clamping, year rollover, invalid ranges and input immutability');
