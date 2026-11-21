'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/js/43u-backup-manifest-policy.js', 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source + '\nthis.matches = backupManifestMatchesPolicy;', context);
const matches = context.matches;

const data = {
  activeStart:'2026-11-21T06:00:00.000Z',
  records:[{id:'f1'},{id:'f2'}],
  deletedFasts:[{id:'df1'}],
  weights:[{id:'w1'},{id:'w2'},{id:'w3'}],
  deletedWeights:[{id:'dw1'}]
};
const manifest = {
  activeFasts:1, fastingRecords:2, deletedFasts:1,
  weightRecords:3, deletedWeights:1,
  dataVersion:7, databaseSchemaVersion:2
};
const envelope = {manifest,data};
const before = JSON.stringify(envelope);
assert.equal(matches(envelope),true,'all matching manifest counts must pass');

for (const key of Object.keys(manifest).slice(0,5)) {
  const altered={...manifest,[key]:Number(manifest[key])+1};
  assert.equal(matches({manifest:altered,data}),false, key+' count mismatch must fail');
}
assert.equal(matches({manifest:{...manifest,activeFasts:'1',fastingRecords:'2',deletedFasts:'1',weightRecords:'3',deletedWeights:'1'},data}),true,
  'numeric-string counts remain accepted for legacy compatibility');
assert.equal(matches({manifest:{...manifest,unrecognizedExtra:999},data}),true,
  'unrecognized manifest fields remain ignored');
assert.equal(matches({manifest,data:{...data,activeStart:null}}),false,
  'active-fast presence must match the manifest');
assert.equal(matches({manifest:{...manifest,activeFasts:0},data:{...data,activeStart:null}}),true,
  'an absent active fast must be represented by zero');
assert.equal(matches({manifest:{activeFasts:0,fastingRecords:0,deletedFasts:0,weightRecords:0,deletedWeights:0},data:{}}),true,
  'missing record collections retain the empty-list interpretation');
assert.equal(matches({manifest:{activeFasts:0,fastingRecords:0,deletedFasts:0,weightRecords:0,deletedWeights:0},data:{records:null,deletedFasts:null,weights:null,deletedWeights:null}}),true,
  'null record collections retain the empty-list interpretation');
assert.equal(matches(null),false);
assert.equal(matches({}),false);
assert.equal(matches({manifest:null,data}),false);
assert.equal(matches({manifest,data:null}),false);
assert.equal(JSON.stringify(envelope),before,'manifest validation must not mutate input');
console.log('PASS: backup manifest count validation preserves active-fast, collection, legacy numeric and immutability semantics');
