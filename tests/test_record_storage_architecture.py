#!/usr/bin/env python3
"""Regression: v1.12.1 migrates the v1.8.x primary blob to record-level IndexedDB and uses compressed snapshots."""
import sys, json
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(5)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.8.19',seenAt:new Date().toISOString()})); }",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.1'",timeout=20000)
    page.wait_for_timeout(300)
    state=page.evaluate("""() => new Promise((resolve,reject)=>{
      const q=indexedDB.open('FastingTrackerDB',2);q.onerror=()=>reject(q.error);q.onsuccess=()=>{
        const db=q.result,names=['state','records','deletedFasts','weights','deletedWeights','snapshotPayload'];
        const tx=db.transaction(names,'readonly'),out={stores:names.filter(n=>db.objectStoreNames.contains(n))};let pending=7;
        const done=()=>{if(--pending===0)resolve(out)};
        for(const n of ['records','deletedFasts','weights','deletedWeights','snapshotPayload']){const r=tx.objectStore(n).getAll();r.onerror=()=>reject(r.error);r.onsuccess=()=>{out[n]=r.result;done();};}
        for(const key of ['settings','primary']){const r=tx.objectStore('state').get(key);r.onerror=()=>reject(r.error);r.onsuccess=()=>{out[key]=r.result||null;done();};}
      };
    })""")
    required={'records','deletedFasts','weights','deletedWeights'}
    if not required.issubset(set(state['stores'])):
        print('FAIL: record-level stores missing',state['stores']); sys.exit(1)
    if state['primary'] is not None or not state['settings']:
        print('FAIL: legacy primary blob was not retired after migration'); sys.exit(1)
    if len(state['records'])!=5 or len(state['weights'])!=5:
        print('FAIL: record-level migration lost records'); sys.exit(1)
    if not state['snapshotPayload']:
        print('FAIL: version-transition recovery snapshot missing'); sys.exit(1)
    payload=state['snapshotPayload'][0]
    if payload.get('encoding') not in ('gzip-json','json') or 'data' in payload:
        print('FAIL: recovery snapshot was not stored in compact encoded form',payload.keys()); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: record-level IndexedDB migration and encoded recovery snapshots')
