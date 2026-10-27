#!/usr/bin/env python3
"""Browser regression for v1.12.8 guarded full reset and cancellation."""
import sys
from browser_perf_common import STORAGE_SHIM, build_data, inlined_html
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844});errors=[]; decisions=[]
    page.on('pageerror',lambda e: errors.append(str(e)))
    def choose_dialog(d):
        decisions.append(d.message)
        d.accept()
    page.on('dialog',choose_dialog)
    page.evaluate(STORAGE_SHIM)
    seeded=build_data(1)
    page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.4'}));}",seeded)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.13.10'",timeout=20000)
    page.wait_for_timeout(500)
    page.evaluate("document.querySelector('#resetBtn').click()")
    page.wait_for_function("!document.querySelector('#destructiveResetModal').hidden")
    assert len(decisions)==1, decisions
    button=page.locator('#destructiveResetConfirmBtn')
    field=page.locator('#destructiveResetPhrase')
    ack=page.locator('#destructiveResetBackupAck')
    assert button.is_disabled(), 'button must start disabled'
    field.fill('DELETE ALL')
    assert button.is_disabled(), 'typed phrase alone must not unlock'
    field.fill('delete all')
    ack.check()
    assert button.is_disabled(), 'wrong case must not unlock'
    field.fill('DELETE ALL')
    assert button.is_enabled(), 'both safeguards should unlock'
    page.keyboard.press('Escape')
    assert page.locator('#destructiveResetModal').is_hidden(), 'Escape must cancel'
    def counts():
        return page.evaluate("""async()=>{
          const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('FastingTrackerDB',2);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
          const all=store=>new Promise((resolve,reject)=>{const r=db.transaction(store,'readonly').objectStore(store).getAll();r.onsuccess=()=>resolve(r.result.length);r.onerror=()=>reject(r.error)});
          return {fasts:await all('records'),weights:await all('weights')};}
        """)
    assert counts()=={'fasts':1,'weights':1}, 'cancelling reset changed records'
    page.evaluate("document.querySelector('#resetBtn').click()")
    page.wait_for_function("!document.querySelector('#destructiveResetModal').hidden")
    assert field.input_value()=='' and not ack.is_checked() and button.is_disabled(), 'guard was not cleared'
    ack.check()
    field.fill('DELETE ALL')
    button.click()
    page.wait_for_function("document.querySelector('#destructiveResetModal').hidden",timeout=10000)
    assert counts()=={'fasts':0,'weights':0}, 'verified reset failed to clear records'
    assert not errors, errors[:4]
    assert len(decisions)==2, decisions
    browser.close()
print('PASS: browser full-reset two-stage confirmation, typed phrase, backup acknowledgment, cancellation, and verified deletion')
