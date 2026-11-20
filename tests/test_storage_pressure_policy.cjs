'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/js/43r-storage-pressure-policy.js', 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source + '\nthis.resolve = resolveStoragePressurePolicy;', context);
const resolve = context.resolve;
const ratioLimit = 0.80;
const freeLimit = 50 * 1024 * 1024;
for (const estimate of [null, undefined, {}, {usage:NaN,quota:100}, {usage:1,quota:Infinity}, {usage:1,quota:0}, {usage:1,quota:-1}]) {
  assert.deepEqual(JSON.parse(JSON.stringify(resolve(estimate, ratioLimit, freeLimit))), {known:false,warning:false,ratio:null,free:null});
}
let result = resolve({usage:79,quota:100}, ratioLimit, 0);
assert.equal(result.known, true); assert.equal(result.warning, false); assert.equal(result.ratio, 0.79); assert.equal(result.free, 21);
result = resolve({usage:80,quota:100}, ratioLimit, 0);
assert.equal(result.warning, true, 'the quota-ratio threshold is inclusive');
result = resolve({usage:100-freeLimit,quota:100}, 2, freeLimit);
assert.equal(result.warning, false, 'exactly the free-space threshold is not below the threshold');
result = resolve({usage:100-freeLimit+1,quota:100}, 2, freeLimit);
assert.equal(result.warning, true, 'free space below the threshold warns');
result = resolve({usage:120,quota:100}, ratioLimit, freeLimit);
assert.deepEqual(JSON.parse(JSON.stringify(result)), {known:true,warning:true,ratio:1.2,free:0});
const estimate = Object.freeze({usage:40,quota:100});
assert.equal(resolve(estimate, ratioLimit, 0).warning, false);
assert.deepEqual(estimate, {usage:40,quota:100}, 'policy must not mutate the browser estimate');
console.log('PASS: storage-pressure policy covers unavailable estimates, inclusive quota threshold, free-space boundary, over-quota usage and immutability');
