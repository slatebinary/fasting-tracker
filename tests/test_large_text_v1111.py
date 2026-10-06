#!/usr/bin/env python3
"""Layout stress regression approximating 200-300% text/display zoom."""
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM

def main():
  empty={'dataVersion':1,'revision':0,'updatedAt':None,'goalHours':16,'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,'records':[],'deletedFasts':[],'weights':[],'deletedWeights':[],'weightUnit':'kg','targetWeightKg':None,'gamificationEnabled':True,'language':'en','appearance':'system','iconChoice':'plate'}
  with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);page=b.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.evaluate(STORAGE_SHIM);page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.4'}));}",empty);page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.11.4'")
    page.locator('.tab[data-screen="settings"]').click();page.wait_for_timeout(80)
    for zoom in (2,3):
      page.evaluate("z=>document.body.style.zoom=String(z)",zoom);page.wait_for_timeout(50)
      for sel in ('#rebuildDerivedBtn','#updateBtn','#deviceChecksBtn'):
        box=page.locator(sel).bounding_box();assert box and box['width']>20 and box['height']>20,(zoom,sel,box)
      page.locator('#deviceChecksBtn').click();page.wait_for_timeout(80);assert page.locator('#deviceCheckModal').is_visible();scroll=page.locator('#deviceCheckModal .modalCard').evaluate("e=>({client:e.clientHeight,scroll:e.scrollHeight,overflow:getComputedStyle(e).overflowY})");assert scroll['client']>0 and scroll['scroll']>=scroll['client'] and scroll['overflow'] in ('auto','scroll'),(zoom,scroll);page.locator('#deviceCheckCloseBtn').evaluate("e=>e.click()");page.wait_for_timeout(20);assert page.locator('#deviceCheckModal').is_hidden()
    assert not errors,errors[:5];b.close()
  print('PASS: 200-300% zoom stress keeps key settings controls and modals usable')
if __name__=='__main__':main()
