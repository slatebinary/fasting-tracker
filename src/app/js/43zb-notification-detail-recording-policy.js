// Pure policy for recording an in-app notification detail and clearing its matching snooze.
function recordNotificationDetailPolicy(id, kind, screen, createdAt, params, active, pending, allowedScreens, limit) {
  const key = String(id);
  const details = Array.isArray(active) ? active : [];
  const queued = Array.isArray(pending) ? pending : [];
  const screens = Array.isArray(allowedScreens) ? allowedScreens : [];
  const cap = Number.isInteger(limit) && limit > 0 ? limit : 0;
  const item = {
    id: key,
    kind,
    screen: screens.includes(screen) ? screen : 'fasting',
    createdAt,
    params
  };
  return {
    details: [item, ...details.filter(entry => entry?.id !== key)].slice(0, cap),
    snoozedDetails: queued.filter(entry => entry?.id !== key)
  };
}
