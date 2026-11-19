  function buildFastingIntervals({
    records,
    activeStart = null,
    activeGoalHours,
    defaultGoalHours,
    rangeStart = -Infinity,
    rangeEnd = Infinity,
    nowMs,
    sanitizeGoal
  }) {
    if (typeof sanitizeGoal !== 'function') return [];
    const intervals = [];
    for (const record of Array.isArray(records) ? records : []) {
      if (!record || typeof record !== 'object') continue;
      const start = Date.parse(record.start), end = Date.parse(record.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      if (end <= rangeStart || start >= rangeEnd) continue;
      intervals.push({
        start,
        end,
        goalHours: sanitizeGoal(record.goalHours, defaultGoalHours),
        sourceStart: start,
        sourceEnd: end,
        active: false
      });
    }
    if (activeStart) {
      const start = Date.parse(activeStart), end = nowMs;
      if (Number.isFinite(start) && Number.isFinite(end) && end > start && end > rangeStart && start < rangeEnd) {
        intervals.push({
          start,
          end,
          goalHours: sanitizeGoal(activeGoalHours, defaultGoalHours),
          sourceStart: start,
          sourceEnd: end,
          active: true
        });
      }
    }
    intervals.sort((a,b)=>a.start-b.start);
    return intervals;
  }
