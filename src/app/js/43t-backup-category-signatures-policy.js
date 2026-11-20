// Pure category-specific backup signature construction.
// The caller injects the stable serializer/hash so this policy has no storage or runtime dependencies.
function buildBackupCategorySignatures(sourceData, hashValue) {
  if (typeof hashValue !== 'function') throw new TypeError('Backup signature hash function is required');
  const byId = list => (Array.isArray(list) ? list : []).slice().sort((a,b) => {
    const left=String(a?.id ?? ''), right=String(b?.id ?? '');
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const hash = value => 'v1:' + hashValue(value);
  return {
    fasting:hash({
      records:byId(sourceData.records),
      deletedFasts:byId(sourceData.deletedFasts),
      activeFast:{
        start:sourceData.activeStart||null,
        timeZone:sourceData.activeTimeZone||null,
        goal:sourceData.activeGoalHours??null,
        createdAt:sourceData.activeCreatedAt||null,
        modifiedAt:sourceData.activeModifiedAt||null
      }
    }),
    weight:hash({
      weights:byId(sourceData.weights),
      deletedWeights:byId(sourceData.deletedWeights)
    })
  };
}
