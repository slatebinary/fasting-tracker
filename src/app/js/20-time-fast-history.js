  function recordMs(r) { return Math.max(0, new Date(r.end) - new Date(r.start)); }
  function goalMs(hours = data.goalHours) { return sanitizeGoal(hours, data.goalHours) * 3600000; }
  function recordMetGoal(r) { return recordMs(r) >= goalMs(r.goalHours ?? data.goalHours); }
  function activeTargetHours() { return data.activeStart ? sanitizeGoal(data.activeGoalHours, data.goalHours) : data.goalHours; }

  function updateGoalChips() {
    document.querySelectorAll('.chip[data-goal]').forEach(chip => {
      const active = Number(chip.dataset.goal) === data.goalHours; chip.classList.toggle('active', active); chip.setAttribute('aria-pressed', String(active));
    });
    updateCycleHelpers();
  }


  function cycleHelperText(hours) {
    const target = sanitizeGoal(hours, data.goalHours);
    if (target < 24) {
      const nonFastingMs = Math.max(0, (24 - target) * 3600000);
      return t('settings.cycleUnder24', {fast: formatGoal(target), nonfast: friendlyDuration(nonFastingMs)});
    }
    if (target === 24) return t('settings.cycle24');
    return t('settings.cycleExtended');
  }

  function updateCycleHelpers() {
    const goalHelp = el('goalCycleHelp');
    if (goalHelp) goalHelp.textContent = cycleHelperText(data.goalHours);
    const activeHelp = el('activeGoalCycleHelp');
    if (activeHelp) {
      const parsed = parseLocalizedNumber(el('activeTargetInput')?.value);
      activeHelp.textContent = cycleHelperText(Number.isFinite(parsed) && parsed > 0 ? parsed : activeTargetHours());
    }
  }

  function latestCompletedFast() {
    if (latestCompletedFastCache !== undefined) return latestCompletedFastCache;
    let latest = null, latestEnd = -Infinity;
    for (const record of data.records) {
      const endMs = new Date(record.end).getTime();
      if (Number.isFinite(endMs) && endMs > latestEnd) { latest = record; latestEnd = endMs; }
    }
    latestCompletedFastCache = latest;
    return latest;
  }

  function nextFastCycleInfo(nowMs = Date.now()) {
    if (data.activeStart) return null;
    const record = latestCompletedFast();
    if (!record) return null;
    const startMs = new Date(record.start).getTime(), endMs = new Date(record.end).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    const durationMs = endMs - startMs;
    const dayMs = 24 * 3600000;
    if (durationMs >= dayMs) return null;
    const suggestedStartMs = startMs + dayMs;
    const remainingMs = suggestedStartMs - nowMs;
    if (remainingMs <= 0) return null;
    return { record, durationMs, nonFastingMs: dayMs - durationMs, suggestedStartMs, remainingMs };
  }

  function updateNextFastCountdown() {
    const card = el('nextFastCard');
    if (!card) return;
    const info = nextFastCycleInfo();
    card.hidden = !info;
    if (!info) return;
    el('nextFastCountdown').textContent = exactDuration(info.remainingMs);
    el('nextFastAt').textContent = t('fasting.nextAt', {date: localDateTimeLabel(info.suggestedStartMs, info.record.timeZone)});
    // Derive both displayed parts from the same completed whole-minute value so
    // the visible arithmetic always adds up to exactly 24h. The countdown itself
    // remains second-accurate.
    const fastMinutes = Math.max(0, Math.min(1439, Math.floor(info.durationMs / 60000)));
    const nonFastMinutes = 1440 - fastMinutes;
    el('nextFastBasis').textContent = t('fasting.nextBasis', {
      fasted: totalHoursDuration(fastMinutes * 60000),
      nonfast: totalHoursDuration(nonFastMinutes * 60000)
    });
  }

  const SCIENCE_STAGES = [
    { max: 8, key: 0 }, { max: 12, key: 1 }, { max: 24, key: 2 },
    { max: 36, key: 3 }, { max: 48, key: 4 }, { max: Infinity, key: 5 }
  ];

  function updateScienceCard() {
    const stages = [...document.querySelectorAll('.scienceStage')];
    stages.forEach(x => x.classList.remove('current'));
    if (!data.activeStart) {
      el('scienceWindow').textContent = t('science.notFasting');
      el('scienceEvidence').textContent = t('science.limited');
      el('scienceText').textContent = t('science.idle');
      return;
    }
    const startMs = new Date(data.activeStart).getTime();
    const hours = Math.max(0, (Date.now() - startMs) / 3600000);
    let index = SCIENCE_STAGES.findIndex(stage => hours < stage.max);
    if (index < 0) index = SCIENCE_STAGES.length - 1;
    const stage = SCIENCE_STAGES[index];
    el('scienceWindow').textContent = t(`science.stage${stage.key}`);
    el('scienceEvidence').textContent = t(`science.stage${stage.key}e`);
    el('scienceText').textContent = t(`science.stage${stage.key}t`);
    if (stages[index]) stages[index].classList.add('current');
  }

  function updateTimer() {
    const targetHours = activeTargetHours();
    goalText.textContent = data.activeStart ? t('fasting.targetLocked', {goal: formatGoal(targetHours)}) : t('fasting.target', {goal: formatGoal(data.goalHours)});
    if (document.activeElement !== goalHours) goalHours.value = formatNumber(data.goalHours, 0, 3);
    updateGoalChips();

    if (data.activeStart) {
      el('nextFastCard').hidden = true;
      const startMs = new Date(data.activeStart).getTime();
      const elapsed = Math.max(0, Date.now() - startMs);
      const targetMs = goalMs(targetHours);
      const pct = targetMs > 0 ? (elapsed / targetMs) * 100 : 0;
      timer.textContent = exactDuration(elapsed);
      friendlyTimer.textContent = friendlyDuration(elapsed);
      statusText.textContent = t('fasting.started', {date: localDateTimeLabel(data.activeStart, data.activeTimeZone)});
      toggleFast.textContent = t('fasting.stop');
      toggleFast.classList.add('stop');
      startEarlierBtn.hidden = true;
      editActiveTargetBtn.hidden = false;
      const visualPct = Math.min(100, Math.max(0, pct));
      fastProgressTrack.style.setProperty('--fast-progress-angle', `${visualPct * 3.6}deg`);
      fastProgressTrack.classList.toggle('reached', pct >= 100);
      fastProgressTrack.setAttribute('aria-valuenow', String(Math.round(visualPct)));
      fastProgressTrack.setAttribute('aria-valuetext', pct >= 100 ? t('fasting.targetReached', {duration:friendlyDuration(Math.max(0, elapsed - targetMs))}) : t('fasting.progress', {pct:formatNumber(Math.min(99.9, pct), pct < 10 ? 1 : 0, pct < 10 ? 1 : 0), duration:friendlyDuration(Math.max(0, targetMs - elapsed))}));
      const targetMoment = el('targetMoment');
      const targetAt = safeTargetDate(startMs, targetMs);
      targetMoment.hidden = !targetAt;
      if (targetAt) targetMoment.textContent = elapsed >= targetMs
        ? t('fasting.targetTimePassed', {date: localDateTimeLabel(targetAt, data.activeTimeZone)})
        : t('fasting.expectedTargetTime', {date: localDateTimeLabel(targetAt, data.activeTimeZone)});

      const encouragement = el('fastingEncouragement');
      const shorterState = shorterGoalState();
      if (shorterState?.start === data.activeStart && shorterState.checkpointAt > 0) {
        encouragement.hidden = false;
        encouragement.textContent = Date.now() < shorterState.checkpointAt
          ? t('fasting.shorterCheckpoint', {duration:friendlyDuration(shorterState.checkpointAt - Date.now())})
          : t('fasting.shorterCheckpointReached');
      } else if (elapsed >= targetMs) {
        encouragement.hidden = false;
        encouragement.textContent = t('fasting.encourageComplete');
      } else {
        const remainingForEncouragement = targetMs - elapsed;
        const progressForEncouragement = targetMs > 0 ? elapsed / targetMs : 0;
        const encouragementKey = progressForEncouragement < 0.25 ? 'fasting.encourageEarly' : progressForEncouragement < 0.75 ? 'fasting.encourageMiddle' : progressForEncouragement < 0.95 ? 'fasting.encourageNear' : 'fasting.encourageAlmost';
        encouragement.hidden = false;
        encouragement.textContent = t(encouragementKey, {duration:friendlyDuration(remainingForEncouragement)});
      }

      if (elapsed >= targetMs) {
        const beyond = elapsed - targetMs;
        progressDetail.textContent = t('fasting.targetReached', {duration: friendlyDuration(beyond)});
        progressDetail.classList.add('good');
      } else {
        const remaining = targetMs - elapsed;
        progressDetail.textContent = t('fasting.progress', {pct: formatNumber(Math.min(99.9, pct), pct < 10 ? 1 : 0, pct < 10 ? 1 : 0), duration: friendlyDuration(remaining)});
        progressDetail.classList.remove('good');
      }
    } else {
      timer.textContent = '00:00:00';
      friendlyTimer.textContent = `0${t('unit.h')} 0${t('unit.m')}`;
      statusText.textContent = t('fasting.ready');
      toggleFast.textContent = t('fasting.start');
      toggleFast.classList.remove('stop');
      startEarlierBtn.hidden = false;
      editActiveTargetBtn.hidden = true;
      fastProgressTrack.style.setProperty('--fast-progress-angle', '0deg');
      fastProgressTrack.classList.remove('reached');
      fastProgressTrack.setAttribute('aria-valuenow', '0');
      fastProgressTrack.setAttribute('aria-valuetext', t('fasting.zeroProgress'));
      progressDetail.textContent = t('fasting.zeroProgress');
      progressDetail.classList.remove('good');
      el('fastingEncouragement').hidden = true;
      el('fastingEncouragement').textContent = '';
      el('targetMoment').hidden = true;
      el('targetMoment').textContent = '';
      updateNextFastCountdown();
    }

    updateScienceCard();
    updateToday();
  }

  function startFast() {
    clearShorterGoalState();
    const createdAt = new Date().toISOString();
    data.activeStart = createdAt;
    data.activeGoalHours = data.goalHours;
    data.activeTimeZone = currentTimeZone();
    data.activeCreatedAt = createdAt;
    data.activeModifiedAt = null;
    if (!save()) { renderAll(); return; }
    renderAll();
  }

  function clearStopUndo({ hide = true } = {}) {
    pendingStopUndo = null;
    if (stopUndoTimer) { clearTimeout(stopUndoTimer); stopUndoTimer = 0; }
    if (stopUndoCountdownTimer) { clearInterval(stopUndoCountdownTimer); stopUndoCountdownTimer = 0; }
    if (stopUndoMessageTimer) { clearTimeout(stopUndoMessageTimer); stopUndoMessageTimer = 0; }
    if (hide) el('stopUndoBar').hidden = true;
  }

  function updateStopUndoCountdown() {
    const badge = el('stopUndoCountdown');
    if (!badge || !pendingStopUndo) return;
    const seconds = Math.max(0, Math.ceil((pendingStopUndo.expiresAt - Date.now()) / 1000));
    badge.textContent = `${seconds}s`;
  }

  function showStopUndo(recordId, activeSnapshot) {
    clearStopUndo({hide:false});
    pendingStopUndo = { recordId, activeSnapshot, expiresAt: Date.now() + 10000 };
    el('stopUndoText').textContent = t('fasting.stoppedUndo');
    el('stopUndoBtn').hidden = false;
    el('stopUndoCountdown').hidden = false;
    el('stopUndoBar').hidden = false;
    updateStopUndoCountdown();
    stopUndoCountdownTimer = setInterval(updateStopUndoCountdown, 250);
    stopUndoTimer = setTimeout(() => clearStopUndo(), 10000);
  }

  function closeStopFastModal() {
    // Do not expose the underlying Start/Stop control to the tail end of the
    // same touch sequence that dismissed this modal. Mobile Safari can
    // otherwise retarget a synthetic click after the overlay disappears.
    suppressFastToggleUntil = performance.now() + 350;
    hideModal('stopFastModal');
    stopModalStage = 'confirm';
    shorterGoalOfferMs = 0;
    el('continueOriginalTargetBtn').hidden = true;
    el('stopFastModalActions').classList.remove('shorterOfferActions');
    el('stopFastModalTitle').textContent = t('fasting.stopModalTitle');
    el('keepFastingBtn').textContent = t('fasting.keepFasting');
    el('stopAndSaveBtn').textContent = t('fasting.stopAndSave');
  }

  function shorterGoalState() {
    try {
      const value = JSON.parse(localStorage.getItem('fastingTracker.shorterGoal') || 'null');
      if (!value || typeof value.start !== 'string' || !Number.isFinite(Number(value.checkpointAt))) return null;
      return {start:value.start, checkpointAt:Number(value.checkpointAt), offered:value.offered === true};
    } catch { return null; }
  }

  function saveShorterGoalState(value) {
    try { localStorage.setItem('fastingTracker.shorterGoal', JSON.stringify(value)); } catch {}
  }

  function clearShorterGoalState() {
    try { localStorage.removeItem('fastingTracker.shorterGoal'); } catch {}
  }

  function keepFastingAndReturnHome() {
    if (stopModalStage === 'shorter') {
      const start = data.activeStart;
      if (start && shorterGoalOfferMs > 0) {
        saveShorterGoalState({start, checkpointAt:Date.now() + shorterGoalOfferMs, offered:true});
      }
    }
    closeStopFastModal();
    activateScreen('fasting');
    requestAnimationFrame(() => { try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch { window.scrollTo(0, 0); } });
  }

  function keepOriginalTargetAndReturnHome() {
    const start = data.activeStart;
    if (start) saveShorterGoalState({start, checkpointAt:0, offered:true, choice:'original-target'});
    closeStopFastModal();
    activateScreen('fasting');
    requestAnimationFrame(() => { try { window.scrollTo({ top: 0, left: 0, behavior: 'auto' }); } catch { window.scrollTo(0, 0); } });
  }

  function stopFast() {
    const start = validDate(data.activeStart);
    if (!start) {
      data.activeStart = null;
      data.activeGoalHours = null;
      data.activeTimeZone = null;
      data.activeCreatedAt = null;
      data.activeModifiedAt = null;
      if (!save()) { renderAll(); return; }
      renderAll();
      return;
    }
    const duration = Date.now() - start.getTime();
    if (duration <= 0) { alert(t('fasting.clockError')); return; }
    stopModalStage = 'confirm';
    shorterGoalOfferMs = 0;
    el('stopFastModalTitle').textContent = t('fasting.stopModalTitle');
    el('keepFastingBtn').textContent = t('fasting.keepFasting');
    el('stopAndSaveBtn').textContent = t('fasting.stopAndSave');
    const text = el('stopFastModalText');
    text.classList.toggle('warn', duration < 60000);
    text.textContent = duration < 60000
      ? t('fasting.stopModalShort')
      : t('fasting.stopModalText', {duration: friendlyDuration(duration)});
    const early = duration < goalMs(activeTargetHours());
    const reasonGroup = el('stopReasonGroup');
    if (reasonGroup) reasonGroup.hidden = !early;
    if (early && el('stopReasonSelect')) el('stopReasonSelect').value = 'personal';
    showModal('stopFastModal', 'keepFastingBtn');
  }

  function confirmStopFast() {
    if (stopModalStage === 'confirm') {
      const startNow = validDate(data.activeStart);
      if (startNow) {
        const nowMs = Date.now();
        const remainingMs = startNow.getTime() + goalMs(activeTargetHours()) - nowMs;
        const reason = normalizeStopReason(el('stopReasonSelect')?.value);
        // Re-offer on every personal early-stop attempt. The shorter-goal
        // state remains useful for the active checkpoint display, but must
        // never suppress a later stop decision for this same fast.
        if (remainingMs >= 120000 && (!reason || reason === 'personal')) {
          shorterGoalOfferMs = Math.floor((remainingMs / 2) / 60000) * 60000;
          if (shorterGoalOfferMs >= 60000) {
            stopModalStage = 'shorter';
            el('stopFastModalTitle').textContent = t('fasting.shorterOfferTitle');
            el('stopFastModalText').classList.remove('warn');
            el('stopFastModalText').textContent = t('fasting.shorterOfferText', {duration:friendlyDuration(shorterGoalOfferMs)});
            el('stopReasonGroup').hidden = true;
            el('stopFastModalActions').classList.add('shorterOfferActions');
            el('continueOriginalTargetBtn').hidden = false;
            el('continueOriginalTargetBtn').textContent = t('fasting.shorterOfferOriginal');
            el('keepFastingBtn').textContent = t('fasting.shorterOfferContinue', {duration:friendlyDuration(shorterGoalOfferMs)});
            el('stopAndSaveBtn').textContent = t('fasting.shorterOfferStop');
            el('continueOriginalTargetBtn').focus();
            return;
          }
        }
      }
    }
    const start = validDate(data.activeStart);
    if (!start) { closeStopFastModal(); return; }
    const end = new Date();
    const duration = end - start;
    if (duration <= 0) { closeStopFastModal(); alert(t('fasting.clockError')); return; }
    const activeSnapshot = {
      activeStart: start.toISOString(),
      activeGoalHours: activeTargetHours(),
      previousGoalHours: data.goalHours,
      activeTimeZone: data.activeTimeZone || currentTimeZone(),
      activeCreatedAt: normalizeAuditTimestamp(data.activeCreatedAt),
      activeModifiedAt: normalizeAuditTimestamp(data.activeModifiedAt)
    };
    const record = {
      id: makeId(),
      start: activeSnapshot.activeStart,
      end: end.toISOString(),
      goalHours: activeSnapshot.activeGoalHours,
      timeZone: activeSnapshot.activeTimeZone,
      createdAt: activeSnapshot.activeCreatedAt,
      modifiedAt: activeSnapshot.activeModifiedAt,
      stopReason: duration < goalMs(activeSnapshot.activeGoalHours) ? (normalizeStopReason(el('stopReasonSelect')?.value) || 'personal') : null
    };
    data.records.push(record);
    // The target used for the most recently completed fast becomes the default
    // for the next interval. Historical records still keep their own target.
    data.goalHours = activeSnapshot.activeGoalHours;
    data.activeStart = null;
    data.activeGoalHours = null;
    data.activeTimeZone = null;
    data.activeCreatedAt = null;
    data.activeModifiedAt = null;
    if (!save()) {
      data.records = data.records.filter(r => r.id !== record.id);
      data.goalHours = activeSnapshot.previousGoalHours;
      data.activeStart = activeSnapshot.activeStart;
      data.activeGoalHours = activeSnapshot.activeGoalHours;
      data.activeTimeZone = activeSnapshot.activeTimeZone;
      data.activeCreatedAt = activeSnapshot.activeCreatedAt;
      data.activeModifiedAt = activeSnapshot.activeModifiedAt;
      closeStopFastModal();
      renderAll();
      return;
    }
    closeStopFastModal();
    renderAll();
    showStopUndo(record.id, activeSnapshot);
  }

  function undoStoppedFast() {
    const pending = pendingStopUndo;
    if (!pending || Date.now() > pending.expiresAt) { clearStopUndo(); return; }
    if (data.activeStart || !data.records.some(r => r.id === pending.recordId)) {
      clearStopUndo();
      alert(t('fasting.undoUnavailable'));
      return;
    }
    const removed = data.records.find(r => r.id === pending.recordId);
    data.records = data.records.filter(r => r.id !== pending.recordId);
    data.activeStart = pending.activeSnapshot.activeStart;
    data.activeGoalHours = pending.activeSnapshot.activeGoalHours;
    data.activeTimeZone = pending.activeSnapshot.activeTimeZone;
    data.activeCreatedAt = pending.activeSnapshot.activeCreatedAt;
    data.activeModifiedAt = pending.activeSnapshot.activeModifiedAt;
    // Keep the last selected target as the next default even after Undo.
    data.goalHours = pending.activeSnapshot.activeGoalHours;
    if (!save()) {
      data.records.push(removed);
      data.activeStart = null;
      data.activeGoalHours = null;
      data.activeTimeZone = null;
      data.activeCreatedAt = null;
      data.activeModifiedAt = null;
      renderAll();
      return;
    }
    clearStopUndo({hide:false});
    renderAll();
    el('stopUndoText').textContent = t('fasting.undoRestored');
    el('stopUndoBtn').hidden = true;
    el('stopUndoCountdown').hidden = true;
    el('stopUndoBar').hidden = false;
    stopUndoMessageTimer = setTimeout(() => { el('stopUndoBar').hidden = true; stopUndoMessageTimer = 0; }, 2200);
  }

  bindResponsiveAction(toggleFast, () => {
    if (performance.now() < suppressFastToggleUntil) return;
    if (fastActionLocked || recoveryMode) return;
    fastActionLocked = true;
    toggleFast.disabled = true;
    try {
      if (data.activeStart) stopFast();
      else { clearStopUndo(); startFast(); }
    } finally {
      setTimeout(() => {
        fastActionLocked = false;
        toggleFast.disabled = !!recoveryMode;
      }, 300);
    }
  });

  function sortedRecordsDesc() {
    if (!sortedRecordsDescCache) sortedRecordsDescCache = [...data.records].sort((a,b)=>String(b.end).localeCompare(String(a.end)));
    return sortedRecordsDescCache;
  }

  function sortedRecordsAsc() {
    if (!sortedRecordsAscCache) sortedRecordsAscCache = [...data.records].sort((a,b)=>String(a.end).localeCompare(String(b.end)));
    return sortedRecordsAscCache;
  }

  function currentStreak() {
    if (currentStreakCache != null) return currentStreakCache;
    const sorted = sortedRecordsDesc();
    let streak = 0;
    for (const r of sorted) {
      if (recordMetGoal(r)) { streak++; continue; }
      if (isExcusedStop(r)) continue;
      break;
    }
    currentStreakCache = streak;
    return streak;
  }

  function updateToday() {
    const now = new Date();
    el('todayTotal').textContent = friendlyDuration(fastingMsForDay(now));
    const s = currentStreak();
    el('streakValue').textContent = t(pluralKey('fasting.fastCount', s), {n:s});
  }

  function clearUndoToast() {
    if (undoToastTimer) clearTimeout(undoToastTimer);
    undoToastTimer = 0; undoToastAction = null;
    const toast=el('undoToast'); if(toast) toast.hidden=true;
  }

  function showUndoToast(message, action) {
    clearUndoToast();
    const toast=el('undoToast'), text=el('undoToastText'); if(!toast||!text)return;
    text.textContent=message; undoToastAction=typeof action==='function'?action:null; toast.hidden=false;
    undoToastTimer=setTimeout(clearUndoToast,UNDO_WINDOW_MS);
  }

  function successfulFastCount() {
    return data.records.filter(recordMetGoal).length;
  }

  function distinctWeightLoggingDays() {
    return new Set(data.weights.map(weightCalendarDay).filter(Boolean)).size;
  }

  function gamificationXP() {
    return successfulFastCount() * 10 + distinctWeightLoggingDays() * 2;
  }

  function levelForXP(xp) {
    if (xp >= 350) return { number: 4, nameKey: 'game.level4', min: 350, next: null };
    if (xp >= 150) return { number: 3, nameKey: 'game.level3', min: 150, next: 350 };
    if (xp >= 50) return { number: 2, nameKey: 'game.level2', min: 50, next: 150 };
    return { number: 1, nameKey: 'game.level1', min: 0, next: 50 };
  }

  function weeklyTargetSuccessRate() {
    const currentWeek = weekKey(new Date(), currentTimeZone());
    let total=0, reached=0;
    // Only the current week matters. Scan newest-first and stop once records are
    // clearly older than the week rather than converting a lifetime of dates.
    const sorted=sortedRecordsDesc();
    for(const r of sorted){
      const day=dayKeyFast(r.end,r.timeZone||currentTimeZone());
      const wk=weekKeyFromDayString(day);
      if(wk===currentWeek){ total++; if(recordMetGoal(r)) reached++; continue; }
      // Records are newest-first. Once we are older than the current week,
      // no later record in this loop can belong to the current week.
      if(wk && wk<currentWeek) break;
    }
    return total ? Math.round((reached/total)*100) : null;
  }

