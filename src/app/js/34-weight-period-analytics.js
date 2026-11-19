  function sortedWeightsAsc() {
    if (!sortedWeightsAscCache) sortedWeightsAscCache = [...data.weights].sort((a, b) => String(a.when).localeCompare(String(b.when)));
    return sortedWeightsAscCache;
  }

  function weightEntriesForPeriod(asc = sortedWeightsAsc(), mode = weightPeriodMode, now = new Date(), explicitBounds = null) {
    const {start, end} = explicitBounds || weightPeriodBounds(mode, now);
    return weightEntriesWithinBounds(asc, start, end);
  }
  function weightPeriodDateRangeLabel(start, end) {
    const fmt = new Intl.DateTimeFormat(currentLocale(), {day:'numeric',month:'short',year:'numeric'});
    return `${fmt.format(start)} – ${fmt.format(end)}`;
  }

  function weightEntryCalendarDay(entry) {
    const stored = typeof entry?.calendarDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.calendarDay) ? entry.calendarDay : null;
    return stored || dayKeyFast(entry.when, entry.timeZone || currentTimeZone());
  }
  function weightBucketLongLabel(bucket, mode = weightPeriodMode) {
    return resolveWeightBucketLabel({bucket,mode,variant:'long',locale:currentLocale(),timeZone:currentTimeZone(),bucketDate:weightBucketDate,localDateTimeLabel,translate:t});
  }
  function weightBucketShortLabel(bucket, mode = weightPeriodMode) {
    return resolveWeightBucketLabel({bucket,mode,variant:'short',locale:currentLocale(),timeZone:currentTimeZone(),bucketDate:weightBucketDate,localDateTimeLabel,translate:t});
  }
  function weightPointCalloutPeriod(bucket, mode = weightPeriodMode) {
    return resolveWeightBucketLabel({bucket,mode,variant:'callout',locale:currentLocale(),timeZone:currentTimeZone(),bucketDate:weightBucketDate,localDateTimeLabel,translate:t});
  }
  function buildWeightCalendarBuckets(entries, mode) {
    return aggregateWeightCalendarBuckets(entries, mode, weightEntryCalendarDay, weightBucketKeyForDay);
  }
  function buildWeightAggregateBuckets(asc = null, mode = weightPeriodMode) {
    const key = `${Number(data.revision)||0}|${mode}|${weightChartStyle}`;
    if (weightAggregateCache.has(key)) return weightAggregateCache.get(key);
    if (weightAggregateCache.size > 10) weightAggregateCache.clear();
    const entries = Array.isArray(asc) ? asc : sortedWeightsAsc();
    if (mode === 'daily') {
      const result = entries.map(entry => ({key:`entry:${entry.id}`,count:1,sumKg:entry.kg,averageKg:entry.kg,lowKg:entry.kg,highKg:entry.kg,first:entry,latest:entry,entry}));
      weightAggregateCache.set(key,result); return result;
    }
    // Calendar-period aggregates remain available for context. The plotted
    // series samples trailing rolling averages only on dates with real entries.
    const calendarBuckets = buildWeightCalendarBuckets(entries,mode);
    if (weightChartStyle === 'fixed') {
      const fixed = [...calendarBuckets.values()].map(bucket => ({...bucket,key:bucket.key,calendarDay:bucket.key,rollingWindowDays:0}));
      weightAggregateCache.set(key,fixed); return fixed;
    }
    const windowDays = weightRollingWindowDays(mode);
    const todayCalendarDay = dayKeyFast(new Date(),currentTimeZone());
    const result = buildWeightRollingAverageBuckets(entries,mode,calendarBuckets,weightEntryCalendarDay,weightBucketKeyForDay,windowDays,todayCalendarDay);
    weightAggregateCache.set(key,result); return result;
  }
  function selectedWeightPeriodBounds(asc = sortedWeightsAsc(), mode = weightPeriodMode) {
    const buckets = buildWeightAggregateBuckets(asc, mode);
    return resolveSelectedWeightPeriodBounds({
      buckets, selectedId:weightChartSelectedId, mode, chartStyle:weightChartStyle,
      todayCalendarDay:dayKeyFast(new Date(), currentTimeZone()),
      calendarDayForEntry:weightEntryCalendarDay,
      rollingWindowDays:weightRollingWindowDays,
      fallbackBounds:weightPeriodBounds
    });
  }

  function renderWeightPeriodAnalytics(asc = sortedWeightsAsc()) {
    if (!WEIGHT_PERIOD_MODES.includes(weightPeriodMode)) weightPeriodMode = 'daily';
    document.querySelectorAll('#weightChartStyleSwitcher [data-weight-style]').forEach(btn=>{const active=btn.dataset.weightStyle===weightChartStyle;btn.classList.toggle('active',active);btn.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('#weightPeriodSwitcher [data-weight-period]').forEach(btn => {
      const active = btn.dataset.weightPeriod === weightPeriodMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
    // Lifetime extrema are independent of the selected chart period and viewport.
    // data.weights contains active records only; soft-deleted entries live separately.
    const lifetimeHigh = asc.reduce((highest, entry) => {
      const kg = Number(entry?.kg);
      return Number.isFinite(kg) && kg > 0 ? Math.max(highest, kg) : highest;
    }, -Infinity);
    const lifetimeHighNode = el('wAllTimeHigh');
    if (lifetimeHighNode) lifetimeHighNode.textContent = Number.isFinite(lifetimeHigh)
      ? formatWeight(lifetimeHigh, data.weightUnit)
      : '—';

    const bounds = selectedWeightPeriodBounds(asc, weightPeriodMode);
    const entries = weightEntriesForPeriod(asc, weightPeriodMode, bounds.end, bounds);
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
    const periodStats = summarizeWeightPeriodEntries(entries);
    el('wPeriodStart').textContent = formatWeight(periodStats.first.kg, unit);
    el('wPeriodEnd').textContent = formatWeight(periodStats.latest.kg, unit);
    el('wPeriodChange').textContent = formatWeight(periodStats.changeKg, unit, true);
    el('wPeriodAverage').textContent = formatWeight(periodStats.averageKg, unit);
    el('wPeriodLow').textContent = formatWeight(periodStats.lowKg, unit);
    el('wPeriodHigh').textContent = formatWeight(periodStats.highKg, unit);
    return entries;
  }