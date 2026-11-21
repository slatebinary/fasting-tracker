  // Classify notification details for the existing fasting/weight snooze preference groups.
  function notificationSnoozeCategoryPolicy(kind) {
    if (kind === 'weigh-in') return 'weight';
    return ['target','safety','cycle'].includes(kind) ? 'fasting' : null;
  }
