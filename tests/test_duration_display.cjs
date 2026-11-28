'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const H = 3600000;
const translations = {
  'unit.h':'h','unit.m':'m','unit.d':'d',
  'unit.day.one':'day','unit.day.other':'days'
};
const context = {
  formatNumber:(value,min=0,max=2)=>new Intl.NumberFormat('en-US',{minimumFractionDigits:min,maximumFractionDigits:max}).format(value),
  t:key=>translations[key] ?? key,
  pluralKey:(key,n)=>`${key}.${n===1?'one':'other'}`,
  pad:value=>String(value).padStart(2,'0')
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('src/app/js/17-time-calendar-primitives.js','utf8')+
  '\nthis.durationFns={friendlyDuration,compactDuration,totalHoursDuration};',context);
const {friendlyDuration,compactDuration,totalHoursDuration}=context.durationFns;

assert.equal(compactDuration(715.3*H),'715.3 h (29d 19h 18m)');
assert.equal(compactDuration((715.3/27)*H),'26.49 h (1d 2h 29m)');
assert.equal(compactDuration(24*H),'24 h (24h 0m)','exactly 24 hours stays in hours/minutes');
assert.equal(compactDuration(24*H+60000),'24.02 h (1d 0h 1m)','days begin above 24 hours');
assert.equal(compactDuration(23.5*H),'23.5 h (23h 30m)');
assert.equal(compactDuration(.5*H),'0.5 h (30m)');
assert.equal(totalHoursDuration(715.3*H),'715.3 h (29d 19h 18m)');
assert.equal(friendlyDuration(715.3*H),'715.3 h (29 days 19h 18m)');
assert.equal(friendlyDuration(25*H,false),'25 h (1 day 1h)');

const window = {};
vm.runInNewContext(fs.readFileSync('js/fasting-visuals.js','utf8'),{window,Date,Math,Number,Object,Array,Infinity});
const durations = Array.from({length:27},()=>715.3*H/27);
const distribution = window.FTVisuals.durationDistribution(durations,{recordMs:value=>value});
const bucket = distribution.find(item=>item.key==='24to48');
assert.equal(bucket.count,27);
assert.ok(Math.abs(bucket.totalHours-715.3)<1e-9);
assert.ok(Math.abs(bucket.averageHours-(715.3/27))<1e-9);
assert.equal(distribution.find(item=>item.key==='under12').averageHours,0);
console.log('PASS: dual duration formatting, 24-hour boundary, and duration-distribution averages');
