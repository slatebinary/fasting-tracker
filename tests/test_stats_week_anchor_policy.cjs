'use strict';
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
expectAnchor(localDate(2026,10,25,3,30),2026,10,19);
expectAnchor(localDate(2026,11,1,1,30),2026,10,26);
const invalid=anchor(new Date(NaN));
assert.ok(Number.isNaN(invalid.getTime()),'invalid input remains invalid');
console.log('PASS: Statistics Monday week anchors, local-noon normalization, DST dates and input immutability');
