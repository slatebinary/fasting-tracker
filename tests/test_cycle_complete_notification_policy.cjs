'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43ze-cycle-complete-notification-policy.js','utf8');
const context={};vm.createContext(context);vm.runInContext(source+'\nthis.resolve=resolveCycleCompleteNotificationPolicy;',context);
const resolve=context.resolve;
const hour=3600000,day=24*hour;
const record={id:'fast-1',start:'2026-11-19T00:00:00.000Z',end:'2026-11-19T08:00:00.000Z'};
const start=Date.parse(record.start),cycleEnd=start+day;
const before=JSON.stringify(record);
let result=resolve({record,nowMs:cycleEnd-1,enabledAtMs:start});
assert.equal(result,null,'notification is not due before the exact 24-hour boundary');
result=resolve({record,nowMs:cycleEnd,enabledAtMs:start});
assert.equal(result.record,record);
assert.equal(result.cycleEnd,cycleEnd);
assert.equal(result.due,true);
assert.equal(result.initializeEnabledAt,false);
assert.equal(resolve({record,nowMs:cycleEnd+1,enabledAtMs:cycleEnd}).due,true,'cycle end equal to notification enable time remains eligible');
assert.equal(resolve({record,nowMs:cycleEnd,enabledAtMs:cycleEnd+1}),null,'do not notify for a cycle that ended before notifications were enabled');
result=resolve({record,nowMs:cycleEnd,enabledAtMs:NaN});
assert.equal(result.due,false);
assert.equal(result.initializeEnabledAt,true,'missing enable time must request initialization rather than delivery');
assert.equal(result.cycleEnd,cycleEnd);
assert.equal(resolve({record:null,nowMs:cycleEnd,enabledAtMs:start}),null);
for(const invalid of [
 {start:'invalid',end:record.end},
 {start:record.start,end:'invalid'},
 {start:record.start,end:record.start},
 {start:record.end,end:record.start}
]) assert.equal(resolve({record:invalid,nowMs:cycleEnd,enabledAtMs:start}),null,'invalid or reversed interval is rejected');
for(const duration of [day,day+1]) {
 const long={start:record.start,end:new Date(start+duration).toISOString()};
 assert.equal(resolve({record:long,nowMs:cycleEnd,enabledAtMs:start}),null,'24-hour and longer fasts are not cycle-complete candidates');
}
const almostDay={start:record.start,end:new Date(start+day-1).toISOString()};
assert.equal(resolve({record:almostDay,nowMs:cycleEnd,enabledAtMs:start}).due,true,'a fast one millisecond shorter than 24 hours remains eligible');
assert.equal(JSON.stringify(record),before,'policy must not mutate the source record');
console.log('PASS: cycle-complete notification policy covers duration, due-time, enable-time and invalid-interval boundaries');
