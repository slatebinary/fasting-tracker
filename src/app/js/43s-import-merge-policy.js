// Pure import dataset merge and conflict policy.
// Callers inject stop-reason normalization and final schema validation.
function stableRecordString(v, omitId = false) {
  // Compare the complete persisted record, including deletion and edit-audit
  // metadata. Sort object keys so equivalent JSON objects remain order-neutral.
  const canonical = value => {
    if (Array.isArray(value)) return value.map(canonical);
    if (!value || typeof value !== 'object') return value;
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (omitId && key === 'id') continue;
      out[key] = canonical(value[key]);
    }
    return out;
  };
  return JSON.stringify(canonical(v));
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
    const fingerprintMatch = byFp.get(fp);
    if (fingerprintMatch) {
      if (stableRecordString(fingerprintMatch, true) !== stableRecordString(item, true)) {
        throw new Error(`${label}: matching fingerprint differs (${item.id})`);
      }
      duplicates++;
      continue;
    }
    out.push(item);
    byId.set(item.id, item);
    byFp.set(fp, item);
  }
  return { out, duplicates };
}

function resolveImportedDataMergePolicy(currentData, imported, normalizeStopReasonFn, validateCompatibleDataFn) {
  const result = JSON.parse(JSON.stringify(currentData));
  const stopReason = value => normalizeStopReasonFn(value) || '';
  const live = mergeByIdAndFingerprint(result.records, imported.records,
    r => `${r.start}|${r.end}|${r.timeZone}|${r.goalHours}|${stopReason(r.stopReason)}`, 'fast');
  const del = mergeByIdAndFingerprint(result.deletedFasts, imported.deletedFasts,
    r => `${r.start}|${r.end}|${r.deletedAt}|${r.timeZone}|${stopReason(r.stopReason)}`, 'deleted fast');
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
    data: validateCompatibleDataFn(result).data,
    duplicates: live.duplicates + del.duplicates + weights.duplicates + delWeights.duplicates
  };
}
