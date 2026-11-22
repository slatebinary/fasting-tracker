// Pure eligibility and timing policy for the 24-hour cycle-complete notification.
function resolveCycleCompleteNotificationPolicy({record,nowMs,enabledAtMs}) {
  if (!record) return null;
  const startMs = new Date(record.start).getTime();
  const endMs = new Date(record.end).getTime();
  const dayMs = 24 * 3600000;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || endMs - startMs >= dayMs) return null;
  const cycleEnd = startMs + dayMs;
  if (nowMs < cycleEnd) return null;
  if (!Number.isFinite(enabledAtMs)) return {record,cycleEnd,due:false,initializeEnabledAt:true};
  if (cycleEnd < enabledAtMs) return null;
  return {record,cycleEnd,due:true,initializeEnabledAt:false};
}
