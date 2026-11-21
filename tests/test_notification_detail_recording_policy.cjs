#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = require('node:path').resolve(__dirname, '..');
const file = 'src/app/js/43zb-notification-detail-recording-policy.js';
vm.runInThisContext(fs.readFileSync(require('node:path').join(root,file),'utf8'), {filename:file});

const active = [
  {id:'same',kind:'target',screen:'fasting',createdAt:'2026-11-20T10:00:00.000Z',params:{targetHours:18}},
  {id:'older',kind:'backup',screen:'settings',createdAt:'2026-11-19T10:00:00.000Z',params:{}},
  {id:'oldest',kind:'safety',screen:'fasting',createdAt:'2026-11-18T10:00:00.000Z',params:{}}
];
const pending = [
  {id:'same',kind:'target',snoozedUntil:'2026-11-21T13:00:00.000Z'},
  {id:'other',kind:'weigh-in',snoozedUntil:'2026-11-22T13:00:00.000Z'}
];
const activeBefore = JSON.stringify(active), pendingBefore = JSON.stringify(pending);
const params = {targetHours:20,source:'test'};
const recorded = recordNotificationDetailPolicy(
  'same','target','weight','2026-11-21T12:00:00.000Z',params,active,pending,['fasting','weight'],3
);
assert.deepEqual(recorded.details.map(item=>item.id),['same','older','oldest']);
assert.equal(recorded.details[0].screen,'weight');
assert.equal(recorded.details[0].createdAt,'2026-11-21T12:00:00.000Z');
assert.equal(recorded.details[0].params,params);
assert.deepEqual(recorded.snoozedDetails.map(item=>item.id),['other']);
assert.equal(JSON.stringify(active),activeBefore,'active details must not be mutated');
assert.equal(JSON.stringify(pending),pendingBefore,'pending snoozes must not be mutated');

const fallback = recordNotificationDetailPolicy(
  42,'cycle','unknown','2026-11-21T12:00:00.000Z',{},active,pending,['fasting','weight'],2
);
assert.deepEqual(fallback.details.map(item=>item.id),['42','same']);
assert.equal(fallback.details[0].screen,'fasting');
assert.deepEqual(fallback.snoozedDetails.map(item=>item.id),['same','other']);

const empty = recordNotificationDetailPolicy('new','test','fasting','2026-11-21T12:00:00.000Z',{},null,null,['fasting'],5);
assert.deepEqual(empty.details.map(item=>item.id),['new']);
assert.deepEqual(empty.snoozedDetails,[]);
const zeroCap = recordNotificationDetailPolicy('new','test','fasting','now',{},active,pending,['fasting'],0);
assert.deepEqual(zeroCap.details,[]);
console.log('PASS: notification detail recording, duplicate replacement, screen fallback, snooze cleanup, queue preservation, caps and input immutability');
