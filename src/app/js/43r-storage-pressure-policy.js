// Pure storage-pressure classification. Browser storage estimation and confirmation remain in the adapter.
function resolveStoragePressurePolicy(estimate, ratioThreshold, freeBytesThreshold) {
  if (!estimate || !Number.isFinite(estimate.usage) || !Number.isFinite(estimate.quota) || estimate.quota <= 0) {
    return {known:false,warning:false,ratio:null,free:null};
  }
  const ratio = estimate.usage / estimate.quota;
  const free = Math.max(0, estimate.quota - estimate.usage);
  return {known:true,warning:ratio >= ratioThreshold || free < freeBytesThreshold,ratio,free};
}
