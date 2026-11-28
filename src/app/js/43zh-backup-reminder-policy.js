// Pure backup-reminder due-time, next-date and notification-token policy.
function resolveBackupReminderPolicy({hasData,firstDataAt,lastBackupAt,nowMs,reminderMs}) {
  const empty = {due:false,baseMs:null,nextAtMs:null,token:null};
  if (!hasData || !Number.isFinite(nowMs) || !Number.isFinite(new Date(nowMs).getTime()) || !Number.isFinite(reminderMs) || reminderMs < 0)
    return empty;
  const timestamp = value => {
    if (value == null || value === '') return null;
    try {
      const parsed = new Date(value).getTime();
      return Number.isFinite(parsed) ? parsed : null;
    } catch (_) {
      return null;
    }
  };
  const firstMs = timestamp(firstDataAt);
  const lastMs = timestamp(lastBackupAt);
  const baseMs = firstMs == null ? lastMs : lastMs == null ? firstMs : Math.max(firstMs,lastMs);
  if (baseMs == null) return empty;
  const nextAtMs = baseMs + reminderMs;
  if (!Number.isFinite(nextAtMs) || !Number.isFinite(new Date(nextAtMs).getTime())) return empty;
  const due = nowMs >= nextAtMs;
  return {due,baseMs,nextAtMs,token:due ? new Date(baseMs).toISOString() : null};
}
