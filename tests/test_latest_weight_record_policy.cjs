#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const file = 'src/app/js/43zd-latest-weight-record-policy.js';
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {filename:file});

const older = {id:'older',when:'2026-11-19T08:00:00.000Z',kg:80};
const newest = {id:'newest',when:'2026-11-21T08:00:00.000Z',kg:79};
const middle = {id:'middle',when:'2026-11-20T08:00:00.000Z',kg:79.5};
const input = [older,middle,newest];
const before = JSON.stringify(input);
assert.equal(selectLatestWeightRecordPolicy(input), newest, 'latest valid timestamp must win');
assert.equal(selectLatestWeightRecordPolicy([newest,{id:'invalid',when:'not-a-date'}]), newest, 'invalid timestamps must be ignored');
assert.equal(selectLatestWeightRecordPolicy([]), null, 'empty history must return null');
assert.equal(selectLatestWeightRecordPolicy([{id:'invalid',when:'not-a-date'}]), null, 'history without valid timestamps must return null');
const tied = {id:'tie',when:newest.when,kg:78};
assert.equal(selectLatestWeightRecordPolicy([newest,tied]), newest, 'equal timestamps must preserve the first encountered record');
assert.equal(JSON.stringify(input), before, 'selection must not mutate the source history');
console.log('PASS: latest weight record selection, invalid timestamps, empty history, stable ties and input immutability');
