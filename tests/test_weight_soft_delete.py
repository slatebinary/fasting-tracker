#!/usr/bin/env python3
"""Regression: weight deletion is auditable, restorable and exported until permanently deleted."""
import sys, json
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

data=build_data(3)
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}); errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc))); page.on('dialog',lambda d:d.accept())
    page.evaluate(STORAGE_SHIM); page.evaluate("data=>{__seedFastingDbV2(data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.1'}));}",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded'); page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.11.1'",timeout=20000)
    page.locator('.tab[data-screen="weight"]').click(); page.wait_for_function("document.querySelectorAll('#weightHistoryList .historyRow').length===3")
    page.locator('#weightHistoryList .historyRow').first.locator('.dangerText').click(); page.wait_for_function("!document.querySelector('#deletedWeightsCard').hidden")
    page.wait_for_timeout(200)
    counts=page.evaluate("""() => new Promise((resolve,reject)=>{const q=indexedDB.open('FastingTrackerDB',2);q.onsuccess=()=>{const tx=q.result.transaction(['weights','deletedWeights'],'readonly');let o={};for(const n of ['weights','deletedWeights']){const r=tx.objectStore(n).getAll();r.onsuccess=()=>{o[n]=r.result;if(o.weights&&o.deletedWeights)resolve(o)}}}})""")
    if len(counts['weights'])!=2 or len(counts['deletedWeights'])!=1 or counts['deletedWeights'][0].get('deleted') is not True:
        print('FAIL: weight soft delete not persisted',counts);sys.exit(1)
    page.evaluate("""() => {Object.defineProperty(navigator,'canShare',{value:()=>true,configurable:true});Object.defineProperty(navigator,'share',{value:async p=>{window.__backupText=await p.files[0].text()},configurable:true});}""")
    page.locator('.tab[data-screen="settings"]').click(); page.locator('#exportBtn').click(); page.wait_for_function("typeof window.__backupText==='string'")
    backup=json.loads(page.evaluate('window.__backupText'))
    if len(backup['data'].get('deletedWeights',[]))!=1:
        print('FAIL: deleted weight audit missing from JSON backup');sys.exit(1)
    page.locator('.tab[data-screen="weight"]').click(); page.locator('#deletedWeightsList .secondary').first.click(); page.wait_for_function("document.querySelector('#deletedWeightsCard').hidden")
    page.locator('#weightHistoryList .historyRow').first.locator('.dangerText').click(); page.wait_for_function("!document.querySelector('#deletedWeightsCard').hidden")
    page.locator('#deletedWeightsList .dangerText').first.click(); page.wait_for_function("document.querySelector('#deletedWeightsCard').hidden")
    if errors: print('FAIL: browser errors: '+' | '.join(errors[:3]));sys.exit(1)
    browser.close()
print('PASS: deleted weight records remain audited/exported until restore or permanent deletion')
