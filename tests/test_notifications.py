#!/usr/bin/env python3
"""Regression: opt-in notification preferences, permission request and deduped target/safety alerts."""
import sys
from datetime import datetime, timezone, timedelta
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""() => {
      window.__ftNotifications=[];
      const MockNotification={
        permission:'default',
        requestPermission:async()=>{ MockNotification.permission='granted'; return 'granted'; }
      };
      Object.defineProperty(window,'Notification',{value:MockNotification,configurable:true});
      const registration={showNotification:async(title,options)=>{window.__ftNotifications.push({title,options});}};
      const sw={ready:Promise.resolve(registration),register:async()=>({}),addEventListener:()=>{},controller:null};
      Object.defineProperty(navigator,'serviceWorker',{value:sw,configurable:true});
    }""")
    data=build_data(0)
    now=datetime.now(timezone.utc)
    start=now-timedelta(hours=25)
    data.update({
        'goalHours':18,
        'activeStart':start.isoformat().replace('+00:00','Z'),
        'activeGoalHours':18,
        'activeTimeZone':'UTC',
        'activeCreatedAt':start.isoformat().replace('+00:00','Z'),
        'activeModifiedAt':None,
    })
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.0',seenAt:new Date().toISOString()})); }", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.0'",timeout=20000)
    page.locator('.tab[data-screen="settings"]').click(); page.locator('#settingsGroupNotifications > summary').click()
    page.wait_for_function("document.querySelector('#notificationsCard') && !document.querySelector('#notificationsCard').hidden",timeout=5000)

    defaults={
        'notificationMasterToggle':False,
        'notificationTargetToggle':True,
        'notificationBackupToggle':True,
        'notificationSafetyToggle':True,
        'notificationWeighToggle':False,
        'notificationCycleToggle':False,
    }
    for control,expected in defaults.items():
        actual=page.locator('#'+control).is_checked()
        if actual != expected:
            print(f'FAIL: {control} default is {actual}, expected {expected}'); sys.exit(1)
    if page.locator('#notificationWeighCadence').input_value() != 'weekly':
        print('FAIL: weigh-in reminder cadence does not default to weekly'); sys.exit(1)
    # Cadence must be selectable even while the weigh-in reminder itself is off.
    if page.locator('#notificationWeighDailyBtn').is_disabled() or page.locator('#notificationWeighWeeklyBtn').is_disabled():
        print('FAIL: weigh-in cadence controls are disabled while reminder is off'); sys.exit(1)
    page.locator('#notificationWeighDailyBtn').click()
    page.wait_for_function("document.querySelector('#notificationWeighCadence')?.value === 'daily'",timeout=5000)
    if page.locator('#notificationWeighDailyBtn').get_attribute('aria-pressed') != 'true':
        print('FAIL: Daily cadence did not become visibly selected'); sys.exit(1)
    # Turning the reminder on must keep the cadence that was preselected.
    page.locator('#notificationWeighToggle').click()
    page.wait_for_function("document.querySelector('#notificationWeighToggle')?.checked && document.querySelector('#notificationWeighCadence')?.value === 'daily'",timeout=5000)
    page.locator('#notificationWeighWeeklyBtn').click()
    page.wait_for_function("document.querySelector('#notificationWeighCadence')?.value === 'weekly'",timeout=5000)
    if page.locator('#notificationWeighWeeklyBtn').get_attribute('aria-pressed') != 'true':
        print('FAIL: Weekly cadence did not become visibly selected'); sys.exit(1)
    if 'no push server' not in page.locator('#notificationsCard').inner_text().lower():
        print('FAIL: notification delivery limitation is not disclosed'); sys.exit(1)
    if 'lock screen' not in page.locator('#notificationsCard').inner_text().lower():
        print('FAIL: lock-screen privacy warning is missing'); sys.exit(1)

    page.locator('#notificationMasterToggle').click()
    page.wait_for_function("document.querySelector('#notificationPermissionBadge')?.textContent === 'On'",timeout=5000)
    page.wait_for_function("window.__ftNotifications.length >= 2",timeout=5000)
    sent=page.evaluate("window.__ftNotifications.map(x=>x.title)")
    if not any('target' in x.lower() for x in sent) or not any('safety' in x.lower() for x in sent):
        print('FAIL: enabling notifications did not emit due target + safety alerts:',sent); sys.exit(1)
    before=len(sent)
    # Turning the master switch off and back on re-runs due-condition checks,
    # but already-delivered target/safety notifications must stay deduplicated.
    page.locator('#notificationMasterToggle').click()
    page.locator('#notificationMasterToggle').click()
    page.wait_for_timeout(350)
    if page.evaluate("window.__ftNotifications.length") != before:
        print('FAIL: due fast notifications were not deduplicated'); sys.exit(1)

    page.locator('#notificationTestBtn').click()
    page.wait_for_function(f"window.__ftNotifications.length === {before+1}",timeout=5000)
    test=page.evaluate("window.__ftNotifications[window.__ftNotifications.length-1]")
    if 'working' not in test['options']['body'].lower():
        print('FAIL: test notification content unexpected:',test); sys.exit(1)


    denied=browser.new_page(viewport={'width':390,'height':844})
    denied.evaluate(STORAGE_SHIM)
    denied.evaluate("""() => {
      const MockNotification={permission:'denied',requestPermission:async()=> 'denied'};
      Object.defineProperty(window,'Notification',{value:MockNotification,configurable:true});
      const sw={ready:Promise.resolve({showNotification:async()=>{}}),register:async()=>({}),addEventListener:()=>{},controller:null};
      Object.defineProperty(navigator,'serviceWorker',{value:sw,configurable:true});
    }""")
    denied_data=build_data(1)
    denied.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.0'})); }", denied_data)
    denied.set_content(inlined_html(),wait_until='domcontentloaded')
    denied.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.0'",timeout=20000)
    denied.locator('.tab[data-screen="settings"]').click(); denied.locator('#settingsGroupNotifications > summary').click()
    denied.wait_for_function("!document.querySelector('#notificationBlockedHelp')?.hidden",timeout=5000)
    help_text=denied.locator('#notificationBlockedHelp').inner_text()
    if 'Settings' not in help_text or 'Notifications' not in help_text or 'JSON backup' not in help_text:
        print('FAIL: blocked notification recovery guidance is incomplete:',help_text);sys.exit(1)
    denied.close()

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: optional notifications, permission opt-in, defaults and duplicate suppression')
