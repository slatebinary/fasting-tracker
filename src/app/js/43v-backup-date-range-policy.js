// Pure date-range selection for normalized external-backup import candidates.
function resolveBackupDateRangePolicy(candidate, parseDate) {
  if (!candidate || typeof parseDate !== 'function') return null;
  const dates = [];
  const fasts = [
    ...(Array.isArray(candidate.records) ? candidate.records : []),
    ...(Array.isArray(candidate.deletedFasts) ? candidate.deletedFasts : [])
  ];
  const weights = [
    ...(Array.isArray(candidate.weights) ? candidate.weights : []),
    ...(Array.isArray(candidate.deletedWeights) ? candidate.deletedWeights : [])
  ];
  for (const record of fasts) {
    const start = parseDate(record?.start), end = parseDate(record?.end);
    if (start) dates.push(start);
    if (end) dates.push(end);
  }
  for (const weight of weights) {
    const when = parseDate(weight?.when);
    if (when) dates.push(when);
  }
  if (!dates.length) return null;
  dates.sort((a, b) => a - b);
  return [dates[0], dates[dates.length - 1]];
}
