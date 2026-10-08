#!/usr/bin/env python3
"""v1.12.1: local benchmark gives immediate feedback, detailed results, and visible failure state."""
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM

VERSION='1.12.1'

def seed_data():
    return {
      'dataVersion':1,'revision':2,'updatedAt':'2026-10-06T18:00:00.000Z','goalHours':16,
      'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,
      'records':[
        {'id':'f1','start':'2026-10-04T16:00:00.000Z','end':'2026-10-05T08:00:00.000Z','goalHours':16,'timeZone':'Europe/Sofia','createdAt':'2026-10-05T08:00:00.000Z','modifiedAt':None,'editHistory':[]},
        {'id':'f2','start':'2026-10-05T15:00:00.000Z','end':'2026-10-06T08:00:00.000Z','goalHours':16,'timeZone':'Europe/Sofia','createdAt':'2026-10-06T08:00:00.000Z','modifiedAt':None,'editHistory':[]}
      ],
      'deletedFasts':[],
      'weights':[{'id':'w1','when':'2026-10-06T06:00:00.000Z','kg':80,'timeZone':'Europe/Sofia','createdAt':'2026-10-06T06:00:00.000Z','modifiedAt':None}],
      'deletedWeights':[],'weightUnit':'kg','targetWeightKg':75,'gamificationEnabled':True,
      'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},
      'language':'en','appearance':'system','iconChoice':'plate'
    }

def main():
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[]; page.on('pageerror',lambda e: errors.append(str(e)))
        page.evaluate(STORAGE_SHIM)
        page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.1'}));}",seed_data())
        page.set_content(inlined_html(),wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.12.1'",timeout=20000)
        page.locator('.tab[data-screen="settings"]').click()
        page.locator('#settingsGroupAdvanced > summary').click()
        page.wait_for_timeout(100)

        # Start manually so we can observe the immediate state before the first event-loop yield completes.
        immediate=page.evaluate("""()=>{
          document.querySelector('#performanceTestBtn').click();
          const b=document.querySelector('#performanceTestBtn'),s=document.querySelector('#healthPerformance');
          return {disabled:b.disabled,busy:b.getAttribute('aria-busy'),button:b.textContent,status:s.textContent,role:s.getAttribute('role'),live:s.getAttribute('aria-live')};
        }""")
        assert immediate['disabled'] is True, immediate
        assert immediate['busy']=='true', immediate
        assert 'Running' in immediate['button'], immediate
        assert 'Running local benchmark' in immediate['status'], immediate
        assert immediate['role']=='status' and immediate['live']=='polite', immediate

        page.wait_for_function("document.querySelector('#healthPerformance')?.textContent.includes('Local benchmark complete')",timeout=3000)
        result=page.locator('#healthPerformance').inner_text()
        for phrase in ['total','sort','daily totals','serialization','2 fasts','1 weights']:
            assert phrase in result, result
        btn=page.locator('#performanceTestBtn')
        assert not btn.is_disabled()
        assert btn.get_attribute('aria-busy') is None
        assert btn.inner_text()=='Run local benchmark'
        meta=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.performance')||'null')")
        assert meta and all(k in meta for k in ['sortMs','totalsMs','serializeMs','totalMs']), meta

        # The implementation has an explicit caught-error path and always restores the button in finally.
        html=inlined_html()
        assert "noteDiagnosticError('performance.benchmark')" in html
        assert "status.textContent=t('performance.failed')" in html
        assert "btn.removeAttribute('aria-busy')" in html
        assert not errors, errors[:5]
        browser.close()
    print('PASS: v1.12.1 benchmark gives immediate progress, detailed completion timings, and visible failure feedback')

if __name__=='__main__': main()
