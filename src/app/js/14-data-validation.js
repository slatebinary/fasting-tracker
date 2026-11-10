  function migrateData(parsed) {
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid data');
    const version = Number(parsed.dataVersion);
    switch (version) {
      case 1: return parsed;
      default: throw new Error('unsupported data format');
    }
  }

  // App-version and deployment-migration metadata is owned by 12-app-migration-state.js.

  function normalizeRecord(r) {
    if (!r || typeof r !== 'object') return null;
    const start = validDate(r.start), end = validDate(r.end);
    if (!start || !end || end <= start || end.getTime() > Date.now() + FUTURE_TOLERANCE_MS) return null;
    return {
      id: (typeof r.id === 'string' && r.id.length <= 120) ? r.id : makeId(),
      start: start.toISOString(),
      end: end.toISOString(),
      goalHours: sanitizeGoal(r.goalHours, 16),
      timeZone: normalizeTimeZone(r.timeZone),
      createdAt: normalizeAuditTimestamp(r.createdAt),
      modifiedAt: normalizeAuditTimestamp(r.modifiedAt),
      editHistory: normalizeFastEditHistory(r.editHistory),
      stopReason: normalizeStopReason(r.stopReason)
    };
  }

  function normalizeDeletedFast(r) {
    const record = normalizeRecord(r);
    const deletedAt = validDate(r?.deletedAt);
    if (!record || !deletedAt) return null;
    const reason = typeof r.deletionReason === 'string' && r.deletionReason.length <= 80 ? r.deletionReason : 'user';
    return { ...record, deleted: true, deletedAt: deletedAt.toISOString(), deletedTimeZone: normalizeTimeZone(r.deletedTimeZone), deletionReason: reason };
  }

  function normalizeData(parsed) {
    parsed = migrateData(parsed);
    if (parsed.dataVersion !== DATA_VERSION) throw new Error('unsupported data format');
    const goal = sanitizeGoal(parsed.goalHours, 16);
    const active = validDate(parsed.activeStart);
    const activeValid = active && active.getTime() <= Date.now() + FUTURE_TOLERANCE_MS;
    return {
      dataVersion: DATA_VERSION,
      revision: Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0,
      updatedAt: validDate(parsed.updatedAt) ? validDate(parsed.updatedAt).toISOString() : null,
      goalHours: goal,
      activeStart: activeValid ? active.toISOString() : null,
      activeGoalHours: activeValid ? sanitizeGoal(parsed.activeGoalHours, goal) : null,
      activeTimeZone: activeValid ? normalizeTimeZone(parsed.activeTimeZone) : null,
      activeCreatedAt: activeValid ? normalizeAuditTimestamp(parsed.activeCreatedAt) : null,
      activeModifiedAt: activeValid ? normalizeAuditTimestamp(parsed.activeModifiedAt) : null,
      records: Array.isArray(parsed.records) ? parsed.records.map(normalizeRecord).filter(Boolean) : [],
      deletedFasts: Array.isArray(parsed.deletedFasts) ? parsed.deletedFasts.map(normalizeDeletedFast).filter(Boolean) : [],
      weights: Array.isArray(parsed.weights) ? parsed.weights.map(normalizeWeightEntry).filter(Boolean) : [],
      deletedWeights: Array.isArray(parsed.deletedWeights) ? parsed.deletedWeights.map(normalizeDeletedWeight).filter(Boolean) : [],
      weightUnit: normalizeWeightUnit(parsed.weightUnit),
      targetWeightKg: sanitizeWeightKg(parsed.targetWeightKg, null),
      gamificationEnabled: parsed.gamificationEnabled !== false,
      notificationPreferences: normalizeNotificationPreferences(parsed.notificationPreferences),
      language: normalizeLanguage(parsed.language),
      appearance: normalizeAppearance(parsed.appearance),
      iconChoice: normalizeIconChoice(parsed.iconChoice)
    };
  }

  function prepareCompatibleData(rawData) {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) throw new Error('invalid data');
    const candidate = JSON.parse(JSON.stringify(rawData));
    let changed = false;
    const mark = (key, value) => {
      if (candidate[key] !== value) { candidate[key] = value; changed = true; }
    };

    // dataVersion identifies the machine format. v1 has intentionally remained
    // backward compatible while optional metadata has evolved. Repair metadata
    // here; reserve Recovery mode for unreadable/unsupported data or damaged
    // core history values (timestamps, durations and weights).
    if (Number(candidate.dataVersion) !== DATA_VERSION) return { data: candidate, changed };
    if (candidate.dataVersion !== DATA_VERSION) mark('dataVersion', DATA_VERSION);
    if (candidate.records === undefined) { candidate.records = []; changed = true; }
    if (candidate.deletedFasts === undefined) { candidate.deletedFasts = []; changed = true; }
    if (candidate.weights === undefined) { candidate.weights = []; changed = true; }
    if (candidate.deletedWeights === undefined) { candidate.deletedWeights = []; changed = true; }

    if (candidate.revision != null && (!Number.isInteger(candidate.revision) || candidate.revision < 0)) mark('revision', 0);
    if (candidate.updatedAt != null && !validDate(candidate.updatedAt)) mark('updatedAt', null);

    const parsedGoal = parseLocalizedNumber(candidate.goalHours);
    const fallbackGoal = Number.isFinite(parsedGoal) && parsedGoal > 0 && parsedGoal <= MAX_SAFE_GOAL_HOURS
      ? sanitizeGoal(candidate.goalHours, 16) : 16;
    if (candidate.goalHours !== fallbackGoal) mark('goalHours', fallbackGoal);

    const weightUnit = normalizeWeightUnit(candidate.weightUnit);
    if (candidate.weightUnit !== weightUnit) mark('weightUnit', weightUnit);
    const language = normalizeLanguage(candidate.language);
    if (candidate.language !== language) mark('language', language);
    const appearance = normalizeAppearance(candidate.appearance);
    if (candidate.appearance !== appearance) mark('appearance', appearance);
    const iconChoice = normalizeIconChoice(candidate.iconChoice);
    if (candidate.iconChoice !== iconChoice) mark('iconChoice', iconChoice);
    if (typeof candidate.gamificationEnabled !== 'boolean') mark('gamificationEnabled', true);
    const notificationPreferences = normalizeNotificationPreferences(candidate.notificationPreferences);
    if (JSON.stringify(candidate.notificationPreferences) !== JSON.stringify(notificationPreferences)) { candidate.notificationPreferences = notificationPreferences; changed = true; }
    if (candidate.targetWeightKg != null) {
      const target = sanitizeWeightKg(candidate.targetWeightKg, null);
      if (target == null) mark('targetWeightKg', null);
      else if (candidate.targetWeightKg !== target) mark('targetWeightKg', target);
    }

    const fallbackZone = currentTimeZone();
    const usedFastIds = new Set();
    if (Array.isArray(candidate.records)) {
      candidate.records = candidate.records.map((record, index) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
        const next = {...record};
        const start = validDate(next.start), end = validDate(next.end);
        const baseId = `legacy-fast-${index + 1}-${start ? start.getTime() : index}`.slice(0, 110);
        let id = typeof next.id === 'string' && next.id && next.id.length <= 120 ? next.id : baseId;
        if (usedFastIds.has(id)) {
          let suffix = 2;
          while (usedFastIds.has(`${baseId}-${suffix}`)) suffix++;
          id = `${baseId}-${suffix}`.slice(0, 120);
        }
        usedFastIds.add(id);
        if (next.id !== id) { next.id = id; changed = true; }
        const goal = sanitizeGoal(next.goalHours, fallbackGoal);
        if (next.goalHours !== goal) { next.goalHours = goal; changed = true; }
        const zone = normalizeTimeZone(next.timeZone, fallbackZone);
        if (next.timeZone !== zone) { next.timeZone = zone; changed = true; }
        for (const key of ['createdAt','modifiedAt']) {
          const audit = normalizeAuditTimestamp(next[key]);
          if (next[key] !== audit) { next[key] = audit; changed = true; }
        }
        const editHistory = normalizeFastEditHistory(next.editHistory);
        if (!Array.isArray(next.editHistory) || JSON.stringify(next.editHistory) !== JSON.stringify(editHistory)) { next.editHistory = editHistory; changed = true; }
        const stopReason = normalizeStopReason(next.stopReason);
        if ((next.stopReason ?? null) !== stopReason) { next.stopReason = stopReason; changed = true; }
        // Canonicalize valid timestamps without guessing damaged core dates.
        if (start && next.start !== start.toISOString()) { next.start = start.toISOString(); changed = true; }
        if (end && next.end !== end.toISOString()) { next.end = end.toISOString(); changed = true; }
        return next;
      });
    }

    const usedDeletedFastIds = new Set();
    if (Array.isArray(candidate.deletedFasts)) {
      candidate.deletedFasts = candidate.deletedFasts.map((record, index) => {
        if (!record || typeof record !== 'object' || Array.isArray(record)) return record;
        const next = {...record};
        const start = validDate(next.start), end = validDate(next.end);
        const baseId = `deleted-fast-${index + 1}-${start ? start.getTime() : index}`.slice(0, 110);
        let id = typeof next.id === 'string' && next.id && next.id.length <= 120 ? next.id : baseId;
        if (usedDeletedFastIds.has(id)) {
          let suffix = 2;
          while (usedDeletedFastIds.has(`${baseId}-${suffix}`)) suffix++;
          id = `${baseId}-${suffix}`.slice(0, 120);
        }
        usedDeletedFastIds.add(id);
        if (next.id !== id) { next.id = id; changed = true; }
        const goal = sanitizeGoal(next.goalHours, fallbackGoal);
        if (next.goalHours !== goal) { next.goalHours = goal; changed = true; }
        const zone = normalizeTimeZone(next.timeZone, fallbackZone);
        if (next.timeZone !== zone) { next.timeZone = zone; changed = true; }
        for (const key of ['createdAt','modifiedAt']) {
          const audit = normalizeAuditTimestamp(next[key]);
          if (next[key] !== audit) { next[key] = audit; changed = true; }
        }
        const editHistory = normalizeFastEditHistory(next.editHistory);
        if (!Array.isArray(next.editHistory) || JSON.stringify(next.editHistory) !== JSON.stringify(editHistory)) { next.editHistory = editHistory; changed = true; }
        const stopReason = normalizeStopReason(next.stopReason);
        if ((next.stopReason ?? null) !== stopReason) { next.stopReason = stopReason; changed = true; }
        if (start && next.start !== start.toISOString()) { next.start = start.toISOString(); changed = true; }
        if (end && next.end !== end.toISOString()) { next.end = end.toISOString(); changed = true; }
        const deletedAt = validDate(next.deletedAt);
        if (deletedAt && next.deletedAt !== deletedAt.toISOString()) { next.deletedAt = deletedAt.toISOString(); changed = true; }
        if (next.deleted !== true) { next.deleted = true; changed = true; }
        const deletedZone = normalizeTimeZone(next.deletedTimeZone, fallbackZone);
        if (next.deletedTimeZone !== deletedZone) { next.deletedTimeZone = deletedZone; changed = true; }
        const reason = typeof next.deletionReason === 'string' && next.deletionReason.length <= 80 ? next.deletionReason : 'user';
        if (next.deletionReason !== reason) { next.deletionReason = reason; changed = true; }
        return next;
      });
    }

    const usedWeightIds = new Set();
    if (Array.isArray(candidate.weights)) {
      candidate.weights = candidate.weights.map((weight, index) => {
        if (!weight || typeof weight !== 'object' || Array.isArray(weight)) return weight;
        const next = {...weight};
        const when = validDate(next.when);
        const baseId = `legacy-weight-${index + 1}-${when ? when.getTime() : index}`.slice(0, 110);
        let id = typeof next.id === 'string' && next.id && next.id.length <= 120 ? next.id : baseId;
        if (usedWeightIds.has(id)) {
          let suffix = 2;
          while (usedWeightIds.has(`${baseId}-${suffix}`)) suffix++;
          id = `${baseId}-${suffix}`.slice(0, 120);
        }
        usedWeightIds.add(id);
        if (next.id !== id) { next.id = id; changed = true; }
        const zone = normalizeTimeZone(next.timeZone, fallbackZone);
        if (next.timeZone !== zone) { next.timeZone = zone; changed = true; }
        for (const key of ['createdAt','modifiedAt']) {
          const audit = normalizeAuditTimestamp(next[key]);
          if (next[key] !== audit) { next[key] = audit; changed = true; }
        }
        if (when && next.when !== when.toISOString()) { next.when = when.toISOString(); changed = true; }
        const kg = sanitizeWeightKg(next.kg, null);
        if (kg != null && next.kg !== kg) { next.kg = kg; changed = true; }
        return next;
      });
    }

    const usedDeletedWeightIds = new Set();
    if (Array.isArray(candidate.deletedWeights)) {
      candidate.deletedWeights = candidate.deletedWeights.map((weight, index) => {
        if (!weight || typeof weight !== 'object' || Array.isArray(weight)) return weight;
        const next = {...weight};
        const when = validDate(next.when);
        const baseId = `deleted-weight-${index + 1}-${when ? when.getTime() : index}`.slice(0,110);
        let id = typeof next.id === 'string' && next.id && next.id.length <= 120 ? next.id : baseId;
        if (usedDeletedWeightIds.has(id)) { let suffix=2; while (usedDeletedWeightIds.has(`${baseId}-${suffix}`)) suffix++; id=`${baseId}-${suffix}`.slice(0,120); }
        usedDeletedWeightIds.add(id);
        if (next.id !== id) { next.id=id; changed=true; }
        const zone=normalizeTimeZone(next.timeZone,fallbackZone); if(next.timeZone!==zone){next.timeZone=zone;changed=true;}
        const kg=sanitizeWeightKg(next.kg,null); if(kg!=null&&next.kg!==kg){next.kg=kg;changed=true;}
        for (const key of ['createdAt','modifiedAt']) { const audit=normalizeAuditTimestamp(next[key]); if(next[key]!==audit){next[key]=audit;changed=true;} }
        if(when&&next.when!==when.toISOString()){next.when=when.toISOString();changed=true;}
        const deletedAt=validDate(next.deletedAt); if(deletedAt&&next.deletedAt!==deletedAt.toISOString()){next.deletedAt=deletedAt.toISOString();changed=true;}
        if(next.deleted!==true){next.deleted=true;changed=true;}
        const deletedZone=normalizeTimeZone(next.deletedTimeZone,fallbackZone); if(next.deletedTimeZone!==deletedZone){next.deletedTimeZone=deletedZone;changed=true;}
        const reason=typeof next.deletionReason==='string'&&next.deletionReason.length<=80?next.deletionReason:'user'; if(next.deletionReason!==reason){next.deletionReason=reason;changed=true;}
        return next;
      });
    }

    if (candidate.activeStart != null) {
      const active = validDate(candidate.activeStart);
      if (active && candidate.activeStart !== active.toISOString()) mark('activeStart', active.toISOString());
      const activeGoal = sanitizeGoal(candidate.activeGoalHours, fallbackGoal);
      if (candidate.activeGoalHours !== activeGoal) mark('activeGoalHours', activeGoal);
      const activeZone = normalizeTimeZone(candidate.activeTimeZone, fallbackZone);
      if (candidate.activeTimeZone !== activeZone) mark('activeTimeZone', activeZone);
      const activeCreated = normalizeAuditTimestamp(candidate.activeCreatedAt);
      if (candidate.activeCreatedAt !== activeCreated) mark('activeCreatedAt', activeCreated);
      const activeModified = normalizeAuditTimestamp(candidate.activeModifiedAt);
      if (candidate.activeModifiedAt !== activeModified) mark('activeModifiedAt', activeModified);
    } else {
      if (candidate.activeStart !== null) mark('activeStart', null);
      if (candidate.activeGoalHours != null) mark('activeGoalHours', null);
      if (candidate.activeTimeZone != null) mark('activeTimeZone', null);
      if (candidate.activeCreatedAt != null) mark('activeCreatedAt', null);
      else if (candidate.activeCreatedAt === undefined) mark('activeCreatedAt', null);
      if (candidate.activeModifiedAt != null) mark('activeModifiedAt', null);
      else if (candidate.activeModifiedAt === undefined) mark('activeModifiedAt', null);
    }
    return { data: candidate, changed };
  }

  function validateCompatibleData(rawData) {
    const prepared = prepareCompatibleData(rawData);
    return { data: validateImportedData(prepared.data), changed: prepared.changed };
  }

  function validateImportedData(rawData) {
    rawData = migrateData(rawData);
    if (rawData.dataVersion !== DATA_VERSION) throw new Error('unsupported data format');
    if (!Array.isArray(rawData.records) || !Array.isArray(rawData.deletedFasts) || !Array.isArray(rawData.weights) || !Array.isArray(rawData.deletedWeights)) throw new Error('missing arrays');
    if (rawData.revision != null && (!Number.isInteger(rawData.revision) || rawData.revision < 0)) throw new Error('invalid revision');
    if (rawData.updatedAt != null && !validDate(rawData.updatedAt)) throw new Error('invalid updated time');
    if (rawData.records.length > MAX_IMPORT_FASTS || rawData.deletedFasts.length > MAX_IMPORT_DELETED_FASTS || rawData.weights.length > MAX_IMPORT_WEIGHTS || rawData.deletedWeights.length > MAX_IMPORT_WEIGHTS) throw new Error('too many records');
    if (!Number.isFinite(parseLocalizedNumber(rawData.goalHours)) || parseLocalizedNumber(rawData.goalHours) <= 0 || parseLocalizedNumber(rawData.goalHours) > MAX_SAFE_GOAL_HOURS) throw new Error('invalid default goal');
    if (!['kg','lb'].includes(rawData.weightUnit)) throw new Error('invalid weight unit');
    if (rawData.language != null && typeof rawData.language !== 'string') throw new Error('invalid language');
    if (!['system','light','dark','grayscale','high-contrast-light','high-contrast-dark','colorblind','protanopia','deuteranopia','tritanopia'].includes(rawData.appearance)) throw new Error('invalid appearance');
    if (rawData.iconChoice != null && !['plate','moon','hourglass','timer','grayscale','highcontrast','colorblind'].includes(rawData.iconChoice)) throw new Error('invalid icon choice');
    if (typeof rawData.gamificationEnabled !== 'boolean') throw new Error('invalid gamification setting');
    const notificationPreferences = rawData.notificationPreferences;
    if (!notificationPreferences || typeof notificationPreferences !== 'object' || Array.isArray(notificationPreferences) ||
        typeof notificationPreferences.enabled !== 'boolean' || typeof notificationPreferences.targetReached !== 'boolean' ||
        typeof notificationPreferences.backupDue !== 'boolean' || typeof notificationPreferences.longFastSafety !== 'boolean' ||
        typeof notificationPreferences.weighIn !== 'boolean' || !['daily','weekly'].includes(notificationPreferences.weighInCadence) ||
        typeof notificationPreferences.cycleComplete !== 'boolean') throw new Error('invalid notification preferences');
    if (rawData.targetWeightKg != null && sanitizeWeightKg(rawData.targetWeightKg, null) == null) throw new Error('invalid target weight');
    if (rawData.activeStart != null) {
      if (!validDate(rawData.activeStart) || validDate(rawData.activeStart).getTime() > Date.now() + FUTURE_TOLERANCE_MS) throw new Error('invalid active fast');
      if (!Number.isFinite(parseLocalizedNumber(rawData.activeGoalHours)) || parseLocalizedNumber(rawData.activeGoalHours) <= 0 || parseLocalizedNumber(rawData.activeGoalHours) > MAX_SAFE_GOAL_HOURS) throw new Error('invalid active goal');
      if (!isValidTimeZone(rawData.activeTimeZone)) throw new Error('invalid active timezone');
      if (rawData.activeCreatedAt != null && !validDate(rawData.activeCreatedAt)) throw new Error('invalid active creation time');
      if (rawData.activeModifiedAt != null && !validDate(rawData.activeModifiedAt)) throw new Error('invalid active modification time');
    } else if (rawData.activeGoalHours != null || rawData.activeTimeZone != null || rawData.activeCreatedAt != null || rawData.activeModifiedAt != null) {
      throw new Error('orphan active fast metadata');
    }

    const records = rawData.records.map(r => {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 120) throw new Error('invalid record id');
      if (!Number.isFinite(parseLocalizedNumber(r.goalHours)) || parseLocalizedNumber(r.goalHours) <= 0 || parseLocalizedNumber(r.goalHours) > MAX_SAFE_GOAL_HOURS) throw new Error('invalid record goal');
      if (!isValidTimeZone(r.timeZone)) throw new Error('invalid record timezone');
      if (r.createdAt != null && !validDate(r.createdAt)) throw new Error('invalid record creation time');
      if (r.modifiedAt != null && !validDate(r.modifiedAt)) throw new Error('invalid record modification time');
      if (!Array.isArray(r.editHistory) || r.editHistory.length > MAX_FAST_EDIT_AUDIT || normalizeFastEditHistory(r.editHistory).length !== r.editHistory.length) throw new Error('invalid record edit audit');
      const normalized = normalizeRecord(r);
      if (!normalized) throw new Error('invalid fasting record');
      return normalized;
    });
    if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('duplicate fasting ids');

    const deletedFasts = rawData.deletedFasts.map(r => {
      if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || r.id.length > 120) throw new Error('invalid deleted fast id');
      if (r.deleted !== true) throw new Error('invalid deleted fast marker');
      if (!validDate(r.deletedAt)) throw new Error('invalid deleted fast deletion time');
      if (!isValidTimeZone(r.deletedTimeZone)) throw new Error('invalid deleted fast deletion timezone');
      if (typeof r.deletionReason !== 'string' || !r.deletionReason || r.deletionReason.length > 80) throw new Error('invalid deleted fast reason');
      if (!Number.isFinite(parseLocalizedNumber(r.goalHours)) || parseLocalizedNumber(r.goalHours) <= 0 || parseLocalizedNumber(r.goalHours) > MAX_SAFE_GOAL_HOURS) throw new Error('invalid deleted fast goal');
      if (!isValidTimeZone(r.timeZone)) throw new Error('invalid deleted fast timezone');
      if (r.createdAt != null && !validDate(r.createdAt)) throw new Error('invalid deleted fast creation time');
      if (r.modifiedAt != null && !validDate(r.modifiedAt)) throw new Error('invalid deleted fast modification time');
      if (!Array.isArray(r.editHistory) || r.editHistory.length > MAX_FAST_EDIT_AUDIT || normalizeFastEditHistory(r.editHistory).length !== r.editHistory.length) throw new Error('invalid deleted fast edit audit');
      const normalized = normalizeDeletedFast(r);
      if (!normalized) throw new Error('invalid deleted fasting record');
      return normalized;
    });
    if (new Set(deletedFasts.map(r => r.id)).size !== deletedFasts.length) throw new Error('duplicate deleted fasting ids');
    const liveFastIds = new Set(records.map(r => r.id));
    if (deletedFasts.some(r => liveFastIds.has(r.id))) throw new Error('fast id present in active and deleted history');
    // Legacy overlap is a semantic conflict, not unreadable storage. Preserve it
    // instead of trapping the whole app in Recovery mode; editing/backdating UI
    // continues to prevent creation of new overlaps.

    const weights = rawData.weights.map(w => {
      if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !w.id || w.id.length > 120) throw new Error('invalid weight id');
      if (sanitizeWeightKg(w.kg, null) == null) throw new Error('invalid weight value');
      if (!isValidTimeZone(w.timeZone)) throw new Error('invalid weight timezone');
      if (w.createdAt != null && !validDate(w.createdAt)) throw new Error('invalid weight creation time');
      if (w.modifiedAt != null && !validDate(w.modifiedAt)) throw new Error('invalid weight modification time');
      const normalized = normalizeWeightEntry(w);
      if (!normalized) throw new Error('invalid weight record');
      return normalized;
    });
    if (new Set(weights.map(w => w.id)).size !== weights.length) throw new Error('duplicate weight ids');

    const deletedWeights = rawData.deletedWeights.map(w => {
      if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !w.id || w.id.length > 120) throw new Error('invalid deleted weight id');
      if (w.deleted !== true || !validDate(w.deletedAt) || !isValidTimeZone(w.deletedTimeZone)) throw new Error('invalid deleted weight audit');
      if (typeof w.deletionReason !== 'string' || !w.deletionReason || w.deletionReason.length > 80) throw new Error('invalid deleted weight reason');
      if (sanitizeWeightKg(w.kg,null) == null || !isValidTimeZone(w.timeZone)) throw new Error('invalid deleted weight value');
      const normalized = normalizeDeletedWeight(w); if (!normalized) throw new Error('invalid deleted weight record'); return normalized;
    });
    if (new Set(deletedWeights.map(w=>w.id)).size !== deletedWeights.length) throw new Error('duplicate deleted weight ids');
    const liveWeightIds = new Set(weights.map(w=>w.id));
    if (deletedWeights.some(w=>liveWeightIds.has(w.id))) throw new Error('weight id present in active and deleted history');

    const normalized = normalizeData(rawData);
    // Preserve legacy active/history overlap as-is. Recovery mode is for data that
    // cannot be read safely, not for a correctable historical business-rule clash.
    normalized.records = records;
    normalized.deletedFasts = deletedFasts;
    normalized.weights = weights;
    normalized.deletedWeights = deletedWeights;
    return normalized;
  }

