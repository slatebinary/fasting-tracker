// Pure rolling Weight series construction. Calendar/time-zone resolution is injected by the caller.
  function buildWeightRollingAverageBuckets(entries, mode, calendarBuckets, calendarDayForEntry, bucketKeyForDay, windowDays, todayCalendarDay) {
    if (!Array.isArray(entries) || entries.length === 0 || typeof calendarDayForEntry !== 'function' || typeof bucketKeyForDay !== 'function' || !Number.isInteger(windowDays) || windowDays <= 0) return [];
    const ordered = entries.map(entry => {
      const day = calendarDayForEntry(entry), match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
      if (!match) return null;
      return {entry,day,dayNumber:Math.floor(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))/86400000)};
    }).filter(Boolean).sort((x,y)=>x.dayNumber-y.dayNumber||String(x.entry.when).localeCompare(String(y.entry.when)));
    if (!ordered.length) return [];
    const firstDayNumber=ordered[0].dayNumber,lastMeasurementDayNumber=ordered[ordered.length-1].dayNumber;
    const todayMatch=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(todayCalendarDay || ''));
    const todayDayNumber=todayMatch?Math.floor(Date.UTC(Number(todayMatch[1]),Number(todayMatch[2])-1,Number(todayMatch[3]))/86400000):lastMeasurementDayNumber;
    const lastDayNumber=Math.max(lastMeasurementDayNumber,todayDayNumber),result=[];
    let end=0,start=0,sumKg=0,sumCompensation=0;
    const minQueue=[],maxQueue=[];let minHead=0,maxHead=0;
    const addToSum=value=>{const adjusted=value-sumCompensation,next=sumKg+adjusted;sumCompensation=(next-sumKg)-adjusted;sumKg=next;};
    for(let dayNumber=firstDayNumber;dayNumber<=lastDayNumber;dayNumber++){
      while(end<ordered.length&&ordered[end].dayNumber<=dayNumber){
        const kg=ordered[end].entry.kg;addToSum(kg);
        while(minQueue.length>minHead&&ordered[minQueue[minQueue.length-1]].entry.kg>=kg)minQueue.pop();
        minQueue.push(end);
        while(maxQueue.length>maxHead&&ordered[maxQueue[maxQueue.length-1]].entry.kg<=kg)maxQueue.pop();
        maxQueue.push(end);end++;
      }
      const firstDay=dayNumber-windowDays+1;
      while(start<end&&ordered[start].dayNumber<firstDay){addToSum(-ordered[start].entry.kg);start++;}
      while(minHead<minQueue.length&&minQueue[minHead]<start)minHead++;
      while(maxHead<maxQueue.length&&maxQueue[maxHead]<start)maxHead++;
      const count=end-start;
      if(!count)continue;
      const lowKg=ordered[minQueue[minHead]].entry.kg,highKg=ordered[maxQueue[maxHead]].entry.kg;
      const calendarDay=new Date(dayNumber*86400000).toISOString().slice(0,10);
      const calendarKey=bucketKeyForDay(calendarDay,mode),calendarBucket=calendarBuckets?.get(calendarKey)||null;
      result.push({key:`rolling:${mode}:${calendarDay}`,calendarDay,rollingWindowDays:windowDays,windowStartDay:new Date(firstDay*86400000).toISOString().slice(0,10),windowEndDay:calendarDay,count,sumKg,averageKg:sumKg/count,lowKg,highKg,first:ordered[start].entry,latest:ordered[end-1].entry,calendarBucket});
    }
    return result;
  }
