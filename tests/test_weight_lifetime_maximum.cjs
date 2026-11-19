'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/js/33i-weight-lifetime-maximum.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { highestValidWeightKg };', context, {filename:'33i-weight-lifetime-maximum.js'});
const highest = context.api.highestValidWeightKg;
const records = [
  {id:'first',kg:82.5}, {id:'lower',kg:79}, {id:'string',kg:'84.2'},
  {id:'zero',kg:0}, {id:'negative',kg:-5}, {id:'nan',kg:'not-a-number'},
  {id:'infinite',kg:Infinity}, {id:'missing'}
];
const before = JSON.stringify(records);
assert.equal(highest(records),84.2);
assert.equal(highest([{kg:71.2},{kg:71.2}]),71.2);
assert.equal(highest([{kg:0},{kg:-1},{kg:'bad'},{kg:Infinity}]),null);
assert.equal(highest([]),null);
assert.equal(highest(null),null);
assert.equal(highest(undefined),null);
assert.equal(highest({length:1}),null);
assert.equal(JSON.stringify(records),before,'lifetime maximum must not mutate source records');
console.log('PASS: pure lifetime Weight maximum, numeric normalization, invalid-value filtering and immutability');
