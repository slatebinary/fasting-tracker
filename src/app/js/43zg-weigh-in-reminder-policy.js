// Pure weigh-in reminder cadence and due-time policy; persistence and delivery stay in the runtime adapter.
function resolveWeighInNotificationPolicy({cadence,latest,anchorAt,nowMs,deliveredToken}) {
  const normalizedCadence = cadence === 'daily' ? 'daily' : 'weekly';
  const cadenceMs = normalizedCadence === 'daily' ? 24 * 3600000 : 7 * 24 * 3600000;
  if (!Number.isFinite(nowMs)) return null;
  const nowDate = new Date(nowMs);
  if (!Number.isFinite(nowDate.getTime())) return null;
  const timestamp = value => {
    try {
      const ms = new Date(value).getTime();
      return Number.isFinite(ms) ? ms : null;
    } catch {
      return null;
    }
  };
  let anchorMs, tokenBase;
  if (latest !== null && latest !== undefined) {
    if (typeof latest !== 'object' || latest.id === null || latest.id === undefined) return null;
    anchorMs = timestamp(latest.when);
    tokenBase = latest.id;
    if (anchorMs === null) return null;
  } else {
    anchorMs = anchorAt ? timestamp(anchorAt) : null;
    if (anchorMs === null) {
      return {cadence:normalizedCadence,cadenceMs,anchorMs:null,token:null,due:false,initializeAnchorAt:nowDate.toISOString()};
    }
    tokenBase = anchorAt;
  }
  const token = `${normalizedCadence}:${tokenBase}`;
  return {cadence:normalizedCadence,cadenceMs,anchorMs,token,due:nowMs >= anchorMs + cadenceMs && deliveredToken !== token,initializeAnchorAt:null};
}
