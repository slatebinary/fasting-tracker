function selectLatestWeightRecordPolicy(weights) {
  let latest = null, latestMs = -Infinity;
  for (const weight of weights) {
    const ms = new Date(weight.when).getTime();
    if (Number.isFinite(ms) && ms > latestMs) { latest = weight; latestMs = ms; }
  }
  return latest;
}
