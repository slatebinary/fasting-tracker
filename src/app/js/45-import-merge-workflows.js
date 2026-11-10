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

function stableRecordString(v) {
  const c = { ...v };
  delete c.deleted;
  delete c.deletedAt;
  delete c.deletedTimeZone;
  delete c.deletionReason;
  return JSON.stringify(c);
}

function mergeByIdAndFingerprint(current, incoming, fingerprint, label) {
  const out = [...current], byId = new Map(current.map(x => [x.id, x]));
  const byFp = new Map(current.map(x => [fingerprint(x), x]));
  let duplicates = 0;
  for (const item of incoming) {
    const existing = byId.get(item.id);
    if (existing) {
      if (stableRecordString(existing) !== stableRecordString(item)) {
        throw new Error(`${label}: same id differs (${item.id})`);
      }
      duplicates++;
      continue;
    }
    const fp = fingerprint(item);
    if (byFp.has(fp)) { duplicates++; continue; }
    out.push(item);
    byId.set(item.id, item);
    byFp.set(fp, item);
  }
  return { out, duplicates };
}

function mergeImportedData(imported) {
  const result = JSON.parse(JSON.stringify(data));
  const live = mergeByIdAndFingerprint(result.records, imported.records,
    r => `${r.start}|${r.end}|${r.timeZone}|${r.goalHours}|${normalizeStopReason(r.stopReason) || ''}`, 'fast');
  const del = mergeByIdAndFingerprint(result.deletedFasts, imported.deletedFasts,
    r => `${r.start}|${r.end}|${r.deletedAt}|${r.timeZone}|${normalizeStopReason(r.stopReason) || ''}`, 'deleted fast');
  const weights = mergeByIdAndFingerprint(result.weights, imported.weights,
    w => `${w.when}|${w.kg}|${w.timeZone}`, 'weight');
  const delWeights = mergeByIdAndFingerprint(result.deletedWeights, imported.deletedWeights,
    w => `${w.when}|${w.kg}|${w.deletedAt}|${w.timeZone}`, 'deleted weight');
  result.records = live.out;
  result.deletedFasts = del.out;
  result.weights = weights.out;
  result.deletedWeights = delWeights.out;
  const liveIds = new Set(result.records.map(r => r.id));
  if (result.deletedFasts.some(r => liveIds.has(r.id))) throw new Error('fast exists in both live and deleted history');
  const weightIds = new Set(result.weights.map(w => w.id));
  if (result.deletedWeights.some(w => weightIds.has(w.id))) throw new Error('weight exists in both live and deleted history');
  const sorted = [...result.records].sort((a, b) => new Date(a.start) - new Date(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (new Date(sorted[i].start) < new Date(sorted[i - 1].end)) throw new Error('fasting time conflict');
  }
  if (result.activeStart && imported.activeStart && result.activeStart !== imported.activeStart) {
    throw new Error('both installations have different active fasts');
  }
  if (!result.activeStart && imported.activeStart) {
    result.activeStart = imported.activeStart;
    result.activeGoalHours = imported.activeGoalHours;
    result.activeTimeZone = imported.activeTimeZone;
    result.activeCreatedAt = imported.activeCreatedAt;
    result.activeModifiedAt = imported.activeModifiedAt;
  }
  return {
    data: validateCompatibleData(result).data,
    duplicates: live.duplicates + del.duplicates + weights.duplicates + delWeights.duplicates
  };
}
