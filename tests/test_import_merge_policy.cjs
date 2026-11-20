'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('src/app/js/43s-import-merge-policy.js', 'utf8');
const context = {};
vm.createContext(context);
vm.runInContext(source + '\nthis.resolve = resolveImportedDataMergePolicy;', context);
const resolve = context.resolve;
const normalizeStopReason = value => value == null ? '' : String(value).trim().toLowerCase();
const validate = value => ({data:value});
const fast = (id,start,end,extra={}) => ({id,start,end,timeZone:'UTC',goalHours:16,stopReason:null,...extra});
const weight = (id,when,kg,extra={}) => ({id,when,kg,timeZone:'UTC',...extra});
const base = {
  records:[fast('f1','2026-01-01T00:00:00Z','2026-01-01T16:00:00Z')],
  deletedFasts:[fast('df1','2026-01-02T00:00:00Z','2026-01-02T16:00:00Z',{deleted:true,deletedAt:'2026-01-03T00:00:00Z'})],
  weights:[weight('w1','2026-01-01T08:00:00Z',80)],
  deletedWeights:[weight('dw1','2026-01-02T08:00:00Z',81,{deleted:true,deletedAt:'2026-01-03T00:00:00Z'})],
  activeStart:null,activeGoalHours:null,activeTimeZone:null,activeCreatedAt:null,activeModifiedAt:null,
  language:'en',revision:7
};
const incoming = {
  records:[
    fast('f1','2026-01-01T00:00:00Z','2026-01-01T16:00:00Z',{deleted:true,deletedAt:'2026-02-01T00:00:00Z'}),
    fast('fingerprint-duplicate','2026-01-01T00:00:00Z','2026-01-01T16:00:00Z'),
    fast('f2','2026-01-04T00:00:00Z','2026-01-04T16:00:00Z')
  ],
  deletedFasts:[fast('df1','2026-01-02T00:00:00Z','2026-01-02T16:00:00Z',{deleted:true,deletedAt:'2026-02-01T00:00:00Z'}),fast('df2','2026-01-05T00:00:00Z','2026-01-05T16:00:00Z',{deletedAt:'2026-01-06T00:00:00Z'})],
  weights:[
    weight('w1','2026-01-01T08:00:00Z',80,{deleted:true}),
    weight('w2','2026-01-04T08:00:00Z',79)
  ],
  deletedWeights:[weight('dw1','2026-01-02T08:00:00Z',81,{deleted:true,deletedAt:'2026-02-01T00:00:00Z'}),weight('dw2','2026-01-05T08:00:00Z',78,{deletedAt:'2026-01-06T00:00:00Z'})],
  activeStart:null
};
const before = JSON.stringify({base,incoming});
const merged = resolve(base,incoming,normalizeStopReason,validate);
assert.deepEqual(JSON.parse(JSON.stringify(merged.data.records.map(x=>x.id))),['f1','f2']);
assert.deepEqual(JSON.parse(JSON.stringify(merged.data.deletedFasts.map(x=>x.id))),['df1','df2']);
assert.deepEqual(JSON.parse(JSON.stringify(merged.data.weights.map(x=>x.id))),['w1','w2']);
assert.deepEqual(JSON.parse(JSON.stringify(merged.data.deletedWeights.map(x=>x.id))),['dw1','dw2']);
assert.equal(merged.duplicates,5,'same-ID and fingerprint duplicates across all four collections are counted');
assert.equal(JSON.stringify({base,incoming}),before,'merge policy must not mutate either input');

const rejects = (current,remote,pattern) => assert.throws(
  () => resolve(current,remote,normalizeStopReason,validate), pattern
);
const empty = () => ({records:[],deletedFasts:[],weights:[],deletedWeights:[],activeStart:null});
rejects({...empty(),records:[fast('same','2026-01-01T00:00:00Z','2026-01-01T12:00:00Z')]},
  {...empty(),records:[fast('same','2026-01-01T00:00:00Z','2026-01-01T13:00:00Z')]},/same id differs/);
rejects({...empty(),records:[fast('live','2026-01-01T00:00:00Z','2026-01-01T12:00:00Z')]},
  {...empty(),deletedFasts:[fast('live','2026-01-02T00:00:00Z','2026-01-02T12:00:00Z')]},/both live and deleted/);
rejects({...empty(),weights:[weight('live-w','2026-01-01T08:00:00Z',80)]},
  {...empty(),deletedWeights:[weight('live-w','2026-01-02T08:00:00Z',81)]},/both live and deleted/);
rejects({...empty(),records:[fast('a','2026-01-01T00:00:00Z','2026-01-01T12:00:00Z')]},
  {...empty(),records:[fast('b','2026-01-01T11:59:59Z','2026-01-01T20:00:00Z')]},/fasting time conflict/);
rejects({...empty(),activeStart:'2026-01-01T00:00:00Z'},
  {...empty(),activeStart:'2026-01-02T00:00:00Z'},/different active fasts/);
const adopted = resolve(empty(),{...empty(),activeStart:'2026-01-03T00:00:00Z',activeGoalHours:18,activeTimeZone:'Europe/Sofia',activeCreatedAt:'created',activeModifiedAt:'modified'},normalizeStopReason,validate).data;
assert.equal(adopted.activeStart,'2026-01-03T00:00:00Z');
assert.equal(adopted.activeGoalHours,18);
assert.equal(adopted.activeTimeZone,'Europe/Sofia');
assert.equal(adopted.activeCreatedAt,'created');
assert.equal(adopted.activeModifiedAt,'modified');
console.log('PASS: import merge policy covers all record collections, duplicate accounting, ID/fingerprint conflicts, live/deleted exclusivity, interval overlap, active-fast rules and immutability');
