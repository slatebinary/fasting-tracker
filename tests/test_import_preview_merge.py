#!/usr/bin/env python3
"""Regression: import preview + safe merge without duplicate/conflicting corruption."""
import sys, json, tempfile
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

local=build_data(1)
# Move the local record far enough into the past to avoid overlap.
local['records'][0]['id']='local-fast'; local['records'][0]['start']='2026-01-01T18:00:00.000Z'; local['records'][0]['end']='2026-01-02T10:00:00.000Z'
local['weights'][0]['id']='local-weight'; local['weights'][0]['when']='2026-01-01T08:00:00.000Z'
remote=build_data(1)
remote['records'][0]['id']='remote-fast'; remote['records'][0]['start']='2026-02-01T18:00:00.000Z'; remote['records'][0]['end']='2026-02-02T10:00:00.000Z'
remote['weights'][0]['id']='remote-weight'; remote['weights'][0]['when']='2026-02-01T08:00:00.000Z'
backup={'format':'fasting-tracker-backup','backupVersion':1,'appVersion':'1.11.4','exportedAt':'2026-10-04T06:00:00.000Z','data':remote}

with tempfile.TemporaryDirectory() as td:
    pth=Path(td)/'backup.json'; pth.write_text(json.dumps(backup),encoding='utf-8')
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':390,'height':844}); errors=[]; alerts=[]
        page.on('pageerror',lambda exc:errors.append(str(exc)))
        page.on('dialog',lambda d:(alerts.append(d.message),d.accept()))
        page.evaluate(STORAGE_SHIM); page.evaluate("data=>{__seedFastingDbV2(data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.4'}));}",local)
        page.set_content(inlined_html(),wait_until='domcontentloaded'); page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.11.4'",timeout=20000)
        page.locator('#importFile').set_input_files(str(pth))
        page.wait_for_function("!document.querySelector('#importPreviewModal').hidden")
        counts=page.locator('#importPreviewCounts').inner_text(); meta=page.locator('#importPreviewMeta').inner_text(); rng=page.locator('#importPreviewRange').inner_text()
        if '1' not in counts or '1.11.4' not in meta or not rng.strip():
            print('FAIL: import preview missing metadata/counts/range',meta,counts,rng);sys.exit(1)
        page.locator('#importPreviewMergeBtn').click()
        page.wait_for_timeout(600)
        result=page.evaluate("""async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('FastingTrackerDB',2);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}); const all=n=>new Promise((res,rej)=>{const q=db.transaction(n,'readonly').objectStore(n).getAll();q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});return {r:(await all('records')).length,w:(await all('weights')).length};}""")
        if result!={'r':2,'w':2}:
            print('FAIL: safe merge did not preserve both datasets',result);sys.exit(1)

        # Same id with different contents must be rejected and leave DB untouched.
        conflict=json.loads(json.dumps(backup)); conflict['data']['records'][0]['id']='local-fast'; conflict['data']['records'][0]['start']='2026-03-01T18:00:00.000Z'; conflict['data']['records'][0]['end']='2026-03-02T10:00:00.000Z'
        cpth=Path(td)/'conflict.json'; cpth.write_text(json.dumps(conflict),encoding='utf-8')
        page.locator('#importFile').set_input_files(str(cpth)); page.wait_for_function("!document.querySelector('#importPreviewModal').hidden"); page.locator('#importPreviewMergeBtn').click(); page.wait_for_timeout(300)
        if not any('conflict' in a.lower() or 'same id' in a.lower() for a in alerts):
            print('FAIL: conflicting merge did not alert',alerts);sys.exit(1)
        result2=page.evaluate("""async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('FastingTrackerDB',2);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}); const q=db.transaction('records','readonly').objectStore('records').getAll();return await new Promise((res,rej)=>{q.onsuccess=()=>res(q.result.length);q.onerror=()=>rej(q.error)});}""")
        if result2!=2:
            print('FAIL: conflicting merge altered database',result2);sys.exit(1)
        if errors:
            print('FAIL: browser errors: '+' | '.join(errors[:3]));sys.exit(1)
        browser.close()
print('PASS: backup import preview and safe merge/conflict handling')
