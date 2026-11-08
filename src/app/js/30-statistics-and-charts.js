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

