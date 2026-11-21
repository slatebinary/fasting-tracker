'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43y-notification-snooze-category-policy.js','utf8');
const context={};vm.createContext(context);vm.runInContext(source+'\nthis.classify=notificationSnoozeCategoryPolicy;',context);
const classify=context.classify;
for(const kind of ['target','safety','cycle']) assert.equal(classify(kind),'fasting',kind+' uses fasting snooze preference');
assert.equal(classify('weigh-in'),'weight','weigh-in uses weight snooze preference');
for(const kind of ['backup','test','unknown','',null,undefined,{},[],42]) assert.equal(classify(kind),null,'unsupported kind '+String(kind));
console.log('PASS: notification snooze category classification preserves fasting/weight mappings and rejects unsupported kinds');
