'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43e-chart-continuation-keys.js','utf8'),context={};
vm.createContext(context);vm.runInContext(source+'\nthis.build=buildChartContinuationKeys;',context);
const build=context.build;
const days=[
  {segments:[
    {type:'gap',start:0,end:100},
    {type:'fast',start:100,end:200,sourceStart:10,sourceEnd:900},
    {type:'gap',start:200,end:300}
  ]},
  {segments:[
    {type:'gap',start:300,end:400},
    {type:'fast',start:400,end:500,sourceStart:10,sourceEnd:900},
    {type:'gap',start:500,end:600},
    {type:'gap',start:1600,end:1700}
  ]},
  {segments:[
    {type:'gap',start:1700,end:1800},
    {type:'gap',start:2800,end:2900}
  ]}
];
const before=JSON.stringify(days),keys=build(days);
assert.deepEqual(JSON.parse(JSON.stringify(keys)),[
  ['gap:1','fast:10:900','gap:2'],
  ['gap:2','fast:10:900','gap:3','gap:4'],
  ['gap:4','gap:5']
]);
assert.equal(JSON.stringify(days),before,'input days and segments must remain unchanged');
assert.deepEqual(JSON.parse(JSON.stringify(build([]))),[]);
assert.deepEqual(JSON.parse(JSON.stringify(build([{segments:[]}]))),[[]]);
console.log('PASS: chart continuation keys across midnight, fast interruptions and non-contiguous gaps');
