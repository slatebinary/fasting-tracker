#!/usr/bin/env python3
"""Regression: global IANA zone selection, DST gaps/folds, and true elapsed durations."""
import sys
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(0)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844},timezone_id='Europe/Sofia');errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM);page.evaluate("data=>{__seedFastingDbV2(data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.13.2'}));}",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    try:
        page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.13.4'",timeout=20000)
    except Exception:
        print('FAIL: app boot did not reach the version label; page errors:',errors)
        print('FAIL: version label text:',page.locator('#appVersionLabel').text_content())
        raise
    page.locator('.tab[data-screen="settings"]').click()
    page.wait_for_timeout(80)
    zones=page.evaluate("window.FT_TIME_ZONE_LOCATIONS.map(z=>z.z)")
    if len(zones)<300:
        print('FAIL: global time-zone location dataset is incomplete',len(zones));sys.exit(1)
    def search_zone(query,value):
        saved_before=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.preferences')||'{}').timeZone")
        page.locator('#timeZoneSearch').fill(query)
        if page.locator('#timeZoneSelect').input_value()!='':
            print('FAIL: typing a time-zone search should prompt the user to choose a result, not leave the old zone selected',query,page.locator('#timeZoneSelect').input_value());sys.exit(1)
        if page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.preferences')||'{}').timeZone") != saved_before:
            print('FAIL: searching changed the saved time zone before the user selected a result');sys.exit(1)
        if not page.locator('#timeZoneSelect option[value=\"\"]').count():
            print('FAIL: search prompt option missing');sys.exit(1)
        options=page.locator('#timeZoneSelect option').evaluate_all("(items)=>items.map(o=>({value:o.value,label:o.textContent}))")
        if len(options)>17: print('FAIL: search results are not capped',query,len(options));sys.exit(1)
        if not any(o['value']==value for o in options): print('FAIL: expected zone missing from search',query,value,options);sys.exit(1)
        if any('_' in o['label'] for o in options): print('FAIL: raw underscore shown in labels',options);sys.exit(1)
        page.locator('#timeZoneSelect').select_option(value)
    # Country, city and continent searches must be readable and bounded.
    search_zone('Bulgaria','Europe/Sofia')
    page.locator('#timeZoneSearch').fill('Tokyo')
    if not page.locator('#timeZoneSelect option[value="Asia/Tokyo"]').count(): print('FAIL: city search did not find Tokyo');sys.exit(1)
    page.locator('#timeZoneSearch').fill('Oceania')
    if page.locator('#timeZoneSelect option').count()>17: print('FAIL: continent search unbounded');sys.exit(1)
    search_zone('America/New_York','America/New_York')
    page.wait_for_timeout(80)
    saved_zone=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.preferences')||'{}').timeZone")
    if saved_zone!='America/New_York': print('FAIL: selected time zone was not persisted',saved_zone);sys.exit(1)
    page.locator('.tab[data-screen="history"]').click()
    def attempt(start,end,expect_error=False):
        page.locator('#addEntryBtn').click();page.locator('#entryStart').fill(start);page.locator('#entryEnd').fill(end);page.locator('#entryGoal').fill('16');page.locator('#entrySaveBtn').click();page.wait_for_timeout(80)
        visible=page.locator('#entryError').is_visible()
        if expect_error:
            if not visible: print('FAIL: DST-invalid wall time was accepted',start,end);sys.exit(1)
            page.locator('#entryCancelBtn').click()
        else:
            if visible: print('FAIL: valid DST-spanning fast was rejected',page.locator('#entryError').inner_text());sys.exit(1)
    # New York jumps from 02:00 to 03:00 on 8 Mar 2026: 02:30 does not exist.
    attempt('2026-03-08T02:30','2026-03-08T04:00',True)
    # New York repeats 01:xx on 2 Nov 2025: 01:30 is ambiguous.
    attempt('2025-11-02T01:30','2025-11-02T02:30',True)
    # 20:00 -> 20:00 across spring forward is 23 real hours.
    attempt('2026-03-07T20:00','2026-03-08T20:00',False)
    # 20:00 -> 20:00 across autumn fallback is 25 real hours.
    attempt('2025-11-01T20:00','2025-11-02T20:00',False)
    # Switch to a second DST-observing region and verify its distinct transition rules.
    page.locator('.tab[data-screen="settings"]').click()
    search_zone('Sofia','Europe/Sofia')
    page.wait_for_timeout(80)
    saved_zone=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.preferences')||'{}').timeZone")
    if saved_zone!='Europe/Sofia': print('FAIL: updated time zone was not persisted',saved_zone);sys.exit(1)
    page.locator('.tab[data-screen="history"]').click()
    attempt('2026-03-29T03:30','2026-03-29T05:00',True)
    attempt('2025-10-26T03:30','2025-10-26T04:30',True)
    attempt('2026-03-28T20:00','2026-03-29T20:00',False)
    attempt('2025-10-25T20:00','2025-10-26T20:00',False)
    # Southern-hemisphere DST rules and a 30-minute transition are also covered.
    page.locator('.tab[data-screen="settings"]').click()
    search_zone('Sydney','Australia/Sydney')
    page.locator('.tab[data-screen="history"]').click()
    attempt('2026-10-04T02:30','2026-10-04T04:00',True)
    attempt('2026-04-05T02:30','2026-04-05T03:30',True)
    attempt('2026-10-03T20:00','2026-10-04T20:00',False)
    attempt('2026-04-04T20:00','2026-04-05T20:00',False)
    page.locator('.tab[data-screen="settings"]').click()
    search_zone('Lord Howe','Australia/Lord_Howe')
    page.locator('.tab[data-screen="history"]').click()
    attempt('2025-10-05T02:15','2025-10-05T03:00',True)
    attempt('2025-04-06T01:45','2025-04-06T02:30',True)
    attempt('2025-10-04T20:00','2025-10-05T20:00',False)
    attempt('2025-04-05T20:00','2025-04-06T20:00',False)
    rows=page.locator('#historyList .historyRow').all_inner_texts()
    joined=' | '.join(rows)
    if '23h 0m' not in joined or '1 day 1h 0m' not in joined and '25h 0m' not in joined:
        # compactDuration may use day wording for 25h.
        if '1d 1h' not in joined:
            print('FAIL: DST-spanning elapsed durations are incorrect',joined);sys.exit(1)
    # Regression: Sofia's 2026-10-25 local calendar day is 25 hours long.
    # A 52-minute non-fasting pause leaves 24h 8m of fasting time for the calendar.
    pause_start = __import__('datetime').datetime.fromisoformat('2026-10-25T00:30:00+00:00')
    pause_end = __import__('datetime').datetime.fromisoformat('2026-10-25T01:22:00+00:00')
    pause_minutes = int((pause_end - pause_start).total_seconds() // 60)
    calendar_fast_minutes = 25 * 60 - pause_minutes
    if pause_minutes != 52 or calendar_fast_minutes != 24 * 60 + 8:
        print('FAIL: Sofia autumn DST calendar should show 24h 8m after a 52m pause', pause_minutes, calendar_fast_minutes);sys.exit(1)
    source = open('index.html', encoding='utf-8').read()
    calendar_renderer = source[source.index('for (const {d,day} of calendarDays) {'):source.index('function buildSummaryChartDays')]
    if calendar_renderer.count('totalHoursDuration(day.totalFastMs)') != 3 or 'compactDuration(day.totalFastMs)' in calendar_renderer:
        print('FAIL: calendar tile, accessible label, and detail must show total hours without day-based truncation');sys.exit(1)
    if errors: print('FAIL: browser errors: '+' | '.join(errors[:3]));sys.exit(1)
    browser.close()
print('PASS: DST/time-zone gap, fallback and elapsed-duration regression checks')
