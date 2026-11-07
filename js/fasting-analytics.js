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
  function summarizeRecords(records,{durationGetter=r=>Math.max(0,Date.parse(r&&r.end)-Date.parse(r&&r.start)),goalGetter=()=>false,streak=0}={}){
    const list=safeRecords(records);let total=0,longest=0,goalCount=0;
    for(const record of list){
      const duration=Math.max(0,Number(durationGetter(record))||0);
      total+=duration;if(duration>longest)longest=duration;
      if(goalGetter(record))goalCount++;
    }
    return {count:list.length,total,average:list.length?total/list.length:0,longest,goalCount,streak:Math.max(0,Number(streak)||0)};
  }
  function aggregateDailyTotalsByPeriod(buckets,dailyTotals,{cutoff=-Infinity,periodKeyForDay=day=>String(day).slice(0,7)}={}){
    const result=(buckets||[]).map(bucket=>({...bucket,totalMs:0,hours:0}));
    const byKey=new Map(result.map(bucket=>[String(bucket.key),bucket]));
    for(const [day,totalMs] of dailyTotals||[]){
      const midday=Date.parse(`${day}T12:00:00Z`);
      if(Number.isFinite(cutoff)&&Number.isFinite(midday)&&midday<cutoff-DAY)continue;
      const bucket=byKey.get(String(periodKeyForDay(day)));
      if(bucket){bucket.totalMs+=Number(totalMs)||0;bucket.hours=bucket.totalMs/3600000;}
    }
    return result;
  }
  function durationBucketKey(hours){hours=Math.max(0,Number(hours)||0);if(hours<12)return'under12';if(hours<16)return'12to16';if(hours<18)return'16to18';if(hours<20)return'18to20';if(hours<24)return'20to24';if(hours<48)return'24to48';return'48plus';}
  function startBucketKey(hour){hour=Number(hour);return Number.isFinite(hour)&&hour>=0&&hour<24?String(Math.floor(hour/3)):null;}
  global.FTAnalytics=Object.freeze({rangeDays,cutoffMs,filterRecords,rollingAverage,cumulative,monthSpan,relativeChange,summarizeRecords,aggregateDailyTotalsByPeriod,durationBucketKey,startBucketKey});
})(window);
