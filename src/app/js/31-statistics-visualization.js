
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

  function drawGenericBarChart(canvasId,items,valueKey,{maxValue=null,valueSuffix='',selectedKey=null,detailBuilder=null,percent=false,integerScale=false}={}){
    const c=el(canvasId),ctx=c.getContext('2d'),ratio=window.devicePixelRatio||1,cssW=c.clientWidth||660,cssH=c.clientHeight||220;c.width=Math.floor(cssW*ratio);c.height=Math.floor(cssH*ratio);ctx.setTransform(ratio,0,0,ratio,0,0);ctx.clearRect(0,0,cssW,cssH);
    const top=18,bottom=44,left=44,right=10,w=cssW-left-right,h=cssH-top-bottom,rawPeak=Math.max(percent?100:1,maxValue==null?FTVisuals.maxValue(items,valueKey,1):maxValue),peak=integerScale?Math.max(2,Math.ceil(rawPeak)):rawPeak;
    const style=getComputedStyle(document.documentElement),line=style.getPropertyValue('--line').trim(),accent=style.getPropertyValue('--accent').trim(),muted=style.getPropertyValue('--muted').trim(),card=style.getPropertyValue('--card').trim(),textColor=style.getPropertyValue('--text').trim();ctx.strokeStyle=line;ctx.lineWidth=1;
    [0,.5,1].forEach(fr=>{const y=top+h-h*fr,tickValue=integerScale?Math.round(peak*fr):peak*fr;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cssW-right,y);ctx.stroke();ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='right';ctx.fillText(`${formatNumber(tickValue,0,percent||integerScale?0:1)}${valueSuffix}`,left-5,y+3);});
    const n=Math.max(1,items.length),gap=n>80?0.25:Math.max(2,Math.min(10,w/(n*5))),bw=Math.max(.35,(w-gap*(n-1))/n),centers=items.map((_,i)=>left+i*(bw+gap)+bw/2);genericChartHitLayout=[];
    ctx.font='9px -apple-system';const axisLabels=FTVisuals.axisLabelPlan(items,{positions:centers,measureText:text=>ctx.measureText(String(text)).width,maxLabels:12,minGap:7}),axisByIndex=new Map(axisLabels.map(x=>[x.index,x.text]));
    let selectedGeometry=null;
    items.forEach((item,i)=>{const value=Math.max(0,Number(item[valueKey])||0),bh=(Math.min(peak,value)/peak)*h,x=left+i*(bw+gap),y=top+h-bh;ctx.fillStyle=accent;ctx.globalAlpha=.86;ctx.fillRect(x,y,bw,bh);ctx.globalAlpha=1;if(selectedKey===item.key){ctx.strokeStyle='#ffffff';ctx.lineWidth=Math.min(4,Math.max(1,bw));ctx.strokeRect(x-2,Math.max(top,y-2),bw+4,Math.min(h,bh+4));ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.strokeRect(x,Math.max(top,y),bw,Math.min(h,bh));selectedGeometry={item,value,x:x+bw/2,y};}if(axisByIndex.has(i)){const text=axisByIndex.get(i),tw=ctx.measureText(String(text)).width,tx=Math.max(left+tw/2,Math.min(cssW-right-tw/2,x+bw/2));ctx.fillStyle=muted;ctx.font='9px -apple-system';ctx.textAlign='center';ctx.fillText(text,tx,cssH-15);}genericChartHitLayout.push({item,x,y:top,w:Math.max(bw,3),h,canvasId,detailBuilder});});
    if(selectedGeometry){const valueText=`${formatNumber(selectedGeometry.value,0,percent||integerScale?0:1)}${valueSuffix}`;drawChartCallout(ctx,{x:selectedGeometry.x,y:selectedGeometry.y,primary:valueText,secondary:selectedGeometry.item.label||selectedGeometry.item.key,canvasW:cssW,canvasH:cssH,accent,card,textColor,muted});}
    renderChartDetailForMode();
  }
  function handleGenericChartPointer(event){const c=event.currentTarget,rect=c.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;const hit=genericChartHitLayout.find(h=>h.canvasId===c.id&&x>=h.x&&x<=h.x+h.w&&y>=h.y&&y<=h.y+h.h);if(!hit)return;genericChartSelectedKey=hit.item.key;statsDetailOverride=hit.detailBuilder?hit.detailBuilder(hit.item):null;renderStatsVisualizationMode(statsVizMode);renderStatsChartData();}
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

  function sortedWeightsAsc() {
    if (!sortedWeightsAscCache) sortedWeightsAscCache = [...data.weights].sort((a, b) => String(a.when).localeCompare(String(b.when)));
    return sortedWeightsAscCache;
  }

  const WEIGHT_PERIOD_MODES = Object.freeze(['daily','week','month','quarter','halfyear','year']);
  function subtractCalendarMonthsClamped(dateLike, months) {
    const source = new Date(dateLike);
    const day = source.getDate();
    const result = new Date(source);
    result.setDate(1);
    result.setMonth(result.getMonth() - months);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
    return result;
  }
  function weightPeriodBounds(mode = weightPeriodMode, now = new Date()) {
    const end = new Date(now);
    let start = new Date(end);
    if (mode === 'daily') start.setDate(start.getDate() - 29);
    else if (mode === 'week') start.setDate(start.getDate() - 6);
    else if (mode === 'month') start = subtractCalendarMonthsClamped(end, 1);
    else if (mode === 'quarter') start = subtractCalendarMonthsClamped(end, 3);
    else if (mode === 'halfyear') start = subtractCalendarMonthsClamped(end, 6);
    else start = subtractCalendarMonthsClamped(end, 12);
    start.setHours(0,0,0,0);
    return { start, end };
  }
  function weightEntriesForPeriod(asc = sortedWeightsAsc(), mode = weightPeriodMode, now = new Date()) {
    const {start, end} = weightPeriodBounds(mode, now);
    const startIso = start.toISOString(), endIso = end.toISOString();
    let lo = 0, hi = asc.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (String(asc[mid].when) < startIso) lo = mid + 1; else hi = mid; }
    const from = lo; hi = asc.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (String(asc[mid].when) <= endIso) lo = mid + 1; else hi = mid; }
    return asc.slice(from, lo);
  }
  function weightPeriodDateRangeLabel(start, end) {
    const fmt = new Intl.DateTimeFormat(currentLocale(), {day:'numeric',month:'short',year:'numeric'});
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }

  function weightEntryCalendarDay(entry) {
    const stored = typeof entry?.calendarDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.calendarDay) ? entry.calendarDay : null;
    return stored || dayKeyFast(entry.when, entry.timeZone || currentTimeZone());
  }
  function weightBucketKeyForDay(calendarDay, mode = weightPeriodMode) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(calendarDay || ''));
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (mode === 'week') {
      const shift = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - shift);
    } else if (mode === 'month') d.setUTCDate(1);
    else if (mode === 'quarter') { d.setUTCDate(1); d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3); }
    else if (mode === 'halfyear') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() < 6 ? 0 : 6); }
    else { d.setUTCMonth(0, 1); }
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  }
  function nextWeightBucketKey(key, mode = weightPeriodMode) {
    const [year,month,day] = String(key).split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (mode === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else if (mode === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (mode === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3);
    else if (mode === 'halfyear') d.setUTCMonth(d.getUTCMonth() + 6);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  }
  function weightBucketDate(key) {
    const [year,month,day] = String(key).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
  }
  function weightBucketLongLabel(bucket, mode = weightPeriodMode) {
    if (mode === 'daily' && bucket?.entry) return localDateTimeLabel(bucket.entry.when, bucket.entry.timeZone);
    const d = weightBucketDate(bucket.key);
    const locale = currentLocale();
    const year = d.getUTCFullYear(), month = d.getUTCMonth();
    if (mode === 'week') return t('weight.weekOf', {date:d.toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})});
    if (mode === 'month') return d.toLocaleDateString(locale,{month:'long',year:'numeric',timeZone:'UTC'});
    if (mode === 'quarter') return t('weight.quarterLabel',{quarter:Math.floor(month/3)+1,year});
    if (mode === 'halfyear') return t('weight.halfYearLabel',{half:month<6?1:2,year});
    return String(year);
  }
  function weightBucketShortLabel(bucket, mode = weightPeriodMode) {
    if (mode === 'daily' && bucket?.entry) {
      const d = new Date(bucket.entry.when), tz = bucket.entry.timeZone || currentTimeZone();
      return d.toLocaleDateString(currentLocale(), {day:'numeric',month:'short',year:'2-digit',timeZone:tz});
    }
    const d = weightBucketDate(bucket.key);
    const locale = currentLocale();
    const year = d.getUTCFullYear(), month = d.getUTCMonth();
    if (mode === 'week') return d.toLocaleDateString(locale,{day:'numeric',month:'short',timeZone:'UTC'});
    if (mode === 'month') return d.toLocaleDateString(locale,{month:'short',year:'2-digit',timeZone:'UTC'});
    if (mode === 'quarter') return t('weight.quarterShort',{quarter:Math.floor(month/3)+1,year:String(year).slice(-2)});
    if (mode === 'halfyear') return t('weight.halfYearShort',{half:month<6?1:2,year:String(year).slice(-2)});
    return String(year);
  }
  function weightPointCalloutPeriod(bucket, mode = weightPeriodMode) {
    if (mode === 'daily' && bucket?.entry) {
      const d = new Date(bucket.entry.when), tz = bucket.entry.timeZone || currentTimeZone();
      return d.toLocaleString(currentLocale(), {day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:tz});
    }
    return weightBucketLongLabel(bucket, mode);
  }
  function buildWeightAggregateBuckets(asc = null, mode = weightPeriodMode) {
    const key = `${Number(data.revision)||0}|${mode}`;
    if (weightAggregateCache.has(key)) return weightAggregateCache.get(key);
    if (weightAggregateCache.size > 10) weightAggregateCache.clear();
    const entries = Array.isArray(asc) ? asc : sortedWeightsAsc();
    if (mode === 'daily') {
      const result = entries.map(entry => ({
        key:`entry:${entry.id}`, count:1, sumKg:entry.kg, averageKg:entry.kg,
        lowKg:entry.kg, highKg:entry.kg, first:entry, latest:entry, entry
      }));
      weightAggregateCache.set(key, result);
      return result;
    }
    const map = new Map();
    for (const entry of entries) {
      const bucketKey = weightBucketKeyForDay(weightEntryCalendarDay(entry), mode);
      if (!bucketKey) continue;
      let bucket = map.get(bucketKey);
      if (!bucket) {
        bucket = {key:bucketKey,count:0,sumKg:0,averageKg:null,lowKg:entry.kg,highKg:entry.kg,first:entry,latest:entry};
        map.set(bucketKey,bucket);
      }
      bucket.count += 1;
      bucket.sumKg += entry.kg;
      bucket.lowKg = Math.min(bucket.lowKg, entry.kg);
      bucket.highKg = Math.max(bucket.highKg, entry.kg);
      if (String(entry.when) < String(bucket.first.when)) bucket.first = entry;
      if (String(entry.when) > String(bucket.latest.when)) bucket.latest = entry;
    }
    const keys = [...map.keys()].sort();
    if (!keys.length) { weightAggregateCache.set(key, []); return []; }
    const result = [];
    for (let cursor = keys[0], last = keys[keys.length-1], guard = 0; cursor <= last && guard < 20000; cursor = nextWeightBucketKey(cursor, mode), guard++) {
      const bucket = map.get(cursor);
      if (bucket) bucket.averageKg = bucket.sumKg / bucket.count;
      result.push(bucket || {key:cursor,count:0,sumKg:0,averageKg:null,lowKg:null,highKg:null,first:null,latest:null});
    }
    weightAggregateCache.set(key, result);
    return result;
  }
  function renderWeightPeriodAnalytics(asc = sortedWeightsAsc()) {
    if (!WEIGHT_PERIOD_MODES.includes(weightPeriodMode)) weightPeriodMode = 'daily';
    document.querySelectorAll('#weightPeriodSwitcher [data-weight-period]').forEach(btn => {
      const active = btn.dataset.weightPeriod === weightPeriodMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    const bounds = weightPeriodBounds(weightPeriodMode);
    const entries = weightEntriesForPeriod(asc, weightPeriodMode, bounds.end);
    const range = weightPeriodDateRangeLabel(bounds.start, bounds.end);
    const summary = el('weightPeriodRange');
    if (summary) {
      const count = entries.length;
      summary.textContent = t('weight.periodSummary', {range, count:formatNumber(count), measurementWord:t(pluralKey('weight.measurement', count))});
      summary.dataset.count = String(count);
      summary.dataset.period = weightPeriodMode;
    }
    const ids = ['wPeriodStart','wPeriodEnd','wPeriodChange','wPeriodAverage','wPeriodLow','wPeriodHigh'];
    if (!entries.length) { ids.forEach(id => { const node=el(id); if(node) node.textContent='—'; }); return entries; }
    const unit = data.weightUnit;
    const first = entries[0], latest = entries[entries.length - 1];
    let total = 0, low = entries[0].kg, high = entries[0].kg;
    for (const entry of entries) { total += entry.kg; if (entry.kg < low) low = entry.kg; if (entry.kg > high) high = entry.kg; }
    const average = total / entries.length;
    el('wPeriodStart').textContent = formatWeight(first.kg, unit);
    el('wPeriodEnd').textContent = formatWeight(latest.kg, unit);
    el('wPeriodChange').textContent = formatWeight(latest.kg - first.kg, unit, true);
    el('wPeriodAverage').textContent = formatWeight(average, unit);
    el('wPeriodLow').textContent = formatWeight(low, unit);
    el('wPeriodHigh').textContent = formatWeight(high, unit);
    return entries;
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

  function drawWeightChartYAxis(minV, maxV) {
    const c = el('weightChartYAxis');
    if (!c) return;
    const ratio = window.devicePixelRatio || 1, cssW = 46, cssH = 240;
    c.width = Math.floor(cssW * ratio); c.height = Math.floor(cssH * ratio);
    c.style.width = `${cssW}px`; c.style.height = `${cssH}px`;
    const ctx = c.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,cssW,cssH);
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    const top=18,bottom=38,h=cssH-top-bottom,span=maxV-minV||1;
    ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='right';ctx.textBaseline='middle';
    [0,.5,1].forEach(frac=>{const y=top+h-h*frac;ctx.fillText(formatNumber(minV+span*frac,1,1),40,y);});
  }

  function drawWeightChart(asc = null) {
    const c = el('weightChart'), scroller = el('weightChartScroller'), track = el('weightChartTrack');
    if (!c || !scroller || !track) return;
    const aggregatedBuckets = buildWeightAggregateBuckets(Array.isArray(asc) ? asc : null, weightPeriodMode);
    // Aggregate views omit empty calendar intervals. Empty weeks/months create
    // blank columns and force scrolling when only a few periods contain data.
    const buckets = weightPeriodMode === 'daily' ? aggregatedBuckets : aggregatedBuckets.filter(bucket => bucket.count > 0);
    weightChartBuckets = buckets;
    const viewportW = Math.max(220, scroller.clientWidth || 614), cssH = 240;
    const ratio = window.devicePixelRatio || 1;
    c.style.width = `${viewportW}px`; c.style.height = `${cssH}px`;
    c.width = Math.floor(viewportW * ratio); c.height = Math.floor(cssH * ratio);
    const ctx = c.getContext('2d'); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,viewportW,cssH);

    const chartNote = el('weightChartNote');
    if (chartNote) chartNote.textContent = t('weight.chartHelp');
    const detail = el('weightChartDetail');
    weightChartHitPoints = [];
    const style = getComputedStyle(document.documentElement);
    const line=style.getPropertyValue('--line').trim(), accent=style.getPropertyValue('--accent').trim(), muted=style.getPropertyValue('--muted').trim();
    const good=style.getPropertyValue('--good').trim(), card=style.getPropertyValue('--card').trim(), textColor=style.getPropertyValue('--text').trim();
    const unit=data.weightUnit;

    if (!buckets.length) {
      track.style.width='100%'; weightChartSelectedId=null;
      if(detail){detail.hidden=true;detail.textContent='';}
      drawWeightChartYAxis(0,1);
      ctx.fillStyle=muted;ctx.font='13px -apple-system';ctx.textAlign='center';ctx.fillText(t('weight.addChart'),viewportW/2,cssH/2);ctx.textAlign='start';syncWeightChartNavigator();return;
    }

    const dataBuckets=weightPeriodMode==='daily'?buckets:buckets.filter(b=>b.count>0);
    if (weightChartSelectedId && !dataBuckets.some(b=>b.key===weightChartSelectedId)) weightChartSelectedId=null;
    const target=data.targetWeightKg==null?null:kgToDisplay(data.targetWeightKg,unit);
    const scaleKey=`${Number(data.revision)||0}|${weightPeriodMode}|${unit}|${target==null?'none':target}`;
    let minV,maxV,span;
    if(weightChartScaleCache?.key===scaleKey){({minV,maxV,span}=weightChartScaleCache);}
    else {
      minV=Infinity;maxV=-Infinity;
      for(const bucket of dataBuckets){const v=kgToDisplay(bucket.averageKg,unit);if(v<minV)minV=v;if(v>maxV)maxV=v;}
      if(target!=null){if(target<minV)minV=target;if(target>maxV)maxV=target;}
      span=maxV-minV;
      const padV=span>0?Math.max(span*.15,unit==='lb'?2:1):(unit==='lb'?5:2);minV-=padV;maxV+=padV;span=maxV-minV||1;
      weightChartScaleCache={key:scaleKey,minV,maxV,span};
    }
    drawWeightChartYAxis(minV,maxV);

    const top=18,bottom=38,left=16,right=14,plotW=Math.max(1,viewportW-left-right),h=cssH-top-bottom;
    const dailySpacing=buckets.length<=30
      ? Math.max(1,plotW/Math.max(1,buckets.length-1))
      : Math.max(10,Math.min(22,plotW/29));
    // Daily retains its fine-grained, scrollable history. Weekly and broader
    // aggregates distribute all non-empty periods across the available width.
    const pointSpacing=weightPeriodMode==='daily' ? dailySpacing : plotW/Math.max(1,buckets.length-1);
    const virtualPlotW=weightPeriodMode==='daily' ? Math.max(plotW,(buckets.length-1)*pointSpacing) : plotW;
    const trackW=Math.ceil(left+virtualPlotW+right);
    track.style.width=`${Math.max(viewportW,trackW)}px`;
    scroller.dataset.period = weightPeriodMode;
    scroller.dataset.bucketCount = String(buckets.length);
    scroller.dataset.dataPointCount = String(dataBuckets.length);
    if(weightChartScrollToLatestPending){scroller.scrollLeft=Math.max(0,scroller.scrollWidth-scroller.clientWidth);weightChartProgrammaticScrollLeft=scroller.scrollLeft;for(let i=buckets.length-1;i>=0;i--){if(buckets[i].count>0){weightChartSelectedId=buckets[i].key;break;}}weightChartScrollToLatestPending=false;}
    const scrollX=scroller.scrollLeft;
    const yFor=v=>top+h-((v-minV)/span)*h;
    const absoluteX=i=>left+(buckets.length===1?plotW/2:i*pointSpacing);
    const xFor=i=>absoluteX(i)-scrollX;

    ctx.strokeStyle=line;ctx.lineWidth=1;
    [0,.5,1].forEach(frac=>{const y=top+h-h*frac;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(viewportW,y);ctx.stroke();});
    if(target!=null){const y=yFor(target);ctx.save();ctx.strokeStyle=good;ctx.setLineDash([5,4]);ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(viewportW,y);ctx.stroke();ctx.restore();}

    const firstVisible=Math.max(0,Math.floor((scrollX-left)/Math.max(1,pointSpacing))-2);
    const lastVisible=Math.min(buckets.length-1,Math.ceil((scrollX+viewportW-left)/Math.max(1,pointSpacing))+2);
    ctx.strokeStyle=accent;ctx.lineWidth=2.5;ctx.lineJoin='round';ctx.lineCap='round';
    let pathOpen=false;
    ctx.beginPath();
    for(let i=Math.max(0,firstVisible-1);i<=Math.min(buckets.length-1,lastVisible+1);i++){
      const bucket=buckets[i];
      if(!bucket.count){pathOpen=false;continue;}
      const x=xFor(i),y=yFor(kgToDisplay(bucket.averageKg,unit));
      if(!pathOpen){ctx.moveTo(x,y);pathOpen=true;}else ctx.lineTo(x,y);
    }
    ctx.stroke();

    const weightMarkerEvery=Math.max(1,Math.ceil(16/Math.max(1,pointSpacing)));
    ctx.fillStyle=accent;
    for(let i=firstVisible;i<=lastVisible;i++){
      const bucket=buckets[i]; if(!bucket.count) continue;
      const value=kgToDisplay(bucket.averageKg,unit),x=xFor(i),y=yFor(value);
      if(x < -28 || x > viewportW+28) continue;
      weightChartHitPoints.push({id:bucket.key,bucket,x,y,value});
      const selected=bucket.key===weightChartSelectedId;if(selected||i%weightMarkerEvery===0||i===lastVisible||i===buckets.length-1){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();}
    }

    const selectedIndex=buckets.findIndex(b=>b.key===weightChartSelectedId&&b.count>0);
    if(selectedIndex>=0){
      const bucket=buckets[selectedIndex],x=xFor(selectedIndex),value=kgToDisplay(bucket.averageKg,unit),y=yFor(value);
      if(x>=-18&&x<=viewportW+18){
        drawSelectionCrosshair(ctx,x,top,top+h,muted);
        ctx.save();ctx.fillStyle='#fff';ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,6.5,0,Math.PI*2);ctx.fill();ctx.stroke();
        const valueLabel=formatWeight(bucket.averageKg,unit),periodLabel=weightPointCalloutPeriod(bucket);
        ctx.font='600 12px -apple-system';const valueW=ctx.measureText(valueLabel).width;
        ctx.font='10px -apple-system';const periodW=ctx.measureText(periodLabel).width;
        const labelW=Math.min(viewportW-8,Math.max(72,Math.ceil(Math.max(valueW,periodW))+18)),labelH=39;
        const bx=Math.max(4,Math.min(viewportW-labelW-4,x-labelW/2)),by=y>62?y-51:y+12;
        ctx.fillStyle=card;ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(bx,by,labelW,labelH,7);else ctx.rect(bx,by,labelW,labelH);ctx.fill();ctx.stroke();
        ctx.fillStyle=textColor;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='600 12px -apple-system';ctx.fillText(valueLabel,bx+labelW/2,by+13);
        ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.fillText(periodLabel,bx+labelW/2,by+28);ctx.restore();
      }
      if(detail){
        if(weightPeriodMode==='daily'&&bucket.entry) detail.textContent=t('weight.pointDetail',{weight:formatWeight(bucket.entry.kg,unit),date:localDateTimeLabel(bucket.entry.when,bucket.entry.timeZone)});
        else {const count=bucket.count;detail.textContent=t('weight.aggregatePointDetail',{weight:formatWeight(bucket.averageKg,unit),period:weightBucketLongLabel(bucket),count:formatNumber(count),measurementWord:t(pluralKey('weight.measurement',count))});}
        detail.hidden=false;
      }
    } else if(detail){detail.hidden=true;detail.textContent='';}

    ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='center';ctx.textBaseline='alphabetic';
    const visibleAxisItems=[],visibleAxisPositions=[];for(let i=firstVisible;i<=lastVisible;i++){const x=xFor(i);if(x<8||x>viewportW-8)continue;const label=weightBucketShortLabel(buckets[i]);visibleAxisItems.push({label,shortLabel:label,index:i});visibleAxisPositions.push(x);}
    const axisPlan=FTVisuals.axisLabelPlan(visibleAxisItems,{positions:visibleAxisPositions,measureText:text=>ctx.measureText(String(text)).width,maxLabels:Math.max(2,Math.floor(viewportW/62)),minGap:7});
    for(const tick of axisPlan){const text=String(tick.text),tw=ctx.measureText(text).width,x=Math.max(4+tw/2,Math.min(viewportW-4-tw/2,tick.x));ctx.fillText(text,x,cssH-10);}
    ctx.textAlign='start';
    syncWeightChartNavigator();
  }

  function weightChartPointAt(clientX,clientY){
    const c=el('weightChart');if(!c||!weightChartHitPoints.length)return null;const rect=c.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;let best=null,bestDistance=Infinity;
    for(const point of weightChartHitPoints){const distance=Math.hypot(x-point.x,y-point.y);if(distance<bestDistance){best=point;bestDistance=distance;}}
    return bestDistance<=28?best:null;
  }
  function selectWeightChartPointAtX(clientX){
    const c=el('weightChart');if(!c||!weightChartHitPoints.length)return null;
    const x=clientX-c.getBoundingClientRect().left;let best=null,distance=Infinity;
    for(const point of weightChartHitPoints){const d=Math.abs(x-point.x);if(d<distance){distance=d;best=point;}}
    return best&&distance<=Math.max(32,(c.clientWidth||220)/Math.max(1,weightChartHitPoints.length)*1.5)?best:null;
  }
  function weightChartPointSpacing(){
    const scroller=el('weightChartScroller'),buckets=weightChartBuckets,viewportW=Math.max(220,scroller?.clientWidth||614),plotW=Math.max(1,viewportW-30);
    if(weightPeriodMode==='daily')return buckets.length<=30?Math.max(1,plotW/Math.max(1,buckets.length-1)):Math.max(10,Math.min(22,plotW/29));
    return plotW/Math.max(1,buckets.length-1);
  }
  function syncWeightChartNavigator(){
    const slider=el('weightChartRange'),older=el('weightChartOlderBtn'),newer=el('weightChartNewerBtn'),scroller=el('weightChartScroller');
    if(!slider||!older||!newer||!scroller)return;
    const buckets=weightChartBuckets,valid=buckets.filter(b=>b.count>0);
    slider.max=String(Math.max(0,buckets.length-1));
    const selectedIndex=buckets.findIndex(b=>b.key===weightChartSelectedId);
    slider.value=String(Math.max(0,selectedIndex));
    slider.disabled=valid.length<2;
    const selectedValidIndex=valid.findIndex(b=>b.key===weightChartSelectedId);
    older.disabled=valid.length<2||selectedValidIndex===0;
    newer.disabled=valid.length<2||selectedValidIndex===valid.length-1;
    const bucket=buckets[selectedIndex];
    slider.setAttribute('aria-valuetext',bucket&&bucket.count ? weightBucketLongLabel(bucket)+' — '+formatWeight(bucket.averageKg,data.weightUnit) : '');
  }
  function nearestWeightBucketIndex(index){
    const buckets=weightChartBuckets;
    index=Math.max(0,Math.min(buckets.length-1,Math.round(Number(index)||0)));
    if(buckets[index]?.count)return index;
    for(let distance=1;distance<buckets.length;distance++){
      if(buckets[index-distance]?.count)return index-distance;
      if(buckets[index+distance]?.count)return index+distance;
    }
    return -1;
  }
  function navigateWeightChartToIndex(index){
    const scroller=el('weightChartScroller'),buckets=weightChartBuckets;
    if(!scroller||!buckets.length)return;
    const targetIndex=nearestWeightBucketIndex(index);
    if(targetIndex<0)return;
    weightChartSelectedId=buckets[targetIndex].key;
    const spacing=weightChartPointSpacing(),pointX=16+targetIndex*spacing;
    weightChartProgrammaticScrollLeft=Math.max(0,Math.min(scroller.scrollWidth-scroller.clientWidth,pointX-scroller.clientWidth/2));
    scroller.scrollLeft=weightChartProgrammaticScrollLeft;
    drawWeightChart();
    renderWeightChartData();
    syncWeightChartNavigator();
  }
  function shiftWeightChartViewport(direction){
    const scroller=el('weightChartScroller'),buckets=weightChartBuckets;
    if(!scroller||!buckets.length)return;
    const valid=buckets.filter(b=>b.count>0);
    if(valid.length<2)return;
    let current=valid.findIndex(b=>b.key===weightChartSelectedId);
    if(current<0){
      const spacing=weightChartPointSpacing(),center=scroller.scrollLeft+scroller.clientWidth/2;
      let bestDistance=Infinity;
      valid.forEach((bucket,i)=>{
        const bucketIndex=buckets.findIndex(b=>b.key===bucket.key),pointX=16+bucketIndex*spacing;
        const distance=Math.abs(pointX-center);
        if(distance<bestDistance){bestDistance=distance;current=i;}
      });
    }
    const target=Math.max(0,Math.min(valid.length-1,current+(direction<0?-1:1)));
    if(target===current){syncWeightChartNavigator();return;}
    navigateWeightChartToIndex(buckets.findIndex(b=>b.key===valid[target].key));
  }
  function beginWeightChartPointer(event){
    if(event.button!=null&&event.button!==0)return;
    weightChartPointerStart={id:event.pointerId,x:event.clientX,y:event.clientY,scrollLeft:el('weightChartScroller')?.scrollLeft||0};
  }
  function finishWeightChartPointer(event){
    const start=weightChartPointerStart;weightChartPointerStart=null;
    if(!start||start.id!==event.pointerId)return;
    if(Math.hypot(event.clientX-start.x,event.clientY-start.y)>10||Math.abs((el('weightChartScroller')?.scrollLeft||0)-start.scrollLeft)>8)return;
    const point=weightChartPointAt(event.clientX,event.clientY);if(!point)return;
    weightChartSelectedId=point.id;drawWeightChart();renderWeightChartData();syncWeightChartNavigator();
  }
  function cancelWeightChartPointer(){weightChartPointerStart=null;}

  function handleWeightChartScroll(){
    if(weightChartScrollFrame)return;
    weightChartScrollFrame=requestAnimationFrame(()=>{
      weightChartScrollFrame=0;
      const scroller=el('weightChartScroller'),buckets=weightChartBuckets;
      const programmaticScroll=scroller&&weightChartProgrammaticScrollLeft!==null&&Math.abs(scroller.scrollLeft-weightChartProgrammaticScrollLeft)<=2;
      if(scroller&&weightChartProgrammaticScrollLeft!==null&&!programmaticScroll)weightChartProgrammaticScrollLeft=null;
      if(scroller&&buckets.length&&!weightChartPointerStart?.scrubbing&&!programmaticScroll){
        const spacing=weightChartPointSpacing(),centerX=scroller.scrollLeft+scroller.clientWidth/2;
        const index=Math.max(0,Math.min(buckets.length-1,Math.round((centerX-16)/Math.max(1,spacing))));
        let nearest=buckets[index];
        if(!nearest?.count){let distance=Infinity;for(let i=0;i<buckets.length;i++){if(!buckets[i].count)continue;const d=Math.abs(i-index);if(d<distance){distance=d;nearest=buckets[i];}}}
        if(nearest?.count)weightChartSelectedId=nearest.key;
      }
      drawWeightChart();renderWeightChartData();syncWeightChartNavigator();
    });
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
