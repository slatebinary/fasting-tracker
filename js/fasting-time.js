(function (global) {
  'use strict';

  function create(dependencies) {
    const {
      currentLocale,
      currentTimeZone,
      normalizeTimeZone,
      zonedParts,
      timeZoneOffsetMs
    } = dependencies || {};
    const pad = typeof dependencies?.pad === 'function'
      ? dependencies.pad
      : value => String(value).padStart(2, '0');

    for (const [name, fn] of Object.entries({
      currentLocale, currentTimeZone, normalizeTimeZone, zonedParts, timeZoneOffsetMs
    })) {
      if (typeof fn !== 'function') throw new TypeError('FTTime.create requires ' + name);
    }

    function dayKey(dateLike, timeZone = currentTimeZone()) {
      const p = zonedParts(dateLike, timeZone);
      return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
    }

    function dayKeyFast(dateLike, timeZone = currentTimeZone()) {
      const tz = normalizeTimeZone(timeZone);
      if (tz === 'UTC') {
        const d = new Date(dateLike);
        return Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : '';
      }
      return dayKey(dateLike, tz);
    }

    function weekKeyFromDayString(dayString) {
      const m = String(dayString || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return '';
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      const dow = d.getUTCDay(), diff = dow === 0 ? -6 : 1 - dow;
      d.setUTCDate(d.getUTCDate() + diff);
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    }

    function localDateLabel(dateLike, timeZone = null) {
      const opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
      if (timeZone) opts.timeZone = normalizeTimeZone(timeZone);
      return new Date(dateLike).toLocaleDateString(currentLocale(), opts);
    }

    function localDateTimeLabel(dateLike, timeZone = null) {
      const d = new Date(dateLike), tz = timeZone ? normalizeTimeZone(timeZone) : null;
      const yearNow = Number(zonedParts(Date.now(), tz || currentTimeZone()).year);
      const yearThere = Number(zonedParts(d, tz || currentTimeZone()).year);
      const dateOpts = { day: 'numeric', month: 'short', year: yearThere === yearNow ? undefined : 'numeric' };
      const timeOpts = { hour: '2-digit', minute: '2-digit' };
      if (tz) { dateOpts.timeZone = tz; timeOpts.timeZone = tz; }
      return `${d.toLocaleDateString(currentLocale(), dateOpts)}, ${d.toLocaleTimeString(currentLocale(), timeOpts)}`;
    }

    function localTimeLabel(dateLike, timeZone = null) {
      const d = new Date(dateLike), opts = { hour: '2-digit', minute: '2-digit' };
      if (timeZone) opts.timeZone = normalizeTimeZone(timeZone);
      return d.toLocaleTimeString(currentLocale(), opts);
    }

    const boundaryCache = new Map();
    const offsetCache = new Map();

    function nextZonedDayBoundary(ms, timeZone, knownKey = null) {
      const tz = normalizeTimeZone(timeZone), key = knownKey || dayKey(ms, tz), cacheKey = `${tz}|${key}`;
      const cached = boundaryCache.get(cacheKey);
      if (Number.isFinite(cached) && cached > ms) return cached;

      // Resolve ordinary days directly; transition and unusual midnight days
      // retain the exact-search fallback below.
      const parts = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (parts && +parts[1] >= 100) {
        const nextDate = new Date(Date.UTC(+parts[1], +parts[2] - 1, +parts[3] + 1));
        const y = nextDate.getUTCFullYear(), m = nextDate.getUTCMonth() + 1, d = nextDate.getUTCDate();
        const nextKey = `${y}-${pad(m)}-${pad(d)}`;
        const target = Date.UTC(y, m - 1, d);
        const prior = offsetCache.get(tz);
        let offset = prior?.key === key ? prior.offset : timeZoneOffsetMs(ms, tz);
        let candidate = target - offset;
        const utcZone = tz === 'UTC' || tz === 'Etc/UTC' || tz === 'Etc/GMT';
        let check = candidate > ms
          ? (utcZone ? {year:y, month:m, day:d, hour:0, minute:0, second:0} : zonedParts(candidate, tz))
          : null;
        if (!(check && `${check.year}-${pad(check.month)}-${pad(check.day)}` === nextKey && check.hour === 0 && check.minute === 0 && check.second === 0) && prior?.key === key) {
          offset = timeZoneOffsetMs(ms, tz);
          candidate = target - offset;
          check = candidate > ms ? zonedParts(candidate, tz) : null;
        }
        if (candidate > ms && check && `${check.year}-${pad(check.month)}-${pad(check.day)}` === nextKey && check.hour === 0 && check.minute === 0 && check.second === 0) {
          const nextOffset = utcZone ? 0 : Date.UTC(check.year, check.month - 1, check.day, check.hour, check.minute, check.second) - Math.floor(candidate / 1000) * 1000;
          offsetCache.set(tz, {key:nextKey, offset:nextOffset});
          if (boundaryCache.size > 10000) boundaryCache.clear();
          boundaryCache.set(cacheKey, candidate);
          return candidate;
        }
      }

      // Preserve exact behavior for midnight gaps, repeated midnights and
      // historical offset changes that cannot use the direct calculation.
      let lo = ms, hi = ms + 30 * 3600000;
      while (dayKey(hi, tz) === key && hi - ms < 72 * 3600000) hi += 12 * 3600000;
      if (dayKey(hi, tz) === key) return hi;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (dayKey(mid, tz) === key) lo = mid;
        else hi = mid;
      }
      const boundaryParts = zonedParts(hi, tz);
      const boundaryKey = `${boundaryParts.year}-${pad(boundaryParts.month)}-${pad(boundaryParts.day)}`;
      const boundaryOffset = Date.UTC(boundaryParts.year, boundaryParts.month - 1, boundaryParts.day, boundaryParts.hour, boundaryParts.minute, boundaryParts.second) - Math.floor(hi / 1000) * 1000;
      offsetCache.set(tz, {key:boundaryKey, offset:boundaryOffset});
      if (boundaryCache.size > 10000) boundaryCache.clear();
      boundaryCache.set(cacheKey, hi);
      return hi;
    }

    function addIntervalToDayMap(map, startLike, endLike, timeZone) {
      const tz = normalizeTimeZone(timeZone), end = new Date(endLike).getTime();
      let cursor = new Date(startLike).getTime(), guard = 0;
      while (cursor < end && guard++ < 10000) {
        const key = dayKey(cursor, tz), boundary = Math.min(end, nextZonedDayBoundary(cursor, tz));
        map.set(key, (map.get(key) || 0) + Math.max(0, boundary - cursor));
        cursor = Math.max(boundary, cursor + 1);
      }
    }

    return Object.freeze({
      dayKey, dayKeyFast, weekKeyFromDayString,
      localDateLabel, localDateTimeLabel, localTimeLabel,
      nextZonedDayBoundary, addIntervalToDayMap
    });
  }

  global.FTTime = Object.freeze({ create });
})(window);
