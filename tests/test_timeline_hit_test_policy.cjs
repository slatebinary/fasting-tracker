'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43f-timeline-hit-test-policy.js','utf8'),context={};
vm.createContext(context);vm.runInContext(source+'\nthis.hit=hitTestTimelineChart;',context);
const hit=context.hit;
const hour=3600000,geometry={left:10,bw:10,slot:20,top:20,h:240,cssH:300};
const day={key:'d1',startMs:0,endMs:24*hour,segments:[
  {start:0,end:12*hour},{start:12*hour,end:24*hour}
]};
assert.deepEqual(JSON.parse(JSON.stringify(hit(15,140,geometry,[day]))),{kind:'segment',dayKey:'d1',segmentIndex:1});
assert.deepEqual(JSON.parse(JSON.stringify(hit(15,260,geometry,[day]))),{kind:'day',dayKey:'d1'});
assert.deepEqual(JSON.parse(JSON.stringify(hit(15,300,geometry,[day]))),{kind:'day',dayKey:'d1'});
assert.equal(hit(15,300.01,geometry,[day]),null);
assert.equal(hit(15,19.99,geometry,[day]),null);
assert.deepEqual(JSON.parse(JSON.stringify(hit(15,20,geometry,[day]))),{kind:'segment',dayKey:'d1',segmentIndex:1});
assert.deepEqual(JSON.parse(JSON.stringify(hit(15,260-0.001,geometry,[day]))),{kind:'segment',dayKey:'d1',segmentIndex:0});
assert.equal(hit(4.99,140,geometry,[day]),null);
assert.deepEqual(JSON.parse(JSON.stringify(hit(25,140,geometry,[day, {...day,key:'d2'}]))),{kind:'segment',dayKey:'d2',segmentIndex:1});
assert.equal(hit(45.01,140,geometry,[day, {...day,key:'d2'}]),null);
const boundaryDay={...day,segments:[{start:0,end:12*hour},{start:12*hour,end:24*hour}]};
assert.deepEqual(JSON.parse(JSON.stringify(hit(15,140,geometry,[boundaryDay]))),{kind:'segment',dayKey:'d1',segmentIndex:1});
const shortDay={key:'short',startMs:0,endMs:23*hour,segments:[{start:0,end:23*hour}]};
const longDay={key:'long',startMs:0,endMs:25*hour,segments:[{start:0,end:25*hour}]};
assert.deepEqual(JSON.parse(JSON.stringify(hit(15,20,geometry,[shortDay]))),{kind:'segment',dayKey:'short',segmentIndex:0});
assert.deepEqual(JSON.parse(JSON.stringify(hit(15,20,geometry,[longDay]))),{kind:'segment',dayKey:'long',segmentIndex:0});
assert.deepEqual(JSON.parse(JSON.stringify(hit(15,140,geometry,[{key:'empty',startMs:0,endMs:24*hour,segments:[]}]))),{kind:'day',dayKey:'empty'});
assert.equal(hit(15,140,null,[day]),null);
assert.equal(hit(15,140,geometry,[]),null);
console.log('PASS: Timeline hit-testing boundaries, day selection, segment mapping and DST day lengths');
