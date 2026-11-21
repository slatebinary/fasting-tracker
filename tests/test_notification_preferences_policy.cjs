'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43x-notification-preferences-policy.js','utf8');
const context={};vm.createContext(context);vm.runInContext(source+'\nthis.normalize=normalizeNotificationPreferencesPolicy;',context);
const normalize=context.normalize,allowed=[15,30,60,240,480,720,1440,2880,4320,10080];
const defaults={enabled:false,targetReached:true,backupDue:true,longFastSafety:true,weighIn:false,weighInCadence:'weekly',cycleComplete:false,weightSnoozeMinutes:60,fastingSnoozeMinutes:60};
const json=value=>JSON.parse(JSON.stringify(value));
assert.deepEqual(json(normalize(null,allowed)),defaults);
assert.deepEqual(json(normalize([],allowed)),defaults);
assert.deepEqual(json(normalize('invalid',allowed)),defaults);
assert.deepEqual(json(normalize({enabled:1,targetReached:0,backupDue:null,longFastSafety:false,weighIn:true,weighInCadence:'daily',cycleComplete:true,weightSnoozeMinutes:'240',fastingSnoozeMinutes:10080},allowed)),{
 enabled:false,targetReached:true,backupDue:true,longFastSafety:false,weighIn:true,weighInCadence:'daily',cycleComplete:true,weightSnoozeMinutes:240,fastingSnoozeMinutes:10080
});
for(const duration of allowed){
 const result=normalize({weightSnoozeMinutes:String(duration),fastingSnoozeMinutes:duration},allowed);
 assert.equal(result.weightSnoozeMinutes,duration,'numeric-string duration '+duration);
 assert.equal(result.fastingSnoozeMinutes,duration,'numeric duration '+duration);
}
for(const invalid of [undefined,null,'','15.5',14,10081,-1,NaN,Infinity,{},[]]){
 const result=normalize({weightSnoozeMinutes:invalid,fastingSnoozeMinutes:invalid},allowed);
 assert.equal(result.weightSnoozeMinutes,60,'invalid weight snooze fallback');
 assert.equal(result.fastingSnoozeMinutes,60,'invalid fasting snooze fallback');
}
assert.deepEqual(json(normalize({weightSnoozeMinutes:15,fastingSnoozeMinutes:30},[])),{...defaults,weightSnoozeMinutes:60,fastingSnoozeMinutes:60});
const input={enabled:true,weighInCadence:'daily',weightSnoozeMinutes:'240'};
const original=JSON.stringify(input);normalize(input,allowed);
assert.equal(JSON.stringify(input),original,'normalization must not mutate persisted preferences');
console.log('PASS: notification preference normalization covers defaults, strict booleans, cadence, all allowed snooze values, invalid inputs and immutability');
