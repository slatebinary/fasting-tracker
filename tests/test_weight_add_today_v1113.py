#!/usr/bin/env python3
"""Regression: add/edit today's weight must refresh every weight view immediately."""
import sys
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(1)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}, timezone_id='Europe/Sofia', locale='en-GB')
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDbV2(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.1',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.1'",timeout=20000)
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function("document.querySelector('#weight')?.classList.contains('active')",timeout=5000)
    page.wait_for_function("document.querySelector('#weightPeriodRange')?.dataset.count !== undefined",timeout=5000)

    before_count=int(page.locator('#weightPeriodRange').get_attribute('data-count'))
    page.locator('#addWeightBtn').click()
    page.wait_for_function("!document.querySelector('#weightModal').hidden",timeout=3000)
    today_value=page.locator('#weightWhen').input_value()
    if not today_value or 'T' not in today_value:
        print('FAIL: Add weight did not default to today/current local time'); sys.exit(1)
    page.locator('#weightValueInput').fill('80.5')
    page.locator('#weightSaveBtn').click()

    page.wait_for_function("document.querySelector('#weightModal').hidden",timeout=3000)
    page.wait_for_function("document.querySelector('#wLatest')?.textContent.includes('80.5')",timeout=5000)
    page.wait_for_function(f"Number(document.querySelector('#weightPeriodRange')?.dataset.count) === {before_count+1}",timeout=5000)
    history=page.locator('#weightHistoryList').inner_text()
    if '80.5 kg' not in history:
        print('FAIL: newly added weight is missing from history without reload'); sys.exit(1)

    # Edit the newest record and require the same immediate cache refresh.
    page.locator('#weightHistoryList .historyActions button').filter(has_text='Edit').first.click()
    page.wait_for_function("!document.querySelector('#weightModal').hidden",timeout=3000)
    page.locator('#weightValueInput').fill('79.9')
    page.locator('#weightSaveBtn').click()
    page.wait_for_function("document.querySelector('#weightModal').hidden",timeout=3000)
    page.wait_for_function("document.querySelector('#wLatest')?.textContent.includes('79.9')",timeout=5000)
    history2=page.locator('#weightHistoryList').inner_text()
    if '79.9 kg' not in history2 or '80.5 kg' in history2:
        print('FAIL: edited weight is not reflected immediately'); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: add/edit today weight refreshes latest/history/statistics immediately')
