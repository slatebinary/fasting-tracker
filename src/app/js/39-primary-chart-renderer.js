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

