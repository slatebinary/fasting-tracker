// Pure backup-reminder due-time, next-date and notification-token policy.
function resolveBackupReminderPolicy({hasData,firstDataAt,lastBackupAt,nowMs,reminderMs}) {
  if (!hasData || !Number.isFinite(nowMs) || !Number.isFinite(reminderMs) || reminderMs < 0)
    return {due:false,baseMs:null,nextAtMs:null,token:null};
  const timestamp = value => {
    if (value == null || value === '') return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };
  const firstMs = timestamp(firstDataAt);
  const lastMs = timestamp(lastBackupAt);
  const baseMs = firstMs == null ? lastMs : lastMs == null ? firstMs : Math.max(firstMs,lastMs);
  if (baseMs == null) return {due:false,baseMs:null,nextAtMs:null,token:null};
  const nextAtMs = baseMs + reminderMs;
  if (!Number.isFinite(nextAtMs)) return {due:false,baseMs:null,nextAtMs:null,token:null};
  const due = nowMs >= nextAtMs;
  return {due,baseMs,nextAtMs,token:due ? new Date(baseMs).toISOString() : null};
}
