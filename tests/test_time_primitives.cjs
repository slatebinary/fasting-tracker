'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(require('node:fs').readFileSync('js/fasting-time.js', 'utf8'), {window}, {filename:'fasting-time.js'});
assert.ok(window.FTTime && typeof window.FTTime.create === 'function');

const formatterCache = new Map();
function currentLocale(){ return 'en-GB'; }
function currentTimeZone(){ return 'Europe/Sofia'; }
function normalizeTimeZone(value, fallback=currentTimeZone()){
  try { new Intl.DateTimeFormat('en',{timeZone:value}).format(0); return value; }
  catch { return fallback; }
}
function zonedParts(dateLike, timeZone){
  const tz=normalizeTimeZone(timeZone);
  let formatter=formatterCache.get(tz);
  if(!formatter){
    formatter=new Intl.DateTimeFormat('en-CA',{
      timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',
      hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
    });
    formatterCache.set(tz,formatter);
  }
  const parts=formatter.formatToParts(new Date(dateLike)), values={};
  for(const part of parts)if(part.type!=='literal')values[part.type]=part.value;
  return {year:+values.year,month:+values.month,day:+values.day,hour:+values.hour,minute:+values.minute,second:+values.second};
}
function timeZoneOffsetMs(ms,timeZone){
  const p=zonedParts(ms,timeZone);
  return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second)-Math.floor(ms/1000)*1000;
}
const time=window.FTTime.create({
  pad:n=>String(n).padStart(2,'0'),
  currentLocale,currentTimeZone,normalizeTimeZone,zonedParts,timeZoneOffsetMs
});

assert.equal(time.dayKey('2026-03-29T00:30:00.000Z','Europe/Sofia'),'2026-03-29');
assert.equal(time.dayKeyFast('2026-11-07T23:30:00.000Z','UTC'),'2026-11-07');
assert.equal(time.dayKeyFast('not-a-date','UTC'),'');
assert.equal(time.weekKeyFromDayString('2026-11-07'),'2026-11-02');
assert.equal(time.weekKeyFromDayString('2026-11-08'),'2026-11-02');
assert.equal(time.weekKeyFromDayString('2026-11-09'),'2026-11-09');
assert.equal(time.weekKeyFromDayString('invalid'),'');
assert.equal(time.weekKeyFromDayString('2024-01-01'),'2024-01-01');

const springStart=Date.parse('2026-03-28T22:00:00.000Z');
const springEnd=Date.parse('2026-03-29T21:00:00.000Z');
assert.equal(time.nextZonedDayBoundary(springStart,'Europe/Sofia'),springEnd);
const springTotals=new Map();
time.addIntervalToDayMap(springTotals,springStart,springEnd,'Europe/Sofia');
assert.equal(springTotals.get('2026-03-29'),23*3600000);

const autumnStart=Date.parse('2026-10-24T21:00:00.000Z');
const autumnEnd=Date.parse('2026-10-25T22:00:00.000Z');
assert.equal(time.nextZonedDayBoundary(autumnStart,'Europe/Sofia'),autumnEnd);
const autumnTotals=new Map();
time.addIntervalToDayMap(autumnTotals,autumnStart,autumnEnd,'Europe/Sofia');
assert.equal(autumnTotals.get('2026-10-25'),25*3600000);

const multiDay=new Map();
time.addIntervalToDayMap(multiDay,'2026-11-06T22:00:00.000Z','2026-11-08T22:00:00.000Z','Europe/Sofia');
assert.equal(multiDay.get('2026-11-07'),24*3600000);
assert.equal(multiDay.get('2026-11-08'),24*3600000);

assert.ok(time.localDateLabel('2026-11-07T12:30:00.000Z','Europe/Sofia').length>0);
assert.ok(time.localDateTimeLabel('2026-11-07T12:30:00.000Z','Europe/Sofia').includes(','));
assert.ok(time.localTimeLabel('2026-11-07T12:30:00.000Z','Europe/Sofia').length>0);

console.log('PASS: isolated time/date primitives, ISO weeks, Sofia DST boundaries and day allocation');
