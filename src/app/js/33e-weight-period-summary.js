// Pure summary of a selected Weight period. Input ordering is preserved.
  function summarizeWeightPeriodEntries(entries) {
    if (!Array.isArray(entries) || entries.length === 0) return null;
    const first = entries[0], latest = entries[entries.length - 1];
    let totalKg = 0, lowKg = entries[0].kg, highKg = entries[0].kg;
    for (const entry of entries) {
      totalKg += entry.kg;
      if (entry.kg < lowKg) lowKg = entry.kg;
      if (entry.kg > highKg) highKg = entry.kg;
    }
    return {first,latest,count:entries.length,totalKg,changeKg:latest.kg-first.kg,averageKg:totalKg/entries.length,lowKg,highKg};
  }
