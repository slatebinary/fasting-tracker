  // Normalize persisted notification preferences without depending on storage or UI state.
  function normalizeNotificationPreferencesPolicy(raw, allowedSnoozeMinutes) {
    const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const allowed = Array.isArray(allowedSnoozeMinutes) ? allowedSnoozeMinutes : [];
    const snoozeMinutes = candidate => {
      let duration;
      try { duration = Number(candidate); } catch { return 60; }
      return Number.isFinite(duration) && allowed.includes(duration) ? duration : 60;
    };
    return {
      enabled: value.enabled === true,
      targetReached: value.targetReached !== false,
      backupDue: value.backupDue !== false,
      longFastSafety: value.longFastSafety !== false,
      weighIn: value.weighIn === true,
      weighInCadence: value.weighInCadence === 'daily' ? 'daily' : 'weekly',
      cycleComplete: value.cycleComplete === true,
      weightSnoozeMinutes: snoozeMinutes(value.weightSnoozeMinutes),
      fastingSnoozeMinutes: snoozeMinutes(value.fastingSnoozeMinutes)
    };
  }
