#!/usr/bin/env python3
"""Regression: storage-health panel and privacy-preserving diagnostic export."""
import sys, json
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(2)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM);page.evaluate("data=>{__seedFastingDbV2(data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.10.1'}));}",data)
    page.evaluate("""() => {Object.defineProperty(navigator,'storage',{value:{persisted:async()=>true,estimate:async()=>({usage:5*1048576,quota:100*1048576}),persist:async()=>true},configurable:true});const orig=URL.createObjectURL;URL.createObjectURL=b=>{window.__diagBlob=b;return 'blob:diag'};HTMLAnchorElement.prototype.click=function(){};}""")
    page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.10.1'",timeout=20000)
    page.locator('.tab[data-screen="settings"]').click();page.wait_for_function("document.querySelector('#healthRecordCount')?.textContent.trim()==='4'",timeout=5000)
    health=page.locator('#storageHealthCard').inner_text()
    if '5' not in health or '100' not in health:
        print('FAIL: storage usage/quota not surfaced',health);sys.exit(1)
    page.locator('#diagnosticExportBtn').click();page.wait_for_function("window.__diagBlob instanceof Blob")
    diag=json.loads(page.evaluate("window.__diagBlob.text()"))
    if diag.get('format')!='fasting-tracker-diagnostics' or diag.get('database',{}).get('fastingRecords')!=2 or diag.get('database',{}).get('weightRecords')!=2:
        print('FAIL: diagnostic payload metadata/counts incorrect',diag);sys.exit(1)
    text=json.dumps(diag)
    for record in data['records']:
        if record['start'] in text or record['end'] in text:
            print('FAIL: diagnostic export leaked fasting timestamps');sys.exit(1)
    for weight in data['weights']:
        if str(weight['kg']) in text:
            print('FAIL: diagnostic export leaked weight values');sys.exit(1)
    if errors: print('FAIL: browser errors: '+' | '.join(errors[:3]));sys.exit(1)
    browser.close()
print('PASS: storage-health panel and non-sensitive diagnostic export')
