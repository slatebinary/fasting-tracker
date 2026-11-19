// Pure localized Weight bucket labels. Locale, translations and app date helpers are injected.
  function resolveWeightBucketLabel(options = {}) {
    const {bucket,mode='daily',variant='long',locale='en',timeZone='UTC',bucketDate,localDateTimeLabel,translate} = options;
    if (!bucket || typeof bucketDate !== 'function') return '';
    const tr = typeof translate === 'function' ? translate : key => key;
    if (variant === 'long') {
      if (mode === 'daily' && bucket.entry) return typeof localDateTimeLabel === 'function' ? localDateTimeLabel(bucket.entry.when,bucket.entry.timeZone) : '';
      if (bucket.rollingWindowDays && bucket.calendarDay) {
        const start = bucketDate(bucket.windowStartDay || bucket.calendarDay);
        const end = bucketDate(bucket.windowEndDay || bucket.calendarDay);
        const dateOptions = {day:'numeric',month:'short',year:'numeric',timeZone:'UTC'};
        return `${start.toLocaleDateString(locale,dateOptions)} – ${end.toLocaleDateString(locale,dateOptions)}`;
      }
      const date = bucketDate(bucket.key);
      const year = date.getUTCFullYear(), month = date.getUTCMonth();
      if (mode === 'week') return tr('weight.weekOf',{date:date.toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'})});
      if (mode === 'month') return date.toLocaleDateString(locale,{month:'long',year:'numeric',timeZone:'UTC'});
      if (mode === 'quarter') return tr('weight.quarterLabel',{quarter:Math.floor(month/3)+1,year});
      if (mode === 'halfyear') return tr('weight.halfYearLabel',{half:month<6?1:2,year});
      return String(year);
    }
    if (variant === 'short') {
      if (bucket.rollingWindowDays && bucket.calendarDay) return bucketDate(bucket.calendarDay).toLocaleDateString(locale,{day:'numeric',month:'short',timeZone:'UTC'});
      if (mode === 'daily' && bucket.entry) {
        const date = new Date(bucket.entry.when), zone = bucket.entry.timeZone || timeZone;
        return date.toLocaleDateString(locale,{day:'numeric',month:'short',year:'2-digit',timeZone:zone});
      }
      const date = bucketDate(bucket.key);
      const year = date.getUTCFullYear(), month = date.getUTCMonth();
      if (mode === 'week') return date.toLocaleDateString(locale,{day:'numeric',month:'short',timeZone:'UTC'});
      if (mode === 'month') return date.toLocaleDateString(locale,{month:'short',year:'2-digit',timeZone:'UTC'});
      if (mode === 'quarter') return tr('weight.quarterShort',{quarter:Math.floor(month/3)+1,year:String(year).slice(-2)});
      if (mode === 'halfyear') return tr('weight.halfYearShort',{half:month<6?1:2,year:String(year).slice(-2)});
      return String(year);
    }
    if (variant === 'callout') {
      if (mode === 'daily' && bucket.entry) {
        const date = new Date(bucket.entry.when), zone = bucket.entry.timeZone || timeZone;
        return date.toLocaleString(locale,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:zone});
      }
      return resolveWeightBucketLabel({...options,variant:'long'});
    }
    return '';
  }
