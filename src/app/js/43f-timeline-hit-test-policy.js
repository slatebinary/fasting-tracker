// Pure hit-testing policy for the Timeline canvas.
// Coordinates are relative to the canvas; geometry and day models are read-only.
function hitTestTimelineChart(x, y, geometry, days) {
  if (!geometry || !Array.isArray(days) || !days.length) return null;
  const { left, bw, slot, top, h, cssH } = geometry;
  const firstCenter = left + bw / 2;
  const index = Math.round((x - firstCenter) / slot);
  if (index < 0 || index >= days.length) return null;
  const center = firstCenter + index * slot;
  if (Math.abs(x - center) > slot / 2) return null;
  const day = days[index];

  if (y >= top + h && y <= cssH) return { kind: 'day', dayKey: day.key };
  if (y < top || y > top + h) return null;

  // Invert the vertical coordinate: bottom is 00:00, top is 24:00.
  // Clamp the upper edge inside the day's actual duration (23/24/25 h).
  const fraction = Math.max(0, Math.min(0.999999, 1 - (y - top) / h));
  const instant = day.startMs + fraction * (day.endMs - day.startMs);
  let segmentIndex = day.segments.findIndex(segment => instant >= segment.start && instant < segment.end);
  if (segmentIndex < 0 && day.segments.length) segmentIndex = day.segments.length - 1;
  return segmentIndex >= 0
    ? { kind: 'segment', dayKey: day.key, segmentIndex }
    : { kind: 'day', dayKey: day.key };
}
