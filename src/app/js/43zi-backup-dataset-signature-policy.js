// Pure canonical backup-dataset signature policy.
function buildBackupDatasetSignature(sourceData, serialize, hash) {
  const byId = list => (Array.isArray(list) ? list : []).slice().sort((a,b) => {
    const left=String(a?.id ?? ''), right=String(b?.id ?? '');
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const tracked = {
    activeStart:sourceData.activeStart || null,
    activeTimeZone:sourceData.activeTimeZone || null,
    activeGoalHours:sourceData.activeGoalHours ?? null,
    activeCreatedAt:sourceData.activeCreatedAt || null,
    activeModifiedAt:sourceData.activeModifiedAt || null,
    records:byId(sourceData.records), deletedFasts:byId(sourceData.deletedFasts),
    weights:byId(sourceData.weights), deletedWeights:byId(sourceData.deletedWeights)
  };
  if (typeof serialize !== 'function' || typeof hash !== 'function') throw new TypeError('Backup signature serializer and hash functions are required');
  return 'v1:' + hash(serialize(tracked));
}
