#!/usr/bin/env python3
"""Regression: concise device notifications keep full, dismissible details inside the app."""
import json, sys
from datetime import datetime, timezone, timedelta
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

SHORT_KEYS=['notifications.testBodyShort','notifications.targetBodyShort','notifications.backupBodyShort','notifications.safetyBodyShort','notifications.weighBodyShort','notifications.cycleBodyShort']
for lang in ('en','bg','es'):
    strings=json.load(open(f'i18n/{lang}.json',encoding='utf-8'))
    for key in SHORT_KEYS:
        body=strings.get(key,'')
        if not body or len(body)>72:
            print(f'FAIL: {lang} {key} is missing or too long ({len(body)} chars): {body}'); sys.exit(1)
    for key in ('notifications.targetDetails','notifications.backupDetails','notifications.safetyDetails','notifications.weighDetails','notifications.cycleDetails','notifications.testDetails'):
        if len(strings.get(key,'')) <= len(strings.get(key.replace('Details','BodyShort'),'')):
            # The full text need not map one-to-one for every key, but it must exist and be substantive.
            if len(strings.get(key,'')) < 45:
                print(f'FAIL: {lang} {key} is not a substantive full-detail message'); sys.exit(1)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""() => {
      window.__ftNotifications=[];
      const MockNotification={permission:'granted',requestPermission:async()=> 'granted'};
      Object.defineProperty(window,'Notification',{value:MockNotification,configurable:true});
      const registration={showNotification:async(title,options)=>{window.__ftNotifications.push({title,options});}};
      const sw={ready:Promise.resolve(registration),register:async()=>({}),addEventListener:()=>{},controller:null};
      Object.defineProperty(navigator,'serviceWorker',{value:sw,configurable:true});
    }""")
    data=build_data(0)
    now=datetime.now(timezone.utc); start=now-timedelta(hours=25)
    data.update({'goalHours':18,'activeStart':start.isoformat().replace('+00:00','Z'),'activeGoalHours':18,'activeTimeZone':'UTC','activeCreatedAt':start.isoformat().replace('+00:00','Z'),'activeModifiedAt':None,'notificationPreferences':{'enabled':True,'targetReached':True,'backupDue':False,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False}})
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.12.1'})); }",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.1'",timeout=20000)
    page.wait_for_function("window.__ftNotifications.length >= 2",timeout=7000)
    notifications=page.evaluate("window.__ftNotifications")
    bodies=[n['options']['body'] for n in notifications]
    if any(len(body)>72 for body in bodies):
        print('FAIL: emitted device notification is too long:',bodies); sys.exit(1)
    page.wait_for_function("document.querySelectorAll('#notificationDetailStack .notificationDetailCard').length >= 2",timeout=5000)
    stack=page.locator('#notificationDetailStack')
    if stack.is_hidden(): print('FAIL: in-app notification details stack is hidden'); sys.exit(1)
    text=stack.inner_text()
    if 'continuing longer is optional' not in text or '24 hours' not in text:
        print('FAIL: full target/safety details are not visible inside app:',text); sys.exit(1)
    if 'Dismiss' not in text:
        print('FAIL: notification details are not dismissible'); sys.exit(1)
    before=page.locator('#notificationDetailStack .notificationDetailCard').count()
    page.locator('#notificationDetailStack .notificationDetailDismiss').first.click()
    page.wait_for_function(f"document.querySelectorAll('#notificationDetailStack .notificationDetailCard').length === {before-1}",timeout=3000)
    stored=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.notificationState')||'{}').details || []")
    if len(stored)!=before-1:
        print('FAIL: dismissed notification detail was not removed from local state:',stored); sys.exit(1)
    # Test notification must also use concise system copy and create/replace one detail by tag.
    page.locator('.tab[data-screen="settings"]').click(); page.locator('#settingsGroupNotifications > summary').click()
    page.locator('#notificationTestBtn').click(); page.wait_for_timeout(250)
    last=page.evaluate("window.__ftNotifications[window.__ftNotifications.length-1]")
    if len(last['options']['body'])>72 or 'working' not in last['options']['body'].lower():
        print('FAIL: test notification is not concise:',last); sys.exit(1)
    page.wait_for_function("document.querySelector('#notificationDetailStack')?.innerText.includes('no action is required')",timeout=3000)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:4])); sys.exit(1)
    browser.close()
print('PASS: short device notifications retain full dismissible in-app details')
