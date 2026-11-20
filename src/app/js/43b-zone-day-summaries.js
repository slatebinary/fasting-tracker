// Pure aggregation of fasting intervals into time-zone calendar-day totals.
  function buildCurrentZoneDaySummaries(intervals, timeZone, rangeStart, rangeEnd, dayKeyForTime, nextDayBoundary) {
    if (!Array.isArray(intervals) || typeof dayKeyForTime !== 'function' || typeof nextDayBoundary !== 'function') return new Map();
    const tz = String(timeZone || '').trim();
    if (!tz) return new Map();
    const map = new Map();
    for (const interval of intervals) {
      if (!interval || !Number.isFinite(interval.start) || !Number.isFinite(interval.end)) continue;
      let cursor = Math.max(interval.start, Number.isFinite(rangeStart) ? rangeStart : interval.start), guard = 0;
      const intervalEnd = Math.min(interval.end, Number.isFinite(rangeEnd) ? rangeEnd : interval.end);
      while (cursor < intervalEnd && guard++ < 10000) {
        const key = dayKeyForTime(cursor, tz);
        const boundary = Math.min(intervalEnd, nextDayBoundary(cursor, tz));
        if (typeof key === 'string' && key) {
          const item = map.get(key) || { totalFastMs:0, fastCount:0 };
          item.totalFastMs += Math.max(0, boundary - cursor);
          item.fastCount += 1;
          map.set(key, item);
        }
        cursor = Math.max(boundary, cursor + 1);
      }
    }
    return map;
  }
