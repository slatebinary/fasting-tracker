// Pure construction of one-record-per-entry daily Weight chart buckets.
  function buildWeightDailyBuckets(entries, calendarDayForEntry) {
    if (!Array.isArray(entries)) return [];
    return entries.map(entry => ({
      key: `entry:${entry.id}`,
      count: 1,
      sumKg: entry.kg,
      averageKg: entry.kg,
      lowKg: entry.kg,
      highKg: entry.kg,
      first: entry,
      latest: entry,
      entry,
      calendarDay: typeof calendarDayForEntry === 'function' ? calendarDayForEntry(entry) : null
    }));
  }
