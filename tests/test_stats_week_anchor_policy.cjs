'use strict';
process.env.TZ='Europe/Sofia';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43j-stats-week-anchor-policy.js','utf8'),context={};
vm.createContext(context);vm.runInContext(source+'\nthis.anchor=startOfStatsWeekMonday;',context);
const anchor=context.anchor;
function localDate(y,m,d,h=0,min=0){return new Date(y,m-1,d,h,min);}
function expectAnchor(input,y,m,d){
  const result=anchor(input);
  assert.equal(result.getFullYear(),y);
  assert.equal(result.getMonth()+1,m);
  assert.equal(result.getDate(),d);
  assert.equal(result.getHours(),12,'week anchors remain at local noon');
  assert.equal(result.getMinutes(),0);
}
const sunday=localDate(2026,11,22,23,45),original=sunday.getTime();
expectAnchor(sunday,2026,11,16);
assert.equal(sunday.getTime(),original,'input date is not mutated');
expectAnchor(localDate(2026,11,16,0,0),2026,11,16);
expectAnchor(localDate(2026,11,18,7,30),2026,11,16);
const beforeSpring=localDate(2026,3,28,12),afterSpring=localDate(2026,3,30,12);
assert.equal(beforeSpring.getTimezoneOffset(),-120,'Bulgaria uses EET before the spring transition');
assert.equal(afterSpring.getTimezoneOffset(),-180,'Bulgaria uses EEST after the spring transition');
expectAnchor(localDate(2026,3,29,3,30),2026,3,23);
const beforeAutumn=localDate(2026,10,24,12),afterAutumn=localDate(2026,10,26,12);
assert.equal(beforeAutumn.getTimezoneOffset(),-180,'Bulgaria uses EEST before the autumn transition');
assert.equal(afterAutumn.getTimezoneOffset(),-120,'Bulgaria uses EET after the autumn transition');
expectAnchor(localDate(2026,10,25,3,30),2026,10,19);
expectAnchor(localDate(2026,11,1,1,30),2026,10,26);
const invalid=anchor(new Date(NaN));
assert.ok(Number.isNaN(invalid.getTime()),'invalid input remains invalid');
console.log('PASS: Statistics Monday week anchors, local-noon normalization, DST dates and input immutability');
