// Pure calendar-bucket aggregation. Date and bucket resolution are injected by the caller.
  function aggregateWeightCalendarBuckets(entries, mode, calendarDayForEntry, bucketKeyForDay) {
    const map = new Map();
    if (!Array.isArray(entries) || typeof calendarDayForEntry !== 'function' || typeof bucketKeyForDay !== 'function') return map;
    for (const entry of entries) {
      const bucketKey = bucketKeyForDay(calendarDayForEntry(entry), mode);
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
