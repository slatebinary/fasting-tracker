// Pure classification of the last external JSON backup against the current dataset.
  // Date parsing, signatures and category-diff calculation remain in the backup adapter.
  function resolveBackupFreshnessPolicy({
    hasData,last,revision,updated,backedRevision,backedUpdated,
    storedDataSignature,currentDataSignature
  }) {
    if (!last) return {state:hasData?'never':'empty',changed:hasData,last:null};
    // Older exports have no data-only signature. Preserve their revision/time fallback.
    const changed=storedDataSignature
      ? currentDataSignature!==storedDataSignature
      : (backedRevision ? Number(revision)>backedRevision : (!!updated&&updated.getTime()>last.getTime()+1000));
    // A deletion of the final fasting/weight record still invalidates the prior export.
    return {state:changed?'stale':hasData?'current':'empty',changed,last,backedRevision,backedUpdated};
  }
