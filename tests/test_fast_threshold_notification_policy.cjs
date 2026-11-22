'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43zf-fast-threshold-notification-policy.js','utf8');
const context={};vm.createContext(context);vm.runInContext(source+'\nthis.resolve=resolveFastThresholdNotificationPolicy;',context);
const resolve=context.resolve;
const hour=3600000,day=24*hour;
const start='2026-11-19T00:00:00.000Z';
const startMs=Date.parse(start);
let result=resolve({start,nowMs:startMs+16*hour-1,thresholdMs:16*hour});
assert.equal(result,null,'target notification is not due one millisecond before its threshold');
result=resolve({start,nowMs:startMs+16*hour,thresholdMs:16*hour});
assert.equal(result.startMs,startMs);
assert.equal(result.dueAtMs,startMs+16*hour);
assert.equal(result.elapsedMs,16*hour);
assert.equal(resolve({start,nowMs:startMs+16*hour+1,thresholdMs:16*hour}).dueAtMs,startMs+16*hour,'due time remains anchored to the original fast start');
assert.equal(resolve({start,nowMs:startMs+day-1,thresholdMs:day}),null,'24-hour safety reminder is not due before the exact boundary');
result=resolve({start,nowMs:startMs+day,thresholdMs:day});
assert.equal(result.dueAtMs,startMs+day);
assert.equal(result.elapsedMs,day);
assert.equal(resolve({start,nowMs:startMs,thresholdMs:0}).dueAtMs,startMs,'zero threshold is immediately due');
for(const input of [
 {start:'invalid',nowMs:startMs+day,thresholdMs:day},
 {start:null,nowMs:startMs+day,thresholdMs:day},
 {start:'',nowMs:startMs+day,thresholdMs:day},
 {start,nowMs:NaN,thresholdMs:day},
 {start,nowMs:startMs+day,thresholdMs:NaN},
 {start,nowMs:startMs+day,thresholdMs:-1},
 {start,nowMs:startMs+day,thresholdMs:Infinity}
]) assert.equal(resolve(input),null,'invalid timestamps and thresholds are rejected');
const longStart='9999-12-31T23:59:59.999Z';
assert.equal(resolve({start:longStart,nowMs:Infinity,thresholdMs:day}),null,'non-finite time is rejected');
console.log('PASS: fast-threshold notification timing covers exact boundaries, target/safety thresholds and invalid inputs');
