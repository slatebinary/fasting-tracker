  function buildSummaryChartDays(dayCount = 30, timeZone = currentTimeZone()) {
    const tz = normalizeTimeZone(timeZone), now = new Date(), rangeStart = now.getTime() - (dayCount + 2) * 86400000, rangeEnd = now.getTime() + 2 * 86400000;
    const summaries = currentZoneDaySummaries(tz, rangeStart, rangeEnd), days = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const anchor = new Date(); anchor.setHours(12,0,0,0); anchor.setDate(anchor.getDate() - i);
      const day = chartDayForAnchor(anchor, tz, summaries);
      if (day) days.push(day);
    }
    return days;
  }

  function chartAxisDayText(day, range='30d') {
    if (!day) return '';
    try {
      const anchor = new Date((Number(day.startMs)||Date.now()) + 12*3600000);
      const tz = normalizeTimeZone(day.timeZone || currentTimeZone());
      const opts = range === 'all' ? {year:'numeric',timeZone:tz} : (range === '1y' || range === '6m') ? {month:'short',year:'2-digit',timeZone:tz} : {day:'numeric',month:'short',timeZone:tz};
      return anchor.toLocaleDateString(currentLocale(), opts);
    } catch { return day.label || day.key || ''; }
  }
  function markerStepForPlot(count, width, range='30d') {
    count = Math.max(0, Number(count)||0); width = Math.max(1, Number(width)||1);
    if (count <= 31) return 1;
    const minSpacing = range === 'all' ? 28 : range === '1y' ? 22 : range === '6m' ? 18 : 15;
    return Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width/minSpacing))));
  }
  function canvasEllipsis(ctx, text, maxWidth) {
    text=String(text??''); if(ctx.measureText(text).width<=maxWidth)return text;
    const ell='…';let lo=0,hi=text.length;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(ctx.measureText(text.slice(0,mid)+ell).width<=maxWidth)lo=mid;else hi=mid-1;}
    return text.slice(0,Math.max(0,lo))+ell;
  }
  function drawChartCallout(ctx,{x,y,primary,secondary,canvasW,canvasH,accent,card,textColor,muted}) {
    const pad=9,labelH=39,maxW=Math.max(72,canvasW-8);
    ctx.save();ctx.font='600 12px -apple-system';const p=String(primary??''),pW=ctx.measureText(p).width;
    ctx.font='10px -apple-system';const q=String(secondary??''),qW=ctx.measureText(q).width;
    const labelW=Math.min(maxW,Math.max(78,Math.ceil(Math.max(pW,qW))+pad*2));
    const bx=Math.max(4,Math.min(canvasW-labelW-4,x-labelW/2));
    let by=y-labelH-12;if(by<4)by=Math.min(canvasH-labelH-4,y+12);by=Math.max(4,Math.min(canvasH-labelH-4,by));
    ctx.fillStyle=card;ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(bx,by,labelW,labelH,7);else ctx.rect(bx,by,labelW,labelH);ctx.fill();ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=textColor;ctx.font='600 12px -apple-system';ctx.fillText(canvasEllipsis(ctx,p,labelW-pad*2),bx+labelW/2,by+13);
    ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.fillText(canvasEllipsis(ctx,q,labelW-pad*2),bx+labelW/2,by+28);ctx.restore();
  }
  function drawSelectionCrosshair(ctx,x,top,bottom,muted) { ctx.save();ctx.strokeStyle=muted;ctx.globalAlpha=.55;ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();ctx.restore(); }
  function drawAdaptiveDayAxis(ctx,days,xFor,{canvasW,bottomY,plotTop,plotBottom,left,right,range}) {
    if(!days.length)return;
    const items=days.map(day=>({label:chartAxisDayText(day,range),shortLabel:chartAxisDayText(day,range)}));
    const positions=days.map((_,i)=>xFor(i));ctx.font='9px -apple-system';
    const maxLabels=Math.max(2,Math.floor(Math.max(1,canvasW-left-right)/64));
    const plan=FTVisuals.axisLabelPlan(items,{positions,measureText:text=>ctx.measureText(String(text)).width,maxLabels,minGap:8});
    const line=getComputedStyle(document.documentElement).getPropertyValue('--line').trim(),muted=getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    for(const tick of plan){const text=String(tick.text),tw=ctx.measureText(text).width,x=Math.max(left+tw/2,Math.min(canvasW-right-tw/2,tick.x));ctx.save();ctx.strokeStyle=line;ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(tick.x,plotTop);ctx.lineTo(tick.x,plotBottom);ctx.stroke();ctx.restore();ctx.fillStyle=muted;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillText(text,x,bottomY);}
  }

  function buildTrendDays(){if(trendChartDaysCache)return trendChartDaysCache;const n=FTAnalytics.rangeDays(chartRange('trend'),data.records,Date.now(),r=>new Date(r.start).getTime());trendChartDaysCache=buildSummaryChartDays(n);const hours=trendChartDaysCache.map(d=>(d.totalFastMs||0)/3600000),a7=FTAnalytics.rollingAverage(trendChartDaysCache,d=>(d.totalFastMs||0)/3600000,7),a30=FTAnalytics.rollingAverage(trendChartDaysCache,d=>(d.totalFastMs||0)/3600000,30);trendChartDaysCache.forEach((d,i)=>{d.hours=hours[i];d.avg7=a7[i];d.avg30=a30[i];});return trendChartDaysCache;}
  function drawFastTrendChart() {
    const c=el('fastTrendChart'), ctx=c.getContext('2d'), ratio=window.devicePixelRatio||1;
    const cssW=c.clientWidth||660, cssH=c.clientHeight||220; c.width=Math.floor(cssW*ratio); c.height=Math.floor(cssH*ratio); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,cssW,cssH);
    const days=buildTrendDays(), top=18,bottom=58,left=34,right=14,w=cssW-left-right,h=cssH-top-bottom;
    const style=getComputedStyle(document.documentElement), line=style.getPropertyValue('--line').trim(),accent=style.getPropertyValue('--accent').trim(),good=style.getPropertyValue('--good').trim(),muted=style.getPropertyValue('--muted').trim(),card=style.getPropertyValue('--card').trim(),textColor=style.getPropertyValue('--text').trim();
    const peak=Math.max(24,...days.flatMap(d=>[d.hours||0,d.avg7||0,d.avg30||0]));ctx.strokeStyle=line;ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='right';
    [0,.5,1].forEach(fr=>{const y=top+h-h*fr;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cssW-right,y);ctx.stroke();ctx.fillText(`${formatNumber(peak*fr,0,0)}${t('unit.h')}`,left-5,y+3);});
    const xFor=i=>left+(i/(Math.max(1,days.length-1)))*w,yFor=value=>top+h-(Math.min(peak,Math.max(0,value))/peak)*h;
    trendPlotBounds={left,right:cssW-right,top,bottom:top+h};
    drawAdaptiveDayAxis(ctx,days,xFor,{canvasW:cssW,bottomY:cssH-27,plotTop:top,plotBottom:top+h,left,right,range:chartRange('trend')});
    const lineSeries=(key,color,width=2,dash=[])=>{ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();days.forEach((day,i)=>{const x=xFor(i),y=yFor(day[key]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.restore();};
    lineSeries('hours',accent,1.7);lineSeries('avg7',good,2,[5,3]);lineSeries('avg30',muted,2,[2,3]);
    trendInteractiveLayout=[];const pointEvery=markerStepForPlot(days.length,w,chartRange('trend'));days.forEach((day,i)=>{const x=xFor(i),y=yFor(day.hours),selected=trendSelectedDayKey===day.key;if(selected||i%pointEvery===0||i===days.length-1){ctx.beginPath();ctx.arc(x,y,selected?6:2.3,0,Math.PI*2);ctx.fillStyle=selected?'#ffffff':accent;ctx.fill();if(selected){ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();}}trendInteractiveLayout.push({day,x,y});});
    const selected=trendInteractiveLayout.find(hit=>hit.day.key===trendSelectedDayKey);if(selected){drawSelectionCrosshair(ctx,selected.x,top,top+h,muted);drawChartCallout(ctx,{x:selected.x,y:selected.y,primary:`${formatNumber(selected.day.hours||0,0,1)} ${t('unit.h')}`,secondary:selected.day.label||selected.day.key,canvasW:cssW,canvasH:cssH,accent,card,textColor,muted});}
    ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='left';ctx.fillText(t('stats.trendLegend'),left,cssH-8);renderChartDetailForMode();
  }

  function selectTrendPoint(clientX,clientY) {
    const c=el('fastTrendChart'),rect=c.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;if(!trendInteractiveLayout.length||!trendPlotBounds||x<trendPlotBounds.left-12||x>trendPlotBounds.right+12||y<trendPlotBounds.top-24||y>trendPlotBounds.bottom+24)return false;
    let best=null,bestD=Infinity;for(const hit of trendInteractiveLayout){const d=Math.abs(x-hit.x);if(d<bestD){bestD=d;best=hit;}}if(!best)return false;
    trendSelectedDayKey=best.day.key;statsDetailOverride={dayKey:best.day.key,title:best.day.label,text:t('stats.detailTrend',{duration:compactDuration(best.day.totalFastMs),avg7:formatNumber(best.day.avg7||0,0,1),avg30:formatNumber(best.day.avg30||0,0,1)}),records:recordsOverlappingDay(best.day)};drawFastTrendChart();return true;
  }
  function handleTrendPointer(event) { selectTrendPoint(event.clientX,event.clientY); }

  function startOfWeekMonday(date) { const d=new Date(date); d.setHours(12,0,0,0); const shift=(d.getDay()+6)%7; d.setDate(d.getDate()-shift); return d; }

  function buildWeeklySummaries() {
    if (weeklySummariesCache) return weeklySummariesCache;
    const tz=currentTimeZone(), thisMonday=startOfWeekMonday(new Date()), rangeStart=thisMonday.getTime()-8*7*86400000-2*86400000, rangeEnd=Date.now()+2*86400000, summaries=currentZoneDaySummaries(tz,rangeStart,rangeEnd), weeks=[];
    for(let wi=7;wi>=0;wi--){const start=new Date(thisMonday);start.setDate(start.getDate()-wi*7);let total=0,daysWithFast=0;for(let di=0;di<7;di++){const d=new Date(start);d.setDate(start.getDate()+di);const day=chartDayForAnchor(d,tz,summaries);if(day){total+=day.totalFastMs;if(day.totalFastMs>0)daysWithFast++;}}const key=dayKey(start,tz);weeks.push({key,start,totalFastMs:total,daysWithFast,label:start.toLocaleDateString(currentLocale(),{day:'numeric',month:'short'})});}
    weeklySummariesCache=weeks;
    return weeklySummariesCache;
  }

  function drawFastWeeksChart() {
    const c=el('fastWeeksChart'),ctx=c.getContext('2d'),ratio=window.devicePixelRatio||1,cssW=c.clientWidth||660,cssH=c.clientHeight||220;c.width=Math.floor(cssW*ratio);c.height=Math.floor(cssH*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,cssW,cssH);
    const weeks=buildWeeklySummaries(),top=18,bottom=34,left=38,right=8,w=cssW-left-right,h=cssH-top-bottom,maxH=Math.max(24,...weeks.map(x=>x.totalFastMs/3600000));
    const style=getComputedStyle(document.documentElement),line=style.getPropertyValue('--line').trim(),accent=style.getPropertyValue('--accent').trim(),muted=style.getPropertyValue('--muted').trim();ctx.strokeStyle=line;ctx.lineWidth=1;
    [0,.5,1].forEach(frac=>{const y=top+h-h*frac;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cssW-right,y);ctx.stroke();ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='right';ctx.fillText(`${formatNumber(maxH*frac,0,0)}${t('unit.h')}`,left-5,y+3);});
    const gap=8,bw=(w-gap*7)/8,weekCenters=weeks.map((_,i)=>i*(bw+gap)+bw/2);ctx.font='9px -apple-system';const weekAxis=FTVisuals.axisLabelPlan(weeks,{positions:weekCenters,measureText:text=>ctx.measureText(String(text)).width,maxLabels:8,minGap:6}),weekAxisByIndex=new Map(weekAxis.map(x=>[x.index,x.text]));weekInteractiveLayout=[];weeks.forEach((week,i)=>{const hours=week.totalFastMs/3600000,bh=(hours/maxH)*h,x=left+i*(bw+gap),y=top+h-bh;ctx.fillStyle=accent;ctx.globalAlpha=.86;ctx.fillRect(x,y,bw,bh);ctx.globalAlpha=1;if(weekSelectedKey===week.key){const sy=Math.max(top,y-3),sh=Math.min(h,bh+6);ctx.strokeStyle='#ffffff';ctx.lineWidth=4;ctx.strokeRect(x-3,sy,bw+6,sh);ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.strokeRect(x-1,Math.max(top,y-1),bw+2,Math.min(h,bh+2));}if(weekAxisByIndex.has(i)){ctx.fillStyle=muted;ctx.font='9px -apple-system';ctx.textAlign='center';ctx.fillText(weekAxisByIndex.get(i),x+bw/2,cssH-10);}weekInteractiveLayout.push({week,x,y:top,w:bw,h});});renderChartDetailForMode();
  }

  function handleWeeksPointer(event) { const c=el('fastWeeksChart'),rect=c.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;const hit=weekInteractiveLayout.find(item=>x>=item.x&&x<=item.x+item.w&&y>=item.y&&y<=item.y+item.h);if(!hit)return;weekSelectedKey=hit.week.key;const tz=currentTimeZone(),start=zonedLocalToDate(`${hit.week.key}T00:00`,tz);let endMs=start?.getTime()||NaN;if(Number.isFinite(endMs))for(let i=0;i<7;i++)endMs=nextZonedDayBoundary(endMs,tz);statsDetailOverride={dayKey:hit.week.key,title:t('stats.weekOf',{date:hit.week.label}),text:t('stats.detailWeek',{duration:compactDuration(hit.week.totalFastMs),days:formatNumber(hit.week.daysWithFast)}),records:start&&Number.isFinite(endMs)?recordsOverlappingRange(start.getTime(),endMs):[]};drawFastWeeksChart(); }


  function buildMonthSummaries(mode='months'){
    if(mode==='months'&&monthSummariesCache)return monthSummariesCache;if(mode==='success'&&targetSuccessCache)return targetSuccessCache;
    const range=chartRange(mode),records=chartRangeRecords(mode),months=FTAnalytics.monthSpan(range,records,Date.now(),r=>new Date(r.end).getTime());
    const cutoff=FTAnalytics.cutoffMs(range,records,Date.now(),r=>new Date(r.end).getTime());
    const buckets=FTAnalytics.aggregateDailyTotalsByPeriod(
      FTVisuals.monthBuckets(records,{months,locale:currentLocale(),dayKeyForRecord:r=>dayKeyFast(r.end,r.timeZone),recordMs,recordMetGoal}),
      completedFastingByStoredCalendarDay(),
      {cutoff:range==='all'?-Infinity:cutoff}
    );
    if(mode==='months')monthSummariesCache=buckets;else targetSuccessCache=buckets;return buckets;
  }
  function buildDurationDistribution(){if(!durationDistributionCache)durationDistributionCache=FTVisuals.durationDistribution(chartRangeRecords('distribution'),{recordMs});return durationDistributionCache;}
  function buildTargetSuccessSummaries(){return buildMonthSummaries('success');}
  function buildStartPattern(){if(!startPatternCache)startPatternCache=FTVisuals.startTimeBuckets(chartRangeRecords('startpattern'),{partsForRecord:r=>zonedParts(r.start,r.timeZone)});return startPatternCache;}
  function buildCumulativeDays(){if(cumulativeDaysCache)return cumulativeDaysCache;const n=FTAnalytics.rangeDays(chartRange('cumulative'),data.records,Date.now(),r=>new Date(r.start).getTime()),days=buildSummaryChartDays(n),values=FTAnalytics.cumulative(days,d=>(d.totalFastMs||0)/3600000);days.forEach((d,i)=>d.cumulativeHours=values[i]);cumulativeDaysCache=days;return days;}
  function fullMonthBuckets(months=14){return FTAnalytics.aggregateDailyTotalsByPeriod(FTVisuals.monthBuckets(data.records,{months,locale:currentLocale(),dayKeyForRecord:r=>dayKeyFast(r.end,r.timeZone),recordMs,recordMetGoal}),completedFastingByStoredCalendarDay());}
  function monthComparisonSummary(){const months=FTAnalytics.monthSpan('all',data.records,Date.now(),r=>new Date(r.end).getTime()),items=fullMonthBuckets(months),selectedIndex=genericChartSelectedKey?items.findIndex(item=>item.key===genericChartSelectedKey):-1,index=selectedIndex>=0?selectedIndex:items.length-1,cur=items[index],prev=items[index-1],year=items[index-12];if(!cur)return'';const mom=FTAnalytics.relativeChange(cur.hours,prev?.hours),yoy=FTAnalytics.relativeChange(cur.hours,year?.hours);const change=(now,old,pct)=>old?`${now>=old?'+':''}${formatNumber(now-old,0,1)} ${t('unit.h')}${pct==null?'':` (${pct>=0?'+':''}${formatNumber(pct,0,0)}%)`}`:t('stats.comparisonNoBaseline');return t('stats.monthComparison',{month:cur.label,mom:change(cur.hours,prev?.hours||0,mom),yoy:change(cur.hours,year?.hours||0,yoy)});}


  function drawFastMonthsChart(){const items=buildMonthSummaries('months'),source=chartRangeRecords('months');drawGenericBarChart('fastMonthsChart',items,'hours',{valueSuffix:t('unit.h'),selectedKey:genericChartSelectedKey,detailBuilder:x=>({dayKey:x.key,title:x.label,text:t('stats.detailMonth',{duration:compactDuration(x.totalMs),count:formatNumber(x.count)}),records:recordsContributingMonth(x.key,source)})});const cmp=el('fastMonthsComparison');if(cmp)cmp.textContent=monthComparisonSummary();}
  function drawFastDistributionChart(){const items=buildDurationDistribution(),source=chartRangeRecords('distribution');drawGenericBarChart('fastDistributionChart',items,'count',{integerScale:true,selectedKey:genericChartSelectedKey,detailBuilder:x=>({dayKey:x.key,title:x.label,text:t('stats.detailDistribution',{count:formatNumber(x.count),hours:formatNumber(x.totalHours,0,1)}),records:recordsForDurationBucket(x.key,source)})});}
  function drawFastSuccessChart(){const items=buildTargetSuccessSummaries(),source=chartRangeRecords('success');drawGenericBarChart('fastSuccessChart',items,'successRate',{maxValue:100,valueSuffix:'%',percent:true,selectedKey:genericChartSelectedKey,detailBuilder:x=>({dayKey:x.key,title:x.label,text:t('stats.detailSuccess',{rate:formatNumber(x.successRate,0,0),reached:formatNumber(x.reached),count:formatNumber(x.count)}),records:recordsEndingInMonth(x.key,source)})});}
  function drawFastStartPatternChart(){const items=buildStartPattern(),source=chartRangeRecords('startpattern');drawGenericBarChart('fastStartPatternChart',items,'count',{integerScale:true,selectedKey:genericChartSelectedKey,detailBuilder:x=>({dayKey:x.key,title:x.label,text:t('stats.detailStartPattern',{count:formatNumber(x.count)}),records:recordsForStartBucket(x.key,source)})});}
  function drawFastCumulativeChart(){
    const c=el('fastCumulativeChart'),ctx=c.getContext('2d'),ratio=window.devicePixelRatio||1,cssW=c.clientWidth||660,cssH=c.clientHeight||220;c.width=Math.floor(cssW*ratio);c.height=Math.floor(cssH*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,cssW,cssH);
    const days=buildCumulativeDays(),top=18,bottom=48,left=48,right=16,w=cssW-left-right,h=cssH-top-bottom,peak=Math.max(1,...days.map(d=>d.cumulativeHours||0)),style=getComputedStyle(document.documentElement),line=style.getPropertyValue('--line').trim(),accent=style.getPropertyValue('--accent').trim(),muted=style.getPropertyValue('--muted').trim(),card=style.getPropertyValue('--card').trim(),textColor=style.getPropertyValue('--text').trim();
    ctx.strokeStyle=line;ctx.lineWidth=1;[0,.5,1].forEach(fr=>{const y=top+h-h*fr;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cssW-right,y);ctx.stroke();ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='right';ctx.fillText(`${formatNumber(peak*fr,0,0)}${t('unit.h')}`,left-5,y+3);});
    const xFor=i=>left+(i/Math.max(1,days.length-1))*w,yFor=v=>top+h-(Math.max(0,v)/peak)*h;cumulativePlotBounds={left,right:cssW-right,top,bottom:top+h};
    drawAdaptiveDayAxis(ctx,days,xFor,{canvasW:cssW,bottomY:cssH-12,plotTop:top,plotBottom:top+h,left,right,range:chartRange('cumulative')});
    ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();days.forEach((d,i)=>{const x=xFor(i),y=yFor(d.cumulativeHours);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();
    cumulativeInteractiveLayout=[];const every=markerStepForPlot(days.length,w,chartRange('cumulative'));days.forEach((day,i)=>{const x=xFor(i),y=yFor(day.cumulativeHours),selected=cumulativeSelectedDayKey===day.key;if(selected||i%every===0||i===days.length-1){ctx.beginPath();ctx.arc(x,y,selected?6:2.3,0,Math.PI*2);ctx.fillStyle=selected?'#ffffff':accent;ctx.fill();if(selected){ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();}}cumulativeInteractiveLayout.push({day,x,y,index:i});});
    const selected=cumulativeInteractiveLayout.find(hit=>hit.day.key===cumulativeSelectedDayKey);if(selected){drawSelectionCrosshair(ctx,selected.x,top,top+h,muted);drawChartCallout(ctx,{x:selected.x,y:selected.y,primary:`${formatNumber(selected.day.cumulativeHours||0,0,1)} ${t('unit.h')}`,secondary:selected.day.label||selected.day.key,canvasW:cssW,canvasH:cssH,accent,card,textColor,muted});}
    renderChartDetailForMode();
  }
  function selectCumulativePoint(clientX,clientY){
    const c=el('fastCumulativeChart'),rect=c.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;if(!cumulativeInteractiveLayout.length||!cumulativePlotBounds||x<cumulativePlotBounds.left-12||x>cumulativePlotBounds.right+12||y<cumulativePlotBounds.top-24||y>cumulativePlotBounds.bottom+24)return false;
    let best=null,dist=Infinity;for(const hit of cumulativeInteractiveLayout){const d=Math.abs(x-hit.x);if(d<dist){dist=d;best=hit;}}if(!best)return false;cumulativeSelectedDayKey=best.day.key;const days=buildCumulativeDays(),first=days[0];statsDetailOverride={dayKey:best.day.key,title:best.day.label,text:t('stats.detailCumulative',{hours:formatNumber(best.day.cumulativeHours||0,0,1),today:formatNumber((best.day.totalFastMs||0)/3600000,0,1)}),records:first?recordsOverlappingRange(first.startMs,best.day.endMs,chartRangeRecords('cumulative')):[]};drawFastCumulativeChart();return true;
  }
  function beginCumulativePointer(event){if(event.button!=null&&event.button!==0)return;cumulativePointerState={id:event.pointerId,startX:event.clientX,startY:event.clientY};selectCumulativePoint(event.clientX,event.clientY);try{event.currentTarget.setPointerCapture(event.pointerId);}catch{}}
  function moveCumulativePointer(event){const st=cumulativePointerState;if(!st||st.id!==event.pointerId)return;const dx=Math.abs(event.clientX-st.startX),dy=Math.abs(event.clientY-st.startY);if(dx>=dy&&dx>3)selectCumulativePoint(event.clientX,event.clientY);}
  function finishCumulativePointer(event){const st=cumulativePointerState;if(!st||st.id!==event.pointerId)return;selectCumulativePoint(event.clientX,event.clientY);cumulativePointerState=null;try{event.currentTarget.releasePointerCapture(event.pointerId);}catch{}}
  function cancelCumulativePointer(){cumulativePointerState=null;}

