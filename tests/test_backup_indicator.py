#!/usr/bin/env python3
"""Browser regression of fasting-header manual JSON backup freshness indicator."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from browser_perf_common import STORAGE_SHIM, build_data, inlined_html
from playwright.sync_api import sync_playwright

CURRENT_VERSION=json.loads((Path(__file__).resolve().parents[1] / 'version.json').read_text(encoding='utf-8'))['version']
HTML = inlined_html()
DATA = build_data(1)

def boot(page, backup_meta=None):
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""arg => {
      __seedFastingDbV2(arg.data,[]);
      localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.17.17'}));
      if (arg.meta) localStorage.setItem('fastingTracker.backupMeta', JSON.stringify(arg.meta));
    }""", {'data':DATA, 'meta':backup_meta})
    page.set_content(HTML, wait_until='domcontentloaded')
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{CURRENT_VERSION}'", timeout=30000)
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
    chip_text=page.locator('#fastingBackupStatusText').inner_text()
    assert ' — ' in chip_text and __import__('re').search(r'\d{1,2}:\d{2}',chip_text), chip_text
    assert 'no changes since the last external JSON backup' in chip_text.lower(), chip_text
    # Green confirmation is temporary; the underlying Settings status persists.
    page.wait_for_timeout(7300)
    assert page.locator('#fastingBackupRow').is_visible(), 'Current backup status must remain visible after the temporary confirmation period'
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
    assert page.locator('#fastingBackupRow').is_visible(), 'Current backup status must remain visible after preference changes'
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
    page.wait_for_function("document.querySelector('#stopAndSaveBtn')?.textContent.includes('End my fast')",timeout=5000)
    page.wait_for_timeout(300)  # Let the reliable modal-action lock expire before the second activation.
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
      localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.17.17'}));
      localStorage.setItem('fastingTracker.backupMeta',JSON.stringify(arg.meta));
    }""", {'data':snapshot,'meta':old})
    page2.set_content(HTML,wait_until='domcontentloaded')
    page2.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{CURRENT_VERSION}'",timeout=30000)
    status(page2,'aged')
    assert not errors2, errors2[:5]

    # The export timestamp is an absolute instant. Rendering it after the
    # device timezone changes must use the new device timezone, not an offset
    # captured when the export was made.
    timezone_meta=dict(meta)
    timezone_meta['lastExternalBackupAt']='2026-01-15T12:34:00.000Z'
    utc_page=browser.new_page(viewport={'width':390,'height':844},timezone_id='UTC')
    sofia_page=browser.new_page(viewport={'width':390,'height':844},timezone_id='Europe/Sofia')
    boot(utc_page,timezone_meta)
    boot(sofia_page,timezone_meta)
    for tz_page in (utc_page,sofia_page):
        tz_page.on('dialog', lambda dialog: dialog.accept())
        # Export now so the test checks the exact current-backup status, not
        # merely the separate historical timestamp field.
        with tz_page.expect_download(timeout=15000):
            tz_page.locator('#fastingBackupStatusBtn').click()
        tz_page.wait_for_function("document.querySelector('#backupFreshnessLabel')?.textContent.includes('—')",timeout=5000)
        tz_page.locator('[data-screen="settings"]').click()
        tz_page.wait_for_function("document.querySelector('#lastBackupLabel')?.textContent.includes(':')",timeout=5000)
    utc_status=utc_page.locator('#backupFreshnessLabel').text_content() or ''
    sofia_status=sofia_page.locator('#backupFreshnessLabel').text_content() or ''
    utc_chip=utc_page.locator('#fastingBackupStatusText').text_content() or ''
    sofia_chip=sofia_page.locator('#fastingBackupStatusText').text_content() or ''
    assert ':' in utc_status and ':' in sofia_status, f'Current-backup status omits export time: UTC={utc_status!r}, Sofia={sofia_status!r}'
    assert utc_status != sofia_status, f'Current-backup status did not follow device timezone: UTC={utc_status!r}, Sofia={sofia_status!r}'
    assert utc_chip != sofia_chip, f'Visible backup chip did not follow device timezone: UTC={utc_chip!r}, Sofia={sofia_chip!r}'
    # The backup summary lives inside a collapsible Settings group. Read its
    # rendered text node content without requiring the group to be expanded.
    utc_label=utc_page.locator('#lastBackupLabel').text_content() or ''
    sofia_label=sofia_page.locator('#lastBackupLabel').text_content() or ''
    assert utc_label != sofia_label, f'Backup timestamp did not follow device timezone: UTC={utc_label!r}, Sofia={sofia_label!r}'
    assert ':' in utc_label and ':' in sofia_label, f'Backup timestamp is missing local time: UTC={utc_label!r}, Sofia={sofia_label!r}'
    assert not errors2, errors2[:5]
    browser.close()
print('PASS: persistent backup indicator red/green/amber, cancel safety, preference isolation, active fast and weight change, device-local timestamp, accessible button')
