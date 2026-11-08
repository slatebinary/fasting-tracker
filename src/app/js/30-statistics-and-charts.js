  function statsSummary() {
    if (statsSummaryCache) return statsSummaryCache;
    statsSummaryCache = FTAnalytics.summarizeRecords(data.records, {
      durationGetter: recordMs,
      goalGetter: recordMetGoal,
      streak: currentStreak()
    });
    return statsSummaryCache;
  }

  let statsGamificationRenderToken = 0;
  let statsGamificationRenderTimer = 0;

  function scheduleStatsGamificationDetail() {
    const token = ++statsGamificationRenderToken;
    if (statsGamificationRenderTimer) { clearTimeout(statsGamificationRenderTimer); statsGamificationRenderTimer = 0; }
    requestAnimationFrame(() => {
      if (token !== statsGamificationRenderToken) return;
      statsGamificationRenderTimer = setTimeout(() => {
        statsGamificationRenderTimer = 0;
        if (token !== statsGamificationRenderToken || !el('stats').classList.contains('active')) return;
        renderGamificationDetail();
      }, 0);
    });
  }

  function renderStats() {
    const summary = statsSummary();
    el('mTotal').textContent = formatNumber(summary.count);
    el('mAverage').textContent = summary.count ? compactDuration(summary.average) : `0${t('unit.h')}`;
    el('mLongest').textContent = summary.count ? compactDuration(summary.longest) : `0${t('unit.h')}`;
    el('mGoal').textContent = formatNumber(summary.goalCount);
    el('mStreak').textContent = formatNumber(summary.streak);
    el('mHours').textContent = summary.total ? compactDuration(summary.total) : `0${t('unit.h')}`;
    renderGamificationSummary();
    renderStatsVisualizations();
    scheduleStatsGamificationDetail();
  }

  function allFastingIntervals(rangeStart = -Infinity, rangeEnd = Infinity) {
    const intervals = [];
    for (const r of data.records) {
      const start = Date.parse(r.start), end = Date.parse(r.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
      if (end <= rangeStart || start >= rangeEnd) continue;
      intervals.push({
        start,
        end,
        goalHours: sanitizeGoal(r.goalHours, data.goalHours),
        sourceStart: start,
        sourceEnd: end,
        active: false
      });
    }
    if (data.activeStart) {
      const start = Date.parse(data.activeStart), end = Date.now();
      if (Number.isFinite(start) && end > start && end > rangeStart && start < rangeEnd) {
        intervals.push({
          start,
          end,
          goalHours: sanitizeGoal(data.activeGoalHours, data.goalHours),
          sourceStart: start,
          sourceEnd: end,
          active: true
        });
      }
    }
    intervals.sort((a,b)=>a.start-b.start);
    return intervals;
  }

  function currentZoneDaySummaries(timeZone = currentTimeZone(), rangeStart = -Infinity, rangeEnd = Infinity) {
    const tz = normalizeTimeZone(timeZone);
    const cacheKey = `${tz}|${Number.isFinite(rangeStart)?Math.floor(rangeStart/86400000):'all'}|${Number.isFinite(rangeEnd)?Math.ceil(rangeEnd/86400000):'all'}|${data.revision}`;
    if (currentZoneDaySummaryCache?.key === cacheKey) return currentZoneDaySummaryCache.map;
    const map = new Map();
    for (const interval of allFastingIntervals(rangeStart, rangeEnd)) {
      let cursor = Math.max(interval.start, Number.isFinite(rangeStart) ? rangeStart : interval.start), guard = 0;
      const intervalEnd = Math.min(interval.end, Number.isFinite(rangeEnd) ? rangeEnd : interval.end);
      while (cursor < intervalEnd && guard++ < 10000) {
        const key = dayKey(cursor, tz);
        const boundary = Math.min(intervalEnd, nextZonedDayBoundary(cursor, tz));
        const item = map.get(key) || { totalFastMs:0, fastCount:0 };
        item.totalFastMs += Math.max(0, boundary - cursor);
        item.fastCount += 1;
        map.set(key, item);
        cursor = Math.max(boundary, cursor + 1);
      }
    }
    currentZoneDaySummaryCache = { key:cacheKey, map };
    return map;
  }

  function buildInteractiveChartDays(dayCount = null, timeZone = currentTimeZone()) {
    const tz = normalizeTimeZone(timeZone);
    const newestAnchor = new Date(); newestAnchor.setHours(12,0,0,0);
    if (!Number.isInteger(dayCount) || dayCount < 1) {
      let oldestMs = newestAnchor.getTime();
      for (const record of data.records) {
        const startMs = Date.parse(record.start);
        if (Number.isFinite(startMs) && startMs < oldestMs) oldestMs = startMs;
      }
      if (data.activeStart) {
        const activeStartMs = Date.parse(data.activeStart);
        if (Number.isFinite(activeStartMs) && activeStartMs < oldestMs) oldestMs = activeStartMs;
      }
      const oldestKeyParts = dayKey(oldestMs,tz).split('-').map(Number);
      const newestKeyParts = dayKey(newestAnchor.getTime(),tz).split('-').map(Number);
      const oldestDayOrdinal = Date.UTC(oldestKeyParts[0],oldestKeyParts[1]-1,oldestKeyParts[2]);
      const newestDayOrdinal = Date.UTC(newestKeyParts[0],newestKeyParts[1]-1,newestKeyParts[2]);
      dayCount = Math.max(14, Math.floor((newestDayOrdinal - oldestDayOrdinal) / 86400000) + 1);
    }
    dayCount = Math.min(dayCount, 100000);
    const oldestAnchor = new Date(newestAnchor); oldestAnchor.setDate(oldestAnchor.getDate() - dayCount - 1);
    const intervals = allFastingIntervals(oldestAnchor.getTime(), newestAnchor.getTime() + 2*86400000);
    const days = [];
    let intervalCursor = 0;
    let previousEndMs = null;
    const anchor = new Date(newestAnchor);
    for (let i = dayCount - 1; i >= 0; i--) {
      anchor.setTime(newestAnchor.getTime());
      anchor.setDate(newestAnchor.getDate() - i);
      const key = dayKeyFast(anchor, tz);
      // Consecutive chart days share the exact previous end/next start. Resolve
      // the expensive local-midnight conversion only once for the oldest day.
      const firstStart = previousEndMs === null ? zonedLocalToDate(`${key}T00:00`, tz) : null;
      const startMs = previousEndMs === null ? firstStart?.getTime() : previousEndMs;
      const endMs = nextZonedDayBoundary(anchor.getTime(), tz, key);
      previousEndMs = endMs;
      if (!Number.isFinite(startMs) || endMs <= startMs) continue;
      const segments = [];
      let cursor = startMs;
      let fastCount = 0;
      let totalFastMs = 0;
      while (intervalCursor < intervals.length && intervals[intervalCursor].end <= startMs) intervalCursor++;
      for (let intervalIndex = intervalCursor; intervalIndex < intervals.length; intervalIndex++) {
        const interval = intervals[intervalIndex];
        if (interval.start >= endMs) break;
        const segStart = Math.max(startMs, interval.start);
        const segEnd = Math.min(endMs, interval.end);
        if (segStart > cursor) {
          segments.push({ type: 'gap', start: cursor, end: segStart, index: segments.length });
        }
        if (segEnd > segStart) {
          segments.push({
            type: 'fast',
            start: segStart,
            end: segEnd,
            index: segments.length,
            goalHours: interval.goalHours,
            sourceStart: interval.sourceStart,
            sourceEnd: interval.sourceEnd,
            active: interval.active
          });
          totalFastMs += segEnd - segStart;
          fastCount += 1;
        }
        cursor = Math.max(cursor, segEnd);
      }
      if (cursor < endMs) segments.push({ type: 'gap', start: cursor, end: endMs, index: segments.length });
      days.push({ key, startMs, endMs, totalFastMs, fastCount, segments, timeZone: tz });
    }

    // Give every segment a stable continuation key across midnight. Fast
    // pieces share the original fast's exact source boundaries. Consecutive
    // non-fasting pieces on adjacent days are grouped until another fast
    // interrupts them. This lets selection reveal the rest of the same
    // fast/gap without changing the underlying timeline data.
    let gapSerial = 0;
    let previousGap = null;
    for (const day of days) {
      for (const segment of day.segments) {
        if (segment.type === 'fast') {
          segment.continuationKey = `fast:${segment.sourceStart}:${segment.sourceEnd}`;
          previousGap = null;
          continue;
        }
        const contiguous = previousGap && Math.abs(previousGap.end - segment.start) < 1000;
        segment.continuationKey = contiguous ? previousGap.continuationKey : `gap:${++gapSerial}`;
        previousGap = segment;
      }
    }
    return days;
  }

  function drawChart(daysOverride = null) {
    const c = el('chart');
    const days = Array.isArray(daysOverride) && daysOverride.length ? daysOverride : buildInteractiveChartDays();
    // Keep canvas dimensions under browser limits while retaining every day.
    // Longer histories compress gradually instead of truncating older records.
    const maxTimelineWidth = 9000;
    const timelineWidth = Math.max(700, Math.min(maxTimelineWidth, days.length * 42));
    c.style.width = `${timelineWidth}px`;
    c.style.minWidth = `${timelineWidth}px`;
    const cssW = c.clientWidth || timelineWidth, cssH = c.clientHeight || 310;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.floor(cssW * ratio); c.height = Math.floor(cssH * ratio);
    const ctx = c.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    c.style.touchAction = 'pan-x';

    const top = 18, bottom = 38, left = 6, right = 6;
    const w = cssW - left - right, h = cssH - top - bottom;
    const slot = w / Math.max(1, days.length);
    const gap = Math.min(8, slot * 0.18), bw = Math.max(0.01, slot - gap);
    timelineChartDays = days;
    timelineChartGeometry = { top, bottom, left, right, w, h, gap, bw, slot, cssW, cssH };
    const style = getComputedStyle(document.documentElement);
    const line = style.getPropertyValue('--line').trim();
    const accent = style.getPropertyValue('--accent').trim();
    const muted = style.getPropertyValue('--muted').trim();
    const card = style.getPropertyValue('--card').trim();
    const textColor = style.getPropertyValue('--text').trim();
    chartInteractiveLayout = [];
    let selectedContinuationKey = null;
    let selectedContinuationType = null;
    if (chartSelectedTarget?.kind === 'segment') {
      const selectedDay = days.find(item => item.key === chartSelectedTarget.dayKey);
      const selectedSegment = selectedDay?.segments?.[chartSelectedTarget.segmentIndex];
      selectedContinuationKey = selectedSegment?.continuationKey || null;
      selectedContinuationType = selectedSegment?.type || null;
    }

    ctx.strokeStyle = line; ctx.lineWidth = 1;
    [0, 6, 12, 18, 24].forEach(hour => {
      const frac = hour / 24;
      const y = top + h * frac;
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(cssW - right, y); ctx.stroke();
    });

    // Group the visible day columns by calendar month. Boundary rules are
    // always drawn, even when the history is too long to fit every label.
    const timelineMonthGroups = [];
    days.forEach((day, index) => {
      const year=Number(day.key.slice(0,4)), month=Number(day.key.slice(5,7));
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const last = timelineMonthGroups[timelineMonthGroups.length - 1];
      if (!last || last.key !== key) timelineMonthGroups.push({key, year, month, startIndex:index, endIndex:index});
      else last.endIndex = index;
    });
    ctx.save();
    ctx.strokeStyle = line;
    ctx.lineWidth = 1;
    ctx.globalAlpha = .58;
    timelineMonthGroups.slice(1).forEach(group => {
      const x = left + group.startIndex * slot;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, cssH - 27);
      ctx.stroke();
    });
    ctx.restore();

    days.forEach((day, i) => {
      const x0 = left + i * (bw + gap);
      const isDaySelected = chartSelectedTarget && chartSelectedTarget.kind === 'day' && chartSelectedTarget.dayKey === day.key;
      ctx.fillStyle = card;
      ctx.fillRect(x0, top, bw, h);
      ctx.strokeStyle = isDaySelected ? textColor : line;
      ctx.lineWidth = isDaySelected ? 4 : 1;
      ctx.strokeRect(x0, top, bw, h);
      if (isDaySelected) {
        ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(x0 + 2, top + 2, Math.max(1,bw - 4), Math.max(1,h - 4));
      }
      chartInteractiveLayout.push({ kind: 'day', dayKey: day.key, x: x0, y: cssH - bottom + 4, w: bw, h: bottom - 4 });

      day.segments.forEach((segment, segIndex) => {
        const segTop = top + ((segment.start - day.startMs) / (day.endMs - day.startMs)) * h;
        const segHeight = Math.max(2, ((segment.end - segment.start) / (day.endMs - day.startMs)) * h);
        const rectY = Math.min(top + h - 2, segTop);
        const rectH = Math.min(h, segHeight);
        chartInteractiveLayout.push({ kind: 'segment', dayKey: day.key, segmentIndex: segIndex, x: x0 - gap/2, y: rectY, w: bw + gap, h: rectH });
        if (segment.type === 'fast') {
          ctx.fillStyle = accent;
          ctx.globalAlpha = .88;
          ctx.fillRect(x0 + 1, rectY + 1, Math.max(1, bw - 2), Math.max(1, rectH - 2));
          ctx.globalAlpha = 1;
        }
        const isSelected = chartSelectedTarget && chartSelectedTarget.kind === 'segment' && chartSelectedTarget.dayKey === day.key && chartSelectedTarget.segmentIndex === segIndex;
        const isRelatedContinuation = !isSelected
          && selectedContinuationKey
          && segment.type === selectedContinuationType
          && segment.continuationKey === selectedContinuationKey;
        if (isRelatedContinuation) {
          // The selected piece keeps the strong border. Other pieces belonging
          // to the same continuous fast/gap are deliberately quieter so the
          // user can follow the interval across midnight without confusing the
          // continuation with the primary selection.
          const rx = x0 + 1, ry = rectY + 1, rw = Math.max(1, bw - 2), rh = Math.max(1, rectH - 2);
          ctx.save();
          if (segment.type === 'fast') {
            ctx.fillStyle = card; ctx.globalAlpha = .28; ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = textColor; ctx.globalAlpha = .58;
          } else {
            ctx.fillStyle = accent; ctx.globalAlpha = .11; ctx.fillRect(rx, ry, rw, rh);
            ctx.strokeStyle = accent; ctx.globalAlpha = .62;
          }
          ctx.lineWidth = 2; ctx.setLineDash([4, 3]); ctx.strokeRect(rx, ry, rw, rh);
          ctx.restore();
        }
        if (isSelected) {
          // High-contrast outer border + accent inner border make selection
          // obvious on both filled fasting segments and empty non-fasting gaps.
          const sx = x0 + 1, sy = rectY + 1, sw = Math.max(1, bw - 2), sh = Math.max(1, rectH - 2);
          ctx.save();
          ctx.fillStyle = textColor; ctx.globalAlpha = .12; ctx.fillRect(sx, sy, sw, sh); ctx.globalAlpha = 1;
          ctx.strokeStyle = textColor; ctx.lineWidth = 4; ctx.strokeRect(sx, sy, sw, sh);
          if (sw > 5 && sh > 5) { ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(sx + 2, sy + 2, Math.max(1, sw - 4), Math.max(1, sh - 4)); }
          ctx.restore();
        }
      });

      const dayOfMonth=Number(day.key.slice(8,10));
      const clockInfo=dayClockChangeInfo(day);
      if(clockInfo&&slot>=18){
        const clockLabel=clockInfo.label.replace(/^(Day|Offset)\s+/,'');
        ctx.save();ctx.font='8px -apple-system';ctx.textAlign='center';
        const clockWidth=Math.min(bw,Math.max(18,ctx.measureText(clockLabel).width+5));
        ctx.fillStyle=card;ctx.fillRect(x0+bw/2-clockWidth/2,top+2,clockWidth,10);
        ctx.fillStyle=accent;ctx.fillText(clockLabel,x0+bw/2,top+10);ctx.restore();
      }
      ctx.fillStyle = muted; ctx.font = '11px -apple-system'; ctx.textAlign = 'center';
      if (slot >= 18) {
        ctx.fillText(formatNumber(dayOfMonth), x0 + bw / 2, cssH - 11);
      } else if (slot < 3 && dp.day === 1 && dp.month === 1) {
        ctx.fillText(String(dp.year), x0 + bw / 2, cssH - 11);
      }
    });

    // Month labels occupy their own subtle row beneath the day numbers.
    // Skip labels that would collide at very long history spans; month-boundary
    // separators above remain visible for every month.
    ctx.font = '10px -apple-system';
    ctx.fillStyle = muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    let lastMonthLabelRight = -Infinity;
    timelineMonthGroups.forEach(group => {
      const startX = left + group.startIndex * slot;
      const endX = left + (group.endIndex + 1) * slot;
      const centerX = (startX + endX) / 2;
      const date = new Date(Date.UTC(group.year, group.month - 1, 1, 12));
      const options = group.month === 1
        ? {month:'short',year:'2-digit',timeZone:'UTC'}
        : {month:'short',timeZone:'UTC'};
      const label = date.toLocaleDateString(currentLocale(), options);
      const labelWidth = ctx.measureText(label).width;
      const fitsMonth = endX - startX >= labelWidth + 6;
      const fitsGap = centerX - labelWidth / 2 >= lastMonthLabelRight + 5;
      if (fitsMonth && fitsGap && centerX >= left && centerX <= cssW - right) {
        ctx.fillText(label, centerX, cssH - 24);
        lastMonthLabelRight = centerX + labelWidth / 2;
      }
    });
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
    renderChartDetail(days);
    scrollTimelineToLatest();
  }

  function toLocalInputValue(dateLike, timeZone = currentTimeZone()) {
    const d = new Date(dateLike); if (!Number.isFinite(d.getTime())) return '';
    const p=zonedParts(d,timeZone);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
  }

  function showEntryError(message) {
    const box = el('entryError');
    box.textContent = message;
    box.hidden = !message;
  }

  function closeEntryModal() {
    hideModal('entryModal');
    editingRecordId = null;
    editingRecordTimeZone = null;
    showEntryError('');
  }

  function openEntryModal(record = null) {
    editingRecordId = record?.id || null;
    editingRecordTimeZone = record ? normalizeTimeZone(record.timeZone) : currentTimeZone();
    el('entryModalTitle').textContent = record ? t('history.editTitle') : t('history.addTitle');
    el('entryAuditHelp').hidden = !record;
    if (record) {
      el('entryStart').value = toLocalInputValue(record.start, editingRecordTimeZone);
      el('entryEnd').value = toLocalInputValue(record.end, editingRecordTimeZone);
      el('entryGoal').value = formatNumber(record.goalHours ?? data.goalHours, 0, 3);
      el('entryStopReason').value = normalizeStopReason(record.stopReason) || '';
    } else {
      const end = new Date();
      const start = new Date(end.getTime() - goalMs(data.goalHours));
      el('entryStart').value = toLocalInputValue(start);
      el('entryEnd').value = toLocalInputValue(end);
      el('entryGoal').value = formatNumber(data.goalHours, 0, 3);
      el('entryStopReason').value = '';
    }
    refreshEntryStopReasonVisibility();
    showEntryError('');
    showModal('entryModal', 'entryStart');
  }

  function refreshEntryStopReasonVisibility() {
    const group=el('entryStopReasonGroup'); if(!group)return;
    const tz=editingRecordTimeZone||currentTimeZone(), start=zonedLocalToDate(el('entryStart')?.value,tz), end=zonedLocalToDate(el('entryEnd')?.value,tz), target=parseLocalizedNumber(el('entryGoal')?.value);
    const missed=!!(start&&end&&end>start&&Number.isFinite(target)&&target>0&&(end-start)<goalMs(target));
    group.hidden=!missed;
    if(!missed&&el('entryStopReason'))el('entryStopReason').value='';
  }

  function intervalOverlaps(start, end, excludeId = null) {
    const s = start.getTime(), e = end.getTime();
    for (const r of data.records) {
      if (r.id === excludeId) continue;
      const rs = new Date(r.start).getTime(), re = new Date(r.end).getTime();
      if (s < re && e > rs) return true;
    }
    if (data.activeStart) {
      const as = new Date(data.activeStart).getTime(), ae = Date.now();
      if (s < ae && e > as) return true;
    }
    return false;
  }

  function fastingRecordCoreEqual(a, b) {
    if (!a || !b) return false;
    return String(a.start) === String(b.start) && String(a.end) === String(b.end) &&
      sanitizeGoal(a.goalHours, data.goalHours) === sanitizeGoal(b.goalHours, data.goalHours) &&
      normalizeTimeZone(a.timeZone) === normalizeTimeZone(b.timeZone) &&
      normalizeStopReason(a.stopReason) === normalizeStopReason(b.stopReason);
  }

  function fastEditAuditEntry(record, editedAt = new Date().toISOString()) {
    return {
      editedAt, editedTimeZone: currentTimeZone(),
      start: record.start, end: record.end, goalHours: sanitizeGoal(record.goalHours, data.goalHours),
      timeZone: normalizeTimeZone(record.timeZone), stopReason: normalizeStopReason(record.stopReason)
    };
  }

  function substantialFastEdit(previous, next) {
    const oldStart = validDate(previous?.start), oldEnd = validDate(previous?.end), newStart = validDate(next?.start), newEnd = validDate(next?.end);
    if (!oldStart || !oldEnd || !newStart || !newEnd) return true;
    const threshold = 30 * 60 * 1000;
    const startShift = Math.abs(newStart - oldStart), endShift = Math.abs(newEnd - oldEnd);
    const durationShift = Math.abs((newEnd - newStart) - (oldEnd - oldStart));
    const goalShift = Math.abs(sanitizeGoal(previous.goalHours, data.goalHours) - sanitizeGoal(next.goalHours, data.goalHours));
    const oldStartDay = dayKeyFast(previous.start, previous.timeZone), newStartDay = dayKeyFast(next.start, next.timeZone);
    const oldEndDay = dayKeyFast(previous.end, previous.timeZone), newEndDay = dayKeyFast(next.end, next.timeZone);
    return startShift >= threshold || endShift >= threshold || durationShift >= threshold || goalShift >= 1 ||
      oldStartDay !== newStartDay || oldEndDay !== newEndDay || recordMetGoal(previous) !== recordMetGoal(next);
  }

  function fastEditSummary(record) {
    const zone = normalizeTimeZone(record.timeZone);
    const base=t('history.editSummary', {
      start: localDateTimeLabel(record.start, zone),
      end: localDateTimeLabel(record.end, zone),
      goal: formatGoal(record.goalHours)
    });
    return normalizeStopReason(record.stopReason) ? `${base} • ${t('fasting.stopReasonSummary',{reason:stopReasonLabel(record.stopReason)})}` : base;
  }

  function saveManualEntry() {
    const tz = editingRecordTimeZone || currentTimeZone();
    const start = zonedLocalToDate(el('entryStart').value, tz);
    const end = zonedLocalToDate(el('entryEnd').value, tz);
    const target = parseLocalizedNumber(el('entryGoal').value);
    if (!start || !end) { showEntryError(t('history.errDates')); return; }
    if (end <= start) { showEntryError(t('history.errEndAfter')); return; }
    if (end.getTime() > Date.now() + 60000) { showEntryError(t('history.errFuture')); return; }
    if (end - start < 60000) { showEntryError(t('history.errMinute')); return; }
    if (!Number.isFinite(target) || target <= 0) { showEntryError(t('history.errGoal')); return; }
    if (intervalOverlaps(start, end, editingRecordId)) { showEntryError(t('history.errOverlap')); return; }

    const existingRecord = editingRecordId ? data.records.find(r => r.id === editingRecordId) : null;
    const nowAudit = new Date().toISOString();
    const draft = {
      id: editingRecordId || makeId(),
      start: start.toISOString(),
      end: end.toISOString(),
      goalHours: sanitizeGoal(target, data.goalHours),
      timeZone: tz,
      createdAt: existingRecord ? normalizeAuditTimestamp(existingRecord.createdAt) : nowAudit,
      modifiedAt: existingRecord ? nowAudit : null,
      editHistory: existingRecord ? normalizeFastEditHistory(existingRecord.editHistory) : [],
      stopReason: (end - start) < goalMs(target) ? normalizeStopReason(el('entryStopReason')?.value) : null
    };
    if (existingRecord && fastingRecordCoreEqual(existingRecord, draft)) { closeEntryModal(); return; }
    if (existingRecord && substantialFastEdit(existingRecord, draft)) {
      const message = t('history.editMaterialConfirm', {before:fastEditSummary(existingRecord), after:fastEditSummary(draft)});
      if (!confirm(message)) return;
    }
    if (existingRecord) {
      draft.editHistory = [...draft.editHistory, fastEditAuditEntry(existingRecord, nowAudit)].slice(-MAX_FAST_EDIT_AUDIT);
      data.records = data.records.map(r => r.id === editingRecordId ? draft : r);
    } else data.records.push(draft);
    if (!save()) { renderAll(); return; }
    closeEntryModal();
    renderAll();
  }

  function bindResponsiveAction(node, handler) {
    if (!node || typeof handler !== 'function') return;
    let pointerHandledAt = 0;
    let pointerStart = null;
    const flash = () => {
      node.classList.add('fastActionPressed');
      setTimeout(() => node.classList.remove('fastActionPressed'), 90);
    };
    node.addEventListener('pointerdown', event => {
      if (event.button != null && event.button !== 0) return;
      pointerStart = { id:event.pointerId, x:event.clientX, y:event.clientY };
      node.classList.add('fastActionPressed');
    });
    node.addEventListener('pointercancel', () => { pointerStart = null; node.classList.remove('fastActionPressed'); });
    node.addEventListener('pointerup', event => {
      const start = pointerStart;
      pointerStart = null;
      node.classList.remove('fastActionPressed');
      if (!start || start.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return;
      pointerHandledAt = performance.now();
      if (event.cancelable) event.preventDefault();
      flash();
      handler(event);
    });
    node.addEventListener('click', event => {
      if (event.detail !== 0 && performance.now() - pointerHandledAt < 700) { event.preventDefault(); return; }
      flash();
      handler(event);
    });
  }

  function bindReliableModalAction(node, handler) {
    if (!node || typeof handler !== 'function') return;
    let locked = false;
    node.addEventListener('click', event => {
      if (locked) return;
      locked = true;
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      node.classList.add('fastActionPressed');
      setTimeout(() => node.classList.remove('fastActionPressed'), 90);
      try { handler(event); } finally { setTimeout(() => { locked = false; }, 250); }
    });
  }

  function scheduleWeightUiRefresh() {
    // Let a modal close / deleted row disappear before rebuilding summaries,
    // history and the weight chart.
    requestAnimationFrame(() => setTimeout(() => {
      renderWeight();
      viewDirty.weight = false;
      if (el('stats').classList.contains('active')) { renderGamification(); viewDirty.stats = true; }
      if (el('fasting').classList.contains('active')) { renderGamificationSummary(); viewDirty.fasting = false; }
      renderBackupStatus();
    }, 0));
  }

  function showWeightError(message) {
    const box = el('weightError');
    box.textContent = message;
    box.hidden = !message;
  }

  function closeWeightModal() {
    hideModal('weightModal');
    editingWeightId = null;
    editingWeightTimeZone = null;
    showWeightError('');
  }

  function openWeightModal(entry = null) {
    editingWeightId = entry?.id || null;
    editingWeightTimeZone = entry ? normalizeTimeZone(entry.timeZone) : currentTimeZone();
    const unit = data.weightUnit;
    el('weightModalTitle').textContent = entry ? t('weight.editTitle') : t('weight.addTitle');
    el('weightModalUnit').textContent = unit;
    el('weightWhen').value = toLocalInputValue(entry?.when || new Date(), editingWeightTimeZone);
    const shown = entry ? kgToDisplay(entry.kg, unit) : null;
    el('weightValueInput').value = shown == null ? '' : formatNumber(shown, 1, 1);
    showWeightError('');
    showModal('weightModal', 'weightValueInput');
  }

  function saveWeightEntry() {
    const tz = editingWeightTimeZone || currentTimeZone();
    const when = zonedLocalToDate(el('weightWhen').value, tz);
    const raw = parseLocalizedNumber(el('weightValueInput').value);
    const kg = sanitizeWeightKg(displayToKg(raw, data.weightUnit), null);
    if (!when) { showWeightError(t('weight.errDate')); return; }
    if (when.getTime() > Date.now() + 60000) { showWeightError(t('weight.errFuture')); return; }
    if (kg == null) { showWeightError(t('weight.errValue', {unit:data.weightUnit})); return; }
    const existingWeight = editingWeightId ? data.weights.find(w => w.id === editingWeightId) : null;
    const nowAudit = new Date().toISOString();
    const whenIso = when.toISOString();
    const entry = {
      id: editingWeightId || makeId(), when: whenIso, kg, timeZone: tz,
      calendarDay: dayKeyFast(whenIso, tz),
      createdAt: existingWeight ? normalizeAuditTimestamp(existingWeight.createdAt) : nowAudit,
      modifiedAt: existingWeight ? nowAudit : null
    };
    if (editingWeightId) data.weights = data.weights.map(w => w.id === editingWeightId ? entry : w);
    else data.weights.push(entry);
    if (!save({ invalidateDerived: true, dirtyViews:['weight','stats','settings','fasting'] })) { renderAll(); return; }
    closeWeightModal();
    scheduleWeightUiRefresh();
  }


  function setWeightPeriodMode(mode) {
    if (!WEIGHT_PERIOD_MODES.includes(mode) || mode === weightPeriodMode) return;
    weightPeriodMode = mode;
    weightChartSelectedId = null;
    weightChartScrollToLatestPending = true;
    const asc = sortedWeightsAsc();
    renderWeightPeriodAnalytics(asc);
    drawWeightChart(asc);
    renderDeletedWeights();
  }

  function softDeleteWeightById(id, reason = 'user') {
    const index=data.weights.findIndex(w=>w.id===id);if(index<0||data.deletedWeights.some(w=>w.id===id))return false;
    const original=data.weights[index],tombstone={...original,deleted:true,deletedAt:new Date().toISOString(),deletedTimeZone:currentTimeZone(),deletionReason:String(reason||'user').slice(0,80)};
    data.weights.splice(index,1);data.deletedWeights.push(tombstone);if(!save({invalidateDerived:true,dirtyViews:['weight','stats','settings','fasting']})){data.deletedWeights=data.deletedWeights.filter(w=>w!==tombstone);data.weights.splice(index,0,original);return false;}return true;
  }
  function restoreDeletedWeightById(id){const index=data.deletedWeights.findIndex(w=>w.id===id);if(index<0)return false;const deleted=data.deletedWeights[index];if(data.weights.some(w=>w.id===deleted.id)){alert(t('weight.restoreConflict'));return false;}const restored=normalizeWeightEntry(deleted);if(!restored)return false;data.deletedWeights.splice(index,1);data.weights.push(restored);if(!save({invalidateDerived:true,dirtyViews:['weight','stats','settings','fasting']})){data.weights=data.weights.filter(w=>w!==restored&&w.id!==restored.id);data.deletedWeights.splice(index,0,deleted);return false;}return true;}
  function permanentlyDeleteWeightById(id){const index=data.deletedWeights.findIndex(w=>w.id===id);if(index<0)return false;const [removed]=data.deletedWeights.splice(index,1);if(!save({invalidateDerived:false,dirtyViews:['weight','settings']})){data.deletedWeights.splice(index,0,removed);return false;}return true;}
  function renderDeletedWeights(){
    const card=el('deletedWeightsCard'),box=el('deletedWeightsList'),spec=weightFilterSpec();if(!card||!box)return;const total=data.deletedWeights.length;card.hidden=!spec.includeDeleted||!total;box.replaceChildren();if(!spec.includeDeleted||!total){updateBulkActionBars();return;}
    const deletedSorted=[...data.deletedWeights].sort((a,b)=>String(b.deletedAt).localeCompare(String(a.deletedAt)));const filtered=weightFilterActive(spec)?deletedSorted.filter(w=>weightPassesFilter(w,spec)):deletedSorted;el('deletedWeightsCount').textContent=t('weight.deletedFilteredCount',{shown:filtered.length,total});const visible=filtered.slice(0,HISTORY_PAGE_SIZE);
    if(!visible.length){const empty=document.createElement('div');empty.className='historyEmpty';empty.textContent=t('history.filterNoMatch');box.append(empty);}
    for(const w of visible){const row=document.createElement('div');row.className='row historyRow'+(weightBulkMode?' bulkSelectable':'');if(weightBulkMode)row.append(bulkCheckbox(w.id,selectedDeletedWeightIds,t('bulk.selectWeight',{date:localDateLabel(w.when,w.timeZone)})));const left=document.createElement('div');const strong=document.createElement('strong');strong.textContent=`${localDateTimeLabel(w.when,w.timeZone)} • ${formatWeight(w.kg,data.weightUnit)}`;const small=document.createElement('div');small.className='small';small.textContent=t('weight.deletedAt',{date:localDateTimeLabel(w.deletedAt,w.deletedTimeZone)});left.append(strong,small);const actions=document.createElement('div');actions.className='historyActions';if(!weightBulkMode){const restore=document.createElement('button');restore.className='secondary';restore.textContent=t('common.restore');restore.addEventListener('click',()=>{if(restoreDeletedWeightById(w.id))renderWeight();});const purge=document.createElement('button');purge.className='dangerText';purge.textContent=t('weight.deletePermanently');purge.addEventListener('click',()=>{if(confirm(t('weight.deletePermanentConfirm'))&&confirm(t('weight.deletePermanentFinalConfirm'))&&permanentlyDeleteWeightById(w.id))renderWeight();});actions.append(restore,purge);}row.append(left,actions);box.append(row);}updateBulkActionBars();
  }

  function renderWeight() {
    const unit = data.weightUnit;
    el('unitKgBtn').classList.toggle('active', unit === 'kg');
    el('unitLbBtn').classList.toggle('active', unit === 'lb');
    el('unitKgBtn').setAttribute('aria-pressed', String(unit === 'kg'));
    el('unitLbBtn').setAttribute('aria-pressed', String(unit === 'lb'));
    el('weightTargetUnit').textContent = unit;
    const targetShown = data.targetWeightKg == null ? '' : formatNumber(kgToDisplay(data.targetWeightKg, unit), 1, 1);
    if (document.activeElement !== el('weightTargetInput')) el('weightTargetInput').value = targetShown;

    const asc = sortedWeightsAsc();
    const latest = asc.length ? asc[asc.length - 1] : null;
    const first = asc.length ? asc[0] : null;
    el('wLatest').textContent = latest ? formatWeight(latest.kg, unit) : '—';
    el('wChange').textContent = latest && first ? formatWeight(latest.kg - first.kg, unit, true) : '—';
    el('wTarget').textContent = data.targetWeightKg == null ? '—' : formatWeight(data.targetWeightKg, unit);
    el('wToTarget').textContent = latest && data.targetWeightKg != null ? formatWeight(latest.kg - data.targetWeightKg, unit, true) : '—';

    const box=el('weightHistoryList');box.replaceChildren();const spec=weightFilterSpec();const allDesc=[...asc].reverse();const sortedDesc=weightFilterActive(spec)?allDesc.filter(w=>weightPassesFilter(w,spec)):allDesc;const filterStatus=el('weightFilterStatus');if(filterStatus)filterStatus.textContent=t('history.filterCount',{shown:sortedDesc.length,total:asc.length});
    if(!sortedDesc.length){const empty=document.createElement('div');empty.className='historyEmpty';empty.textContent=asc.length?t('history.filterNoMatch'):t('weight.empty');box.append(empty);}else{const visibleWeights=sortedDesc.slice(0,weightVisibleCount);visibleWeights.forEach(w=>{const row=document.createElement('div');row.className='row historyRow'+(weightBulkMode?' bulkSelectable':'');if(weightBulkMode)row.append(bulkCheckbox(w.id,selectedWeightIds,t('bulk.selectWeight',{date:localDateLabel(w.when,w.timeZone)})));const left=document.createElement('div');left.style.minWidth='0';const strong=document.createElement('strong');strong.textContent=localDateLabel(w.when,w.timeZone);left.append(strong);const when=document.createElement('div');when.className='small';when.textContent=localDateTimeLabel(w.when,w.timeZone);left.append(when);const right=document.createElement('div');right.style.textAlign='right';right.style.flex='0 0 auto';const val=document.createElement('div');val.className='duration';val.textContent=formatWeight(w.kg,unit);right.append(val);if(!weightBulkMode){const actions=document.createElement('div');actions.className='historyActions';const edit=document.createElement('button');edit.className='secondary';edit.textContent=t('common.edit');bindResponsiveAction(edit, () => openWeightModal(w));const del=document.createElement('button');del.className='dangerText';del.textContent=t('common.delete');bindResponsiveAction(del, () => {if(!confirm(t('weight.deleteConfirm')))return;if(!softDeleteWeightById(w.id,'user')){renderAll();return;}renderWeight();showUndoToast(t('weight.deletedUndo'),()=>{if(restoreDeletedWeightById(w.id))renderWeight();});});actions.append(edit,del);right.append(actions);}row.append(left,right);box.append(row);});if(visibleWeights.length<sortedDesc.length){const wrap=document.createElement('div');wrap.className='loadMoreWrap';const more=document.createElement('button');more.className='secondary';more.textContent=t('common.loadMoreCount',{n:sortedDesc.length-visibleWeights.length});more.addEventListener('click',()=>{weightVisibleCount+=HISTORY_PAGE_SIZE;renderWeight();});wrap.append(more);box.append(wrap);}}
    renderWeightPeriodAnalytics(asc);
    drawWeightChart(asc);
    renderDeletedWeights();
  }


  function renderWeightChartData() {
    const box=el('weightChartData'),btn=el('weightChartDataBtn'); if(!box||box.hidden)return;
    const scroller=el('weightChartScroller'), buckets=weightChartBuckets; box.replaceChildren();
    if(!buckets.length){box.textContent=t('a11y.noChartData');return;}
    const viewport=Math.max(1,scroller?.clientWidth||600), scroll=scroller?.scrollLeft||0;
    const spacing=weightPeriodMode==='daily'?(buckets.length<=30?Math.max(1,(viewport-30)/Math.max(1,buckets.length-1)):Math.max(10,Math.min(22,(viewport-30)/29))):(buckets.length<=5?Math.max(1,(viewport-30)/Math.max(1,buckets.length-1)):68);
    const first=Math.max(0,Math.floor((scroll-16)/Math.max(1,spacing))-1), last=Math.min(buckets.length-1,Math.ceil((scroll+viewport-16)/Math.max(1,spacing))+1);
    const ul=document.createElement('ul');
    for(let i=last;i>=first;i--){const b=buckets[i];if(!b.count)continue;const li=document.createElement('li');li.textContent=`${weightBucketLongLabel(b)} — ${formatWeight(b.averageKg,data.weightUnit)}${b.count>1?` • ${b.count} ${t(pluralKey('weight.measurement',b.count))}`:''}`;ul.append(li);} box.append(ul);
  }
  function renderStatsChartData(){
    const box=el('statsChartData'); if(!box||box.hidden)return; box.replaceChildren(); const ul=document.createElement('ul');
    if(statsVizMode==='timeline'){for(const d of [...timelineChartDays].reverse()){const li=document.createElement('li');const clockNote=clockChangeNoteForDetail({dayKey:d.key},'timeline');li.textContent=`${d.label||localDateLabel(d.startMs,d.timeZone)||d.key||''} — ${compactDuration(d.totalFastMs||0)}${clockNote?' • '+clockNote:''}`;ul.append(li);}}
    else if(statsVizMode==='trend'){for(const d of [...buildTrendDays()].reverse()){const li=document.createElement('li');const clockNote=clockChangeNoteForDetail({dayKey:d.key},'trend');li.textContent=`${d.label||d.key||''} — ${formatNumber(d.hours||0,0,1)} ${t('unit.h')} • 7d ${formatNumber(d.avg7||0,0,1)} • 30d ${formatNumber(d.avg30||0,0,1)}${clockNote?' • '+clockNote:''}`;ul.append(li);}}
    else if(statsVizMode==='weeks'){for(const w of [...(weeklySummariesCache||[])].reverse()){const li=document.createElement('li');li.textContent=`${w.label||w.key||''} — ${formatNumber((w.totalFastMs||0)/3600000,0,1)} ${t('unit.h')}`;ul.append(li);}}
    else if(statsVizMode==='months'){for(const x of [...buildMonthSummaries()].reverse()){const li=document.createElement('li');li.textContent=`${x.label} — ${formatNumber(x.hours,0,1)} ${t('unit.h')} • ${x.count}`;ul.append(li);}}
    else if(statsVizMode==='success'){for(const x of [...buildTargetSuccessSummaries()].reverse()){const li=document.createElement('li');li.textContent=`${x.label} — ${formatNumber(x.successRate,0,0)}% • ${x.reached}/${x.count}`;ul.append(li);}}
    else if(statsVizMode==='distribution'){for(const x of buildDurationDistribution()){const li=document.createElement('li');li.textContent=`${x.label} — ${x.count}`;ul.append(li);}}
    else if(statsVizMode==='startpattern'){for(const x of buildStartPattern()){const li=document.createElement('li');li.textContent=`${x.label} — ${x.count}`;ul.append(li);}}
    else if(statsVizMode==='cumulative'){for(const d of [...buildCumulativeDays()].reverse()){const li=document.createElement('li');const clockNote=clockChangeNoteForDetail({dayKey:d.key},'cumulative');li.textContent=`${d.label||d.key||''} — ${formatNumber(d.cumulativeHours||0,0,1)} ${t('unit.h')}${clockNote?' • '+clockNote:''}`;ul.append(li);}}
    else { const month=el('calendarMonthTitle')?.textContent||''; const li=document.createElement('li'); li.textContent=t('a11y.calendarDataHint',{month}); ul.append(li); }
    if(!ul.children.length){const li=document.createElement('li');li.textContent=t('a11y.noChartData');ul.append(li);} box.append(ul);
  }

  function setWeightUnit(unit) {
    data.weightUnit = normalizeWeightUnit(unit);
    save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] });
    renderWeight();
    viewDirty.weight = false;
  }

  function setTargetWeightFromInput() {
    const raw = el('weightTargetInput').value.trim();
    if (!raw) {
      data.targetWeightKg = null;
      save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] }); renderWeight(); viewDirty.weight = false; return;
    }
    const kg = sanitizeWeightKg(displayToKg(parseLocalizedNumber(raw), data.weightUnit), null);
    if (kg == null) {
      alert(t('weight.errTarget', {unit:data.weightUnit}));
      renderWeight(); return;
    }
    data.targetWeightKg = kg;
    save({ invalidateDerived:false, dirtyViews:['weight','stats','settings'] }); renderWeight(); viewDirty.weight = false;
  }

  function hasBackupWorthyData() {
    return !!data.activeStart || data.records.length > 0 || data.deletedFasts.length > 0 || data.weights.length > 0 || data.deletedWeights.length > 0;
  }

  function normalizeBackupClockSkew() {
    const nowMs = Date.now();
    let changed = false;
    for (const key of ['firstDataAt','lastExternalBackupAt']) {
      const d = validDate(backupMeta[key]);
      if (d && d.getTime() > nowMs + FUTURE_TOLERANCE_MS) {
        backupMeta[key] = new Date(nowMs).toISOString();
        changed = true;
      }
    }
    if (changed) saveBackupMeta();
  }

  function ensureBackupTrackingStarted() {
    normalizeBackupClockSkew();
    if (!hasBackupWorthyData()) {
      if (backupMeta.firstDataAt) {
        backupMeta.firstDataAt = null;
        saveBackupMeta();
      }
      return null;
    }
    let firstData = validDate(backupMeta.firstDataAt);
    if (!firstData) {
      firstData = new Date();
      backupMeta.firstDataAt = firstData.toISOString();
      saveBackupMeta();
    }
    return firstData;
  }

  // This is a local change detector, NOT proof that an external backup file exists.
  // Track the actual records and active fasting state; ordinary setting changes
  // (such as language, colors or notification settings) must not falsely mark
  // an otherwise current fasting/weight backup as outdated.
  let backupDatasetSignatureCache = null;
