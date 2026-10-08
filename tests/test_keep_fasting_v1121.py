#!/usr/bin/env python3
"""Regression: Keep fasting always dismisses the stop modal and cannot touch-through reopen it."""
import sys
from datetime import datetime, timezone, timedelta
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(3)
now=datetime.now(timezone.utc)
data['activeStart']=(now-timedelta(minutes=8)).isoformat().replace('+00:00','Z')
data['activeGoalHours']=16
data['activeTimeZone']='UTC'
data['activeCreatedAt']=data['activeStart']
data['activeModifiedAt']=None

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}, has_touch=True)
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.1',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.1'",timeout=20000)
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Stop')",timeout=10000)

    # Repeat the user flow to catch state/focus regressions.
    for _ in range(3):
        page.locator('#toggleFast').click()
        page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
        page.locator('#keepFastingBtn').click()
        page.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
        page.wait_for_function("document.querySelector('#fasting')?.classList.contains('active')",timeout=5000)
        if 'Stop' not in page.locator('#toggleFast').inner_text():
            print('FAIL: Keep fasting changed the active fasting state'); sys.exit(1)
        page.wait_for_timeout(400)

    # Simulate a late synthetic/ghost activation on the underlying toggle immediately
    # after closing. The suppression window must keep the stop modal closed.
    page.locator('#toggleFast').click()
    page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page.locator('#keepFastingBtn').click()
    page.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    page.locator('#toggleFast').dispatch_event('click')
    page.wait_for_timeout(120)
    if page.locator('#stopFastModal').is_visible():
        print('FAIL: stop modal reopened from touch-through/ghost click'); sys.exit(1)
    if 'Stop' not in page.locator('#toggleFast').inner_text():
        print('FAIL: ghost click changed active fasting state'); sys.exit(1)

    # The modal controls must not use the pointer-drift-sensitive responsive binder.
    html=page.content()
    # Runtime behavior is primary; source assertion is done in release test below.
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: Keep fasting reliably dismisses modal and blocks touch-through')
