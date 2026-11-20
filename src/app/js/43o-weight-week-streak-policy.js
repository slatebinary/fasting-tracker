  function previousWeightWeekKey(key) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!match) return '';
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) return '';
    date.setUTCDate(date.getUTCDate() - 7);
    return date.toISOString().slice(0, 10);
  }

  // Count consecutive logged Weight weeks, allowing the current week to be empty.
  function calculateWeightWeekStreak(weekKeys, currentWeekKey) {
    const weeks = new Set((Array.isArray(weekKeys) ? weekKeys : []).filter(Boolean));
    if (!weeks.size) return 0;
    let key = currentWeekKey;
    if (!weeks.has(key)) key = previousWeightWeekKey(key);
    if (!weeks.has(key)) return 0;
    let streak = 0;
    while (weeks.has(key)) {
      streak++;
      key = previousWeightWeekKey(key);
    }
    return streak;
  }
