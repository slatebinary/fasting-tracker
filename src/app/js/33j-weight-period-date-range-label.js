// Pure locale-aware formatting for a Weight period's inclusive date range.
  function formatWeightPeriodDateRange(start, end, locale) {
    const formatter = new Intl.DateTimeFormat(locale, {day:'numeric',month:'short',year:'numeric'});
    return formatter.format(start) + ' – ' + formatter.format(end);
  }
