  function weightWeekStreak() {
    const weeks = new Set(data.weights.map(w => weekKeyFromDayString(weightCalendarDay(w))).filter(Boolean));
    if (!weeks.size) return 0;
    let cursor = startOfWeek();
    let key=weekKeyFromDayString(dayKeyFast(cursor,currentTimeZone()));
    if (!weeks.has(key)) {
      cursor.setDate(cursor.getDate() - 7);
      key=weekKeyFromDayString(dayKeyFast(cursor,currentTimeZone()));
      if (!weeks.has(key)) return 0;
    }
    let streak = 0;
    while (weeks.has(key)) {
      streak++;
      cursor.setDate(cursor.getDate() - 7);
      key=weekKeyFromDayString(dayKeyFast(cursor,currentTimeZone()));
    }
    return streak;
  }

  function hasComebackAchievement() {
    const sorted = sortedRecordsAsc().filter(r => !isExcusedStop(r));
    for (let i = 1; i < sorted.length; i++) {
      if (!recordMetGoal(sorted[i - 1]) && recordMetGoal(sorted[i])) return true;
    }
    return false;
  }

  function achievementDefinitions() {
    const wins = successfulFastCount();
    const consecutiveWins = currentStreak();
    const weightStreak = weightWeekStreak();
    const backupFresh = !!validDate(backupMeta.lastExternalBackupAt) && !backupIsDue();
    return [
      { icon: '✓', title: t('game.ach1'), detail: t('game.ach1d'), unlocked: wins >= 1 },
      { icon: '5', title: t('game.ach5'), detail: t('game.ach5d'), unlocked: wins >= 5 },
      { icon: '10', title: t('game.ach10'), detail: t('game.ach10d'), unlocked: wins >= 10 },
      { icon: '25', title: t('game.ach25'), detail: t('game.ach25d'), unlocked: wins >= 25 },
      { icon: '50', title: t('game.ach50'), detail: t('game.ach50d'), unlocked: wins >= 50 },
      { icon: '5↻', title: t('game.streak5'), detail: t('game.streak5d'), unlocked: consecutiveWins >= 5 },
      { icon: '25↻', title: t('game.streak25'), detail: t('game.streak25d'), unlocked: consecutiveWins >= 25 },
      { icon: '50↻', title: t('game.streak50'), detail: t('game.streak50d'), unlocked: consecutiveWins >= 50 },
      { icon: '↗', title: t('game.comeback'), detail: t('game.comebackd'), unlocked: hasComebackAchievement() },
      { icon: '⚖', title: t('game.weightHabit'), detail: t('game.weightHabitd'), unlocked: weightStreak >= 4 },
      { icon: '⇩', title: t('game.backupKeeper'), detail: t('game.backupKeeperd'), unlocked: backupFresh }
    ];
  }

  function gamificationSummaryModel() {
    const xp = gamificationXP();
    const level = levelForXP(xp);
    let fillPct = 100;
    if (level.next != null) fillPct = ((xp - level.min) / (level.next - level.min)) * 100;
    return { xp, level, fillPct: Math.max(0, Math.min(100, fillPct)) };
  }

  function renderGamificationSummary() {
    const enabled = data.gamificationEnabled !== false;
    const summary = el('gamificationSummary');
    if (summary) summary.hidden = !enabled;
    if (!enabled || !summary) return;

    const { xp, level, fillPct } = gamificationSummaryModel();
    el('gSummaryLevel').textContent = t('game.level', {n: level.number});
    el('gSummaryXP').textContent = `${formatNumber(xp)} XP`;
    el('gSummaryNext').textContent = level.next == null ? t('game.highest') : t('game.next', {xp: Math.max(0, level.next - xp)});
    el('gSummaryFill').style.width = `${fillPct}%`;
    el('xpProgressTrack').setAttribute('aria-valuenow', String(Math.round(fillPct)));
    el('xpProgressTrack').setAttribute('aria-valuetext', level.next == null ? t('game.highest') : t('game.next', {xp: Math.max(0, level.next - xp)}));
  }

  function renderGamificationDetail() {
    const enabled = data.gamificationEnabled !== false;
    const detail = el('gamificationDetail');
    if (detail) detail.hidden = !enabled;
    const toggle = el('gamificationToggle');
    if (toggle) toggle.checked = enabled;
    if (!enabled || !detail) return;

    const { xp, level, fillPct } = gamificationSummaryModel();
    const levelLabel = t('game.levelFull', {n: level.number, name: t(level.nameKey)});
    el('gDetailLevel').textContent = levelLabel;
    el('gXP').textContent = formatNumber(xp);
    el('xpProgressTrack').setAttribute('aria-valuenow', String(Math.round(fillPct)));
    el('xpProgressTrack').setAttribute('aria-valuetext', level.next == null ? t('game.highest') : t('game.next', {xp: Math.max(0, level.next - xp)}));

    const weekly = weeklyTargetSuccessRate();
    el('gWeekly').textContent = weekly == null ? '—' : `${weekly}%`;
    el('gWeightStreak').textContent = formatNumber(weightWeekStreak());

    const box = el('achievementBadges');
    box.replaceChildren();
    for (const achievement of achievementDefinitions()) {
      const item = document.createElement('div');
      item.className = `achievementBadge ${achievement.unlocked ? 'unlocked' : 'locked'}`;
      item.setAttribute('role', 'group');
      item.setAttribute('aria-label', `${achievement.title}: ${t(achievement.unlocked ? 'game.unlocked' : 'game.locked')}. ${achievement.detail}`);
      const icon = document.createElement('div'); icon.className = 'badgeIcon'; icon.textContent = achievement.icon;
      const title = document.createElement('strong'); title.textContent = achievement.title;
      const detailText = document.createElement('div'); detailText.className = 'small'; detailText.textContent = achievement.detail;
      item.append(icon, title, detailText);
      box.append(item);
    }
  }

  function renderGamification() {
    renderGamificationSummary();
    renderGamificationDetail();
  }

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

  function chartTimeWithinDayLabel(ms, dayEndMs, timeZone, includeSeconds = false) {
    if (Math.abs(ms - dayEndMs) < 1000) return '23:59';
    const parts = zonedParts(ms, timeZone);
    const base = `${pad(parts.hour)}:${pad(parts.minute)}`;
    return includeSeconds ? `${base}:${pad(parts.second)}` : base;
  }

  function chartSelectionDetail(days) {
    if (!chartSelectedTarget) return null;
    const day = days.find(item => item.key === chartSelectedTarget.dayKey);
    if (!day) return null;
    if (chartSelectedTarget.kind === 'day') {
      return {
        title: day.label || localDateLabel(day.startMs, day.timeZone),
        text: t('stats.detailTotal', { duration: compactDuration(day.totalFastMs), count: formatNumber(day.fastCount) })
      };
    }
    const segment = day.segments[chartSelectedTarget.segmentIndex];
    if (!segment) return null;
    // Minute-only labels can make an exact 18m interval look like 08:30–08:49
    // while its duration displays 18m. For gaps, expose seconds whenever either
    // boundary is not aligned to a whole minute so the range explains the duration.
    const showGapSeconds = segment.type === 'gap' &&
      (segment.start % 60000 !== 0 || segment.end % 60000 !== 0);
    const start = chartTimeWithinDayLabel(segment.start, day.endMs, day.timeZone, showGapSeconds);
    // The internal interval still ends at exact midnight. Calling that boundary
    // "end of day" keeps the displayed range consistent with the true 24-hour
    // duration while the axis itself can remain labelled 23:59.
    const end = Math.abs(segment.end - day.endMs) < 1000
      ? t('stats.endOfDay')
      : chartTimeWithinDayLabel(segment.end, day.endMs, day.timeZone, showGapSeconds);
    if (segment.type === 'fast') {
      const segmentDuration = Math.max(0, segment.end - segment.start);
      const sourceDuration = Math.max(0, (segment.sourceEnd ?? segment.end) - (segment.sourceStart ?? segment.start));
      const targetDuration = goalMs(segment.goalHours ?? data.goalHours);
      const splitAcrossDay = Math.abs(sourceDuration - segmentDuration) >= 60000;
      const beyondTarget = Math.max(0, sourceDuration - targetDuration);
      return {
        title: day.label || localDateLabel(day.startMs, day.timeZone),
        text: splitAcrossDay
          ? t(beyondTarget >= 60000 ? 'stats.detailFastSplitTargetBeyond' : 'stats.detailFastSplitTarget', {
              start,
              end,
              segmentDuration: compactDuration(segmentDuration),
              duration: totalHoursDuration(sourceDuration),
              target: totalHoursDuration(targetDuration),
              beyond: totalHoursDuration(beyondTarget)
            })
          : t('stats.detailFastTarget', {
              start,
              end,
              duration: compactDuration(sourceDuration),
              target: compactDuration(targetDuration)
            })
      };
    }
    return {
      title: day.label || localDateLabel(day.startMs, day.timeZone),
      text: t('stats.detailGap', { start, end, duration: compactDuration(segment.end - segment.start) })
    };
  }

  function renderChartDetail(days = null) {
    if (statsVizMode === 'timeline') renderChartDetailForMode(days);
  }

  function hitTestChart(clientX, clientY) {
    const c = el('chart');
    const rect = c.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const g = timelineChartGeometry;
    if (!g || !timelineChartDays.length) return null;

    // Use the whole day cell (bar plus half of each inter-column gap) as the
    // horizontal touch target. This is much easier to hit than the narrow
    // painted bar on a phone while still selecting the intended date.
    const firstCenter = g.left + g.bw / 2;
    const index = Math.round((x - firstCenter) / g.slot);
    if (index < 0 || index >= timelineChartDays.length) return null;
    const center = firstCenter + index * g.slot;
    if (Math.abs(x - center) > g.slot / 2) return null;
    const day = timelineChartDays[index];

    // Tapping the date-label strip selects the whole day.
    if (y >= g.top + g.h && y <= g.cssH) return { kind:'day', dayKey:day.key };
    if (y < g.top || y > g.top + g.h) return null;

    // Map the vertical touch position directly to clock time, then find the
    // corresponding fasting or non-fasting segment. Every point in the 24 h
    // column therefore has a selectable segment, even if that segment is only
    // a few pixels tall visually.
    const fraction = Math.max(0, Math.min(0.999999, (y - g.top) / g.h));
    const instant = day.startMs + fraction * (day.endMs - day.startMs);
    let segmentIndex = day.segments.findIndex(seg => instant >= seg.start && instant < seg.end);
    if (segmentIndex < 0 && day.segments.length) segmentIndex = day.segments.length - 1;
    return segmentIndex >= 0 ? { kind:'segment', dayKey:day.key, segmentIndex } : { kind:'day', dayKey:day.key };
  }

  function selectTimelineAt(clientX, clientY) {
    const hit = hitTestChart(clientX, clientY);
    if (!hit) return false;
    statsDetailOverride = null;
    if (hit.kind === 'day') chartSelectedTarget = { kind:'day', dayKey:hit.dayKey };
    else chartSelectedTarget = { kind:'segment', dayKey:hit.dayKey, segmentIndex:hit.segmentIndex };
    drawChart(timelineChartDays);
    return true;
  }

  function beginTimelinePointer(event) {
    // Pointer Events avoid iOS's delayed synthetic click path. We keep the
    // press pending so a horizontal swipe can still scroll the timeline.
    timelinePointerStart = { id:event.pointerId, x:event.clientX, y:event.clientY, moved:false };
  }

  function moveTimelinePointer(event) {
    const start = timelinePointerStart;
    if (!start || start.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) start.moved = true;
  }

  function finishTimelinePointer(event) {
    const start = timelinePointerStart;
    timelinePointerStart = null;
    if (!start || start.id !== event.pointerId || start.moved) return;
    selectTimelineAt(event.clientX, event.clientY);
  }

  function cancelTimelinePointer(event) {
    if (!timelinePointerStart || timelinePointerStart.id === event.pointerId) timelinePointerStart = null;
  }

  function scrollTimelineToLatest({ force = false } = {}) {
    const scroller = el('timelineScroller');
    if (!scroller) return false;
    if (!force && !timelineScrollToLatestPending) return true;
    if (timelineScrollFrame) cancelAnimationFrame(timelineScrollFrame);
    timelineScrollFrame = requestAnimationFrame(() => {
      timelineScrollFrame = 0;
      if (!scroller.isConnected || scroller.clientWidth <= 0) return;
      const maxScroll = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
      scroller.scrollLeft = maxScroll;
      // iOS can update the scrollable width one paint later after a hidden
      // statistics panel becomes visible. Repeat once to guarantee the newest
      // day is flush with the right-hand time axis.
      requestAnimationFrame(() => {
        if (!scroller.isConnected || scroller.clientWidth <= 0) return;
        scroller.scrollLeft = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
        timelineScrollToLatestPending = false;
      });
    });
    return true;
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

  const RANGE_MODES=new Set(['trend','months','distribution','success','startpattern','cumulative']);
  function loadChartRanges(){try{const raw=JSON.parse(localStorage.getItem(CHART_RANGE_KEY)||'{}')||{};const out={};for(const [mode,def] of Object.entries(DEFAULT_CHART_RANGES))out[mode]=['7d','30d','90d','6m','1y','all'].includes(raw[mode])?raw[mode]:def;return out;}catch{return {...DEFAULT_CHART_RANGES};}}
  function saveChartRanges(){try{localStorage.setItem(CHART_RANGE_KEY,JSON.stringify(chartRanges));}catch{}}
  function chartRange(mode=statsVizMode){return chartRanges[mode]||DEFAULT_CHART_RANGES[mode]||'30d';}
  function chartRangeRecords(mode=statsVizMode){return FTAnalytics.filterRecords(data.records,chartRange(mode));}
  function chartRangeLabel(range){return t(`stats.range.${range}`);}
  function updateStatsRangeControl(){const bar=el('statsRangeBar'),sel=el('statsRangeSelect'),summary=el('statsRangeSummary');const enabled=RANGE_MODES.has(statsVizMode);if(bar)bar.hidden=!enabled;if(!enabled)return;if(sel)sel.value=chartRange(statsVizMode);if(summary){const n=chartRangeRecords(statsVizMode).length;summary.textContent=t('stats.rangeSummary',{range:chartRangeLabel(chartRange(statsVizMode)),n});}}
  const STATS_HISTORY_NAV_MODES=new Set(['timeline','trend','weeks','months','success','cumulative']);
  function statsHistoryNavigationItems(mode=statsVizMode){
    if(mode==='timeline')return timelineChartDays;
    if(mode==='trend')return buildTrendDays();
    if(mode==='weeks')return buildWeeklySummaries();
    if(mode==='months')return buildMonthSummaries('months');
    if(mode==='success')return buildTargetSuccessSummaries();
    if(mode==='cumulative')return buildCumulativeDays();
    return [];
  }
  function statsHistorySelectedKey(mode=statsVizMode){
    if(mode==='timeline')return chartSelectedTarget?.dayKey||null;
    if(mode==='trend')return trendSelectedDayKey;
    if(mode==='weeks')return weekSelectedKey;
    if(mode==='cumulative')return cumulativeSelectedDayKey;
    if(mode==='months'||mode==='success')return genericChartSelectedKey;
    return null;
  }
  function syncStatsHistoryNavigator(){
    const wrap=el('statsHistoryNavigator'),slider=el('statsHistoryRange'),older=el('statsHistoryOlderBtn'),newer=el('statsHistoryNewerBtn');
    if(!wrap||!slider||!older||!newer)return;
    const applicable=STATS_HISTORY_NAV_MODES.has(statsVizMode),items=applicable?statsHistoryNavigationItems():[];
    wrap.hidden=!applicable||items.length<2;
    if(wrap.hidden)return;
    const selectedKey=statsHistorySelectedKey(),selected=items.findIndex(item=>item.key===selectedKey),index=selected<0?items.length-1:selected;
    slider.min='0';slider.max=String(items.length-1);slider.step='1';slider.value=String(index);slider.disabled=items.length<2;
    older.disabled=index<=0;newer.disabled=index>=items.length-1;
    const item=items[index];slider.setAttribute('aria-valuetext',item?.label||item?.key||'');
  }
  function selectStatsHistoryIndex(rawIndex){
    const mode=statsVizMode,items=statsHistoryNavigationItems(mode);if(!STATS_HISTORY_NAV_MODES.has(mode)||items.length<2)return;
    const index=Math.max(0,Math.min(items.length-1,Math.round(Number(rawIndex)||0))),item=items[index];if(!item)return;
    statsDetailOverride=null;
    if(mode==='timeline'){
      chartSelectedTarget={kind:'day',dayKey:item.key};drawChart(timelineChartDays);
      const scroller=el('timelineScroller'),g=timelineChartGeometry;
      if(scroller&&g){const x=g.left+index*g.slot+g.slot/2;scroller.scrollLeft=Math.max(0,Math.min(scroller.scrollWidth-scroller.clientWidth,x-scroller.clientWidth/2));}
      statsDetailOverride=chartSelectionDetail(timelineChartDays);
    }else if(mode==='trend'){
      trendSelectedDayKey=item.key;statsDetailOverride={dayKey:item.key,title:item.label,text:t('stats.detailTrend',{duration:compactDuration(item.totalFastMs||0),avg7:formatNumber(item.avg7||0,0,1),avg30:formatNumber(item.avg30||0,0,1)}),records:recordsOverlappingDay(item)};drawFastTrendChart();
    }else if(mode==='weeks'){
      weekSelectedKey=item.key;const tz=currentTimeZone(),start=zonedLocalToDate(`${item.key}T00:00`,tz);let endMs=start?.getTime()||NaN;if(Number.isFinite(endMs))for(let i=0;i<7;i++)endMs=nextZonedDayBoundary(endMs,tz);statsDetailOverride={dayKey:item.key,title:t('stats.weekOf',{date:item.label}),text:t('stats.detailWeek',{duration:compactDuration(item.totalFastMs||0),days:formatNumber(item.daysWithFast||0)}),records:start&&Number.isFinite(endMs)?recordsOverlappingRange(start.getTime(),endMs):[]};drawFastWeeksChart();
    }else if(mode==='months'){
      genericChartSelectedKey=item.key;const source=chartRangeRecords('months');statsDetailOverride={dayKey:item.key,title:item.label,text:t('stats.detailMonth',{duration:compactDuration(item.totalMs||0),count:formatNumber(item.count||0)}),records:recordsContributingMonth(item.key,source)};drawFastMonthsChart();
    }else if(mode==='success'){
      genericChartSelectedKey=item.key;const source=chartRangeRecords('success');statsDetailOverride={dayKey:item.key,title:item.label,text:t('stats.detailSuccess',{rate:formatNumber(item.successRate||0,0,0),reached:formatNumber(item.reached||0),count:formatNumber(item.count||0)}),records:recordsEndingInMonth(item.key,source)};drawFastSuccessChart();
    }else if(mode==='cumulative'){
      cumulativeSelectedDayKey=item.key;const first=items[0];statsDetailOverride={dayKey:item.key,title:item.label,text:t('stats.detailCumulative',{hours:formatNumber(item.cumulativeHours||0,0,1),today:formatNumber((item.totalFastMs||0)/3600000,0,1)}),records:first?recordsOverlappingRange(first.startMs,item.endMs,chartRangeRecords('cumulative')):[]};drawFastCumulativeChart();
    }
    renderChartDetailForMode();if(el('statsChartData')&&!el('statsChartData').hidden)renderStatsChartData();syncStatsHistoryNavigator();
  }
  function shiftStatsHistory(direction){const items=statsHistoryNavigationItems();if(items.length<2)return;const selected=items.findIndex(item=>item.key===statsHistorySelectedKey()),current=selected<0?items.length-1:selected;selectStatsHistoryIndex(current+(direction<0?-1:1));}
  function changeStatsRange(range){if(!RANGE_MODES.has(statsVizMode)||!['7d','30d','90d','6m','1y','all'].includes(range))return;chartRanges[statsVizMode]=range;saveChartRanges();trendChartDaysCache=null;monthSummariesCache=null;durationDistributionCache=null;targetSuccessCache=null;startPatternCache=null;cumulativeDaysCache=null;statsVizRendered.delete(statsVizMode);statsDetailOverride=null;genericChartSelectedKey=null;trendSelectedDayKey=null;cumulativeSelectedDayKey=null;statsDrilldownRecordIds=[];renderChartDetailForMode();updateStatsRangeControl();scheduleStatsVizRender(statsVizMode);}
  function announceStatsSelection(detail){const live=el('statsSelectionLive');if(live&&detail)live.textContent=`${detail.title||''}. ${detail.text||''}`.trim();}
  function setStatsDrilldown(records=[]){statsDrilldownRecordIds=[...new Set((records||[]).map(r=>r&&r.id).filter(Boolean))];const btn=el('statsDrilldownBtn');if(btn)btn.hidden=!statsDrilldownRecordIds.length;}
  function recordsEndingInMonth(key,source=data.records){return source.filter(r=>dayKeyFast(r.end,r.timeZone).slice(0,7)===key);}
  function recordsContributingMonth(key,source=data.records){return source.filter(r=>{try{for(const day of recordDayContribution(r).keys())if(String(day).slice(0,7)===key)return true;}catch{}return false;});}
  function recordsForDurationBucket(key,source=data.records){return source.filter(r=>FTAnalytics.durationBucketKey(recordMs(r)/3600000)===key);}
  function recordsForStartBucket(key,source=data.records){return source.filter(r=>FTAnalytics.startBucketKey(zonedParts(r.start,r.timeZone).hour)===String(key));}
  function recordsOverlappingRange(startMs,endMs,source=data.records){return source.filter(r=>{const a=new Date(r.start).getTime(),b=new Date(r.end).getTime();return Number.isFinite(a)&&Number.isFinite(b)&&a<endMs&&b>startMs;});}
  function recordsOverlappingDay(day){return day?recordsOverlappingRange(day.startMs,day.endMs):[];}
  function openStatsDrilldown(){const records=data.records.filter(r=>statsDrilldownRecordIds.includes(r.id)).sort((a,b)=>String(b.end).localeCompare(String(a.end)));const box=el('statsDrilldownList');box.replaceChildren();el('statsDrilldownSummary').textContent=t('stats.drilldownCount',{n:records.length});if(!records.length){box.textContent=t('stats.drilldownEmpty');}else for(const r of records){const row=document.createElement('div');row.className='row';const left=document.createElement('div');const strong=document.createElement('strong');strong.textContent=localDateLabel(r.end,r.timeZone);const small=document.createElement('div');small.className='small';small.textContent=`${localDateTimeLabel(r.start,r.timeZone)} → ${localDateTimeLabel(r.end,r.timeZone)}`;left.append(strong,small);const right=document.createElement('div');right.className='duration';right.textContent=compactDuration(recordMs(r));row.append(left,right);box.append(row);}showModal('statsDrilldownModal','statsDrilldownCloseBtn');}

  function setStatsDetail(title, text) {
    statsDetailOverride = title || text ? { title: title || t('stats.chartDetailDefaultTitle'), text: text || '' } : null;
    renderChartDetailForMode();
  }

  function defaultStatsHelpKey() {
    return statsVizMode === 'calendar' ? 'stats.calendarHelp' : statsVizMode === 'trend' ? 'stats.trendHelp' : statsVizMode === 'weeks' ? 'stats.weeksHelp' : statsVizMode === 'months' ? 'stats.monthsHelp' : statsVizMode === 'distribution' ? 'stats.distributionHelp' : statsVizMode === 'success' ? 'stats.successHelp' : statsVizMode === 'startpattern' ? 'stats.startPatternHelp' : statsVizMode === 'cumulative' ? 'stats.cumulativeHelp' : 'stats.timelineHelp';
  }

  function renderChartDetailForMode(days = null) {
    const title = el('chartDetailTitle'), text = el('chartDetailText');
    if (!title || !text) return;
    let detail = statsDetailOverride;
    if (!detail && statsVizMode === 'timeline') {
      // Timeline selection is retained while the user visits another screen.
      // Rebuild its detail from the last rendered day model when Statistics returns.
      const availableDays = Array.isArray(days) && days.length ? days : timelineChartDays;
      if (chartSelectedTarget && availableDays.length) {
        detail = chartSelectionDetail(availableDays);
        // Do not leave a stale highlight if a range/data change removed the target.
        if (!detail) chartSelectedTarget = null;
      }
    }
    title.textContent = detail?.title || t('stats.chartDetailDefaultTitle');
    const clockNote=detail?clockChangeNoteForDetail(detail,statsVizMode):'';
    text.textContent = [detail?.text,clockNote].filter(Boolean).join(' ');
    if(detail){announceStatsSelection({...detail,text:text.textContent});setStatsDrilldown(detail.records||[]);}else setStatsDrilldown([]);
    const help = el('statsVizHelp'); if (help) help.textContent = t(defaultStatsHelpKey());
    updateStatsRangeControl();
    syncStatsHistoryNavigator();
  }

  function statsVizGroupForMode(mode) {
    for (const [group,modes] of Object.entries(STATS_VIZ_GROUPS)) if (modes.includes(mode)) return group;
    return 'overview';
  }

  function defaultStatsVizPrefs() {
    return { activeGroup:'overview', lastByGroup:{ overview:'timeline', timing:'startpattern', goals:'success', longterm:'cumulative' } };
  }

  function loadStatsVizPrefs() {
    const fallback=defaultStatsVizPrefs();
    try {
      const parsed=JSON.parse(localStorage.getItem(STATS_VIZ_PREF_KEY)||'null');
      if(!parsed||typeof parsed!=='object')return fallback;
      const activeGroup=Object.hasOwn(STATS_VIZ_GROUPS,parsed.activeGroup)?parsed.activeGroup:'overview';
      const lastByGroup={...fallback.lastByGroup};
      for(const [group,modes] of Object.entries(STATS_VIZ_GROUPS)){const candidate=parsed.lastByGroup?.[group];if(modes.includes(candidate))lastByGroup[group]=candidate;}
      return {activeGroup,lastByGroup};
    } catch { return fallback; }
  }

  function saveStatsVizPrefs() {
    try { localStorage.setItem(STATS_VIZ_PREF_KEY,JSON.stringify(statsVizPrefs)); } catch {}
  }

  function syncStatsVizNavigator() {
    const group=statsVizGroupForMode(statsVizMode);
    statsVizGroup=group;
    document.querySelectorAll('#statsVizGroupSwitcher [data-viz-group]').forEach(btn=>{
      const active=btn.dataset.vizGroup===group;
      btn.classList.toggle('active',active);
      btn.setAttribute('aria-selected',String(active));
      btn.tabIndex=active?0:-1;
    });
    const select=el('statsVizSelect');
    if(select&&select.value!==statsVizMode)select.value=statsVizMode;
  }

  function setStatsVizGroup(group) {
    if(!Object.hasOwn(STATS_VIZ_GROUPS,group))return;
    statsVizGroup=group;
    statsVizPrefs.activeGroup=group;
    const preferred=STATS_VIZ_GROUPS[group].includes(statsVizPrefs.lastByGroup?.[group])?statsVizPrefs.lastByGroup[group]:STATS_VIZ_GROUPS[group][0];
    saveStatsVizPrefs();
    setStatsVizMode(preferred);
  }

  function activateStatsVizGroupControl(target) {
    const button=target?.closest?.('#statsVizGroupSwitcher [data-viz-group]');
    if(!button)return false;
    button.classList.add('pressed');
    setTimeout(()=>button.classList.remove('pressed'),100);
    setStatsVizGroup(button.dataset.vizGroup);
    return true;
  }

  function handleStatsVizGroupPointerDown(event) {
    if(!activateStatsVizGroupControl(event.target))return;
    statsVizPointerStamp=performance.now();
    if(event.cancelable)event.preventDefault();
  }

  function handleStatsVizGroupClick(event) {
    if(event.detail!==0&&performance.now()-statsVizPointerStamp<700)return;
    activateStatsVizGroupControl(event.target);
  }

  function showStatsVizView(mode) {
    const map = { timeline:'statsTimelineView', calendar:'statsCalendarView', trend:'statsTrendView', weeks:'statsWeeksView', months:'statsMonthsView', distribution:'statsDistributionView', success:'statsSuccessView', startpattern:'statsStartPatternView', cumulative:'statsCumulativeView' };
    for (const [key,id] of Object.entries(map)) el(id).hidden = key !== mode;
  }

  function renderStatsVisualizationMode(mode = statsVizMode) {
    if (mode === 'calendar') renderFastCalendar();
    else if (mode === 'trend') drawFastTrendChart();
    else if (mode === 'weeks') drawFastWeeksChart();
    else if (mode === 'months') drawFastMonthsChart();
    else if (mode === 'distribution') drawFastDistributionChart();
    else if (mode === 'success') drawFastSuccessChart();
    else if (mode === 'startpattern') drawFastStartPatternChart();
    else if (mode === 'cumulative') drawFastCumulativeChart();
    else drawChart();
    statsVizRendered.add(mode);
    if(el('statsChartData')&&!el('statsChartData').hidden)renderStatsChartData();
  }

  function scheduleStatsVizRender(mode) {
    const requestedMode = mode;
    const token = ++statsVizRenderFrame;
    if (statsVizRenderTimer) { clearTimeout(statsVizRenderTimer); statsVizRenderTimer = 0; }

    // A single requestAnimationFrame still runs before the browser paints, so
    // expensive chart work in that callback can hide the tab change. Schedule
    // the work as a timer from the frame callback: the browser gets one paint
    // with the newly selected tab/view before any chart calculation begins.
    requestAnimationFrame(() => {
      if (token !== statsVizRenderFrame || statsVizMode !== requestedMode) return;
      statsVizRenderTimer = setTimeout(() => {
        statsVizRenderTimer = 0;
        if (token !== statsVizRenderFrame || statsVizMode !== requestedMode) return;
        renderStatsVisualizationMode(requestedMode);
        renderChartDetailForMode();
      }, 0);
    });
  }

  function setStatsVizMode(mode) {
    const allowed=Object.values(STATS_VIZ_GROUPS).flat();
    const nextMode=allowed.includes(mode)?mode:'timeline';
    const nextGroup=statsVizGroupForMode(nextMode);
    const changed=statsVizMode!==nextMode;
    statsVizMode=nextMode;
    statsVizGroup=nextGroup;
    statsVizPrefs.activeGroup=nextGroup;
    statsVizPrefs.lastByGroup[nextGroup]=nextMode;
    saveStatsVizPrefs();
    syncStatsVizNavigator();
    showStatsVizView(statsVizMode);
    updateStatsRangeControl();
    if(!changed){
      if(el('stats').classList.contains('active')) verifyStatsVisualizationAfterLayout();
      return;
    }
    statsDetailOverride=null;
    genericChartSelectedKey=null;
    if(statsVizMode==='timeline')timelineScrollToLatestPending=true;

    // Switch the panel and explanatory copy immediately. If this mode was
    // already rendered for the current data revision, no chart work is needed
    // at all, making repeat switches effectively instantaneous.
    showStatsVizView(statsVizMode);
    updateStatsRangeControl();
    renderChartDetailForMode();
    if(!statsVizRendered.has(statsVizMode)||data.activeStart)scheduleStatsVizRender(statsVizMode);
  }

  function renderStatsVisualizations() {
    syncStatsVizNavigator();
    // Always re-apply the remembered panel before drawing. A persisted non-default
    // view can otherwise remain hidden while its chart is rendered off-screen.
    showStatsVizView(statsVizMode);
    updateStatsRangeControl();
    // Let the Statistics screen paint its summary and controls before doing
    // chart aggregation. The active visualization is then rendered by the same
    // cancellable, post-paint scheduler used for subsequent mode changes.
    renderChartDetailForMode();
    if (!statsVizRendered.has(statsVizMode) || data.activeStart) scheduleStatsVizRender(statsVizMode);
  }

  function verifyStatsVisualizationAfterLayout() {
    // iOS can expose the Statistics screen before its final layout width is ready.
    // Verify the active panel on the next paint and redraw only that visualization.
    requestAnimationFrame(() => {
      if (!el('stats').classList.contains('active')) return;
      showStatsVizView(statsVizMode);
      syncStatsVizNavigator();
      updateStatsRangeControl();
      renderChartDetailForMode();
      // Re-render after the final layout through the post-paint scheduler;
      // never perform expensive chart aggregation inside this animation frame.
      scheduleStatsVizRender(statsVizMode);
      if (statsVizMode === 'timeline') scrollTimelineToLatest();
    });
  }

  function monthAnchor(offset = 0) {
    const d = new Date(); d.setHours(12,0,0,0); d.setDate(1); d.setMonth(d.getMonth() + offset); return d;
  }

  function formatClockChangeDuration(minutes) {
    const total=Math.abs(Math.round(Number(minutes)||0)),hours=Math.floor(total/60),mins=total%60;
    return [hours?hours+'h':'',mins?mins+'m':''].filter(Boolean).join(' ')||'0m';
  }
  // A local calendar day is not always 24 elapsed hours. Compare its actual
  // boundaries and its UTC offsets so unusual non-hour transitions are handled.
  function dayClockChangeInfo(day) {
    if(!day||!Number.isFinite(day.startMs)||!Number.isFinite(day.endMs)||day.endMs<=day.startMs)return null;
    const tz=normalizeTimeZone(day.timeZone||currentTimeZone()),elapsed=day.endMs-day.startMs;
    const dayDelta=Math.round((elapsed-86400000)/60000);
    // For local-midnight boundaries, elapsed day length already captures the
    // net UTC-offset change. Ordinary 24-hour days need no extra Intl calls.
    if(Math.abs(dayDelta)<1)return null;
    const startOffset=timeZoneOffsetMs(day.startMs+1000,tz),endOffset=timeZoneOffsetMs(day.endMs-1000,tz);
    const offsetDelta=Math.round((endOffset-startOffset)/60000);
    const isDayLengthChange=Math.abs(dayDelta)>=1,delta=isDayLengthChange?dayDelta:offsetDelta;
    const sign=delta>0?'+':'−',duration=formatClockChangeDuration(delta),change=sign+duration;
    const label=t(isDayLengthChange?'stats.clockDayChangeLabel':'stats.clockOffsetChangeLabel',{sign,duration});
    const description=t(isDayLengthChange?'stats.clockDayChangeHelp':'stats.clockOffsetChangeHelp',{
      date:day.label||localDateLabel(day.startMs,tz),dayLength:totalHoursDuration(elapsed),change,zone:tz
    });
    return {label,description,deltaMinutes:delta,dayDeltaMinutes:dayDelta,offsetDeltaMinutes:offsetDelta};
  }
  function clockChangeSummaryForRange(startMs,endMs,timeZone=currentTimeZone()) {
    const tz=normalizeTimeZone(timeZone),changes=[];let cursor=startMs,guard=0;
    while(Number.isFinite(cursor)&&cursor<endMs&&guard++<400) {
      const key=dayKey(cursor,tz),localStart=zonedLocalToDate(`${key}T00:00`,tz),dayStart=localStart?localStart.getTime():cursor;
      const dayEnd=Math.min(endMs,Math.max(dayStart+1,nextZonedDayBoundary(dayStart,tz)));
      const info=dayClockChangeInfo({key,startMs:dayStart,endMs:Math.max(dayStart+1,nextZonedDayBoundary(dayStart,tz)),timeZone:tz,label:localDateLabel(dayStart,tz)});
      if(info)changes.push(`${localDateLabel(dayStart,tz)} (${info.label})`);
      cursor=Math.max(dayEnd,cursor+1);
    }
    return changes.length?t('stats.clockPeriodChangeList',{changes:changes.join(', ')}):'';
  }
  function clockChangeNoteForDetail(detail,mode) {
    const key=String(detail?.dayKey||''),tz=currentTimeZone();
    if(mode==='weeks'&&/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const start=zonedLocalToDate(`${key}T00:00`,tz);if(!start)return '';
      let end=start.getTime();for(let i=0;i<7;i++)end=nextZonedDayBoundary(end,tz);
      return clockChangeSummaryForRange(start.getTime(),end,tz);
    }
    if(mode==='months'&&/^\d{4}-\d{2}$/.test(key)) {
      const [year,month]=key.split('-').map(Number),nextYear=month===12?year+1:year,nextMonth=month===12?1:month+1;
      const start=zonedLocalToDate(`${key}-01T00:00`,tz),end=zonedLocalToDate(`${nextYear}-${String(nextMonth).padStart(2,'0')}-01T00:00`,tz);
      return start&&end?clockChangeSummaryForRange(start.getTime(),end.getTime(),tz):'';
    }
    if(['calendar','timeline','trend','cumulative'].includes(mode)&&/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const start=zonedLocalToDate(`${key}T00:00`,tz);if(!start)return '';
      const startMs=start.getTime(),endMs=nextZonedDayBoundary(startMs,tz);
      return dayClockChangeInfo({key,startMs,endMs,timeZone:tz,label:localDateLabel(startMs,tz)})?.description||'';
    }
    return '';
  }

  function chartDayForAnchor(anchor, timeZone = currentTimeZone(), summaries = currentZoneDaySummaries(timeZone)) {
    const tz = normalizeTimeZone(timeZone), key = dayKey(anchor, tz);
    const start = zonedLocalToDate(`${key}T00:00`, tz);
    if (!start) return null;
    const startMs = start.getTime(), endMs = nextZonedDayBoundary(startMs, tz);
    const summary = summaries.get(key) || { totalFastMs:0, fastCount:0 };
    return { key, startMs, endMs, totalFastMs:summary.totalFastMs, fastCount:summary.fastCount, timeZone:tz, label:localDateLabel(startMs,tz) };
  }

  function calendarLevel(ms) {
    const hours = Math.max(0, ms) / 3600000;
    if (hours <= 0) return 0;
    if (hours < 6) return 1;
    if (hours < 12) return 2;
    if (hours < 18) return 3;
    return 4;
  }

  function weekdayLabelsMondayFirst() {
    const base = new Date(2026, 0, 5, 12, 0, 0, 0); // Monday
    return Array.from({length:7},(_,i)=>new Date(base.getTime()+i*86400000).toLocaleDateString(currentLocale(),{weekday:'narrow'}));
  }

  // Completed days within one second of a full local day are treated as complete.
  // The current day remains elapsed-only; DST days retain their real 23h/25h length.
  function calendarDurationForDisplay(day, nowMs = Date.now()) {
    const total = Math.max(0, Number(day?.totalFastMs) || 0);
    const start = Number(day?.startMs), end = Number(day?.endMs);
    const dayLength = end - start, shortfall = dayLength - total;
    if (Number.isFinite(start) && Number.isFinite(end) && end <= nowMs && dayLength > 0 && total > 0 && shortfall >= 0 && shortfall <= 1000) return dayLength;
    return total;
  }

  function renderFastCalendar() {
    const title=el('calendarMonthTitle'), grid=el('fastCalendar'), heads=el('calendarWeekdays');
    if (!title || !grid || !heads) return;
    const month=monthAnchor(statsCalendarMonthOffset), monthIndex=month.getMonth(), now=new Date();
    title.textContent=month.toLocaleDateString(currentLocale(),{month:'long',year:'numeric'});
    el('calendarNextBtn').disabled = statsCalendarMonthOffset >= 0;
    heads.replaceChildren();
    for (const label of weekdayLabelsMondayFirst()) { const node=document.createElement('div'); node.className='calendarWeekday'; node.textContent=label; heads.append(node); }
    const first=new Date(month); const shift=(first.getDay()+6)%7; first.setDate(first.getDate()-shift);
    const tz=currentTimeZone(), cacheKey=`${statsCalendarMonthOffset}|${tz}`;
    let calendarDays=calendarDaysCache.get(cacheKey);
    if (!calendarDays) {
      const rangeStart=first.getTime()-2*86400000, rangeEnd=first.getTime()+44*86400000;
      const summaries=currentZoneDaySummaries(tz,rangeStart,rangeEnd);
      calendarDays=[];
      for (let i=0;i<42;i++) {
        const d=new Date(first); d.setDate(first.getDate()+i); d.setHours(12,0,0,0);
        const day=chartDayForAnchor(d,tz,summaries);
        if (day) calendarDays.push({d,day});
      }
      calendarDaysCache.set(cacheKey,calendarDays);
    }
    grid.replaceChildren();
    let firstEnabledButton=null, restoredFocusTarget=false;
    for (const {d,day} of calendarDays) {
      const displayFastMs=calendarDurationForDisplay(day,now.getTime());
      const btn=document.createElement('button'); btn.type='button'; btn.className='calendarDay level'+calendarLevel(displayFastMs);
      const outside=d.getMonth()!==monthIndex, future=d.getTime()>now.getTime()+12*3600000;
      if (outside) btn.classList.add('outside'); if (future) btn.classList.add('future');
      if (statsDetailOverride?.dayKey===day.key) btn.classList.add('selected');
      btn.disabled=future; btn.dataset.dayKey=day.key;
      btn.tabIndex=!future&&day.key===calendarFocusDayKey?0:-1;
      if(!future&&!firstEnabledButton)firstEnabledButton=btn;
      if(btn.tabIndex===0)restoredFocusTarget=true;
      const n=document.createElement('span'); n.textContent=formatNumber(d.getDate());
      const h=document.createElement('span'); h.className='calendarHours'; h.textContent=displayFastMs ? totalHoursDuration(displayFastMs) : '—';
      const clockInfo=dayClockChangeInfo(day);
      btn.append(n,h);
      if(clockInfo){const clock=document.createElement('span');clock.className='calendarClockChange';clock.textContent=clockInfo.label.replace(/^(Day|Offset)\s+/,'');clock.setAttribute('aria-hidden','true');btn.append(clock);btn.title=clockInfo.description;}
      btn.setAttribute('aria-label',day.label+': '+totalHoursDuration(displayFastMs)+(clockInfo?'; '+clockInfo.description:''));
      const selectCalendarDay=()=>{ statsDetailOverride={dayKey:day.key,title:day.label,text:t('stats.detailTotal',{duration:totalHoursDuration(displayFastMs),count:formatNumber(day.fastCount)})}; grid.querySelectorAll('.calendarDay.selected').forEach(node=>node.classList.remove('selected')); btn.classList.add('selected'); renderChartDetailForMode(); };
      btn.addEventListener('pointerdown',event=>{ selectCalendarDay(); if(event.cancelable) event.preventDefault(); });
      btn.addEventListener('click',event=>{ if(event.detail===0) selectCalendarDay(); });
      grid.append(btn);
    }
    if(!restoredFocusTarget&&firstEnabledButton){firstEnabledButton.tabIndex=0;calendarFocusDayKey=firstEnabledButton.dataset.dayKey;}
    renderChartDetailForMode();
  }

  function handleCalendarGridKeydown(event) {
    const grid=el('fastCalendar'),current=event.target.closest?.('.calendarDay');
    if(!grid||!current||!grid.contains(current))return;
    const buttons=[...grid.querySelectorAll('.calendarDay')],index=buttons.indexOf(current);
    if(index<0)return;
    const rowStart=Math.floor(index/7)*7,rowEnd=Math.min(buttons.length-1,rowStart+6);
    let targetIndex=index,step=0,lower=0,upper=buttons.length-1;
    switch(event.key){
      case 'ArrowLeft': targetIndex=index-1;step=-1;lower=rowStart;upper=rowEnd;break;
      case 'ArrowRight': targetIndex=index+1;step=1;lower=rowStart;upper=rowEnd;break;
      case 'ArrowUp': targetIndex=index-7;step=-7;break;
      case 'ArrowDown': targetIndex=index+7;step=7;break;
      case 'Home': targetIndex=rowStart;step=1;lower=rowStart;upper=rowEnd;break;
      case 'End': targetIndex=rowEnd;step=-1;lower=rowStart;upper=rowEnd;break;
      default:return;
    }
    event.preventDefault();
    while(targetIndex>=lower&&targetIndex<=upper&&buttons[targetIndex]?.disabled)targetIndex+=step;
    const target=buttons[targetIndex];
    if(!target||target.disabled||targetIndex<lower||targetIndex>upper)return;
    current.tabIndex=-1;target.tabIndex=0;calendarFocusDayKey=target.dataset.dayKey;target.focus();
  }

  function buildSummaryChartDays(dayCount = 30, timeZone = currentTimeZone()) {
    const tz = normalizeTimeZone(timeZone), now = new Date(), rangeStart = now.getTime() - (dayCount + 2) * 86400000, rangeEnd = now.getTime() + 2 * 86400000;
    const summaries = currentZoneDaySummaries(tz, rangeStart, rangeEnd), days = [];
    for (let i = dayCount - 1; i >= 0; i--) {
      const anchor = new Date(); anchor.setHours(12,0,0,0); anchor.setDate(anchor.getDate() - i);
      const day = chartDayForAnchor(anchor, tz, summaries);
      if (day) days.push(day);
    }
    return days;
  }

  function chartAxisDayText(day, range='30d') {
    if (!day) return '';
    try {
      const anchor = new Date((Number(day.startMs)||Date.now()) + 12*3600000);
      const tz = normalizeTimeZone(day.timeZone || currentTimeZone());
      const opts = range === 'all' ? {year:'numeric',timeZone:tz} : (range === '1y' || range === '6m') ? {month:'short',year:'2-digit',timeZone:tz} : {day:'numeric',month:'short',timeZone:tz};
      return anchor.toLocaleDateString(currentLocale(), opts);
    } catch { return day.label || day.key || ''; }
  }
  function markerStepForPlot(count, width, range='30d') {
    count = Math.max(0, Number(count)||0); width = Math.max(1, Number(width)||1);
    if (count <= 31) return 1;
    const minSpacing = range === 'all' ? 28 : range === '1y' ? 22 : range === '6m' ? 18 : 15;
    return Math.max(1, Math.ceil(count / Math.max(2, Math.floor(width/minSpacing))));
  }
  function canvasEllipsis(ctx, text, maxWidth) {
    text=String(text??''); if(ctx.measureText(text).width<=maxWidth)return text;
    const ell='…';let lo=0,hi=text.length;
    while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(ctx.measureText(text.slice(0,mid)+ell).width<=maxWidth)lo=mid;else hi=mid-1;}
    return text.slice(0,Math.max(0,lo))+ell;
  }
  function drawChartCallout(ctx,{x,y,primary,secondary,canvasW,canvasH,accent,card,textColor,muted}) {
    const pad=9,labelH=39,maxW=Math.max(72,canvasW-8);
    ctx.save();ctx.font='600 12px -apple-system';const p=String(primary??''),pW=ctx.measureText(p).width;
    ctx.font='10px -apple-system';const q=String(secondary??''),qW=ctx.measureText(q).width;
    const labelW=Math.min(maxW,Math.max(78,Math.ceil(Math.max(pW,qW))+pad*2));
    const bx=Math.max(4,Math.min(canvasW-labelW-4,x-labelW/2));
    let by=y-labelH-12;if(by<4)by=Math.min(canvasH-labelH-4,y+12);by=Math.max(4,Math.min(canvasH-labelH-4,by));
    ctx.fillStyle=card;ctx.strokeStyle=accent;ctx.lineWidth=1.5;ctx.beginPath();if(typeof ctx.roundRect==='function')ctx.roundRect(bx,by,labelW,labelH,7);else ctx.rect(bx,by,labelW,labelH);ctx.fill();ctx.stroke();
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=textColor;ctx.font='600 12px -apple-system';ctx.fillText(canvasEllipsis(ctx,p,labelW-pad*2),bx+labelW/2,by+13);
    ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.fillText(canvasEllipsis(ctx,q,labelW-pad*2),bx+labelW/2,by+28);ctx.restore();
  }
  function drawSelectionCrosshair(ctx,x,top,bottom,muted) { ctx.save();ctx.strokeStyle=muted;ctx.globalAlpha=.55;ctx.lineWidth=1;ctx.setLineDash([3,3]);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,bottom);ctx.stroke();ctx.restore(); }
  function drawAdaptiveDayAxis(ctx,days,xFor,{canvasW,bottomY,plotTop,plotBottom,left,right,range}) {
    if(!days.length)return;
    const items=days.map(day=>({label:chartAxisDayText(day,range),shortLabel:chartAxisDayText(day,range)}));
    const positions=days.map((_,i)=>xFor(i));ctx.font='9px -apple-system';
    const maxLabels=Math.max(2,Math.floor(Math.max(1,canvasW-left-right)/64));
    const plan=FTVisuals.axisLabelPlan(items,{positions,measureText:text=>ctx.measureText(String(text)).width,maxLabels,minGap:8});
    const line=getComputedStyle(document.documentElement).getPropertyValue('--line').trim(),muted=getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
    for(const tick of plan){const text=String(tick.text),tw=ctx.measureText(text).width,x=Math.max(left+tw/2,Math.min(canvasW-right-tw/2,tick.x));ctx.save();ctx.strokeStyle=line;ctx.globalAlpha=.45;ctx.beginPath();ctx.moveTo(tick.x,plotTop);ctx.lineTo(tick.x,plotBottom);ctx.stroke();ctx.restore();ctx.fillStyle=muted;ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillText(text,x,bottomY);}
  }

  function buildTrendDays(){if(trendChartDaysCache)return trendChartDaysCache;const n=FTAnalytics.rangeDays(chartRange('trend'),data.records,Date.now(),r=>new Date(r.start).getTime());trendChartDaysCache=buildSummaryChartDays(n);const hours=trendChartDaysCache.map(d=>(d.totalFastMs||0)/3600000),a7=FTAnalytics.rollingAverage(trendChartDaysCache,d=>(d.totalFastMs||0)/3600000,7),a30=FTAnalytics.rollingAverage(trendChartDaysCache,d=>(d.totalFastMs||0)/3600000,30);trendChartDaysCache.forEach((d,i)=>{d.hours=hours[i];d.avg7=a7[i];d.avg30=a30[i];});return trendChartDaysCache;}
  function drawFastTrendChart() {
    const c=el('fastTrendChart'), ctx=c.getContext('2d'), ratio=window.devicePixelRatio||1;
    const cssW=c.clientWidth||660, cssH=c.clientHeight||220; c.width=Math.floor(cssW*ratio); c.height=Math.floor(cssH*ratio); ctx.setTransform(ratio,0,0,ratio,0,0); ctx.clearRect(0,0,cssW,cssH);
    const days=buildTrendDays(), top=18,bottom=58,left=34,right=14,w=cssW-left-right,h=cssH-top-bottom;
    const style=getComputedStyle(document.documentElement), line=style.getPropertyValue('--line').trim(),accent=style.getPropertyValue('--accent').trim(),good=style.getPropertyValue('--good').trim(),muted=style.getPropertyValue('--muted').trim(),card=style.getPropertyValue('--card').trim(),textColor=style.getPropertyValue('--text').trim();
    const peak=Math.max(24,...days.flatMap(d=>[d.hours||0,d.avg7||0,d.avg30||0]));ctx.strokeStyle=line;ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='right';
    [0,.5,1].forEach(fr=>{const y=top+h-h*fr;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(cssW-right,y);ctx.stroke();ctx.fillText(`${formatNumber(peak*fr,0,0)}${t('unit.h')}`,left-5,y+3);});
    const xFor=i=>left+(i/(Math.max(1,days.length-1)))*w,yFor=value=>top+h-(Math.min(peak,Math.max(0,value))/peak)*h;
    trendPlotBounds={left,right:cssW-right,top,bottom:top+h};
    drawAdaptiveDayAxis(ctx,days,xFor,{canvasW:cssW,bottomY:cssH-27,plotTop:top,plotBottom:top+h,left,right,range:chartRange('trend')});
    const lineSeries=(key,color,width=2,dash=[])=>{ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.beginPath();days.forEach((day,i)=>{const x=xFor(i),y=yFor(day[key]);if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});ctx.stroke();ctx.restore();};
    lineSeries('hours',accent,1.7);lineSeries('avg7',good,2,[5,3]);lineSeries('avg30',muted,2,[2,3]);
    trendInteractiveLayout=[];const pointEvery=markerStepForPlot(days.length,w,chartRange('trend'));days.forEach((day,i)=>{const x=xFor(i),y=yFor(day.hours),selected=trendSelectedDayKey===day.key;if(selected||i%pointEvery===0||i===days.length-1){ctx.beginPath();ctx.arc(x,y,selected?6:2.3,0,Math.PI*2);ctx.fillStyle=selected?'#ffffff':accent;ctx.fill();if(selected){ctx.strokeStyle=accent;ctx.lineWidth=2;ctx.stroke();}}trendInteractiveLayout.push({day,x,y});});
    const selected=trendInteractiveLayout.find(hit=>hit.day.key===trendSelectedDayKey);if(selected){drawSelectionCrosshair(ctx,selected.x,top,top+h,muted);drawChartCallout(ctx,{x:selected.x,y:selected.y,primary:`${formatNumber(selected.day.hours||0,0,1)} ${t('unit.h')}`,secondary:selected.day.label||selected.day.key,canvasW:cssW,canvasH:cssH,accent,card,textColor,muted});}
    ctx.fillStyle=muted;ctx.font='10px -apple-system';ctx.textAlign='left';ctx.fillText(t('stats.trendLegend'),left,cssH-8);renderChartDetailForMode();
  }

  function selectTrendPoint(clientX,clientY) {
    const c=el('fastTrendChart'),rect=c.getBoundingClientRect(),x=clientX-rect.left,y=clientY-rect.top;if(!trendInteractiveLayout.length||!trendPlotBounds||x<trendPlotBounds.left-12||x>trendPlotBounds.right+12||y<trendPlotBounds.top-24||y>trendPlotBounds.bottom+24)return false;
    let best=null,bestD=Infinity;for(const hit of trendInteractiveLayout){const d=Math.abs(x-hit.x);if(d<bestD){bestD=d;best=hit;}}if(!best)return false;
    trendSelectedDayKey=best.day.key;statsDetailOverride={dayKey:best.day.key,title:best.day.label,text:t('stats.detailTrend',{duration:compactDuration(best.day.totalFastMs),avg7:formatNumber(best.day.avg7||0,0,1),avg30:formatNumber(best.day.avg30||0,0,1)}),records:recordsOverlappingDay(best.day)};drawFastTrendChart();return true;
  }
  function handleTrendPointer(event) { selectTrendPoint(event.clientX,event.clientY); }

  function startOfWeekMonday(date) { const d=new Date(date); d.setHours(12,0,0,0); const shift=(d.getDay()+6)%7; d.setDate(d.getDate()-shift); return d; }

  function buildWeeklySummaries() {
    if (weeklySummariesCache) return weeklySummariesCache;
    const tz=currentTimeZone(), thisMonday=startOfWeekMonday(new Date()), rangeStart=thisMonday.getTime()-8*7*86400000-2*86400000, rangeEnd=Date.now()+2*86400000, summaries=currentZoneDaySummaries(tz,rangeStart,rangeEnd), weeks=[];
    for(let wi=7;wi>=0;wi--){const start=new Date(thisMonday);start.setDate(start.getDate()-wi*7);let total=0,daysWithFast=0;for(let di=0;di<7;di++){const d=new Date(start);d.setDate(start.getDate()+di);const day=chartDayForAnchor(d,tz,summaries);if(day){total+=day.totalFastMs;if(day.totalFastMs>0)daysWithFast++;}}const key=dayKey(start,tz);weeks.push({key,start,totalFastMs:total,daysWithFast,label:start.toLocaleDateString(currentLocale(),{day:'numeric',month:'short'})});}
    weeklySummariesCache=weeks;
    return weeklySummariesCache;
  }
