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
    let end=0,start=0;
    for(let dayNumber=firstDayNumber;dayNumber<=lastDayNumber;dayNumber++){
      while(end<ordered.length&&ordered[end].dayNumber<=dayNumber)end++;
      const firstDay=dayNumber-windowDays+1;
      while(start<end&&ordered[start].dayNumber<firstDay)start++;
      const count=end-start;
      if(!count)continue;
      let sumKg=0,lowKg=Infinity,highKg=-Infinity;
      for(let i=start;i<end;i++){const kg=ordered[i].entry.kg;sumKg+=kg;lowKg=Math.min(lowKg,kg);highKg=Math.max(highKg,kg);}
      const calendarDay=new Date(dayNumber*86400000).toISOString().slice(0,10);
      const calendarKey=bucketKeyForDay(calendarDay,mode),calendarBucket=calendarBuckets?.get(calendarKey)||null;
      result.push({key:`rolling:${mode}:${calendarDay}`,calendarDay,rollingWindowDays:windowDays,windowStartDay:new Date(firstDay*86400000).toISOString().slice(0,10),windowEndDay:calendarDay,count,sumKg,averageKg:sumKg/count,lowKg,highKg,first:ordered[start].entry,latest:ordered[end-1].entry,calendarBucket});
    }
    return result;
  }
