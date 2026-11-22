'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app/js/11-recovery-snapshots.js','utf8');
const context={
  SNAPSHOT_RECENT_KEEP:5,SNAPSHOT_DAILY_KEEP:7,SNAPSHOT_WEEKLY_KEEP:4,
  SNAPSHOT_MONTHLY_KEEP:6,SNAPSHOT_SCAN_LIMIT:80,
  validDate:value=>{const date=value instanceof Date?new Date(value):new Date(value);return Number.isFinite(date.getTime())?date:null;},
  pad:value=>String(value).padStart(2,'0')
};
vm.createContext(context);
vm.runInContext(source+'\nthis.prune=pruneSnapshots;',context);
const prune=context.prune;
const base=Date.UTC(2026,0,1,12);
const rows=Array.from({length:100},(_,i)=>({
  id:'snapshot-'+i,createdAt:new Date(base+i*86400000).toISOString(),
  dayBucket:'day-'+i,weekBucket:'week-'+Math.floor(i/7),
  monthBucket:'month-'+Math.floor(i/30),revision:i,storedBytes:100+i
}));
const original=JSON.stringify(rows);
const kept=prune(rows.slice().reverse());
const expected=new Set();
for(let i=99;i>=95;i--)expected.add('snapshot-'+i);
for(let i=99;i>=93;i--)expected.add('snapshot-'+i);
for(const i of [99,92,85,78])expected.add('snapshot-'+i);
for(const i of [99,69,39,9])expected.add('snapshot-'+i);
assert.deepEqual(kept.map(x=>x.id),[...expected].sort((a,b)=>Number(b.slice(9))-Number(a.slice(9))));
assert.deepEqual(kept.map(x=>x.createdAt),kept.map(x=>x.createdAt).slice().sort().reverse());
assert.equal(JSON.stringify(rows),original,'retention must not mutate the caller collection');
assert.ok(kept.length<=22,'retention must not exceed the sum of all preservation-tier limits');

// Invalid metadata is excluded; valid legacy metadata receives derived calendar buckets.
const mixed=prune([
  null,{id:'',createdAt:'2026-01-01T00:00:00Z'},
  {id:'bad-date',createdAt:'not-a-date'},
  {id:'legacy',createdAt:'2026-04-05T10:00:00Z',label:'  Recovery point  ',revision:-2,storedBytes:-1}
]);
assert.deepEqual(mixed.map(x=>x.id),['legacy']);
assert.equal(mixed[0].label,'Recovery point');
assert.equal(mixed[0].revision,0);
assert.equal(mixed[0].storedBytes,0);
assert.equal(mixed[0].dayBucket,'2026-04-05');
assert.equal(mixed[0].weekBucket,'2026-03-30');
assert.equal(mixed[0].monthBucket,'2026-04');

// Explicit bucket collisions retain one newest anchor per day/week/month bucket.
const collisions=Array.from({length:20},(_,i)=>({
  id:'collision-'+i,createdAt:new Date(base+i*3600000).toISOString(),
  dayBucket:'same-day',weekBucket:'same-week',monthBucket:'same-month'
}));
const collisionKept=prune(collisions);
assert.deepEqual(collisionKept.map(x=>x.id),collisions.slice(-5).reverse().map(x=>x.id));
console.log('PASS: recovery snapshot retention preserves recent, daily, weekly and monthly anchors; normalizes legacy metadata; excludes invalid records; keeps newest-first order without mutating input');
