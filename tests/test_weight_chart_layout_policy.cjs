'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43w-weight-chart-layout-policy.js','utf8');
const context={};
vm.runInNewContext(source+'\nthis.api={weightChartPointSpacingPolicy,weightChartVisibleRangePolicy,weightChartTimelineLayoutPolicy,weightChartVisibleRangeFromPositionsPolicy,weightChartNearestPositionIndexPolicy};',context,{filename:'43w-weight-chart-layout-policy.js'});
const spacing=context.api.weightChartPointSpacingPolicy,visible=context.api.weightChartVisibleRangePolicy,timeline=context.api.weightChartTimelineLayoutPolicy,visiblePositions=context.api.weightChartVisibleRangeFromPositionsPolicy,nearest=context.api.weightChartNearestPositionIndexPolicy;
for(const width of [220,320,390,614,1024]){
 const plot=Math.max(1,Math.max(220,width)-30);
 for(const count of [0,1,2,7,30,31,90,365,20000]){
  const expected=count<=30?Math.max(1,plot/Math.max(1,count-1)):Math.max(10,Math.min(22,plot/29));
  assert.equal(spacing(count,width),expected,'spacing '+count+'/'+width);
 }
}
assert.equal(spacing(7,390),60);
assert.equal(JSON.stringify(visible(0,390,0,12)),JSON.stringify({first:0,last:-1}));
assert.equal(JSON.stringify(visible(1,390,0,12)),JSON.stringify({first:0,last:0}));
assert.equal(JSON.stringify(visible(100,390,0,12)),JSON.stringify({first:0,last:34}));
assert.equal(JSON.stringify(visible(100,390,600,12)),JSON.stringify({first:46,last:84}));
assert.equal(JSON.stringify(visible(100,390,999999,12)),JSON.stringify({first:Math.floor((999999-16)/12)-2,last:99}));
assert.equal(JSON.stringify(visible(100,390,-100,12)),JSON.stringify({first:0,last:34}));
assert.equal(JSON.stringify(visible(100,390,0,0)),JSON.stringify({first:0,last:99}));
const dates=['2026-11-10','2026-11-11','2026-11-14','2026-11-17'];
const daily=timeline(dates.map((calendarDay,i)=>({calendarDay,key:String(i)})),'daily',390);
assert.equal(daily.calendarBased,true);
assert.equal(daily.spanDays,8);
assert.equal(daily.positions[1]-daily.positions[0],daily.spacing);
assert.equal(daily.positions[2]-daily.positions[1],daily.spacing*3);
assert.equal(daily.positions[3]-daily.positions[2],daily.spacing*3);
assert.equal(daily.positions[3]-daily.positions[0],daily.spacing*7);
const sameDay=timeline([{calendarDay:'2026-11-10'},{calendarDay:'2026-11-10'}],'daily',390);
assert.equal(sameDay.spanDays,1);
assert.equal(sameDay.positions[0],sameDay.positions[1]);
const dense=timeline(Array.from({length:100},(_,i)=>({calendarDay:new Date(Date.UTC(2026,0,1+i*2)).toISOString().slice(0,10)})),'daily',390);
assert.equal(dense.spanDays,199);
assert.equal(dense.positions[99]-dense.positions[0],dense.spacing*198);
assert.equal(nearest([0,60,240,420],239),2);
assert.deepEqual(JSON.parse(JSON.stringify(visiblePositions([0,60,240,420],390,0,16,36))),{first:0,last:2});
assert.deepEqual(JSON.parse(JSON.stringify(visiblePositions([0,60,240,420],390,300,16,36))),{first:1,last:3});
console.log('PASS: Weight chart spacing and visible-window policies preserve dense layout and proportional calendar-day gaps across mobile/desktop widths, period sizes and scroll positions');
