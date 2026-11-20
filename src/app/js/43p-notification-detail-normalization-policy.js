// Pure normalization of persisted in-app notification details. Time and
// validation dependencies are explicit so retention and deduplication are deterministic.
function normalizeNotificationDetailItemsPolicy(raw, nowMs, parseDate, allowedScreens, ttlMs, limit) {
  const items = Array.isArray(raw) ? raw : [];
  const seen = new Set(), out = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const id = String(item.id || '').slice(0, 240);
    const kind = String(item.kind || '').slice(0, 40);
    const screen = allowedScreens.includes(item.screen) ? item.screen : 'fasting';
    const created = parseDate(item.createdAt);
    if (!id || !kind || !created || nowMs - created.getTime() > ttlMs || seen.has(id)) continue;
    const params = item.params && typeof item.params === 'object' && !Array.isArray(item.params) ? item.params : {};
    seen.add(id);
    out.push({id, kind, screen, createdAt:created.toISOString(), params});
    if (out.length >= limit) break;
  }
  return out;
}
