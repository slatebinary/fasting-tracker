'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/js/33b-weight-period-filter.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { weightEntriesWithinBounds };', context, {filename:'33b-weight-period-filter.js'});
const filter = context.api.weightEntriesWithinBounds;
const records = [
  {id:'a',when:'2026-11-17T23:59:59.999Z'},
  {id:'b',when:'2026-11-18T00:00:00.000Z'},
  {id:'c',when:'2026-11-18T12:00:00.000Z'},
  {id:'d',when:'2026-11-19T00:00:00.000Z'},
  {id:'e',when:'2026-11-19T00:00:00.001Z'},
];
const start = new Date('2026-11-18T00:00:00.000Z');
const end = new Date('2026-11-19T00:00:00.000Z');
assert.deepEqual(Array.from(filter(records,start,end),x=>x.id), ['b','c','d']);
assert.deepEqual(Array.from(filter(records,new Date('2026-11-18T12:00:00Z'),new Date('2026-11-18T12:00:00Z')),x=>x.id), ['c']);
assert.deepEqual(Array.from(filter(records,new Date('2026-11-20T00:00:00Z'),new Date('2026-11-21T00:00:00Z'))), []);
assert.deepEqual(Array.from(filter(records,new Date('2026-11-20T00:00:00Z'),new Date('2026-11-19T00:00:00Z'))), []);
assert.deepEqual(Array.from(filter(records,new Date(NaN),end)), []);
assert.deepEqual(Array.from(filter([],start,end)), []);
assert.deepEqual(Array.from(filter(null,start,end)), []);
assert.deepEqual(records.map(x=>x.id), ['a','b','c','d','e']);
console.log('PASS: isolated inclusive weight-record period filtering and boundary handling');
