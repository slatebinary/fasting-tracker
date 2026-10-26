#!/usr/bin/env python3
"""Browser regression of fasting-header manual JSON backup freshness indicator."""
import json
from datetime import datetime, timedelta, timezone
from browser_perf_common import STORAGE_SHIM, build_data, inlined_html
from playwright.sync_api import sync_playwright

HTML = inlined_html()
DATA = build_data(1)

def boot(page, backup_meta=None):
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""arg => {
      __seedFastingDbV2(arg.data,[]);
      localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.8'}));
      if (arg.meta) localStorage.setItem('fastingTracker.backupMeta', JSON.stringify(arg.meta));
    }""", {'data':DATA, 'meta':backup_meta})
    page.set_content(HTML, wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.13.3'", timeout=30000)
    page.wait_for_function("document.querySelector('#fastingBackupStatusBtn')?.dataset.state!=='empty'", timeout=30000)

def status(page, expected):
    page.wait_for_function('(x)=>document.querySelector("#fastingBackupStatusBtn")?.dataset.state===x', arg=expected, timeout=15000)
    button=page.locator('#fastingBackupStatusBtn')
    assert button.is_visible(), f'Backup indicator hidden in {expected}'
    assert button.get_attribute('aria-label') and button.get_attribute('title'), 'Missing accessibility description'
    assert button.bounding_box()['height'] >= 43, 'Tap target too short'
    coords=page.evaluate('''()=>{
      const head=document.querySelector('#fasting .fastingSectionHeader').getBoundingClientRect();
      const h1=document.querySelector('#fasting .fastingSectionHeader h1').getBoundingClientRect();
      const share=document.querySelector('#shareProgressBtn').getBoundingClientRect();
      const backup=document.querySelector('#fastingBackupRow').getBoundingClientRect();
      return {headingTop:h1.top,shareTop:share.top,headingRight:h1.right,
              shareLeft:share.left,headerBottom:head.bottom,backupTop:backup.top};
    }''')
    assert abs(coords['headingTop']-coords['shareTop'])<12, f'Header not on one line: {coords}'
    assert coords['headingRight']<=coords['shareLeft']+2, f'Share not at right: {coords}'
    assert coords['backupTop']>=coords['headerBottom'], f'Backup not below header: {coords}'

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}, accept_downloads=True)
    errors=[]; decision=[False]+[True]*20
    page.on('pageerror', lambda e: errors.append(str(e)))
    def dialog(d):
        if 'backup' in d.message.lower() or 'json' in d.message.lower():
            if decision.pop(0): d.accept()
            else: d.dismiss()
        else: d.accept()
    page.on('dialog',dialog)
    boot(page)
    status(page,'never')
    page.locator('#fastingBackupStatusBtn').click()
    status(page,'never')  # cancelled download must not claim backup
    page.locator('#fastingBackupStatusBtn').click()
    status(page,'current')
    # Green confirmation is temporary; the underlying Settings status persists.
    page.wait_for_timeout(7300)
    assert page.locator('#fastingBackupRow').is_hidden(), 'Green badge must disappear'
    assert page.locator('#shareProgressBtn').is_visible(), 'Share action must remain available'
    meta=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.backupMeta'))")
    assert meta.get('lastExternalBackupDataSignature','').startswith('v1:'),meta
    # Changing an appearance preference may update general revision, but it
    # does NOT alter the fasting/weight dataset and should remain green.
    page.locator('[data-screen="settings"]').click()
    page.select_option('#languageSelect', 'bg')
    page.select_option('#languageSelect', 'en')
    page.locator('[data-screen="fasting"]').click()
    page.wait_for_function("document.querySelector('#fastingBackupStatusBtn')?.dataset.state==='current'")
    assert page.locator('#fastingBackupRow').is_hidden(), 'No permanent green badge'
    # Start a fast: the recorded export is now missing the active fast.
    page.locator('#toggleFast').click()
    status(page,'stale')
    page.locator('#fastingBackupStatusBtn').click()
    status(page,'current')
    meta=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.backupMeta'))")
    # Save the live snapshot at the exact time of export for the age test.
    exported_snapshot=page.evaluate("""async ()=>{let db=await new Promise((ok,bad)=>{let r=indexedDB.open('FastingTrackerDB',2);r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});let out={};for(let name of ['records','weights','deletedFasts','deletedWeights'])out[name]=await new Promise((ok,bad)=>{let r=db.transaction(name,'readonly').objectStore(name).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});let state=await new Promise((ok,bad)=>{let r=db.transaction('state','readonly').objectStore('state').get('settings');r.onsuccess=()=>ok(r.result);r.onerror=()=>bad(r.error)});return {...state.data,...out};}""")
    # Weight addition after manual export must immediately show stale.
    page.locator('[data-screen="weight"]').click()
    page.locator('#addWeightBtn').click()
    page.locator('#weightValueInput').fill('78.2')
    page.locator('#weightSaveBtn').click()
    page.locator('[data-screen="fasting"]').click()
    status(page,'stale')
    page.locator('#fastingBackupStatusBtn').click()
    status(page,'current')
    # Editing an existing weight invalidates the recorded backup too.
    page.locator('[data-screen="weight"]').click()
    page.locator('#weightHistoryList .historyActions button.secondary').first.click()
    page.locator('#weightValueInput').fill('78.4')
    page.locator('#weightSaveBtn').click()
    page.locator('[data-screen="fasting"]').click()
    status(page,'stale')
    page.locator('#fastingBackupStatusBtn').click()
    status(page,'current')
    page.locator('[data-screen="weight"]').click()
    page.locator('#weightHistoryList .historyActions button.dangerText').first.click()
    page.locator('[data-screen="fasting"]').click()
    status(page,'stale')
    page.locator('#fastingBackupStatusBtn').click()
    status(page,'current')
    # Stopping a fast creates a new completed history record.
    page.locator('#toggleFast').click()
    page.wait_for_function("!document.querySelector('#stopFastModal').hidden")
    page.locator('#stopAndSaveBtn').click()
    status(page,'stale')
    assert not errors, errors[:5]
    # An older export with the very same signature receives an amber reminder,
    # not a red 'records changed' warning.
    old=dict(meta)
    old['lastExternalBackupAt']=(datetime.now(timezone.utc)-timedelta(days=9)).isoformat().replace('+00:00','Z')
    page2=browser.new_page(viewport={'width':390,'height':844}, accept_downloads=True)
    errors2=[];page2.on('pageerror',lambda e:errors2.append(str(e)))
    # The second page starts with the active fast included in the last export.
    # This seed is built from the app's live state via IDB for exact equivalence.
    snapshot=exported_snapshot
    page2.evaluate(STORAGE_SHIM)
    page2.evaluate("""arg=>{
      __seedFastingDbV2(arg.data,[]);
      localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.8'}));
      localStorage.setItem('fastingTracker.backupMeta',JSON.stringify(arg.meta));
    }""", {'data':snapshot,'meta':old})
    page2.set_content(HTML,wait_until='domcontentloaded')
    page2.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.13.3'",timeout=30000)
    status(page2,'aged')
    assert not errors2, errors2[:5]
    browser.close()
print('PASS: backup indicator red/green/amber, cancel safety, preference isolation, active fast and weight change, accessible button')
