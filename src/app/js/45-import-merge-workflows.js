// Import merge primitives extracted from settings/startup orchestration.
// Keep these declarations in the ordered shared lexical scope.
function backupDateRange(candidate) {
  return resolveBackupDateRangePolicy(candidate, validDate);
}

function mergeImportedData(imported) {
  return resolveImportedDataMergePolicy(data, imported, normalizeStopReason, validateCompatibleData);
}
