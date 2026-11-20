// Pure policy for assigning stable continuation keys to chart segments.
// The returned keys mirror the input day/segment structure without mutating it.
function buildChartContinuationKeys(days) {
  let gapSerial = 0;
  let previousGap = null;
  return (Array.isArray(days) ? days : []).map(day => {
    return (Array.isArray(day?.segments) ? day.segments : []).map(segment => {
      if (segment?.type === 'fast') {
        previousGap = null;
        return `fast:${segment.sourceStart}:${segment.sourceEnd}`;
      }
      const contiguous = previousGap && Math.abs(previousGap.end - segment.start) < 1000;
      const continuationKey = contiguous ? previousGap.continuationKey : `gap:${++gapSerial}`;
      previousGap = { end: segment.end, continuationKey };
      return continuationKey;
    });
  });
}
