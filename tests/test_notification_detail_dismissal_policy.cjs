#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = 'src/app/js/43zc-notification-detail-dismissal-policy.js';
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {filename:file});

const active = [
  {id:'first',kind:'target'},
  {id:'second',kind:'weigh-in'},
  {id:'third',kind:'safety'}
];
const before = JSON.stringify(active);
const dismissed = dismissNotificationDetailPolicy('second', active);
assert.deepEqual(dismissed, [active[0], active[2]]);
assert.notEqual(dismissed, active, 'policy must return a new array');
assert.equal(JSON.stringify(active), before, 'source details must not be mutated');
assert.deepEqual(dismissNotificationDetailPolicy('missing', active), active, 'unknown ID must preserve all details');
assert.deepEqual(dismissNotificationDetailPolicy('first', null), [], 'invalid collection must be treated as empty');
assert.deepEqual(dismissNotificationDetailPolicy('first', {id:'first'}), [], 'non-array collection must be treated as empty');
const duplicateIds = [{id:'same',n:1},{id:'keep',n:2},{id:'same',n:3}];
assert.deepEqual(dismissNotificationDetailPolicy('same', duplicateIds), [{id:'keep',n:2}], 'all entries with the dismissed stable ID must be removed');
assert.deepEqual(dismissNotificationDetailPolicy(7, [{id:'7'},{id:7}]), [{id:'7'}], 'ID comparison must remain strict');
console.log('PASS: notification detail dismissal, strict ID matching, duplicate removal, invalid input and input immutability');
