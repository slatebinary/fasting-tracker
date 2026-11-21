'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43w-weight-chart-layout-policy.js','utf8');
const context={};
vm.runInNewContext(source+'\nthis.api={weightChartPointSpacingPolicy,weightChartVisibleRangePolicy};',context,{filename:'43w-weight-chart-layout-policy.js'});
const spacing=context.api.weightChartPointSpacingPolicy,visible=context.api.weightChartVisibleRangePolicy;
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
assert.equal(JSON.stringify(visible(100,390,0,0)),JSON.stringify({first:0,last:34}));
console.log('PASS: Weight chart spacing and visible-window policies preserve dense layout across mobile/desktop widths, period sizes and scroll positions');
