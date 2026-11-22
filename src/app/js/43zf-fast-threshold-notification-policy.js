// Pure timing policy shared by fasting target and prolonged-fast safety notifications.
function resolveFastThresholdNotificationPolicy({start,nowMs,thresholdMs}) {
  if (start == null || start === '' || !Number.isFinite(nowMs) || !Number.isFinite(thresholdMs) || thresholdMs < 0) return null;
  const startMs = new Date(start).getTime();
  if (!Number.isFinite(startMs)) return null;
  const dueAtMs = startMs + thresholdMs;
  if (!Number.isFinite(dueAtMs) || nowMs < dueAtMs) return null;
  return {startMs,dueAtMs,elapsedMs:nowMs-startMs};
}
