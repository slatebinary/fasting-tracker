#!/usr/bin/env python3
"""Regression: optional stop activities, immediate stop, safety bypass and Undo."""
import sys, json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

APP_VERSION=json.loads((Path(__file__).resolve().parents[1]/'version.json').read_text())['version']

def seed_active(page, elapsed_hours=2):
    data=build_data(3)
    now=datetime.now(timezone.utc)
    data['activeStart']=(now-timedelta(hours=elapsed_hours)).isoformat().replace('+00:00','Z')
    data['activeGoalHours']=16
    data['activeTimeZone']='UTC'
    data['activeCreatedAt']=data['activeStart']
    data['activeModifiedAt']=None
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.21.20',seenAt:new Date().toISOString()})); localStorage.setItem('fastingTracker.shorterGoal', JSON.stringify({start:data.activeStart,checkpointAt:Date.now()+60000,offered:true})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent === 'v{APP_VERSION}'",timeout=20000)
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Stop')",timeout=10000)
    return data

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    errors=[]
    page=browser.new_page(viewport={'width':390,'height':844})
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    seed_active(page)
    encouragement=page.locator('#fastingEncouragement')
    if not encouragement.is_visible() or 'feel well' not in encouragement.inner_text().lower():
        print('FAIL: active fast does not retain safety-aware encouragement'); sys.exit(1)

    page.locator('#toggleFast').click()
    page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    if not page.locator('#stopActivity').is_visible():
        print('FAIL: optional activity suggestions are not shown for a normal stop'); sys.exit(1)
    if not page.locator('#stopAndSaveBtn').is_visible() or not page.locator('#keepFastingBtn').is_visible():
        print('FAIL: immediate Stop & Save and Keep fasting actions are not both available'); sys.exit(1)
    if page.evaluate("localStorage.getItem('fastingTracker.shorterGoal')") is not None:
        print('FAIL: obsolete shorter-goal checkpoint state was not cleared'); sys.exit(1)

    page.locator('#stopActivityPuzzleBtn').click()
    question1=page.locator('#stopActivityText').inner_text()
    if not question1 or not page.locator('#stopActivityAnswerBtn').is_visible():
        print('FAIL: quick puzzle does not present a question and answer control'); sys.exit(1)
    if page.locator('#stopActivityAnswer').is_visible():
        print('FAIL: puzzle answer is exposed before the user asks to see it'); sys.exit(1)
    page.locator('#stopActivityAnswerBtn').click()
    if not page.locator('#stopActivityAnswer').is_visible() or not page.locator('#stopActivityAnswer').inner_text():
        print('FAIL: puzzle answer is not revealed on request'); sys.exit(1)
    page.locator('#stopActivityNextBtn').click()
    if page.locator('#stopActivityText').inner_text()==question1:
        print('FAIL: Another puzzle did not provide a different challenge'); sys.exit(1)
    if not page.locator('#stopAndSaveBtn').is_visible():
        print('FAIL: Stop & Save disappeared while an activity was displayed'); sys.exit(1)

    page.locator('#keepFastingBtn').click()
    page.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    if 'Stop' not in page.locator('#toggleFast').inner_text():
        print('FAIL: Keep fasting ended the active fast'); sys.exit(1)

    page.wait_for_timeout(400)
    page.locator('#toggleFast').click()
    page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page.locator('#stopAndSaveBtn').click()
    page.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    page.locator('#stopUndoBar').wait_for(state='visible',timeout=5000)
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Start')",timeout=5000)

    page2=browser.new_page(viewport={'width':390,'height':844})
    page2.on('pageerror',lambda exc:errors.append(str(exc)))
    seed_active(page2, elapsed_hours=17.95)
    page2.locator('#toggleFast').click()
    page2.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    if not page2.locator('#stopActivity').is_visible():
        print('FAIL: activity suggestions are missing after the target has been reached'); sys.exit(1)
    page2.locator('#stopActivityMovementBtn').click()
    if 'walk' not in page2.locator('#stopActivityText').inner_text().lower():
        print('FAIL: gentle movement option does not provide usable activity instructions'); sys.exit(1)
    page2.locator('#stopAndSaveBtn').click()
    page2.locator('#stopUndoBar').wait_for(state='visible',timeout=5000)

    page3=browser.new_page(viewport={'width':390,'height':844})
    page3.on('pageerror',lambda exc:errors.append(str(exc)))
    seed_active(page3)
    page3.locator('#toggleFast').click()
    page3.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page3.locator('#stopReasonSelect').select_option('health-safety')
    if page3.locator('#stopActivity').is_visible():
        print('FAIL: health/safety stop still displays activity suggestions'); sys.exit(1)
    page3.locator('#stopAndSaveBtn').click()
    page3.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    page3.locator('#stopUndoBar').wait_for(state='visible',timeout=5000)
    page3.locator('#stopUndoBtn').click()
    page3.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Stop')",timeout=5000)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: optional stop activities, direct stop, safety bypass, repeat attempts and Undo')
