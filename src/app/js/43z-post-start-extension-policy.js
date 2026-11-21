// Pure policy for the short post-start eating-period adjustment window.
const POST_START_EXTENSION_GRACE_MS = 30 * 60 * 1000;
const POST_START_EXTENSION_MINUTES = Object.freeze([5, 10, 15, 30]);

function resolvePostStartExtensionWindow(createdAt, nowMs, graceMs = POST_START_EXTENSION_GRACE_MS) {
  const createdAtMs = new Date(createdAt).getTime();
  if (!Number.isFinite(createdAtMs) || !Number.isFinite(nowMs) || !Number.isFinite(graceMs) || graceMs <= 0 || createdAtMs > nowMs + 60000) {
    return { eligible: false, remainingMs: 0 };
  }
  const remainingMs = createdAtMs + graceMs - nowMs;
  return { eligible: remainingMs > 0, remainingMs: Math.max(0, remainingMs) };
}

function resolvePostStartExtendedTimestamp(startAt, minutes) {
  const startMs = new Date(startAt).getTime();
  const amount = Number(minutes);
  if (!Number.isFinite(startMs) || !POST_START_EXTENSION_MINUTES.includes(amount)) return null;
  return startMs + amount * 60000;
}
