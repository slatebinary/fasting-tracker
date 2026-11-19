// Pure selected Weight-period bounds. Calendar-day and fallback resolution are injected.
  function resolveSelectedWeightPeriodBounds(options = {}) {
    const {buckets,selectedId,mode='daily',chartStyle='rolling',todayCalendarDay,calendarDayForEntry,rollingWindowDays,fallbackBounds} = options;
    const list = Array.isArray(buckets) ? buckets : [];
    let selected = list.find(bucket => bucket.key === selectedId && bucket.count > 0);
    if (!selected) selected = [...list].reverse().find(bucket => bucket.count > 0) || null;
    let endDay = mode === 'daily' && selected?.entry
      ? (typeof calendarDayForEntry === 'function' ? calendarDayForEntry(selected.entry) : null)
      : selected?.calendarDay;
    if (!endDay) endDay = todayCalendarDay;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(endDay || ''));
    if (!match) return typeof fallbackBounds === 'function' ? fallbackBounds(mode) : null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (chartStyle === 'fixed' && mode !== 'daily') {
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
    const days = mode === 'daily' ? 30 : (typeof rollingWindowDays === 'function' ? rollingWindowDays(mode) : 0);
    const start = new Date(year, month - 1, day);
    start.setDate(start.getDate() - Math.max(0, days - 1));
    start.setHours(0, 0, 0, 0);
    return {start, end};
  }
