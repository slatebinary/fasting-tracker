#!/usr/bin/env python3
"""Regression: time-left encouragement, half-remaining checkpoint and safety bypass."""
import sys, json
from pathlib import Path
from datetime import datetime, timezone, timedelta
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

APP_VERSION=json.loads((Path(__file__).resolve().parents[1]/'version.json').read_text())['version']

def seed_active(page, reason='personal'):
    data=build_data(3)
    now=datetime.now(timezone.utc)
    data['activeStart']=(now-timedelta(hours=2)).isoformat().replace('+00:00','Z')
    data['activeGoalHours']=16
    data['activeTimeZone']='UTC'
    data['activeCreatedAt']=data['activeStart']
    data['activeModifiedAt']=None
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.17.9',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent === 'v{APP_VERSION}'",timeout=20000)
    page.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Stop')",timeout=10000)
    return data

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    seed_active(page)
    encouragement=page.locator('#fastingEncouragement')
    if not encouragement.is_visible() or 'feel well' not in encouragement.inner_text().lower() or 'target' not in encouragement.inner_text().lower():
        print('FAIL: active fast does not show supportive time-remaining encouragement'); sys.exit(1)

    # Declining the original target offers exactly half the time remaining,
    # measured at the moment Stop & save is selected.
    page.locator('#toggleFast').click()
    page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page.locator('#stopAndSaveBtn').click()
    if 'continue to your original target' not in page.locator('#stopFastModalText').inner_text().lower():
        print('FAIL: shorter-step prompt does not encourage continuing to the original target'); sys.exit(1)
    if 'half the time remaining' not in page.locator('#stopFastModalText').inner_text().lower():
        print('FAIL: shorter-step offer does not explain the half-remaining calculation'); sys.exit(1)
    continue_label=page.locator('#keepFastingBtn').inner_text().lower()
    if 'continue for' not in continue_label:
        print('FAIL: shorter-step acceptance button does not show the proposed duration'); sys.exit(1)
    if not page.locator('#continueOriginalTargetBtn').is_visible():
        print('FAIL: shorter-step offer omits the original-target choice'); sys.exit(1)
    if 'original target' not in page.locator('#continueOriginalTargetBtn').inner_text().lower():
        print('FAIL: original-target choice is not clearly labelled'); sys.exit(1)
    if page.evaluate("document.activeElement?.id") != 'continueOriginalTargetBtn':
        print('FAIL: focus does not default to continuing to the original target'); sys.exit(1)
    page.locator('#keepFastingBtn').click()
    page.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    if 'Stop' not in page.locator('#toggleFast').inner_text():
        print('FAIL: accepting shorter step ended the active fast'); sys.exit(1)
    state=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.shorterGoal') || 'null')")
    if not state or state.get('start') is None or state.get('offered') is not True:
        print('FAIL: accepted shorter step was not recorded as an active checkpoint'); sys.exit(1)
    if not (6*3600000 <= state['checkpointAt']-page.evaluate('Date.now()') <= 7*3600000):
        print('FAIL: checkpoint is not approximately half of the 14 hours remaining'); sys.exit(1)
    page.evaluate("() => { const x=JSON.parse(localStorage.getItem('fastingTracker.shorterGoal')); x.checkpointAt=Date.now()-1000; localStorage.setItem('fastingTracker.shorterGoal',JSON.stringify(x)); }")
    page.wait_for_function("document.querySelector('#fastingEncouragement')?.textContent.toLowerCase().includes('completed the shorter step')",timeout=5000)

    # The shorter offer is one-time for this active fast; a later stop saves normally.
    page.wait_for_timeout(400)
    page.locator('#toggleFast').click()
    page.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page.locator('#stopAndSaveBtn').click()
    page.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    page.locator('#stopUndoBar').wait_for(state='visible',timeout=5000)

    # A health/safety stop bypasses any extension suggestion.
    page2=browser.new_page(viewport={'width':390,'height':844})
    page2.on('pageerror',lambda exc:errors.append(str(exc)))
    seed_active(page2)
    page2.locator('#toggleFast').click()
    page2.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page2.locator('#stopReasonSelect').select_option('health-safety')
    page2.locator('#stopAndSaveBtn').click()
    page2.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    page2.wait_for_function("document.querySelector('#toggleFast')?.textContent.includes('Start')",timeout=5000)
    # Choosing the original target must be an explicit third option. It keeps
    # the active fast running, leaves its target unchanged and does not create
    # a half-time checkpoint or repeat the offer for this same fast.
    page3=browser.new_page(viewport={'width':390,'height':844})
    page3.on('pageerror',lambda exc:errors.append(str(exc)))
    seed_active(page3)
    page3.locator('#toggleFast').click()
    page3.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page3.locator('#stopAndSaveBtn').click()
    page3.locator('#continueOriginalTargetBtn').wait_for(state='visible',timeout=3000)
    page3.locator('#continueOriginalTargetBtn').click()
    page3.locator('#stopFastModal').wait_for(state='hidden',timeout=5000)
    if 'Stop' not in page3.locator('#toggleFast').inner_text():
        print('FAIL: original-target choice ended the active fast'); sys.exit(1)
    original_state=page3.evaluate("JSON.parse(localStorage.getItem('fastingTracker.shorterGoal') || 'null')")
    if not original_state or original_state.get('offered') is not True or original_state.get('checkpointAt') != 0:
        print('FAIL: original-target choice was not recorded without a shorter checkpoint'); sys.exit(1)
    if '16' not in page3.locator('#goalText').inner_text():
        print('FAIL: original fasting target display changed after choosing to continue'); sys.exit(1)
    page3.locator('#toggleFast').click()
    page3.locator('#stopFastModal').wait_for(state='visible',timeout=5000)
    page3.locator('#stopAndSaveBtn').click()
    if page3.locator('#continueOriginalTargetBtn').is_visible():
        print('FAIL: the same fast received the early-stop offer more than once'); sys.exit(1)
    page3.locator('#stopAndSaveBtn').click()
    page3.locator('#stopUndoBar').wait_for(state='visible',timeout=5000)

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: encouragement, half-remaining checkpoint, one-time offer and health/safety bypass')
