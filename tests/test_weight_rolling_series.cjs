'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('src/app/js/33d-weight-rolling-series.js', 'utf8');
const context = {};
vm.runInNewContext(source + '\nthis.api = { buildWeightRollingAverageBuckets };', context, {filename:'33d-weight-rolling-series.js'});
const build = context.api.buildWeightRollingAverageBuckets;
const records = [
  {id:'third',when:'2026-11-10T09:00:00.000Z',kg:78},
  {id:'first',when:'2026-11-01T09:00:00.000Z',kg:80},
  {id:'second',when:'2026-11-03T09:00:00.000Z',kg:82},
];
const before = JSON.stringify(records);
const dayForEntry = entry => entry.when.slice(0,10);
const keyForDay = day => day.slice(0,7);
const calendarBuckets = new Map([['2026-11',{key:'2026-11',count:3}]]);
const result = build(records,'month',calendarBuckets,dayForEntry,keyForDay,7,'2026-11-12');
assert.equal(result.length,12);
assert.deepEqual(Array.from(result,point=>point.calendarDay),[
  '2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06',
  '2026-11-07','2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12'
]);
assert.equal(result[0].count,1);
assert.equal(result[0].averageKg,80);
assert.equal(result[2].count,2);
assert.equal(result[2].averageKg,81);
assert.equal(result[7].count,1);
assert.equal(result[7].averageKg,82);
assert.equal(result[9].count,1);
assert.equal(result[9].averageKg,78);
assert.equal(result[11].count,1);
assert.equal(result[11].averageKg,78);
assert.equal(result[11].lowKg,78);
assert.equal(result[11].highKg,78);
assert.equal(result[11].first.id,'third');
assert.equal(result[11].latest.id,'third');
assert.equal(result[11].calendarBucket,calendarBuckets.get('2026-11'));
assert.equal(result[0].key,'rolling:month:2026-11-01');
assert.equal(result[0].windowStartDay,'2026-10-26');
assert.equal(result[11].windowEndDay,'2026-11-12');
assert.equal(build([], 'month', calendarBuckets, dayForEntry, keyForDay, 7, '2026-11-12').length, 0);
assert.equal(build(records, 'month', calendarBuckets, () => 'invalid', keyForDay, 7, '2026-11-12').length, 0);
assert.equal(build(records, 'month', calendarBuckets, dayForEntry, keyForDay, 0, '2026-11-12').length, 0);
assert.deepEqual(Array.from(build(records, 'month', calendarBuckets, dayForEntry, keyForDay, 7, 'invalid'), x=>x.calendarDay), ['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07','2026-11-08','2026-11-09','2026-11-10']);
assert.equal(JSON.stringify(records),before,'rolling aggregation must not mutate source records');
console.log('PASS: isolated rolling Weight series, trailing-window continuity, extrema, calendar context, empty input and immutability');


// Compare every emitted rolling point with an independent direct-window oracle,
// including duplicate same-day measurements and non-monotonic source ordering.
const oracleEntries=[];
for(let i=0;i<520;i++){
  const day=new Date(Date.UTC(2025,0,1+i)).toISOString().slice(0,10);
  const kg=55+((i*37)%173)/10;
  oracleEntries.push({id:`oracle-${i}`,when:`${day}T08:00:00.000Z`,kg});
  if(i%17===0)oracleEntries.push({id:`oracle-${i}-late`,when:`${day}T18:00:00.000Z`,kg:kg+0.35});
}
const shuffled=oracleEntries.slice().reverse();
for(const windowDays of [7,30,90,180,365]){
  const actual=build(shuffled,'month',new Map(),dayForEntry,keyForDay,windowDays,'2026-06-10');
  for(const point of actual){
    const startDay=Date.parse(`${point.windowStartDay}T00:00:00.000Z`);
    const endDay=Date.parse(`${point.calendarDay}T23:59:59.999Z`);
    const included=oracleEntries.filter(entry=>{
      const timestamp=Date.parse(entry.when);
      return timestamp>=startDay&&timestamp<=endDay;
    }).sort((a,b)=>a.when.localeCompare(b.when));
    const sum=included.reduce((total,entry)=>total+entry.kg,0);
    assert.equal(point.count,included.length,`window count mismatch at ${point.calendarDay}/${windowDays}`);
    assert.ok(Math.abs(point.averageKg-sum/included.length)<1e-9,`average mismatch at ${point.calendarDay}/${windowDays}`);
    assert.equal(point.lowKg,Math.min(...included.map(entry=>entry.kg)));
    assert.equal(point.highKg,Math.max(...included.map(entry=>entry.kg)));
    assert.equal(point.first.id,included[0].id);
    assert.equal(point.latest.id,included[included.length-1].id);
  }
}

// Lifetime-sized input: the sliding-window implementation should process a
// long daily history without rescanning all 365 entries for every output day.
const lifetimeEntries=[];
for(let i=0;i<20000;i++){
  const when=new Date(Date.UTC(1970,0,1+i,8)).toISOString();
  lifetimeEntries.push({id:`life-${i}`,when,kg:70+(i%101)/100});
}
const lifetime=build(lifetimeEntries,'year',new Map(),dayForEntry,keyForDay,365,'2024-10-03');
assert.equal(lifetime.length,20000);
assert.equal(lifetime.at(-1).count,365);
assert.equal(lifetime.at(-1).first.id,'life-19635');
assert.equal(lifetime.at(-1).latest.id,'life-19999');
console.log('PASS: rolling Weight windows match a direct oracle for 7/30/90/180/365 days and handle 20,000 daily measurements');
