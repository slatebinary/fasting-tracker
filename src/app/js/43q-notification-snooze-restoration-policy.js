// Pure policy for deciding which persisted snoozed notification details are due.
// Notification delivery and persistence remain in the caller.
function resolveDueSnoozedNotificationDetailsPolicy(pending, active, nowMs, parseDate, allowedScreens, limit) {
  const due = [], remaining = [];
  for (const item of Array.isArray(pending) ? pending : []) {
    if (!item || typeof item !== 'object' || !String(item.id || '')) continue;
    const until = parseDate(item.snoozedUntil);
    if (!until) continue;
    if (until.getTime() <= nowMs) due.push(item);
    else remaining.push(item);
  }
  const details = Array.isArray(active) ? active.slice() : [];
  const restored = [];
  for (const item of due) {
    if (details.some(entry => entry.id === item.id)) continue;
    const detail = {
      id:String(item.id),
      kind:String(item.kind),
      screen:allowedScreens.includes(item.screen) ? item.screen : 'fasting',
      createdAt:new Date(nowMs).toISOString(),
      params:item.params && typeof item.params === 'object' ? item.params : {}
    };
    details.unshift(detail);
    restored.push(detail);
  }
  return {due, remaining, restored, details:details.slice(0, limit)};
}
