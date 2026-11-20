// Import merge primitives extracted from settings/startup orchestration.
// Keep these declarations in the ordered shared lexical scope.
function backupDateRange(candidate) {
  const dates = [];
  for (const r of [...candidate.records, ...candidate.deletedFasts]) {
    const a = validDate(r.start), b = validDate(r.end);
    if (a) dates.push(a);
    if (b) dates.push(b);
  }
  for (const w of [...candidate.weights, ...candidate.deletedWeights]) {
    const d = validDate(w.when);
    if (d) dates.push(d);
  }
  if (!dates.length) return null;
  dates.sort((a, b) => a - b);
  return [dates[0], dates[dates.length - 1]];
}

function mergeImportedData(imported) {
  return resolveImportedDataMergePolicy(data, imported, normalizeStopReason, validateCompatibleData);
}
