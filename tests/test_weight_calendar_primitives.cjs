'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

process.env.TZ = 'UTC';
const source = fs.readFileSync('src/app/js/33a-weight-calendar-primitives.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { WEIGHT_PERIOD_MODES, subtractCalendarMonthsClamped, weightPeriodBounds, weightBucketKeyForDay, nextWeightBucketKey, weightBucketDate, weightRollingWindowDays };', context, {filename:'33a-weight-calendar-primitives.js'});
const api = context.api;
const iso = date => date.toISOString();

assert.deepEqual(Array.from(api.WEIGHT_PERIOD_MODES), ['daily','week','month','quarter','halfyear','year']);
assert.equal(iso(api.subtractCalendarMonthsClamped('2024-03-31T15:45:00Z', 1)), '2024-02-29T15:45:00.000Z');
assert.equal(iso(api.subtractCalendarMonthsClamped('2025-03-31T15:45:00Z', 1)), '2025-02-28T15:45:00.000Z');
assert.equal(iso(api.subtractCalendarMonthsClamped('2024-05-31T15:45:00Z', 3)), '2024-02-29T15:45:00.000Z');
assert.equal(iso(api.subtractCalendarMonthsClamped('2024-02-29T15:45:00Z', 12)), '2023-02-28T15:45:00.000Z');

const monthBounds = api.weightPeriodBounds('month', new Date('2024-03-31T15:45:00Z'));
assert.equal(iso(monthBounds.start), '2024-02-29T00:00:00.000Z');
assert.equal(iso(monthBounds.end), '2024-03-31T15:45:00.000Z');
const dailyBounds = api.weightPeriodBounds('daily', new Date('2026-11-19T15:45:00Z'));
assert.equal(iso(dailyBounds.start), '2026-10-21T00:00:00.000Z');
assert.equal(iso(dailyBounds.end), '2026-11-19T15:45:00.000Z');
const weekBounds = api.weightPeriodBounds('week', new Date('2026-11-19T15:45:00Z'));
assert.equal(iso(weekBounds.start), '2026-11-13T00:00:00.000Z');

assert.equal(api.weightBucketKeyForDay('2026-11-19','week'), '2026-11-16');
assert.equal(api.weightBucketKeyForDay('2026-11-15','week'), '2026-11-09');
assert.equal(api.weightBucketKeyForDay('2024-02-29','month'), '2024-02-01');
assert.equal(api.weightBucketKeyForDay('2026-11-19','quarter'), '2026-10-01');
assert.equal(api.weightBucketKeyForDay('2026-11-19','halfyear'), '2026-07-01');
assert.equal(api.weightBucketKeyForDay('2026-11-19','year'), '2026-01-01');
assert.equal(api.weightBucketKeyForDay('invalid','month'), null);

assert.equal(api.nextWeightBucketKey('2026-11-16','week'), '2026-11-23');
assert.equal(api.nextWeightBucketKey('2026-11-01','month'), '2026-12-01');
assert.equal(api.nextWeightBucketKey('2026-10-01','quarter'), '2027-01-01');
assert.equal(api.nextWeightBucketKey('2026-07-01','halfyear'), '2027-01-01');
assert.equal(api.nextWeightBucketKey('2026-01-01','year'), '2027-01-01');
assert.equal(api.nextWeightBucketKey('invalid','month'), null);
assert.equal(iso(api.weightBucketDate('2024-02-29')), '2024-02-29T12:00:00.000Z');
assert.ok(Number.isNaN(api.weightBucketDate('invalid').getTime()));
assert.deepEqual(['week','month','quarter','halfyear','year','daily'].map(api.weightRollingWindowDays), [7,30,90,180,365,0]);

console.log('PASS: isolated weight calendar primitives, month-end clamping, leap years and bucket boundaries');
