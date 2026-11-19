'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/js/33j-weight-period-date-range-label.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { formatWeightPeriodDateRange };', context, {filename:'33j-weight-period-date-range-label.js'});
const format = context.api.formatWeightPeriodDateRange;

const start = new Date('2026-11-01T12:00:00.000Z');
const end = new Date('2026-11-19T12:00:00.000Z');
assert.equal(format(start, end, 'en-GB'), '1 Nov 2026 – 19 Nov 2026');
assert.equal(format(start, end, 'en-US'), 'Nov 1, 2026 – Nov 19, 2026');
assert.equal(format(start, start, 'en-GB'), '1 Nov 2026 – 1 Nov 2026');
assert.equal(format(new Date('2024-02-29T12:00:00.000Z'), new Date('2024-03-01T12:00:00.000Z'), 'en-GB'), '29 Feb 2024 – 1 Mar 2024');
assert.throws(() => format(new Date(NaN), end, 'en-GB'), error => error && error.name === 'RangeError');
assert.throws(() => format(start, end, 'not-a-locale'), error => error && error.name === 'RangeError');
console.log('PASS: pure locale-aware Weight period date-range formatting, same-day and leap-day ranges, invalid dates and locales');
