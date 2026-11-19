// Deterministic weight-period calendar primitives. Keep this fragment free of app state and DOM access.
  const WEIGHT_PERIOD_MODES = Object.freeze(['daily','week','month','quarter','halfyear','year']);
  function weightCalendarPad(value) { return String(value).padStart(2, '0'); }

  function subtractCalendarMonthsClamped(dateLike, months) {
    const source = new Date(dateLike);
    const day = source.getDate();
    const result = new Date(source);
    result.setDate(1);
    result.setMonth(result.getMonth() - months);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(day, lastDay));
    return result;
  }

  function weightPeriodBounds(mode = 'daily', now = new Date()) {
    const end = new Date(now);
    let start = new Date(end);
    if (mode === 'daily') start.setDate(start.getDate() - 29);
    else if (mode === 'week') start.setDate(start.getDate() - 6);
    else if (mode === 'month') start = subtractCalendarMonthsClamped(end, 1);
    else if (mode === 'quarter') start = subtractCalendarMonthsClamped(end, 3);
    else if (mode === 'halfyear') start = subtractCalendarMonthsClamped(end, 6);
    else start = subtractCalendarMonthsClamped(end, 12);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }

  function weightBucketKeyForDay(calendarDay, mode = 'daily') {
    const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(calendarDay || ''));
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (mode === 'week') {
      const shift = (d.getUTCDay() + 6) % 7;
      d.setUTCDate(d.getUTCDate() - shift);
    } else if (mode === 'month') d.setUTCDate(1);
    else if (mode === 'quarter') { d.setUTCDate(1); d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3); }
    else if (mode === 'halfyear') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() < 6 ? 0 : 6); }
    else { d.setUTCMonth(0, 1); }
    return `${d.getUTCFullYear()}-${weightCalendarPad(d.getUTCMonth()+1)}-${weightCalendarPad(d.getUTCDate())}`;
  }

  function nextWeightBucketKey(key, mode = 'daily') {
    const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(key || ''));
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const d = new Date(Date.UTC(year, month - 1, day));
    if (mode === 'week') d.setUTCDate(d.getUTCDate() + 7);
    else if (mode === 'month') d.setUTCMonth(d.getUTCMonth() + 1);
    else if (mode === 'quarter') d.setUTCMonth(d.getUTCMonth() + 3);
    else if (mode === 'halfyear') d.setUTCMonth(d.getUTCMonth() + 6);
    else d.setUTCFullYear(d.getUTCFullYear() + 1);
    return `${d.getUTCFullYear()}-${weightCalendarPad(d.getUTCMonth()+1)}-${weightCalendarPad(d.getUTCDate())}`;
  }

  function weightBucketDate(key) {
    const match = /^(\\d{4})-(\\d{2})-(\\d{2})$/.exec(String(key || ''));
    if (!match) return new Date(NaN);
    const [year, month, day] = match.slice(1).map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
  }

  function weightRollingWindowDays(mode) {
    return ({week:7,month:30,quarter:90,halfyear:180,year:365})[mode] || 0;
  }
