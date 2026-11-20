'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/js/43t-backup-category-signatures-policy.js', 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source + '\nthis.build = buildBackupCategorySignatures;', context);
const build = context.build;
const hash = value => JSON.stringify(value);
const fast = (id,start,extra={}) => ({id,start,end:'2026-01-01T16:00:00Z',timeZone:'UTC',...extra});
const weight = (id,when,kg) => ({id,when,kg,timeZone:'UTC'});
const base = {
  records:[fast('f2','2026-01-02T00:00:00Z'),fast('f1','2026-01-01T00:00:00Z')],
  deletedFasts:[fast('df1','2026-01-03T00:00:00Z',{deletedAt:'2026-01-04T00:00:00Z'})],
  weights:[weight('w2','2026-01-02T08:00:00Z',79),weight('w1','2026-01-01T08:00:00Z',80)],
  deletedWeights:[weight('dw1','2026-01-03T08:00:00Z',81)],
  activeStart:'2026-01-05T00:00:00Z',activeTimeZone:'Europe/Sofia',
  activeGoalHours:18,activeCreatedAt:'created',activeModifiedAt:'modified'
};
const before = JSON.stringify(base);
const signatures = build(base,hash);
assert.equal(signatures.fasting.startsWith('v1:'),true);
assert.equal(signatures.weight.startsWith('v1:'),true);
const reordered = build({...base,records:[...base.records].reverse(),weights:[...base.weights].reverse()},hash);
assert.deepEqual(JSON.parse(JSON.stringify(reordered)),JSON.parse(JSON.stringify(signatures)),
  'record ordering must not change either category signature');
const changedWeight = build({...base,weights:[...base.weights,weight('w3','2026-01-04T08:00:00Z',78)]},hash);
assert.equal(changedWeight.fasting,signatures.fasting,'weight-only edits must not invalidate fasting signature');
assert.notEqual(changedWeight.weight,signatures.weight,'weight-only edits must invalidate weight signature');
const changedFast = build({...base,records:[...base.records,fast('f3','2026-01-06T00:00:00Z')]},hash);
assert.notEqual(changedFast.fasting,signatures.fasting,'fasting edits must invalidate fasting signature');
assert.equal(changedFast.weight,signatures.weight,'fasting-only edits must not invalidate weight signature');
const changedDeletedFast = build({...base,deletedFasts:[...base.deletedFasts,fast('df2','2026-01-07T00:00:00Z')]},hash);
assert.notEqual(changedDeletedFast.fasting,signatures.fasting,'deleted fasting history belongs to fasting signature');
const changedDeletedWeight = build({...base,deletedWeights:[...base.deletedWeights,weight('dw2','2026-01-08T08:00:00Z',77)]},hash);
assert.notEqual(changedDeletedWeight.weight,signatures.weight,'deleted weight history belongs to weight signature');
for (const key of ['activeStart','activeTimeZone','activeGoalHours','activeCreatedAt','activeModifiedAt']) {
  const changed = build({...base,[key]:key==='activeGoalHours'?19:'changed-'+key},hash);
  assert.notEqual(changed.fasting,signatures.fasting,key+' must invalidate fasting signature');
  assert.equal(changed.weight,signatures.weight,key+' must not invalidate weight signature');
}
const empty = build({},hash);
assert.deepEqual(JSON.parse(JSON.stringify(empty)),{fasting:'v1:{"records":[],"deletedFasts":[],"activeFast":{"start":null,"timeZone":null,"goal":null,"createdAt":null,"modifiedAt":null}}',weight:'v1:{"weights":[],"deletedWeights":[]}'} );
assert.equal(JSON.stringify(base),before,'signature construction must not mutate source records');
assert.throws(()=>build(base,null),/hash function is required/);
console.log('PASS: backup category signatures are order-independent, isolated by data category, include active-fast state and preserve inputs');
