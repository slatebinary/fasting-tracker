#!/usr/bin/env python3
"""Regression: stopping uses one explicit modal and a reversible 10-second Undo."""
import sys
from datetime import datetime, timezone, timedelta
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(5)
initial_count=len(data['records'])
now=datetime.now(timezone.utc)
data['activeStart']=(now-timedelta(hours=2)).isoformat().replace('+00:00','Z')
data['activeGoalHours']=16
data['activeTimeZone']='UTC'
data['activeCreatedAt']=data['activeStart']
data['activeModifiedAt']=None
original_start=data['activeStart']

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; dialogs=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.on('dialog',lambda d:(dialogs.append(d.message),d.dismiss()))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.1',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.1'",timeout=20000)
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Stop')",timeout=10000)

    # Stop opens one app modal; dismissing it must keep the fast running.
    original_status=page.locator('#statusText').inner_text()
    page.locator('#toggleFast').click()
    page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    if dialogs:
        print('FAIL: stop flow used a native confirm/dialog instead of the app modal'); sys.exit(1)
    if '2h' not in page.locator('#stopFastModalText').inner_text():
        print('FAIL: stop confirmation does not show elapsed duration'); sys.exit(1)
    page.locator('#keepFastingBtn').click()
    page.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    page.wait_for_function("document.querySelector('#fasting')?.classList.contains('active')",timeout=5000)
    if 'Stop' not in page.locator('#toggleFast').inner_text():
        print('FAIL: Keep fasting ended the active fast'); sys.exit(1)
    page.wait_for_timeout(400)

    # One explicit Stop & save action ends it and reveals Undo.
    page.locator('#toggleFast').click()
    page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page.locator('#stopAndSaveBtn').click()
    page.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Start')",timeout=5000)
    page.locator('#stopUndoBar').wait_for(state='visible',timeout=5000)
    countdown=page.locator('#stopUndoCountdown').inner_text().strip()
    if not countdown.endswith('s') or not countdown[:-1].isdigit() or not (1 <= int(countdown[:-1]) <= 10):
        print('FAIL: Undo countdown is not visible or valid'); sys.exit(1)
    page.wait_for_timeout(1100)
    countdown2=page.locator('#stopUndoCountdown').inner_text().strip()
    if int(countdown2[:-1]) >= int(countdown[:-1]):
        print('FAIL: Undo countdown did not decrease'); sys.exit(1)
    page.locator('.tab[data-screen="history"]').click()
    page.wait_for_function(f"document.querySelectorAll('#historyList .historyRow').length === {initial_count + 1}",timeout=5000)

    # Undo must remove the newly saved record and restore the original active fast.
    page.locator('#stopUndoBtn').click()
    page.wait_for_function(f"document.querySelectorAll('#historyList .historyRow').length === {initial_count}",timeout=5000)
    if 'restored' not in page.locator('#stopUndoText').inner_text().lower():
        print('FAIL: Undo did not provide restored feedback'); sys.exit(1)
    page.locator('.tab[data-screen="fasting"]').click()
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Stop')",timeout=5000)
    if page.locator('#statusText').inner_text() != original_status:
        print('FAIL: Undo did not restore the original active fasting start'); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: stop flow uses one confirmation plus reversible Undo')
