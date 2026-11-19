// Pure resolution of a Weight record's calendar day. The application date resolver is injected.
  function resolveWeightEntryCalendarDay(entry, fallbackTimeZone, dayKeyForInstant) {
    if (typeof dayKeyForInstant !== 'function') return null;
    const stored = typeof entry?.calendarDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.calendarDay) ? entry.calendarDay : null;
    return stored || dayKeyForInstant(entry.when, entry.timeZone || fallbackTimeZone);
  }
