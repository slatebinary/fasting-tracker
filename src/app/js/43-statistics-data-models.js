  function allFastingIntervals(rangeStart = -Infinity, rangeEnd = Infinity) {
    return buildFastingIntervals({
      records:data.records,
      activeStart:data.activeStart,
      activeGoalHours:data.activeGoalHours,
      defaultGoalHours:data.goalHours,
      rangeStart,
      rangeEnd,
      nowMs:Date.now(),
      sanitizeGoal
    });
  }

  function currentZoneDaySummaries(timeZone = currentTimeZone(), rangeStart = -Infinity, rangeEnd = Infinity) {
    const tz = normalizeTimeZone(timeZone);
    const cacheKey = `${tz}|${Number.isFinite(rangeStart)?Math.floor(rangeStart/86400000):'all'}|${Number.isFinite(rangeEnd)?Math.ceil(rangeEnd/86400000):'all'}|${data.revision}`;
    if (currentZoneDaySummaryCache?.key === cacheKey) return currentZoneDaySummaryCache.map;
    const map = buildCurrentZoneDaySummaries(allFastingIntervals(rangeStart, rangeEnd), tz, rangeStart, rangeEnd, dayKey, nextZonedDayBoundary);
    currentZoneDaySummaryCache = { key:cacheKey, map };
    return map;
  }

  function renderStatsChartData(){
    const box=el('statsChartData'); if(!box||box.hidden)return; box.replaceChildren(); const ul=document.createElement('ul');
    if(statsVizMode==='timeline'){for(const d of [...timelineChartDays].reverse()){const li=document.createElement('li');const clockNote=clockChangeNoteForDetail({dayKey:d.key},'timeline');li.textContent=`${d.label||localDateLabel(d.startMs,d.timeZone)||d.key||''} — ${compactDuration(d.totalFastMs||0)}${clockNote?' • '+clockNote:''}`;ul.append(li);}}
    else if(statsVizMode==='trend'){for(const d of [...buildTrendDays()].reverse()){const li=document.createElement('li');const clockNote=clockChangeNoteForDetail({dayKey:d.key},'trend');li.textContent=`${d.label||d.key||''} — ${compactDuration((d.hours||0)*3600000)} • 7d ${compactDuration((d.avg7||0)*3600000)} • 30d ${compactDuration((d.avg30||0)*3600000)}${clockNote?' • '+clockNote:''}`;ul.append(li);}}
    else if(statsVizMode==='weeks'){for(const w of [...(weeklySummariesCache||[])].reverse()){const li=document.createElement('li');li.textContent=`${w.label||w.key||''} — ${compactDuration(w.totalFastMs||0)}`;ul.append(li);}}
    else if(statsVizMode==='months'){for(const x of [...buildMonthSummaries()].reverse()){const li=document.createElement('li');li.textContent=`${x.label} — ${compactDuration((x.hours||0)*3600000)} • ${x.count}`;ul.append(li);}}
    else if(statsVizMode==='success'){for(const x of [...buildTargetSuccessSummaries()].reverse()){const li=document.createElement('li');li.textContent=`${x.label} — ${formatNumber(x.successRate,0,0)}% • ${x.reached}/${x.count}`;ul.append(li);}}
    else if(statsVizMode==='distribution'){for(const x of buildDurationDistribution()){const li=document.createElement('li');li.textContent=`${x.label} — ${t('stats.detailDistribution',{count:formatNumber(x.count),total:compactDuration((x.totalHours||0)*3600000),average:compactDuration((x.averageHours||0)*3600000)})}`;ul.append(li);}}
    else if(statsVizMode==='startpattern'){for(const x of buildStartPattern()){const li=document.createElement('li');li.textContent=`${x.label} — ${x.count}`;ul.append(li);}}
    else if(statsVizMode==='cumulative'){for(const d of [...buildCumulativeDays()].reverse()){const li=document.createElement('li');const clockNote=clockChangeNoteForDetail({dayKey:d.key},'cumulative');li.textContent=`${d.label||d.key||''} — ${compactDuration((d.cumulativeHours||0)*3600000)}${clockNote?' • '+clockNote:''}`;ul.append(li);}}
    else { const month=el('calendarMonthTitle')?.textContent||''; const li=document.createElement('li'); li.textContent=t('a11y.calendarDataHint',{month}); ul.append(li); }
    if(!ul.children.length){const li=document.createElement('li');li.textContent=t('a11y.noChartData');ul.append(li);} box.append(ul);
  }


  function statsSummary() {
    if (statsSummaryCache) return statsSummaryCache;
    statsSummaryCache = FTAnalytics.summarizeRecords(data.records, {
      durationGetter: recordMs,
      goalGetter: recordMetGoal,
      streak: currentStreak()
    });
    return statsSummaryCache;
  }

