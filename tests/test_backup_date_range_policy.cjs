'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/js/43v-backup-date-range-policy.js', 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source + '\nthis.resolve = resolveBackupDateRangePolicy;', context);
const resolve = context.resolve;
const parseDate = value => {
  if (value == null || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const candidate = {
  records:[{id:'f1',start:'2026-11-10T10:00:00Z',end:'2026-11-10T22:00:00Z'}],
  deletedFasts:[{id:'df1',start:'2026-10-01T08:00:00Z',end:'2026-10-02T08:00:00Z'}],
  weights:[{id:'w1',when:'2026-09-15T07:30:00Z'},{id:'w2',when:'2026-11-20T07:30:00Z'}],
  deletedWeights:[{id:'dw1',when:'2026-08-05T06:00:00Z'}]
};
const before = JSON.stringify(candidate);
const range = resolve(candidate, parseDate);
assert.deepEqual(range.map(d => d.toISOString()), ['2026-08-05T06:00:00.000Z','2026-11-20T07:30:00.000Z'],
  'all live/deleted fasting and weight dates must contribute to the range');
assert.equal(JSON.stringify(candidate), before, 'date-range selection must not mutate its input');
assert.deepEqual(resolve({records:[{start:'invalid',end:null}],deletedFasts:[],weights:[],deletedWeights:[]},parseDate), null,
  'invalid-only candidates must produce no range');
assert.deepEqual(resolve({records:[],deletedFasts:[],weights:[],deletedWeights:[]},parseDate), null,
  'empty candidates must produce no range');
assert.deepEqual(resolve({weights:[{when:'2026-11-21T00:00:00Z'}]},parseDate).map(d=>d.toISOString()),
  ['2026-11-21T00:00:00.000Z','2026-11-21T00:00:00.000Z'], 'a single valid date must be both bounds');
assert.equal(resolve(null,parseDate), null);
assert.equal(resolve(candidate,null), null);
console.log('PASS: import backup date-range policy includes all record categories and preserves input');
