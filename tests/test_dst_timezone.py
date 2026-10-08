#!/usr/bin/env python3
"""Regression: DST gaps/repeated hours are rejected; full-day fasts across DST use true elapsed time."""
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
    page.evaluate(STORAGE_SHIM);page.evaluate("data=>{__seedFastingDbV2(data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.1'}));}",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.12.1'",timeout=20000)
    page.locator('.tab[data-screen="history"]').click()
    def attempt(start,end,expect_error=False):
        page.locator('#addEntryBtn').click();page.locator('#entryStart').fill(start);page.locator('#entryEnd').fill(end);page.locator('#entryGoal').fill('16');page.locator('#entrySaveBtn').click();page.wait_for_timeout(80)
        visible=page.locator('#entryError').is_visible()
        if expect_error:
            if not visible: print('FAIL: DST-invalid wall time was accepted',start,end);sys.exit(1)
            page.locator('#entryCancelBtn').click()
        else:
            if visible: print('FAIL: valid DST-spanning fast was rejected',page.locator('#entryError').inner_text());sys.exit(1)
    # Sofia jumps from 03:00 to 04:00 on 29 Mar 2026: 03:30 does not exist.
    attempt('2026-03-29T03:30','2026-03-29T05:00',True)
    # Sofia repeated 03:xx hour on 26 Oct 2025: 03:30 is ambiguous.
    attempt('2025-10-26T03:30','2025-10-26T04:30',True)
    # 20:00 -> 20:00 across spring forward is 23 real hours.
    attempt('2026-03-28T20:00','2026-03-29T20:00',False)
    # 20:00 -> 20:00 across autumn fallback is 25 real hours.
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
