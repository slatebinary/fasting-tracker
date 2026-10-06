#!/usr/bin/env python3
"""Fault regressions: detect snapshot corruption and reject tampered v2 backups without changing live data."""
from pathlib import Path
import json, tempfile, sys
from playwright.sync_api import sync_playwright
from browser_perf_common import STORAGE_SHIM, inlined_html

DATA={
 'dataVersion':1,'revision':5,'updatedAt':'2026-10-01T12:00:00.000Z','goalHours':16,
 'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,
 'records':[{'id':'keep-fast','start':'2026-10-01T00:00:00.000Z','end':'2026-10-01T16:00:00.000Z','goalHours':16,'timeZone':'UTC','createdAt':'2026-10-01T16:00:00.000Z','modifiedAt':None,'editHistory':[]}],
 'deletedFasts':[],'weights':[],'deletedWeights':[],'weightUnit':'kg','targetWeightKg':None,'gamificationEnabled':True,
 'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},
 'language':'en','appearance':'system','iconChoice':'plate'
}

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(accept_downloads=True,viewport={'width':390,'height':844})
    dialogs=[]
    page.on('dialog',lambda d:(dialogs.append(d.message),d.accept()))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("d=>{__seedFastingDbV2(d,[['2026-10-01',57600000]]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.6'}));}",DATA)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.11.6'",timeout=20000)
    page.locator('.tab[data-screen="settings"]').click(); page.wait_for_timeout(300)

    # Create a valid snapshot then remove only its payload to simulate partial/corrupt local recovery storage.
    page.locator('#createSnapshotBtn').click(); page.locator('#manualSnapshotSaveBtn').click(); page.wait_for_timeout(300)
    sid=page.evaluate("""() => new Promise((resolve,reject)=>{const q=indexedDB.open('FastingTrackerDB',2);q.onsuccess=()=>{const tx=q.result.transaction('snapshotMeta','readonly'),r=tx.objectStore('snapshotMeta').getAll();r.onsuccess=()=>resolve(r.result.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)))[0].id);r.onerror=()=>reject(r.error)};q.onerror=()=>reject(q.error)})""")
    page.evaluate("""id => new Promise((resolve,reject)=>{const q=indexedDB.open('FastingTrackerDB',2);q.onsuccess=()=>{const tx=q.result.transaction('snapshotPayload','readwrite');tx.objectStore('snapshotPayload').delete(id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)};q.onerror=()=>reject(q.error)})""",sid)
    page.locator('#integrityCheckBtn').click(); page.wait_for_function("!document.querySelector('#integrityModal').hidden")
    itext=page.locator('#integrityModal').inner_text().lower()
    assert 'metadata but no payload' in itext, itext
    page.locator('#integrityCloseBtn').click()

    # Export a valid v2 backup, tamper data without updating its checksum, then import it.
    dialogs.clear()
    with page.expect_download(timeout=10000) as info:
        page.locator('#exportBtn').click()
    raw=json.loads(Path(info.value.path()).read_text(encoding='utf-8'))
    raw['data']['goalHours']=23
    fd,tmp=tempfile.mkstemp(suffix='.json'); Path(tmp).write_text(json.dumps(raw),encoding='utf-8')
    page.set_input_files('#importFile',tmp)
    page.wait_for_timeout(600)
    assert any('not a valid' in m.lower() for m in dialogs), dialogs
    # Failed/tampered import must not change live primary data.
    page.locator('.tab[data-screen="fasting"]').click(); page.wait_for_timeout(100)
    goal=page.locator('#goalText').inner_text()
    assert '16' in goal, goal
    Path(tmp).unlink(missing_ok=True)
    browser.close()
print('PASS: corrupt snapshot detection and tampered-backup rejection preserve live data')
