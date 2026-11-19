// Pure calendar cutoff for the Weight History range selector. The supplied date uses local calendar semantics.
  function resolveWeightHistoryRangeCutoff(range, now = new Date()) {
    const months = ({month:1,halfyear:6,year:12})[range];
    if (!months) return null;
    const current = new Date(now);
    const cutoff = new Date(current.getFullYear(), current.getMonth(), 1);
    cutoff.setMonth(cutoff.getMonth() - months);
    const day = Math.min(current.getDate(), new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate());
    cutoff.setDate(day);
    cutoff.setHours(0, 0, 0, 0);
    return cutoff.getTime();
  }
