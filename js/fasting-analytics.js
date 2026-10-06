(function(global){
  'use strict';
  const DAY=86400000;
  const RANGE_DAYS=Object.freeze({'7d':7,'30d':30,'90d':90,'6m':183,'1y':366});
  function safeRecords(records){return Array.isArray(records)?records:[];}
  function rangeDays(range,records=[],nowMs=Date.now(),dateGetter=r=>Date.parse(r&&r.end||r&&r.start||'')){
    if(Object.prototype.hasOwnProperty.call(RANGE_DAYS,range))return RANGE_DAYS[range];
    if(range!=='all')return 30;
    let earliest=Infinity;
    for(const r of safeRecords(records)){const ms=Number(dateGetter(r));if(Number.isFinite(ms))earliest=Math.min(earliest,ms);}
    if(!Number.isFinite(earliest))return 30;
    return Math.max(1,Math.min(36600,Math.ceil((nowMs-earliest)/DAY)+1));
  }
  function cutoffMs(range,records=[],nowMs=Date.now(),dateGetter){
    if(range==='all')return -Infinity;
    return nowMs-rangeDays(range,records,nowMs,dateGetter)*DAY;
  }
  function filterRecords(records,range,{nowMs=Date.now(),startGetter=r=>Date.parse(r&&r.start||''),endGetter=r=>Date.parse(r&&r.end||r&&r.start||'')}={}){
    const list=safeRecords(records);if(range==='all')return list.slice();const cutoff=cutoffMs(range,list,nowMs,endGetter);
    return list.filter(r=>{const s=Number(startGetter(r)),e=Number(endGetter(r));return Number.isFinite(e)&&e>=cutoff&&(!Number.isFinite(s)||s<=nowMs);});
  }
  function rollingAverage(items,valueGetter,windowSize){
    const out=[],queue=[];let sum=0;const n=Math.max(1,Math.floor(Number(windowSize)||1));
    for(const item of items||[]){const value=Math.max(0,Number(valueGetter(item))||0);queue.push(value);sum+=value;if(queue.length>n)sum-=queue.shift();out.push(sum/queue.length);}return out;
  }
  function cumulative(items,valueGetter){let sum=0;return (items||[]).map(item=>(sum+=Math.max(0,Number(valueGetter(item))||0)));}
  function monthSpan(range,records=[],nowMs=Date.now(),dateGetter=r=>Date.parse(r&&r.end||'')){
    if(range==='7d')return 1;if(range==='30d')return 2;if(range==='90d')return 4;if(range==='6m')return 7;if(range==='1y')return 12;
    let earliest=Infinity;for(const r of safeRecords(records)){const ms=Number(dateGetter(r));if(Number.isFinite(ms))earliest=Math.min(earliest,ms);}if(!Number.isFinite(earliest))return 12;
    const a=new Date(earliest),b=new Date(nowMs);return Math.max(1,Math.min(1200,(b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth())+1));
  }
  function relativeChange(current,previous){current=Number(current)||0;previous=Number(previous)||0;if(Math.abs(previous)<1e-9)return null;return (current-previous)/Math.abs(previous)*100;}
  function durationBucketKey(hours){hours=Math.max(0,Number(hours)||0);if(hours<12)return'under12';if(hours<16)return'12to16';if(hours<18)return'16to18';if(hours<20)return'18to20';if(hours<24)return'20to24';if(hours<48)return'24to48';return'48plus';}
  function startBucketKey(hour){hour=Number(hour);return Number.isFinite(hour)&&hour>=0&&hour<24?String(Math.floor(hour/3)):null;}
  global.FTAnalytics=Object.freeze({rangeDays,cutoffMs,filterRecords,rollingAverage,cumulative,monthSpan,relativeChange,durationBucketKey,startBucketKey});
})(window);
