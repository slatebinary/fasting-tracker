'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43zi-backup-dataset-signature-policy.js','utf8');
const context={};vm.createContext(context);vm.runInContext(source+'\nthis.build=buildBackupDatasetSignature;',context);
const build=context.build;
const sourceData={
  revision:17,untrackedField:'ignored',activeStart:'2026-11-01T10:00:00.000Z',activeTimeZone:'Europe/Sofia',
  activeGoalHours:18,activeCreatedAt:'created',activeModifiedAt:'modified',
  records:[{id:'b',hours:12},{id:'a',hours:16}],
  deletedFasts:[{id:'d2',reason:'second'},{id:'d1',reason:'first'}],
  weights:[{id:'w2',kg:74},{id:'w1',kg:75}],
  deletedWeights:[{id:'x2'},{id:'x1'}]
};
const before=JSON.stringify(sourceData);
let captured=null,serialized=null;
const signature=build(sourceData,value=>{captured=value;serialized=JSON.stringify(value);return serialized;},value=>'test-hash');
assert.equal(signature,'v1:test-hash','signature prefix and hash output remain stable');
assert.deepEqual(JSON.parse(JSON.stringify(captured.records)).map(x=>x.id),['a','b'],'fasting records are canonicalized by stable ID');
assert.deepEqual(JSON.parse(JSON.stringify(captured.deletedFasts)).map(x=>x.id),['d1','d2'],'deleted fasting records are canonicalized');
assert.deepEqual(JSON.parse(JSON.stringify(captured.weights)).map(x=>x.id),['w1','w2'],'weight records are canonicalized');
assert.deepEqual(JSON.parse(JSON.stringify(captured.deletedWeights)).map(x=>x.id),['x1','x2'],'deleted weight records are canonicalized');
assert.equal(captured.activeStart,sourceData.activeStart);
assert.equal(captured.activeTimeZone,sourceData.activeTimeZone);
assert.equal(captured.activeGoalHours,18,'configured fasting goal must be retained');
assert.equal(captured.activeCreatedAt,'created');
assert.equal(captured.activeModifiedAt,'modified');
assert.equal(Object.hasOwn(captured,'revision'),false,'revision remains outside the tracked dataset projection');
assert.equal(Object.hasOwn(captured,'untrackedField'),false,'untracked properties must not affect backup identity');
assert.equal(serialized,JSON.stringify(captured),'the serializer receives only the canonical tracked projection');
assert.equal(JSON.stringify(sourceData),before,'signature construction must not mutate source data');
const empty=build({activeGoalHours:0},value=>{captured=value;return JSON.stringify(value);},()=> 'empty');
assert.equal(empty,'v1:empty');
for(const key of ['records','deletedFasts','weights','deletedWeights']) assert.deepEqual(JSON.parse(JSON.stringify(captured[key])),[],key+' defaults to an empty list');
assert.equal(captured.activeGoalHours,0,'zero fasting goal is preserved');
assert.equal(captured.activeStart,null);
assert.equal(captured.activeTimeZone,null);
assert.equal(captured.activeCreatedAt,null);
assert.equal(captured.activeModifiedAt,null);
const unsortedA={records:[{id:'z',v:1},{id:'a',v:2}],weights:[{id:'2'},{id:'1'}]};
const unsortedB={records:[{id:'a',v:2},{id:'z',v:1}],weights:[{id:'1'},{id:'2'}]};
const serialize=value=>JSON.stringify(value);
const hash=value=>value.length.toString(16);
assert.equal(build(unsortedA,serialize,hash),build(unsortedB,serialize,hash),'record array order must not affect dataset identity');
assert.throws(()=>build(sourceData,null,()=>''),error=>error?.name==='TypeError','a serializer must be supplied');
assert.throws(()=>build(sourceData,serialize,null),error=>error?.name==='TypeError','a hash function must be supplied');
console.log('PASS: backup dataset signature canonicalizes every record collection without mutating data');
