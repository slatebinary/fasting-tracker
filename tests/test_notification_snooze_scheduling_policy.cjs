#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = require('node:path').resolve(__dirname, '..');
for (const file of ['src/app/js/43y-notification-snooze-category-policy.js','src/app/js/43za-notification-snooze-scheduling-policy.js']) {
  vm.runInThisContext(fs.readFileSync(require('node:path').join(root,file),'utf8'), {filename:file});
}
const now = Date.parse('2026-11-21T12:00:00.000Z');
const active = [
  {id:'target-1',kind:'target',screen:'fasting',createdAt:'2026-11-21T10:00:00.000Z',params:{targetHours:18}},
  {id:'backup-1',kind:'backup',screen:'settings',createdAt:'2026-11-21T11:00:00.000Z',params:{}},
  {id:'weigh-1',kind:'weigh-in',screen:'weight',createdAt:'2026-11-21T11:30:00.000Z',params:{cadence:'weekly'}}
];
const pending = [
  {id:'older-1',kind:'safety',snoozedUntil:'2026-11-22T12:00:00.000Z'},
  {id:'target-1',kind:'target',snoozedUntil:'2026-11-21T13:00:00.000Z'}
];
const activeBefore = JSON.stringify(active), pendingBefore = JSON.stringify(pending);
const allowed=[15,30,60,240];
const scheduled=scheduleNotificationDetailSnoozePolicy('target-1',60,active,pending,now,allowed,notificationSnoozeCategoryPolicy,10);
assert.ok(scheduled);
assert.deepEqual(JSON.parse(JSON.stringify(scheduled.details)),active.slice(1));
assert.equal(scheduled.snoozedDetails.length,2);
assert.equal(scheduled.snoozedDetails[0].id,'target-1');
assert.equal(scheduled.snoozedDetails[0].snoozedUntil,'2026-11-21T13:00:00.000Z');
assert.equal(scheduled.snoozedDetails[1].id,'older-1');
assert.equal(JSON.stringify(active),activeBefore,'active details must not be mutated');
assert.equal(JSON.stringify(pending),pendingBefore,'pending queue must not be mutated');
const weigh=scheduleNotificationDetailSnoozePolicy('weigh-1',15,active,pending,now,allowed,notificationSnoozeCategoryPolicy,10);
assert.equal(weigh.snoozedDetails[0].id,'weigh-1');
assert.equal(weigh.snoozedDetails[0].snoozedUntil,'2026-11-21T12:15:00.000Z');
for(const id of ['backup-1','missing']) assert.equal(scheduleNotificationDetailSnoozePolicy(id,60,active,pending,now,allowed,notificationSnoozeCategoryPolicy,10),null);
for(const duration of [0,-15,1,45,NaN,Infinity]) assert.equal(scheduleNotificationDetailSnoozePolicy('target-1',duration,active,pending,now,allowed,notificationSnoozeCategoryPolicy,10),null);
assert.equal(scheduleNotificationDetailSnoozePolicy('target-1',15,active,pending,NaN,allowed,notificationSnoozeCategoryPolicy,10),null);
const capped=scheduleNotificationDetailSnoozePolicy('target-1',15,active,pending,now,allowed,notificationSnoozeCategoryPolicy,1);
assert.equal(capped.snoozedDetails.length,1);
assert.equal(capped.snoozedDetails[0].id,'target-1');
console.log('PASS: notification snooze scheduling policy validation, replacement, queue ordering, duration, cap and immutability');
