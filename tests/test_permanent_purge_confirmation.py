#!/usr/bin/env python3
"""Browser-confirm two separate prompts for single and bulk irreversible purges."""
from browser_perf_common import STORAGE_SHIM, build_data, inlined_html
from playwright.sync_api import sync_playwright

seed=build_data(1)
fast={**seed['records'][0],'deleted':True,'deletedAt':'2026-03-01T11:00:00Z','deletionReason':'user'}
weight={**seed['weights'][0],'deleted':True,'deletedAt':'2026-03-01T11:00:00Z','deletionReason':'user'}
seed['records']=[];seed['weights']=[]
seed['deletedFasts']=[fast];seed['deletedWeights']=[weight]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844});alerts=[];errors=[];decisions=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    def dialog(d):
        alerts.append(d.message)
        if decisions and decisions.pop(0) is False: d.dismiss()
        else: d.accept()
    page.on('dialog',dialog)
    page.evaluate(STORAGE_SHIM)
    page.evaluate('d=>{__seedFastingDbV2(d,[]);localStorage.setItem("fastingTracker.appMeta",JSON.stringify({lastAppVersion:"1.12.4"}));}',seed)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.15.2'",timeout=20000)
    page.locator('[data-screen="history"]').click()
    page.wait_for_function("!document.querySelector('#deletedFastsCard').hidden")
    fast_purge=page.locator('#deletedFastsList button.dangerText')
    assert fast_purge.count()==1,'Deleted fast row should be visible'
    decisions.extend([True,False]);fast_purge.click()
    assert len(alerts)==2,alerts
    assert fast_purge.count()==1,'second-step cancel erased fasting data'
    decisions.extend([True,True]);fast_purge.click()
    assert len(alerts)==4,alerts
    page.wait_for_function("document.querySelector('#deletedFastsCard').hidden")
    page.locator('[data-screen="weight"]').click()
    page.wait_for_function("!document.querySelector('#deletedWeightsCard').hidden")
    page.locator('#weightTools summary').click()
    page.locator('#weightBulkModeBtn').click()
    box=page.locator('#deletedWeightsList input[type="checkbox"]')
    assert box.count()==1,'Deleted weight selection absent'
    box.check()
    purge=page.locator('#deletedWeightBulkPurgeBtn')
    assert not purge.is_disabled(),'Bulk purge button disabled despite selection'
    decisions.extend([True,False]);purge.click()
    assert len(alerts)==6,alerts
    assert box.count()==1,'second-step cancel erased weight data'
    decisions.extend([True,True]);purge.click()
    assert len(alerts)==8,alerts
    page.wait_for_function("document.querySelector('#deletedWeightsCard').hidden")
    assert not errors,errors[:5]
    browser.close()
print('PASS: two independent permanent fast and bulk weight confirmations; second-step cancellation preserves data')
