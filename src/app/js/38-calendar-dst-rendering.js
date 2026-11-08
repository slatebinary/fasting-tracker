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

