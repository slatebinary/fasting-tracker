'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('src/app/js/43p-notification-detail-normalization-policy.js','utf8');
const context={};vm.createContext(context);vm.runInContext(source+'\nthis.resolve=normalizeNotificationDetailItemsPolicy;',context);
const resolve=context.resolve;
const now=Date.parse('2026-11-20T12:00:00.000Z'), ttl=30*24*60*60*1000, screens=['fasting','history','weight','stats','settings'];
const parse=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?date:null;};
const item=(id,createdAt=now,extra={})=>({id,kind:'target',screen:'stats',createdAt:typeof createdAt==='number'?new Date(createdAt).toISOString():createdAt,params:{targetHours:18},...extra});
const input=[
  item('newest',now),
  item('old-boundary',now-ttl),
  item('expired',now-ttl-1),
  item('duplicate',now),
  item('duplicate',now-1000),
  item('invalid-date','not-a-date'),
  item('',now),
  item('invalid-screen',now,{screen:'unknown',params:[]}),
  item('future',now+ttl)
];
const original=JSON.stringify(input);
const out=resolve(input,now,parse,screens,ttl,20);
assert.deepEqual(JSON.parse(JSON.stringify(out)),[
  {id:'newest',kind:'target',screen:'stats',createdAt:new Date(now).toISOString(),params:{targetHours:18}},
  {id:'old-boundary',kind:'target',screen:'stats',createdAt:new Date(now-ttl).toISOString(),params:{targetHours:18}},
  {id:'duplicate',kind:'target',screen:'stats',createdAt:new Date(now).toISOString(),params:{targetHours:18}},
  {id:'invalid-screen',kind:'target',screen:'fasting',createdAt:new Date(now).toISOString(),params:{}},
  {id:'future',kind:'target',screen:'stats',createdAt:new Date(now+ttl).toISOString(),params:{targetHours:18}}
]);
assert.equal(JSON.stringify(input),original,'normalization must not mutate persisted input');
assert.deepEqual(JSON.parse(JSON.stringify(resolve(null,now,parse,screens,ttl,10))),[]);
assert.deepEqual(JSON.parse(JSON.stringify(resolve('not-an-array',now,parse,screens,ttl,10))),[]);
assert.equal(resolve([item('a'),item('b'),item('c')],now,parse,screens,ttl,2).length,2,'enforce configured item limit');
const longId='x'.repeat(240)+'first';
const longIdCollision='x'.repeat(240)+'second';
const truncated=resolve([item(longId),item(longIdCollision)],now,parse,screens,ttl,10);
assert.equal(truncated.length,1,'deduplicate after the existing 240-character ID truncation');
const longKind=resolve([item('kind',now,{kind:'k'.repeat(45)})],now,parse,screens,ttl,10);
assert.equal(longKind[0].kind,'k'.repeat(40),'truncate kind to the established 40-character limit');
console.log('PASS: notification detail normalization covers retention, deduplication, bounds, fallback screens and input immutability');
