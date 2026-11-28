  function exactDuration(ms) {
    ms = Math.max(0, ms);
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function durationDisplay(ms, compact = true, includeMinutes = true) {
    ms = Math.max(0, Number(ms) || 0);
    const totalMin = Math.floor(ms / 60000);
    const useDays = ms > 86400000;
    const days = useDays ? Math.floor(totalMin / 1440) : 0;
    const hours = useDays ? Math.floor((totalMin % 1440) / 60) : Math.floor(totalMin / 60);
    const minutes = totalMin % 60;
    const decimal = `${formatNumber(ms / 3600000, 0, 2)} ${t('unit.h')}`;
    let readable;
    if (days > 0) {
      const day = compact ? `${formatNumber(days)}${t('unit.d')}` : `${formatNumber(days)} ${t(pluralKey('unit.day', days))}`;
      readable = `${day} ${formatNumber(hours)}${t('unit.h')}${includeMinutes ? ` ${formatNumber(minutes)}${t('unit.m')}` : ''}`;
    } else if (hours > 0) {
      readable = `${formatNumber(hours)}${t('unit.h')}${includeMinutes ? ` ${formatNumber(minutes)}${t('unit.m')}` : ''}`;
    } else {
      readable = `${formatNumber(minutes)}${t('unit.m')}`;
    }
    return `${decimal} (${readable})`;
  }

  function friendlyDuration(ms, includeMinutes = true) {
    return durationDisplay(ms, false, includeMinutes);
  }

  function compactDuration(ms) {
    return durationDisplay(ms, true, true);
  }

  function totalHoursDuration(ms) {
    return compactDuration(ms);
  }

  function dayKey(dateLike, timeZone = currentTimeZone()) {
    return timeUtils.dayKey(dateLike, timeZone);
  }

  function dayKeyFast(dateLike, timeZone = currentTimeZone()) {
    return timeUtils.dayKeyFast(dateLike, timeZone);
  }

  function weekKeyFromDayString(dayString) {
    return timeUtils.weekKeyFromDayString(dayString);
  }

  function weightCalendarDay(weight) {
    if (weight && typeof weight.calendarDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weight.calendarDay)) return weight.calendarDay;
    return weight ? dayKeyFast(weight.when, weight.timeZone || currentTimeZone()) : '';
  }

  function localDateLabel(dateLike, timeZone = null) {
    return timeUtils.localDateLabel(dateLike, timeZone);
  }

  function localDateTimeLabel(dateLike, timeZone = null) {
    return timeUtils.localDateTimeLabel(dateLike, timeZone);
  }

  function localTimeLabel(dateLike, timeZone = null) {
    return timeUtils.localTimeLabel(dateLike, timeZone);
  }

  function nextZonedDayBoundary(ms, timeZone, knownKey = null) {
    return timeUtils.nextZonedDayBoundary(ms, timeZone, knownKey);
  }

  function addIntervalToDayMap(map, startLike, endLike, timeZone) {
    return timeUtils.addIntervalToDayMap(map, startLike, endLike, timeZone);
  }

  function completedFastingByStoredCalendarDay() {
    return storedDayTotalsMap;
  }
  function fastingByStoredCalendarDay() {
    const map = new Map(completedFastingByStoredCalendarDay());
    if (data.activeStart) addIntervalToDayMap(map, data.activeStart, new Date(), data.activeTimeZone || currentTimeZone());
    return map;
  }

  function fastingMsForDay(dayDate) {
    const key = dayKey(dayDate, currentTimeZone());
    let total = completedFastingByStoredCalendarDay().get(key) || 0;
    if (data.activeStart) {
      const active = new Map();
      addIntervalToDayMap(active, data.activeStart, new Date(), data.activeTimeZone || currentTimeZone());
      total += active.get(key) || 0;
    }
    return total;
  }

  function startOfWeek(dateLike = new Date()) {
    const d = new Date(dateLike);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  }

  function weekKey(dateLike, timeZone = currentTimeZone()) {
    const p=zonedParts(dateLike,timeZone); const d=new Date(Date.UTC(p.year,p.month-1,p.day));
    const day=d.getUTCDay(), diff=day===0?-6:1-day; d.setUTCDate(d.getUTCDate()+diff);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`;
  }

