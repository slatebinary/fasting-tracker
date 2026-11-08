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

