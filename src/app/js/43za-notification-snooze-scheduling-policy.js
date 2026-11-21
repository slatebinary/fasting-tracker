// Pure policy for moving a notification detail from the active list into its snoozed queue.
// Time, preference validation and persistence are supplied by the caller.
function scheduleNotificationDetailSnoozePolicy(id, durationMinutes, active, pending, nowMs, allowedMinutes, categoryForKind, limit) {
  let duration;
  try { duration = Number(durationMinutes); } catch { return null; }
  if (!Array.isArray(allowedMinutes) || !allowedMinutes.includes(duration)) return null;
  if (!Number.isFinite(nowMs) || typeof categoryForKind !== 'function') return null;
  const details = Array.isArray(active) ? active : [];
  const item = details.find(entry => entry && entry.id === id);
  if (!item || !categoryForKind(item.kind)) return null;
  const untilMs = nowMs + duration * 60000;
  const until = new Date(untilMs);
  if (!Number.isFinite(until.getTime())) return null;
  const queued = Array.isArray(pending) ? pending : [];
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 0;
  return {
    details: details.filter(entry => entry?.id !== id),
    snoozedDetails: [
      {...item, snoozedUntil:until.toISOString()},
      ...queued.filter(entry => entry?.id !== id)
    ].slice(0, cap)
  };
}
