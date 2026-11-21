// Pure policy for dismissing one in-app notification detail by its stable ID.
function dismissNotificationDetailPolicy(id, active) {
  const details = Array.isArray(active) ? active : [];
  return details.filter(item => item?.id !== id);
}
