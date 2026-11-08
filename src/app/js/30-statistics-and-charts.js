  function statsSummary() {
    if (statsSummaryCache) return statsSummaryCache;
    statsSummaryCache = FTAnalytics.summarizeRecords(data.records, {
      durationGetter: recordMs,
      goalGetter: recordMetGoal,
      streak: currentStreak()
    });
    return statsSummaryCache;
  }

  let statsGamificationRenderToken = 0;
  let statsGamificationRenderTimer = 0;

  function scheduleStatsGamificationDetail() {
    const token = ++statsGamificationRenderToken;
    if (statsGamificationRenderTimer) { clearTimeout(statsGamificationRenderTimer); statsGamificationRenderTimer = 0; }
    requestAnimationFrame(() => {
      if (token !== statsGamificationRenderToken) return;
      statsGamificationRenderTimer = setTimeout(() => {
        statsGamificationRenderTimer = 0;
        if (token !== statsGamificationRenderToken || !el('stats').classList.contains('active')) return;
        renderGamificationDetail();
      }, 0);
    });
  }

  function renderStats() {
    const summary = statsSummary();
    el('mTotal').textContent = formatNumber(summary.count);
    el('mAverage').textContent = summary.count ? compactDuration(summary.average) : `0${t('unit.h')}`;
    el('mLongest').textContent = summary.count ? compactDuration(summary.longest) : `0${t('unit.h')}`;
    el('mGoal').textContent = formatNumber(summary.goalCount);
    el('mStreak').textContent = formatNumber(summary.streak);
    el('mHours').textContent = summary.total ? compactDuration(summary.total) : `0${t('unit.h')}`;
    renderGamificationSummary();
    renderStatsVisualizations();
    scheduleStatsGamificationDetail();
  }

  function allFastingIntervals(rangeStart = -Infinity, rangeEnd = Infinity) {
    const intervals = [];
    for (const r of data.records) {
      const start = Date.parse(r.start), end = Date.parse(r.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      if (end <= rangeStart || start >= rangeEnd) continue;
      intervals.push({
        start,
        end,
        goalHours: sanitizeGoal(r.goalHours, data.goalHours),
        sourceStart: start,
        sourceEnd: end,
        active: false
      });
    }
    if (data.activeStart) {
      const start = Date.parse(data.activeStart), end = Date.now();
      if (Number.isFinite(start) && end > start && end > rangeStart && start < rangeEnd) {
        intervals.push({
          start,
          end,
          goalHours: sanitizeGoal(data.activeGoalHours, data.goalHours),
          sourceStart: start,
          sourceEnd: end,
          active: true
        });
      }
    }
    intervals.sort((a,b)=>a.start-b.start);
    return intervals;
  }

  function currentZoneDaySummaries(timeZone = currentTimeZone(), rangeStart = -Infinity, rangeEnd = Infinity) {
    const tz = normalizeTimeZone(timeZone);
    const cacheKey = `${tz}|${Number.isFinite(rangeStart)?Math.floor(rangeStart/86400000):'all'}|${Number.isFinite(rangeEnd)?Math.ceil(rangeEnd/86400000):'all'}|${data.revision}`;
    if (currentZoneDaySummaryCache?.key === cacheKey) return currentZoneDaySummaryCache.map;
    const map = new Map();
    for (const interval of allFastingIntervals(rangeStart, rangeEnd)) {
      let cursor = Math.max(interval.start, Number.isFinite(rangeStart) ? rangeStart : interval.start), guard = 0;
      const intervalEnd = Math.min(interval.end, Number.isFinite(rangeEnd) ? rangeEnd : interval.end);
      while (cursor < intervalEnd && guard++ < 10000) {
        const key = dayKey(cursor, tz);
        const boundary = Math.min(intervalEnd, nextZonedDayBoundary(cursor, tz));
        const item = map.get(key) || { totalFastMs:0, fastCount:0 };
        item.totalFastMs += Math.max(0, boundary - cursor);
        item.fastCount += 1;
        map.set(key, item);
        cursor = Math.max(boundary, cursor + 1);
      }
    }
    currentZoneDaySummaryCache = { key:cacheKey, map };
    return map;
  }

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
  function monthComparisonSummary(){const items=fullMonthBuckets(14),cur=items.at(-1),prev=items.at(-2),year=items.at(-13);if(!cur)return'';const mom=FTAnalytics.relativeChange(cur.hours,prev?.hours),yoy=FTAnalytics.relativeChange(cur.hours,year?.hours);const change=(now,old,pct)=>old?`${now>=old?'+':''}${formatNumber(now-old,0,1)} ${t('unit.h')}${pct==null?'':` (${pct>=0?'+':''}${formatNumber(pct,0,0)}%)`}`:t('stats.comparisonNoBaseline');return t('stats.monthComparison',{month:cur.label,mom:change(cur.hours,prev?.hours||0,mom),yoy:change(cur.hours,year?.hours||0,yoy)});}


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

  function toLocalInputValue(dateLike, timeZone = currentTimeZone()) {
    const d = new Date(dateLike); if (!Number.isFinite(d.getTime())) return '';
    const p=zonedParts(d,timeZone);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
  }

  function showEntryError(message) {
    const box = el('entryError');
    box.textContent = message;
    box.hidden = !message;
  }

  function closeEntryModal() {
    hideModal('entryModal');
    editingRecordId = null;
    editingRecordTimeZone = null;
    showEntryError('');
  }

  function openEntryModal(record = null) {
    editingRecordId = record?.id || null;
    editingRecordTimeZone = record ? normalizeTimeZone(record.timeZone) : currentTimeZone();
    el('entryModalTitle').textContent = record ? t('history.editTitle') : t('history.addTitle');
    el('entryAuditHelp').hidden = !record;
    if (record) {
      el('entryStart').value = toLocalInputValue(record.start, editingRecordTimeZone);
      el('entryEnd').value = toLocalInputValue(record.end, editingRecordTimeZone);
      el('entryGoal').value = formatNumber(record.goalHours ?? data.goalHours, 0, 3);
      el('entryStopReason').value = normalizeStopReason(record.stopReason) || '';
    } else {
      const end = new Date();
      const start = new Date(end.getTime() - goalMs(data.goalHours));
      el('entryStart').value = toLocalInputValue(start);
      el('entryEnd').value = toLocalInputValue(end);
      el('entryGoal').value = formatNumber(data.goalHours, 0, 3);
      el('entryStopReason').value = '';
    }
    refreshEntryStopReasonVisibility();
    showEntryError('');
    showModal('entryModal', 'entryStart');
  }

  function refreshEntryStopReasonVisibility() {
    const group=el('entryStopReasonGroup'); if(!group)return;
    const tz=editingRecordTimeZone||currentTimeZone(), start=zonedLocalToDate(el('entryStart')?.value,tz), end=zonedLocalToDate(el('entryEnd')?.value,tz), target=parseLocalizedNumber(el('entryGoal')?.value);
    const missed=!!(start&&end&&end>start&&Number.isFinite(target)&&target>0&&(end-start)<goalMs(target));
    group.hidden=!missed;
    if(!missed&&el('entryStopReason'))el('entryStopReason').value='';
  }

  function intervalOverlaps(start, end, excludeId = null) {
    const s = start.getTime(), e = end.getTime();
    for (const r of data.records) {
      if (r.id === excludeId) continue;
      const rs = new Date(r.start).getTime(), re = new Date(r.end).getTime();
      if (s < re && e > rs) return true;
    }
    if (data.activeStart) {
      const as = new Date(data.activeStart).getTime(), ae = Date.now();
      if (s < ae && e > as) return true;
    }
    return false;
  }

  function fastingRecordCoreEqual(a, b) {
    if (!a || !b) return false;
    return String(a.start) === String(b.start) && String(a.end) === String(b.end) &&
      sanitizeGoal(a.goalHours, data.goalHours) === sanitizeGoal(b.goalHours, data.goalHours) &&
      normalizeTimeZone(a.timeZone) === normalizeTimeZone(b.timeZone) &&
      normalizeStopReason(a.stopReason) === normalizeStopReason(b.stopReason);
  }

  function fastEditAuditEntry(record, editedAt = new Date().toISOString()) {
    return {
      editedAt, editedTimeZone: currentTimeZone(),
      start: record.start, end: record.end, goalHours: sanitizeGoal(record.goalHours, data.goalHours),
      timeZone: normalizeTimeZone(record.timeZone), stopReason: normalizeStopReason(record.stopReason)
    };
  }

  function substantialFastEdit(previous, next) {
    const oldStart = validDate(previous?.start), oldEnd = validDate(previous?.end), newStart = validDate(next?.start), newEnd = validDate(next?.end);
    if (!oldStart || !oldEnd || !newStart || !newEnd) return true;
    const threshold = 30 * 60 * 1000;
    const startShift = Math.abs(newStart - oldStart), endShift = Math.abs(newEnd - oldEnd);
    const durationShift = Math.abs((newEnd - newStart) - (oldEnd - oldStart));
    const goalShift = Math.abs(sanitizeGoal(previous.goalHours, data.goalHours) - sanitizeGoal(next.goalHours, data.goalHours));
    const oldStartDay = dayKeyFast(previous.start, previous.timeZone), newStartDay = dayKeyFast(next.start, next.timeZone);
    const oldEndDay = dayKeyFast(previous.end, previous.timeZone), newEndDay = dayKeyFast(next.end, next.timeZone);
    return startShift >= threshold || endShift >= threshold || durationShift >= threshold || goalShift >= 1 ||
      oldStartDay !== newStartDay || oldEndDay !== newEndDay || recordMetGoal(previous) !== recordMetGoal(next);
  }

  function fastEditSummary(record) {
    const zone = normalizeTimeZone(record.timeZone);
    const base=t('history.editSummary', {
      start: localDateTimeLabel(record.start, zone),
      end: localDateTimeLabel(record.end, zone),
      goal: formatGoal(record.goalHours)
    });
    return normalizeStopReason(record.stopReason) ? `${base} • ${t('fasting.stopReasonSummary',{reason:stopReasonLabel(record.stopReason)})}` : base;
  }

  function saveManualEntry() {
    const tz = editingRecordTimeZone || currentTimeZone();
    const start = zonedLocalToDate(el('entryStart').value, tz);
    const end = zonedLocalToDate(el('entryEnd').value, tz);
    const target = parseLocalizedNumber(el('entryGoal').value);
    if (!start || !end) { showEntryError(t('history.errDates')); return; }
    if (end <= start) { showEntryError(t('history.errEndAfter')); return; }
    if (end.getTime() > Date.now() + 60000) { showEntryError(t('history.errFuture')); return; }
    if (end - start < 60000) { showEntryError(t('history.errMinute')); return; }
    if (!Number.isFinite(target) || target <= 0) { showEntryError(t('history.errGoal')); return; }
    if (intervalOverlaps(start, end, editingRecordId)) { showEntryError(t('history.errOverlap')); return; }

    const existingRecord = editingRecordId ? data.records.find(r => r.id === editingRecordId) : null;
    const nowAudit = new Date().toISOString();
    const draft = {
      id: editingRecordId || makeId(),
      start: start.toISOString(),
      end: end.toISOString(),
      goalHours: sanitizeGoal(target, data.goalHours),
      timeZone: tz,
      createdAt: existingRecord ? normalizeAuditTimestamp(existingRecord.createdAt) : nowAudit,
      modifiedAt: existingRecord ? nowAudit : null,
      editHistory: existingRecord ? normalizeFastEditHistory(existingRecord.editHistory) : [],
      stopReason: (end - start) < goalMs(target) ? normalizeStopReason(el('entryStopReason')?.value) : null
    };
    if (existingRecord && fastingRecordCoreEqual(existingRecord, draft)) { closeEntryModal(); return; }
    if (existingRecord && substantialFastEdit(existingRecord, draft)) {
      const message = t('history.editMaterialConfirm', {before:fastEditSummary(existingRecord), after:fastEditSummary(draft)});
      if (!confirm(message)) return;
    }
    if (existingRecord) {
      draft.editHistory = [...draft.editHistory, fastEditAuditEntry(existingRecord, nowAudit)].slice(-MAX_FAST_EDIT_AUDIT);
      data.records = data.records.map(r => r.id === editingRecordId ? draft : r);
    } else data.records.push(draft);
    if (!save()) { renderAll(); return; }
    closeEntryModal();
    renderAll();
  }

  function bindResponsiveAction(node, handler) {
    if (!node || typeof handler !== 'function') return;
    let pointerHandledAt = 0;
    let pointerStart = null;
    const flash = () => {
      node.classList.add('fastActionPressed');
      setTimeout(() => node.classList.remove('fastActionPressed'), 90);
    };
    node.addEventListener('pointerdown', event => {
      if (event.button != null && event.button !== 0) return;
      pointerStart = { id:event.pointerId, x:event.clientX, y:event.clientY };
      node.classList.add('fastActionPressed');
    });
    node.addEventListener('pointercancel', () => { pointerStart = null; node.classList.remove('fastActionPressed'); });
    node.addEventListener('pointerup', event => {
      const start = pointerStart;
      pointerStart = null;
      node.classList.remove('fastActionPressed');
      if (!start || start.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
      pointerHandledAt = performance.now();
      if (event.cancelable) event.preventDefault();
      flash();
      handler(event);
    });
    node.addEventListener('click', event => {
      if (event.detail !== 0 && performance.now() - pointerHandledAt < 700) { event.preventDefault(); return; }
      flash();
      handler(event);
    });
  }

  function bindReliableModalAction(node, handler) {
    if (!node || typeof handler !== 'function') return;
    let locked = false;
    node.addEventListener('click', event => {
      if (locked) return;
      locked = true;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      node.classList.add('fastActionPressed');
      setTimeout(() => node.classList.remove('fastActionPressed'), 90);
      try { handler(event); } finally { setTimeout(() => { locked = false; }, 250); }
    });
  }

  function scheduleWeightUiRefresh() {
    // Let a modal close / deleted row disappear before rebuilding summaries,
    // history and the weight chart.
    requestAnimationFrame(() => setTimeout(() => {
      renderWeight();
      viewDirty.weight = false;
      if (el('stats').classList.contains('active')) { renderGamification(); viewDirty.stats = true; }
      if (el('fasting').classList.contains('active')) { renderGamificationSummary(); viewDirty.fasting = false; }
      renderBackupStatus();
    }, 0));
  }

  function showWeightError(message) {
    const box = el('weightError');
    box.textContent = message;
    box.hidden = !message;
  }

  function closeWeightModal() {
    hideModal('weightModal');
    editingWeightId = null;
    editingWeightTimeZone = null;
    showWeightError('');
  }

  function openWeightModal(entry = null) {
    editingWeightId = entry?.id || null;
    editingWeightTimeZone = entry ? normalizeTimeZone(entry.timeZone) : currentTimeZone();
    const unit = data.weightUnit;
    el('weightModalTitle').textContent = entry ? t('weight.editTitle') : t('weight.addTitle');
    el('weightModalUnit').textContent = unit;
    el('weightWhen').value = toLocalInputValue(entry?.when || new Date(), editingWeightTimeZone);
    const shown = entry ? kgToDisplay(entry.kg, unit) : null;
    el('weightValueInput').value = shown == null ? '' : formatNumber(shown, 1, 1);
    showWeightError('');
    showModal('weightModal', 'weightValueInput');
  }

  function saveWeightEntry() {
    const tz = editingWeightTimeZone || currentTimeZone();
    const when = zonedLocalToDate(el('weightWhen').value, tz);
    const raw = parseLocalizedNumber(el('weightValueInput').value);
    const kg = sanitizeWeightKg(displayToKg(raw, data.weightUnit), null);
    if (!when) { showWeightError(t('weight.errDate')); return; }
    if (when.getTime() > Date.now() + 60000) { showWeightError(t('weight.errFuture')); return; }
    if (kg == null) { showWeightError(t('weight.errValue', {unit:data.weightUnit})); return; }
    const existingWeight = editingWeightId ? data.weights.find(w => w.id === editingWeightId) : null;
    const nowAudit = new Date().toISOString();
    const whenIso = when.toISOString();
    const entry = {
      id: editingWeightId || makeId(), when: whenIso, kg, timeZone: tz,
      calendarDay: dayKeyFast(whenIso, tz),
      createdAt: existingWeight ? normalizeAuditTimestamp(existingWeight.createdAt) : nowAudit,
      modifiedAt: existingWeight ? nowAudit : null
    };
    if (editingWeightId) data.weights = data.weights.map(w => w.id === editingWeightId ? entry : w);
    else data.weights.push(entry);
    if (!save({ invalidateDerived: true, dirtyViews:['weight','stats','settings','fasting'] })) { renderAll(); return; }
    closeWeightModal();
    scheduleWeightUiRefresh();
  }


  function setWeightPeriodMode(mode) {
    if (!WEIGHT_PERIOD_MODES.includes(mode) || mode === weightPeriodMode) return;
    weightPeriodMode = mode;
    weightChartSelectedId = null;
    weightChartScrollToLatestPending = true;
    const asc = sortedWeightsAsc();
    renderWeightPeriodAnalytics(asc);
    drawWeightChart(asc);
    renderDeletedWeights();
  }

  function softDeleteWeightById(id, reason = 'user') {
    const index=data.weights.findIndex(w=>w.id===id);if(index<0||data.deletedWeights.some(w=>w.id===id))return false;
    const original=data.weights[index],tombstone={...original,deleted:true,deletedAt:new Date().toISOString(),deletedTimeZone:currentTimeZone(),deletionReason:String(reason||'user').slice(0,80)};
    data.weights.splice(index,1);data.deletedWeights.push(tombstone);if(!save({invalidateDerived:true,dirtyViews:['weight','stats','settings','fasting']})){data.deletedWeights=data.deletedWeights.filter(w=>w!==tombstone);data.weights.splice(index,0,original);return false;}return true;
  }
  function restoreDeletedWeightById(id){const index=data.deletedWeights.findIndex(w=>w.id===id);if(index<0)return false;const deleted=data.deletedWeights[index];if(data.weights.some(w=>w.id===deleted.id)){alert(t('weight.restoreConflict'));return false;}const restored=normalizeWeightEntry(deleted);if(!restored)return false;data.deletedWeights.splice(index,1);data.weights.push(restored);if(!save({invalidateDerived:true,dirtyViews:['weight','stats','settings','fasting']})){data.weights=data.weights.filter(w=>w!==restored&&w.id!==restored.id);data.deletedWeights.splice(index,0,deleted);return false;}return true;}
  function permanentlyDeleteWeightById(id){const index=data.deletedWeights.findIndex(w=>w.id===id);if(index<0)return false;const [removed]=data.deletedWeights.splice(index,1);if(!save({invalidateDerived:false,dirtyViews:['weight','settings']})){data.deletedWeights.splice(index,0,removed);return false;}return true;}
  function renderDeletedWeights(){
    const card=el('deletedWeightsCard'),box=el('deletedWeightsList'),spec=weightFilterSpec();if(!card||!box)return;const total=data.deletedWeights.length;card.hidden=!spec.includeDeleted||!total;box.replaceChildren();if(!spec.includeDeleted||!total){updateBulkActionBars();return;}
    const deletedSorted=[...data.deletedWeights].sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));const filtered=weightFilterActive(spec)?deletedSorted.filter(w=>weightPassesFilter(w,spec)):deletedSorted;el('deletedWeightsCount').textContent=t('weight.deletedFilteredCount',{shown:filtered.length,total});const visible=filtered.slice(0,HISTORY_PAGE_SIZE);
    if(!visible.length){const empty=document.createElement('div');empty.className='historyEmpty';empty.textContent=t('history.filterNoMatch');box.append(empty);}
    for(const w of visible){const row=document.createElement('div');row.className='row historyRow'+(weightBulkMode?' bulkSelectable':'');if(weightBulkMode)row.append(bulkCheckbox(w.id,selectedDeletedWeightIds,t('bulk.selectWeight',{date:localDateLabel(w.when,w.timeZone)})));const left=document.createElement('div');const strong=document.createElement('strong');strong.textContent=`${localDateTimeLabel(w.when,w.timeZone)} • ${formatWeight(w.kg,data.weightUnit)}`;const small=document.createElement('div');small.className='small';small.textContent=t('weight.deletedAt',{date:localDateTimeLabel(w.deletedAt,w.deletedTimeZone)});left.append(strong,small);const actions=document.createElement('div');actions.className='historyActions';if(!weightBulkMode){const restore=document.createElement('button');restore.className='secondary';restore.textContent=t('common.restore');restore.addEventListener('click',()=>{if(restoreDeletedWeightById(w.id))renderWeight();});const purge=document.createElement('button');purge.className='dangerText';purge.textContent=t('weight.deletePermanently');purge.addEventListener('click',()=>{if(confirm(t('weight.deletePermanentConfirm'))&&confirm(t('weight.deletePermanentFinalConfirm'))&&permanentlyDeleteWeightById(w.id))renderWeight();});actions.append(restore,purge);}row.append(left,actions);box.append(row);}updateBulkActionBars();
  }

  function renderWeight() {
    const unit = data.weightUnit;
    el('unitKgBtn').classList.toggle('active', unit === 'kg');
    el('unitLbBtn').classList.toggle('active', unit === 'lb');
    el('unitKgBtn').setAttribute('aria-pressed', String(unit === 'kg'));
    el('unitLbBtn').setAttribute('aria-pressed', String(unit === 'lb'));
    el('weightTargetUnit').textContent = unit;
    const targetShown = data.targetWeightKg == null ? '' : formatNumber(kgToDisplay(data.targetWeightKg, unit), 1, 1);
    if (document.activeElement !== el('weightTargetInput')) el('weightTargetInput').value = targetShown;

    const asc = sortedWeightsAsc();
    const latest = asc.length ? asc[asc.length - 1] : null;
    const first = asc.length ? asc[0] : null;
    el('wLatest').textContent = latest ? formatWeight(latest.kg, unit) : '—';
    el('wChange').textContent = latest && first ? formatWeight(latest.kg - first.kg, unit, true) : '—';
    el('wTarget').textContent = data.targetWeightKg == null ? '—' : formatWeight(data.targetWeightKg, unit);
    el('wToTarget').textContent = latest && data.targetWeightKg != null ? formatWeight(latest.kg - data.targetWeightKg, unit, true) : '—';

    const box=el('weightHistoryList');box.replaceChildren();const spec=weightFilterSpec();const allDesc=[...asc].reverse();const sortedDesc=weightFilterActive(spec)?allDesc.filter(w=>weightPassesFilter(w,spec)):allDesc;const filterStatus=el('weightFilterStatus');if(filterStatus)filterStatus.textContent=t('history.filterCount',{shown:sortedDesc.length,total:asc.length});
    if(!sortedDesc.length){const empty=document.createElement('div');empty.className='historyEmpty';empty.textContent=asc.length?t('history.filterNoMatch'):t('weight.empty');box.append(empty);}else{const visibleWeights=sortedDesc.slice(0,weightVisibleCount);visibleWeights.forEach(w=>{const row=document.createElement('div');row.className='row historyRow'+(weightBulkMode?' bulkSelectable':'');if(weightBulkMode)row.append(bulkCheckbox(w.id,selectedWeightIds,t('bulk.selectWeight',{date:localDateLabel(w.when,w.timeZone)})));const left=document.createElement('div');left.style.minWidth='0';const strong=document.createElement('strong');strong.textContent=localDateLabel(w.when,w.timeZone);left.append(strong);const when=document.createElement('div');when.className='small';when.textContent=localDateTimeLabel(w.when,w.timeZone);left.append(when);const right=document.createElement('div');right.style.textAlign='right';right.style.flex='0 0 auto';const val=document.createElement('div');val.className='duration';val.textContent=formatWeight(w.kg,unit);right.append(val);if(!weightBulkMode){const actions=document.createElement('div');actions.className='historyActions';const edit=document.createElement('button');edit.className='secondary';edit.textContent=t('common.edit');bindResponsiveAction(edit, () => openWeightModal(w));const del=document.createElement('button');del.className='dangerText';del.textContent=t('common.delete');bindResponsiveAction(del, () => {if(!confirm(t('weight.deleteConfirm')))return;if(!softDeleteWeightById(w.id,'user')){renderAll();return;}renderWeight();showUndoToast(t('weight.deletedUndo'),()=>{if(restoreDeletedWeightById(w.id))renderWeight();});});actions.append(edit,del);right.append(actions);}row.append(left,right);box.append(row);});if(visibleWeights.length<sortedDesc.length){const wrap=document.createElement('div');wrap.className='loadMoreWrap';const more=document.createElement('button');more.className='secondary';more.textContent=t('common.loadMoreCount',{n:sortedDesc.length-visibleWeights.length});more.addEventListener('click',()=>{weightVisibleCount+=HISTORY_PAGE_SIZE;renderWeight();});wrap.append(more);box.append(wrap);}}
    renderWeightPeriodAnalytics(asc);
    drawWeightChart(asc);
    renderDeletedWeights();
  }


  function renderWeightChartData() {
    const box=el('weightChartData'),btn=el('weightChartDataBtn'); if(!box||box.hidden)return;
    const scroller=el('weightChartScroller'), buckets=weightChartBuckets; box.replaceChildren();
    if(!buckets.length){box.textContent=t('a11y.noChartData');return;}
    const viewport=Math.max(1,scroller?.clientWidth||600), scroll=scroller?.scrollLeft||0;
    const spacing=weightPeriodMode==='daily'?(buckets.length<=30?Math.max(1,(viewport-30)/Math.max(1,buckets.length-1)):Math.max(10,Math.min(22,(viewport-30)/29))):(buckets.length<=5?Math.max(1,(viewport-30)/Math.max(1,buckets.length-1)):68);
    const first=Math.max(0,Math.floor((scroll-16)/Math.max(1,spacing))-1), last=Math.min(buckets.length-1,Math.ceil((scroll+viewport-16)/Math.max(1,spacing))+1);
    const ul=document.createElement('ul');
    for(let i=last;i>=first;i--){const b=buckets[i];if(!b.count)continue;const li=document.createElement('li');li.textContent=`${weightBucketLongLabel(b)} — ${formatWeight(b.averageKg,data.weightUnit)}${b.count>1?` • ${b.count} ${t(pluralKey('weight.measurement',b.count))}`:''}`;ul.append(li);} box.append(ul);
  }
  function renderStatsChartData(){
    const box=el('statsChartData'); if(!box||box.hidden)return; box.replaceChildren(); const ul=document.createElement('ul');
    if(statsVizMode==='timeline'){for(const d of [...timelineChartDays].reverse()){const li=document.createElement('li');const clockNote=clockChangeNoteForDetail({dayKey:d.key},'timeline');li.textContent=`${d.label||localDateLabel(d.startMs,d.timeZone)||d.key||''} — ${compactDuration(d.totalFastMs||0)}${clockNote?' • '+clockNote:''}`;ul.append(li);}}
    else if(statsVizMode==='trend'){for(const d of [...buildTrendDays()].reverse()){const li=document.createElement('li');const clockNote=clockChangeNoteForDetail({dayKey:d.key},'trend');li.textContent=`${d.label||d.key||''} — ${formatNumber(d.hours||0,0,1)} ${t('unit.h')} • 7d ${formatNumber(d.avg7||0,0,1)} • 30d ${formatNumber(d.avg30||0,0,1)}${clockNote?' • '+clockNote:''}`;ul.append(li);}}
    else if(statsVizMode==='weeks'){for(const w of [...(weeklySummariesCache||[])].reverse()){const li=document.createElement('li');li.textContent=`${w.label||w.key||''} — ${formatNumber((w.totalFastMs||0)/3600000,0,1)} ${t('unit.h')}`;ul.append(li);}}
    else if(statsVizMode==='months'){for(const x of [...buildMonthSummaries()].reverse()){const li=document.createElement('li');li.textContent=`${x.label} — ${formatNumber(x.hours,0,1)} ${t('unit.h')} • ${x.count}`;ul.append(li);}}
    else if(statsVizMode==='success'){for(const x of [...buildTargetSuccessSummaries()].reverse()){const li=document.createElement('li');li.textContent=`${x.label} — ${formatNumber(x.successRate,0,0)}% • ${x.reached}/${x.count}`;ul.append(li);}}
    else if(statsVizMode==='distribution'){for(const x of buildDurationDistribution()){const li=document.createElement('li');li.textContent=`${x.label} — ${x.count}`;ul.append(li);}}
    else if(statsVizMode==='startpattern'){for(const x of buildStartPattern()){const li=document.createElement('li');li.textContent=`${x.label} — ${x.count}`;ul.append(li);}}
    else if(statsVizMode==='cumulative'){for(const d of [...buildCumulativeDays()].reverse()){const li=document.createElement('li');const clockNote=clockChangeNoteForDetail({dayKey:d.key},'cumulative');li.textContent=`${d.label||d.key||''} — ${formatNumber(d.cumulativeHours||0,0,1)} ${t('unit.h')}${clockNote?' • '+clockNote:''}`;ul.append(li);}}
    else { const month=el('calendarMonthTitle')?.textContent||''; const li=document.createElement('li'); li.textContent=t('a11y.calendarDataHint',{month}); ul.append(li); }
    if(!ul.children.length){const li=document.createElement('li');li.textContent=t('a11y.noChartData');ul.append(li);} box.append(ul);
  }

  function setWeightUnit(unit) {
    data.weightUnit = normalizeWeightUnit(unit);
    save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] });
    renderWeight();
    viewDirty.weight = false;
  }

  function setTargetWeightFromInput() {
    const raw = el('weightTargetInput').value.trim();
    if (!raw) {
      data.targetWeightKg = null;
      save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] }); renderWeight(); viewDirty.weight = false; return;
    }
    const kg = sanitizeWeightKg(displayToKg(parseLocalizedNumber(raw), data.weightUnit), null);
    if (kg == null) {
      alert(t('weight.errTarget', {unit:data.weightUnit}));
      renderWeight(); return;
    }
    data.targetWeightKg = kg;
    save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] }); renderWeight(); viewDirty.weight = false;
  }

  function hasBackupWorthyData() {
    return !!data.activeStart || data.records.length > 0 || data.deletedFasts.length > 0 || data.weights.length > 0 || data.deletedWeights.length > 0;
  }

  function normalizeBackupClockSkew() {
    const nowMs = Date.now();
    let changed = false;
    for (const key of ['firstDataAt','lastExternalBackupAt']) {
      const d = validDate(backupMeta[key]);
      if (d && d.getTime() > nowMs + FUTURE_TOLERANCE_MS) {
        backupMeta[key] = new Date(nowMs).toISOString();
        changed = true;
      }
    }
    if (changed) saveBackupMeta();
  }

  function ensureBackupTrackingStarted() {
    normalizeBackupClockSkew();
    if (!hasBackupWorthyData()) {
      if (backupMeta.firstDataAt) {
        backupMeta.firstDataAt = null;
        saveBackupMeta();
      }
      return null;
    }
    let firstData = validDate(backupMeta.firstDataAt);
    if (!firstData) {
      firstData = new Date();
      backupMeta.firstDataAt = firstData.toISOString();
      saveBackupMeta();
    }
    return firstData;
  }

  // This is a local change detector, NOT proof that an external backup file exists.
  // Track the actual records and active fasting state; ordinary setting changes
  // (such as language, colors or notification settings) must not falsely mark
  // an otherwise current fasting/weight backup as outdated.
  let backupDatasetSignatureCache = null;
