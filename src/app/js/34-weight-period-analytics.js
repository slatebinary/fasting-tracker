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