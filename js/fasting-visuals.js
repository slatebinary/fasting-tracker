(function(global){
  'use strict';
  const HOUR=3600000;
  function safeRecords(records){return Array.isArray(records)?records:[];}
  function monthBuckets(records,{months=12,dayKeyForRecord,recordMs,recordMetGoal,locale='en'}={}){
    const now=new Date(),keys=[];
    for(let i=months-1;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1,12);const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;keys.push({key,label:d.toLocaleDateString(locale,{month:'short',year:'2-digit'}),totalMs:0,count:0,reached:0});}
    const by=new Map(keys.map(x=>[x.key,x]));
    for(const r of safeRecords(records)){const day=dayKeyForRecord(r);if(!day)continue;const key=day.slice(0,7),b=by.get(key);if(!b)continue;b.totalMs+=Math.max(0,Number(recordMs(r))||0);b.count++;if(recordMetGoal(r))b.reached++;}
    return keys.map(x=>({...x,hours:x.totalMs/HOUR,successRate:x.count?x.reached/x.count*100:0}));
  }
  function durationDistribution(records,{recordMs}={}){
    const defs=[
      {key:'under12',min:0,max:12,label:'<12h'},
      {key:'12to16',min:12,max:16,label:'12–16h'},
      {key:'16to18',min:16,max:18,label:'16–18h'},
      {key:'18to20',min:18,max:20,label:'18–20h'},
      {key:'20to24',min:20,max:24,label:'20–24h'},
      {key:'24to48',min:24,max:48,label:'24–48h'},
      {key:'48plus',min:48,max:Infinity,label:'48h+'}
    ].map(x=>({...x,count:0,totalHours:0}));
    for(const r of safeRecords(records)){const hours=Math.max(0,(Number(recordMs(r))||0)/HOUR);const b=defs.find(x=>hours>=x.min&&hours<x.max);if(b){b.count++;b.totalHours+=hours;}}
    return defs;
  }
  function startTimeBuckets(records,{partsForRecord}={}){
    const buckets=Array.from({length:8},(_,i)=>({key:String(i),startHour:i*3,endHour:i*3+3,label:`${String(i*3).padStart(2,'0')}:00–${String((i*3+3)%24).padStart(2,'0')}:00`,count:0}));
    for(const r of safeRecords(records)){const p=partsForRecord(r);const h=Number(p&&p.hour);if(Number.isFinite(h)&&h>=0&&h<24)buckets[Math.floor(h/3)].count++;}
    return buckets;
  }
  function maxValue(items,key,floor=1){return Math.max(floor,...safeRecords(items).map(x=>Number(x&&x[key])||0));}
  global.FTVisuals=Object.freeze({monthBuckets,durationDistribution,startTimeBuckets,maxValue});
})(window);
