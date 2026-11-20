// Pure eligibility and timing policy for the neutral 24-hour cycle countdown.
  function resolveNextFastCycleInfo({record,nowMs,active=false,scheduled=false}) {
    if (active || scheduled || !record) return null;
    const startMs = new Date(record.start).getTime(), endMs = new Date(record.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    const durationMs = endMs - startMs;
    const dayMs = 24 * 3600000;
    if (durationMs >= dayMs) return null;
    const suggestedStartMs = startMs + dayMs;
    const remainingMs = suggestedStartMs - nowMs;
    if (remainingMs <= 0) return null;
    return {record,durationMs,nonFastingMs:dayMs-durationMs,suggestedStartMs,remainingMs};
  }
