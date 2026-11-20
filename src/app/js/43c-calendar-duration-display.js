// Pure display-duration policy for completed local calendar days.
  // A completed day within one second of its actual length is shown as complete;
  // the current day stays elapsed-only, including 23-hour and 25-hour DST days.
  function calendarDurationForDisplay(day, nowMs = Date.now()) {
    const total = Math.max(0, Number(day?.totalFastMs) || 0);
    const start = Number(day?.startMs), end = Number(day?.endMs);
    const dayLength = end - start, shortfall = dayLength - total;
    if (Number.isFinite(start) && Number.isFinite(end) && end <= nowMs && dayLength > 0 && total > 0 && shortfall >= 0 && shortfall <= 1000) return dayLength;
    return total;
  }
