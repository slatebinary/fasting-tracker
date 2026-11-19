// Pure selection of Weight History records for the currently selected display range.
  function selectWeightHistoryRecordsForDisplay(sortedDesc, range, cutoff) {
    if (!Array.isArray(sortedDesc)) return [];
    if (range === 'recent7') return sortedDesc.slice(0, 7);
    if (range === 'all') return sortedDesc;
    if (!Number.isFinite(cutoff)) return sortedDesc.slice(0, 7);
    return sortedDesc.filter(entry => {
      const timestamp = Date.parse(entry?.when);
      return Number.isFinite(timestamp) && timestamp >= cutoff;
    });
  }
