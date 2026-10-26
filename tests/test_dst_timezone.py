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
    page.evaluate(STORAGE_SHIM);page.evaluate("data=>{__seedFastingDbV2(data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.13.3'}));}",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.13.3'",timeout=20000)
    page.locator('.tab[data-screen="settings"]').click()
    page.wait_for_timeout(80)
    zones=page.evaluate("Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : []")
    required=['America/New_York','Asia/Kathmandu','Africa/Casablanca','Pacific/Chatham','Europe/Sofia']
    if len(zones)<300 or any(zone not in zones for zone in required):
        print('FAIL: global IANA time-zone list is incomplete',len(zones),[z for z in required if z not in zones]);sys.exit(1)
    # A manually selected zone overrides the device zone for new date inputs and calendar views.
    page.locator('#timeZoneSearch').fill('New York')
    page.wait_for_timeout(80)
    if page.locator('#timeZoneResults [role="option"]').count()>12: print('FAIL: search results are not limited');sys.exit(1)
    if not page.locator('#timeZoneResults [data-time-zone="America/New_York"]').count(): print('FAIL: city search did not find New York');sys.exit(1)
    page.locator('#timeZoneResults [data-time-zone="America/New_York"]').click()
    page.wait_for_timeout(80)
    saved_zone=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.preferences')||'{}').timeZone")
    if saved_zone!='America/New_York': print('FAIL: selected time zone was not persisted',saved_zone);sys.exit(1)
    page.locator('#timeZoneSearch').fill('Europe')
    page.wait_for_timeout(80)
    if page.locator('#timeZoneResults [role="option"]').count()>12: print('FAIL: region search is not capped');sys.exit(1)
    page.locator('#timeZoneSystemBtn').click()
    if page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.preferences')||'{}').timeZone") not in (None,'system'): print('FAIL: device-zone option was not restored');sys.exit(1)
    page.locator('#timeZoneSearch').fill('New York')
    page.wait_for_timeout(80)
    page.locator('#timeZoneResults [data-time-zone="America/New_York"]').click()
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
    page.locator('#timeZoneSearch').fill('Bulgaria')
    page.wait_for_timeout(80)
    if not page.locator('#timeZoneResults [data-time-zone="Europe/Sofia"]').count(): print('FAIL: country search did not find Bulgaria / Europe-Sofia');sys.exit(1)
    page.locator('#timeZoneResults [data-time-zone="Europe/Sofia"]').click()
    page.wait_for_timeout(80)
    saved_zone=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.preferences')||'{}').timeZone")
    if saved_zone!='Europe/Sofia': print('FAIL: updated time zone was not persisted',saved_zone);sys.exit(1)
    page.locator('.tab[data-screen="history"]').click()
    attempt('2026-03-29T03:30','2026-03-29T05:00',True)
    attempt('2025-10-26T03:30','2025-10-26T04:30',True)
    attempt('2026-03-28T20:00','2026-03-29T20:00',False)
    attempt('2025-10-25T20:00','2025-10-26T20:00',False)
    rows=page.locator('#historyList .historyRow').all_inner_texts()
    joined=' | '.join(rows)
    if '23h 0m' not in joined or '1 day 1h 0m' not in joined and '25h 0m' not in joined:
        # compactDuration may use day wording for 25h.
        if '1d 1h' not in joined:
            print('FAIL: DST-spanning elapsed durations are incorrect',joined);sys.exit(1)
    if errors: print('FAIL: browser errors: '+' | '.join(errors[:3]));sys.exit(1)
    browser.close()
print('PASS: DST/time-zone gap, fallback and elapsed-duration regression checks')
