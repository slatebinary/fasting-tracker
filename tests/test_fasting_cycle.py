#!/usr/bin/env python3
"""Regression: shorter presets, carry-forward target and sub-24h next-fast countdown."""
import sys
from datetime import datetime, timezone, timedelta
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)


def seed_active(hours_elapsed, active_goal=14, default_goal=16):
    data=build_data(0)
    now=datetime.now(timezone.utc)
    start=now-timedelta(hours=hours_elapsed)
    data['goalHours']=default_goal
    data['activeStart']=start.isoformat().replace('+00:00','Z')
    data['activeGoalHours']=active_goal
    data['activeTimeZone']='UTC'
    data['activeCreatedAt']=data['activeStart']
    data['activeModifiedAt']=None
    return data

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])

    # A short completed fast should create the remaining-to-24h countdown and
    # carry its selected target forward to the next-fast default.
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    data=seed_active(2,14,16)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.9.2',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.9.2'",timeout=20000)

    for attr in ('data-goal','data-active-goal','data-setup-goal'):
        vals=page.eval_on_selector_all(f'[{attr}]', f"els => els.map(e => Number(e.getAttribute('{attr}')))" )
        for needed in (12,14,20):
            if needed not in vals:
                print(f'FAIL: {needed}h missing from {attr} presets'); sys.exit(1)

    page.locator('#toggleFast').click()
    page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page.locator('#stopAndSaveBtn').click()
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Start')",timeout=5000)
    page.wait_for_function("!document.querySelector('#nextFastCard').hidden",timeout=5000)
    if page.locator('#goalHours').input_value() != '14':
        print('FAIL: completed fast target did not become next default'); sys.exit(1)
    basis=page.locator('#nextFastBasis').inner_text()
    if '2h' not in basis or '22h' not in basis or '24' not in basis:
        print('FAIL: next-fast countdown basis is not actual fast + remainder to 24h:',basis); sys.exit(1)
    count=page.locator('#nextFastCountdown').inner_text().strip()
    parts=count.split(':')
    if len(parts)!=3 or not all(x.isdigit() for x in parts) or not (21 <= int(parts[0]) <= 22):
        print('FAIL: next-fast countdown does not show roughly 22h remaining:',count); sys.exit(1)

    # A completed fast of 24h or longer must not suggest the 24h-cycle countdown.
    long=browser.new_page(viewport={'width':390,'height':844})
    long.evaluate(STORAGE_SHIM)
    data2=seed_active(26,36,16)
    long.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.9.2',seenAt:new Date().toISOString()})); }", data2)
    long.set_content(inlined_html(),wait_until='domcontentloaded')
    long.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.9.2'",timeout=20000)
    long.locator('#toggleFast').click(); long.locator('#stopFastModal').wait_for(state='visible',timeout=5000); long.locator('#stopAndSaveBtn').click()
    long.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Start')",timeout=5000)
    if not long.locator('#nextFastCard').is_hidden():
        print('FAIL: >=24h completed fast still shows next-fast countdown'); sys.exit(1)
    if long.locator('#goalHours').input_value() != '36':
        print('FAIL: extended fast target did not become next default'); sys.exit(1)

    # Wording must present this as neutral cycle arithmetic, not as a suggested
    # eating interval or a prescribed next-fast time.
    if page.locator('#nextFastCard').locator('h2').inner_text().strip() != '24-hour cycle':
        print('FAIL: cycle card still uses prescriptive next-fast heading'); sys.exit(1)
    if 'not a recommendation' not in page.locator('#nextFastCard').inner_text().lower():
        print('FAIL: neutral cycle disclaimer is missing'); sys.exit(1)

    # 23h40m of actual fasting should leave exactly 20m in the displayed
    # 24-hour-cycle arithmetic (allowing the live countdown itself to tick).
    precise=browser.new_page(viewport={'width':390,'height':844})
    precise.evaluate(STORAGE_SHIM)
    data3=seed_active(23 + 40/60,23,23)
    precise.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.9.2',seenAt:new Date().toISOString()})); }", data3)
    precise.set_content(inlined_html(),wait_until='domcontentloaded')
    precise.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.9.2'",timeout=20000)
    precise.locator('#toggleFast').click(); precise.locator('#stopFastModal').wait_for(state='visible',timeout=5000); precise.locator('#stopAndSaveBtn').click()
    precise.wait_for_function("!document.querySelector('#nextFastCard').hidden",timeout=5000)
    precise_basis=precise.locator('#nextFastBasis').inner_text()
    if '23h 40m' not in precise_basis or '0h 20m' not in precise_basis:
        print('FAIL: 23h40m fast does not show a 20m 24-hour-cycle remainder:',precise_basis); sys.exit(1)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: shorter presets, target carry-forward and neutral sub-24h cycle countdown')
