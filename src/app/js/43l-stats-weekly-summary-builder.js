// Pure builder for the eight local-calendar weekly summaries shown in Statistics.
function buildStatsWeeklySummaryRows(monday,timeZone,summaries,chartDayForAnchor,dayKey,formatLabel,weekCount=8){
  const anchor=new Date(monday);
  if(!Number.isFinite(anchor.getTime())||typeof chartDayForAnchor!=='function'||typeof dayKey!=='function'||typeof formatLabel!=='function')return[];
  anchor.setHours(12,0,0,0);
  const count=Number.isInteger(weekCount)&&weekCount>0?weekCount:8,weeks=[];
  for(let wi=count-1;wi>=0;wi--){
    const start=new Date(anchor);start.setDate(start.getDate()-wi*7);
    let total=0,daysWithFast=0;
    for(let di=0;di<7;di++){
      const date=new Date(start);date.setDate(start.getDate()+di);
      const day=chartDayForAnchor(date,timeZone,summaries);
      if(day){total+=day.totalFastMs;if(day.totalFastMs>0)daysWithFast++;}
    }
    weeks.push({key:dayKey(start,timeZone),start,totalFastMs:total,daysWithFast,label:formatLabel(start)});
  }
  return weeks;
}
