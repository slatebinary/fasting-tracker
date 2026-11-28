function selectLatestWeightRecordPolicy(weights) {
  if (!Array.isArray(weights)) return null;
  let latest = null, latestMs = -Infinity;
  for (const weight of weights) {
    if (!weight || typeof weight !== 'object') continue;
    let ms;
    try { ms = new Date(weight.when).getTime(); }
    catch { continue; }
    if (Number.isFinite(ms) && ms > latestMs) { latest = weight; latestMs = ms; }
  }
  return latest;
}
