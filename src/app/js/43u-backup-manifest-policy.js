// Pure validation of the record-count fields in an external-backup manifest.
function backupManifestMatchesPolicy(raw) {
  const manifest=raw?.manifest,data=raw?.data;
  if(!manifest||!data)return false;
  const expected={
    activeFasts:data.activeStart?1:0,
    fastingRecords:(data.records||[]).length,
    deletedFasts:(data.deletedFasts||[]).length,
    weightRecords:(data.weights||[]).length,
    deletedWeights:(data.deletedWeights||[]).length
  };
  return Object.entries(expected).every(([key,value])=>Number(manifest[key])===value);
}
