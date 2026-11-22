// Pure weigh-in reminder cadence and due-time policy; persistence and delivery stay in the runtime adapter.
function resolveWeighInNotificationPolicy({cadence,latest,anchorAt,nowMs,deliveredToken}) {
  const normalizedCadence = cadence === 'daily' ? 'daily' : 'weekly';
  const cadenceMs = normalizedCadence === 'daily' ? 24 * 3600000 : 7 * 24 * 3600000;
  if (!Number.isFinite(nowMs)) return null;
  let anchorMs, tokenBase;
  if (latest) {
    anchorMs = new Date(latest.when).getTime();
    tokenBase = latest.id;
    if (!Number.isFinite(anchorMs)) return null;
  } else {
    const anchor = anchorAt ? new Date(anchorAt) : null;
    if (!anchor || !Number.isFinite(anchor.getTime())) {
      return {cadence:normalizedCadence,cadenceMs,anchorMs:null,token:null,due:false,initializeAnchorAt:new Date(nowMs).toISOString()};
    }
    anchorMs = anchor.getTime();
    tokenBase = anchorAt;
  }
  const token = `${normalizedCadence}:${tokenBase}`;
  return {cadence:normalizedCadence,cadenceMs,anchorMs,token,due:nowMs >= anchorMs + cadenceMs && deliveredToken !== token,initializeAnchorAt:null};
}
