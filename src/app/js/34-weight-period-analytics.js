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
  function weightEntriesForPeriod(asc = sortedWeightsAsc(), mode = weightPeriodMode, now = new Date(), explicitBounds = null) {
    const {start, end} = explicitBounds || weightPeriodBounds(mode, now);
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
    if (bucket?.rollingWindowDays && bucket.calendarDay) return weightBucketDate(bucket.calendarDay).toLocaleDateString(currentLocale(),{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
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
    if (bucket?.rollingWindowDays && bucket.calendarDay) return weightBucketDate(bucket.calendarDay).toLocaleDateString(currentLocale(),{day:'numeric',month:'short',timeZone:'UTC'});
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
  function buildWeightCalendarBuckets(entries, mode) {
    const map = new Map();
    for (const entry of entries) {
      const bucketKey = weightBucketKeyForDay(weightEntryCalendarDay(entry), mode);
      if (!bucketKey) continue;
      let bucket = map.get(bucketKey);
      if (!bucket) bucket = {key:bucketKey,count:0,sumKg:0,averageKg:null,lowKg:entry.kg,highKg:entry.kg,first:entry,latest:entry};
      bucket.count += 1; bucket.sumKg += entry.kg;
      bucket.lowKg = Math.min(bucket.lowKg,entry.kg); bucket.highKg = Math.max(bucket.highKg,entry.kg);
      if (String(entry.when) < String(bucket.first.when)) bucket.first = entry;
      if (String(entry.when) > String(bucket.latest.when)) bucket.latest = entry;
      map.set(bucketKey,bucket);
    }
    for (const bucket of map.values()) bucket.averageKg = bucket.sumKg / bucket.count;
    return map;
  }
  function weightRollingWindowDays(mode) {
    return ({week:7,month:30,quarter:90,halfyear:180,year:365})[mode] || 0;
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
    const ordered = entries.map(entry => {
      const day = weightEntryCalendarDay(entry), match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
      if (!match) return null;
      return {entry,day,dayNumber:Math.floor(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]))/86400000)};
    }).filter(Boolean).sort((x,y)=>x.dayNumber-y.dayNumber||String(x.entry.when).localeCompare(String(y.entry.when)));
    const days = [...new Set(ordered.map(item=>item.dayNumber))], result = [];
    let end=0,start=0;
    for (const dayNumber of days) {
      while(end<ordered.length&&ordered[end].dayNumber<=dayNumber) end++;
      const firstDay=dayNumber-windowDays+1;
      while(start<end&&ordered[start].dayNumber<firstDay) start++;
      let sumKg=0,lowKg=Infinity,highKg=-Infinity,firstEntry=null,latestEntry=null;
      for(let i=start;i<end;i++){
        const entry=ordered[i].entry;sumKg+=entry.kg;lowKg=Math.min(lowKg,entry.kg);highKg=Math.max(highKg,entry.kg);
        if(!firstEntry||String(entry.when)<String(firstEntry.when))firstEntry=entry;
        if(!latestEntry||String(entry.when)>String(latestEntry.when))latestEntry=entry;
      }
      const calendarDay=ordered[end-1].day,calendarKey=weightBucketKeyForDay(calendarDay,mode),calendarBucket=calendarBuckets.get(calendarKey)||null,count=end-start;
      result.push({key:`rolling:${mode}:${calendarDay}`,calendarDay,rollingWindowDays:windowDays,windowStartDay:new Date(firstDay*86400000).toISOString().slice(0,10),windowEndDay:calendarDay,count,sumKg,averageKg:count?sumKg/count:null,lowKg:Number.isFinite(lowKg)?lowKg:null,highKg:Number.isFinite(highKg)?highKg:null,first:firstEntry,latest:latestEntry,calendarBucket});
    }
    weightAggregateCache.set(key,result); return result;
  }
  function selectedWeightPeriodBounds(asc = sortedWeightsAsc(), mode = weightPeriodMode) {
    const buckets = buildWeightAggregateBuckets(asc, mode);
    let selected = buckets.find(bucket => bucket.key === weightChartSelectedId && bucket.count > 0);
    if (!selected) selected = [...buckets].reverse().find(bucket => bucket.count > 0) || null;
    let endDay = mode === 'daily' && selected?.entry
      ? weightEntryCalendarDay(selected.entry)
      : selected?.calendarDay;
    if (!endDay) endDay = dayKeyFast(new Date(), currentTimeZone());
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(endDay));
    if (!match) return weightPeriodBounds(mode);
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (weightChartStyle === 'fixed' && mode !== 'daily') {
      const start = new Date(year, month - 1, day);
      const end = new Date(start);
      if (mode === 'week') end.setDate(end.getDate()+6);
      else if (mode === 'month') end.setMonth(end.getMonth()+1,0);
      else if (mode === 'quarter') end.setMonth(end.getMonth()+3,0);
      else if (mode === 'halfyear') end.setMonth(end.getMonth()+6,0);
      else end.setFullYear(end.getFullYear()+1,0,0);
      end.setHours(23,59,59,999); start.setHours(0,0,0,0); return {start,end};
    }
    const end = new Date(year, month - 1, day, 23, 59, 59, 999);
    const days = mode === 'daily' ? 30 : weightRollingWindowDays(mode);
    const start = new Date(year, month - 1, day);
    start.setDate(start.getDate() - Math.max(0, days - 1));
    start.setHours(0, 0, 0, 0);
    return {start, end};
  }

  function renderWeightPeriodAnalytics(asc = sortedWeightsAsc()) {
    if (!WEIGHT_PERIOD_MODES.includes(weightPeriodMode)) weightPeriodMode = 'daily';
    document.querySelectorAll('#weightPeriodSwitcher [data-weight-period]').forEach(btn => {
      const active = btn.dataset.weightPeriod === weightPeriodMode;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', String(active));
    });
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