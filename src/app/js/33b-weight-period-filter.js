// Pure binary-search filtering for chronologically sorted weight records.
// Inputs are explicit so this helper has no dependency on application state.
  function weightEntriesWithinBounds(asc, start, end) {
    if (!Array.isArray(asc) || asc.length === 0 || typeof start?.getTime !== 'function' || typeof end?.getTime !== 'function') return [];
    const startMs = start.getTime(), endMs = end.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) return [];
    const startIso = start.toISOString(), endIso = end.toISOString();
    let lo = 0, hi = asc.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (String(asc[mid]?.when) < startIso) lo = mid + 1;
      else hi = mid;
    }
    const from = lo;
    hi = asc.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (String(asc[mid]?.when) <= endIso) lo = mid + 1;
      else hi = mid;
    }
    return asc.slice(from, lo);
  }
