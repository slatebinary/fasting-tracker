  const RANGE_MODES=new Set(['trend','months','distribution','success','startpattern','cumulative']);
  function loadChartRanges(){try{const raw=JSON.parse(localStorage.getItem(CHART_RANGE_KEY)||'{}')||{};const out={};for(const [mode,def] of Object.entries(DEFAULT_CHART_RANGES))out[mode]=['7d','30d','90d','6m','1y','all'].includes(raw[mode])?raw[mode]:def;return out;}catch{return {...DEFAULT_CHART_RANGES};}}
  function saveChartRanges(){try{localStorage.setItem(CHART_RANGE_KEY,JSON.stringify(chartRanges));}catch{}}
  function chartRange(mode=statsVizMode){return chartRanges[mode]||DEFAULT_CHART_RANGES[mode]||'30d';}
  function chartRangeRecords(mode=statsVizMode){return FTAnalytics.filterRecords(data.records,chartRange(mode));}
  function chartRangeLabel(range){return t(`stats.range.${range}`);}
  function updateStatsRangeControl(){const bar=el('statsRangeBar'),sel=el('statsRangeSelect'),summary=el('statsRangeSummary');const enabled=RANGE_MODES.has(statsVizMode);if(bar)bar.hidden=!enabled;if(!enabled)return;if(sel)sel.value=chartRange(statsVizMode);if(summary){const n=chartRangeRecords(statsVizMode).length;summary.textContent=t('stats.rangeSummary',{range:chartRangeLabel(chartRange(statsVizMode)),n});}}
  const STATS_HISTORY_NAV_MODES=new Set(['timeline','trend','weeks','months','success','cumulative']);
  function statsHistoryNavigationItems(mode=statsVizMode){
    if(mode==='timeline')return timelineChartDays;
    if(mode==='trend')return buildTrendDays();
    if(mode==='weeks')return buildWeeklySummaries();
    if(mode==='months')return buildMonthSummaries('months');
    if(mode==='success')return buildTargetSuccessSummaries();
    if(mode==='cumulative')return buildCumulativeDays();
    return [];
  }
  function statsHistorySelectedKey(mode=statsVizMode){
    if(mode==='timeline')return chartSelectedTarget?.dayKey||null;
    if(mode==='trend')return trendSelectedDayKey;
    if(mode==='weeks')return weekSelectedKey;
    if(mode==='cumulative')return cumulativeSelectedDayKey;
    if(mode==='months'||mode==='success')return genericChartSelectedKey;
    return null;
  }
  function syncStatsHistoryNavigator(){
    const wrap=el('statsHistoryNavigator'),slider=el('statsHistoryRange'),older=el('statsHistoryOlderBtn'),newer=el('statsHistoryNewerBtn');
    if(!wrap||!slider||!older||!newer)return;
    const applicable=STATS_HISTORY_NAV_MODES.has(statsVizMode),items=applicable?statsHistoryNavigationItems():[];
    wrap.hidden=!applicable||items.length<2;
    if(wrap.hidden)return;
    const selectedKey=statsHistorySelectedKey(),selected=items.findIndex(item=>item.key===selectedKey),index=selected<0?items.length-1:selected;
    slider.min='0';slider.max=String(items.length-1);slider.step='1';slider.value=String(index);slider.disabled=items.length<2;
    older.disabled=index<=0;newer.disabled=index>=items.length-1;
    const item=items[index];slider.setAttribute('aria-valuetext',item?.label||item?.key||'');
  }
  function selectStatsHistoryIndex(rawIndex){
    const mode=statsVizMode,items=statsHistoryNavigationItems(mode);if(!STATS_HISTORY_NAV_MODES.has(mode)||items.length<2)return;
    const index=Math.max(0,Math.min(items.length-1,Math.round(Number(rawIndex)||0))),item=items[index];if(!item)return;
    statsDetailOverride=null;
    if(mode==='timeline'){
      chartSelectedTarget={kind:'day',dayKey:item.key};drawChart(timelineChartDays);
      const scroller=el('timelineScroller'),g=timelineChartGeometry;
      if(scroller&&g){const x=g.left+index*g.slot+g.slot/2;scroller.scrollLeft=Math.max(0,Math.min(scroller.scrollWidth-scroller.clientWidth,x-scroller.clientWidth/2));}
      statsDetailOverride=chartSelectionDetail(timelineChartDays);
    }else if(mode==='trend'){
      trendSelectedDayKey=item.key;statsDetailOverride={dayKey:item.key,title:item.label,text:t('stats.detailTrend',{duration:compactDuration(item.totalFastMs||0),avg7:formatNumber(item.avg7||0,0,1),avg30:formatNumber(item.avg30||0,0,1)}),records:recordsOverlappingDay(item)};drawFastTrendChart();
    }else if(mode==='weeks'){
      weekSelectedKey=item.key;const tz=currentTimeZone(),start=zonedLocalToDate(`${item.key}T00:00`,tz);let endMs=start?.getTime()||NaN;if(Number.isFinite(endMs))for(let i=0;i<7;i++)endMs=nextZonedDayBoundary(endMs,tz);statsDetailOverride={dayKey:item.key,title:t('stats.weekOf',{date:item.label}),text:t('stats.detailWeek',{duration:compactDuration(item.totalFastMs||0),days:formatNumber(item.daysWithFast||0)}),records:start&&Number.isFinite(endMs)?recordsOverlappingRange(start.getTime(),endMs):[]};drawFastWeeksChart();
    }else if(mode==='months'){
      genericChartSelectedKey=item.key;const source=chartRangeRecords('months');statsDetailOverride={dayKey:item.key,title:item.label,text:t('stats.detailMonth',{duration:compactDuration(item.totalMs||0),count:formatNumber(item.count||0)}),records:recordsContributingMonth(item.key,source)};drawFastMonthsChart();
    }else if(mode==='success'){
      genericChartSelectedKey=item.key;const source=chartRangeRecords('success');statsDetailOverride={dayKey:item.key,title:item.label,text:t('stats.detailSuccess',{rate:formatNumber(item.successRate||0,0,0),reached:formatNumber(item.reached||0),count:formatNumber(item.count||0)}),records:recordsEndingInMonth(item.key,source)};drawFastSuccessChart();
    }else if(mode==='cumulative'){
      cumulativeSelectedDayKey=item.key;const first=items[0];statsDetailOverride={dayKey:item.key,title:item.label,text:t('stats.detailCumulative',{hours:formatNumber(item.cumulativeHours||0,0,1),today:formatNumber((item.totalFastMs||0)/3600000,0,1)}),records:first?recordsOverlappingRange(first.startMs,item.endMs,chartRangeRecords('cumulative')):[]};drawFastCumulativeChart();
    }
    renderChartDetailForMode();if(el('statsChartData')&&!el('statsChartData').hidden)renderStatsChartData();syncStatsHistoryNavigator();
  }
  function shiftStatsHistory(direction){const items=statsHistoryNavigationItems();if(items.length<2)return;const selected=items.findIndex(item=>item.key===statsHistorySelectedKey()),current=selected<0?items.length-1:selected;selectStatsHistoryIndex(current+(direction<0?-1:1));}
  function changeStatsRange(range){if(!RANGE_MODES.has(statsVizMode)||!['7d','30d','90d','6m','1y','all'].includes(range))return;chartRanges[statsVizMode]=range;saveChartRanges();trendChartDaysCache=null;monthSummariesCache=null;durationDistributionCache=null;targetSuccessCache=null;startPatternCache=null;cumulativeDaysCache=null;statsVizRendered.delete(statsVizMode);statsDetailOverride=null;genericChartSelectedKey=null;trendSelectedDayKey=null;cumulativeSelectedDayKey=null;statsDrilldownRecordIds=[];renderChartDetailForMode();updateStatsRangeControl();scheduleStatsVizRender(statsVizMode);}
  function announceStatsSelection(detail){const live=el('statsSelectionLive');if(live&&detail)live.textContent=`${detail.title||''}. ${detail.text||''}`.trim();}
  function setStatsDrilldown(records=[]){statsDrilldownRecordIds=[...new Set((records||[]).map(r=>r&&r.id).filter(Boolean))];const btn=el('statsDrilldownBtn');if(btn)btn.hidden=!statsDrilldownRecordIds.length;}
  function recordsEndingInMonth(key,source=data.records){return source.filter(r=>dayKeyFast(r.end,r.timeZone).slice(0,7)===key);}
  function recordsContributingMonth(key,source=data.records){return source.filter(r=>{try{for(const day of recordDayContribution(r).keys())if(String(day).slice(0,7)===key)return true;}catch{}return false;});}
  function recordsForDurationBucket(key,source=data.records){return source.filter(r=>FTAnalytics.durationBucketKey(recordMs(r)/3600000)===key);}
  function recordsForStartBucket(key,source=data.records){return source.filter(r=>FTAnalytics.startBucketKey(zonedParts(r.start,r.timeZone).hour)===String(key));}
  function recordsOverlappingRange(startMs,endMs,source=data.records){return source.filter(r=>{const a=new Date(r.start).getTime(),b=new Date(r.end).getTime();return Number.isFinite(a)&&Number.isFinite(b)&&a<endMs&&b>startMs;});}
  function recordsOverlappingDay(day){return day?recordsOverlappingRange(day.startMs,day.endMs):[];}
  function openStatsDrilldown(){const records=data.records.filter(r=>statsDrilldownRecordIds.includes(r.id)).sort((a,b)=>String(b.end).localeCompare(String(a.end)));const box=el('statsDrilldownList');box.replaceChildren();el('statsDrilldownSummary').textContent=t('stats.drilldownCount',{n:records.length});if(!records.length){box.textContent=t('stats.drilldownEmpty');}else for(const r of records){const row=document.createElement('div');row.className='row';const left=document.createElement('div');const strong=document.createElement('strong');strong.textContent=localDateLabel(r.end,r.timeZone);const small=document.createElement('div');small.className='small';small.textContent=`${localDateTimeLabel(r.start,r.timeZone)} → ${localDateTimeLabel(r.end,r.timeZone)}`;left.append(strong,small);const right=document.createElement('div');right.className='duration';right.textContent=compactDuration(recordMs(r));row.append(left,right);box.append(row);}showModal('statsDrilldownModal','statsDrilldownCloseBtn');}

  function setStatsDetail(title, text) {
    statsDetailOverride = title || text ? { title: title || t('stats.chartDetailDefaultTitle'), text: text || '' } : null;
    renderChartDetailForMode();
  }

  function defaultStatsHelpKey() {
    return statsVizMode === 'calendar' ? 'stats.calendarHelp' : statsVizMode === 'trend' ? 'stats.trendHelp' : statsVizMode === 'weeks' ? 'stats.weeksHelp' : statsVizMode === 'months' ? 'stats.monthsHelp' : statsVizMode === 'distribution' ? 'stats.distributionHelp' : statsVizMode === 'success' ? 'stats.successHelp' : statsVizMode === 'startpattern' ? 'stats.startPatternHelp' : statsVizMode === 'cumulative' ? 'stats.cumulativeHelp' : 'stats.timelineHelp';
  }

  function renderChartDetailForMode(days = null) {
    const title = el('chartDetailTitle'), text = el('chartDetailText');
    if (!title || !text) return;
    let detail = statsDetailOverride;
    if (!detail && statsVizMode === 'timeline') {
      // Timeline selection is retained while the user visits another screen.
      // Rebuild its detail from the last rendered day model when Statistics returns.
      const availableDays = Array.isArray(days) && days.length ? days : timelineChartDays;
      if (chartSelectedTarget && availableDays.length) {
        detail = chartSelectionDetail(availableDays);
        // Do not leave a stale highlight if a range/data change removed the target.
        if (!detail) chartSelectedTarget = null;
      }
    }
    title.textContent = detail?.title || t('stats.chartDetailDefaultTitle');
    const clockNote=detail?clockChangeNoteForDetail(detail,statsVizMode):'';
    text.textContent = [detail?.text,clockNote].filter(Boolean).join(' ');
    if(detail){announceStatsSelection({...detail,text:text.textContent});setStatsDrilldown(detail.records||[]);}else setStatsDrilldown([]);
    const help = el('statsVizHelp'); if (help) help.textContent = t(defaultStatsHelpKey());
    updateStatsRangeControl();
    syncStatsHistoryNavigator();
  }

