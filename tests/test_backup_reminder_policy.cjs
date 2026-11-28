'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43zh-backup-reminder-policy.js','utf8');
const context={};vm.createContext(context);vm.runInContext(source+'\nthis.resolve=resolveBackupReminderPolicy;',context);
const resolve=context.resolve;
const first='2026-11-01T10:00:00.000Z', last='2026-11-10T10:00:00.000Z';
const base={hasData:true,firstDataAt:first,lastBackupAt:last,nowMs:Date.parse('2026-11-20T10:00:00.000Z'),reminderMs:7*24*60*60*1000};
let result=resolve(base);
assert.equal(result.baseMs,Date.parse(last),'the most recent of first-data and last-backup timestamps anchors the reminder');
assert.equal(result.nextAtMs,Date.parse(last)+base.reminderMs,'the displayed next reminder date must use the same anchor as due-state calculation');
assert.equal(result.due,true,'the reminder is due at the exact inclusive boundary');
assert.equal(result.token,last,'the notification token is the stable ISO timestamp of the active anchor');
result=resolve({...base,nowMs:Date.parse(last)+base.reminderMs-1});
assert.equal(result.due,false,'one millisecond before the boundary is not due');assert.equal(result.nextAtMs,Date.parse(last)+base.reminderMs,'next reminder date remains fixed before the due boundary');assert.equal(result.token,null);
result=resolve({...base,lastBackupAt:null});
assert.equal(result.baseMs,Date.parse(first),'first-data timestamp is used when no external backup exists');
assert.equal(result.nextAtMs,Date.parse(first)+base.reminderMs,'first-data timestamp also anchors the next reminder when no backup exists');
result=resolve({...base,firstDataAt:'2026-11-15T10:00:00.000Z'});
assert.equal(result.baseMs,Date.parse('2026-11-15T10:00:00.000Z'),'a later first-data timestamp must win over an older backup timestamp');
assert.equal(result.nextAtMs,Date.parse('2026-11-15T10:00:00.000Z')+base.reminderMs,'next reminder date must follow the later first-data timestamp, not the older backup timestamp');
result=resolve({...base,hasData:false});
assert.deepEqual(JSON.parse(JSON.stringify(result)),{due:false,baseMs:null,nextAtMs:null,token:null});
for(const values of [{firstDataAt:null,lastBackupAt:null},{firstDataAt:'invalid',lastBackupAt:'invalid'},{firstDataAt:null,lastBackupAt:''}]) {
  result=resolve({...base,...values});assert.equal(result.due,false);assert.equal(result.baseMs,null);assert.equal(result.nextAtMs,null);assert.equal(result.token,null);
}
for(const values of [{nowMs:NaN},{reminderMs:NaN},{reminderMs:-1},{reminderMs:Number.MAX_VALUE}]) {
  result=resolve({...base,...values});assert.equal(result.due,false);assert.equal(result.nextAtMs,null);assert.equal(result.token,null);
}
assert.deepEqual(base,{hasData:true,firstDataAt:first,lastBackupAt:last,nowMs:Date.parse('2026-11-20T10:00:00.000Z'),reminderMs:7*24*60*60*1000},'the policy must not mutate inputs');
console.log('PASS: backup reminder due-time and notification-token policy covers inclusive boundaries, anchor selection and invalid/missing data');
