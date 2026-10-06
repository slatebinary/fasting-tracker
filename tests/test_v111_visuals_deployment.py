#!/usr/bin/env python3
"""v1.11.4 regression: added fasting visualizations, device checks, and deployment-consistency helper."""
import sys, subprocess, tempfile, textwrap
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM
ROOT=Path(__file__).resolve().parents[1]
VERSION='1.11.4'

def data():
    rec=[]
    # Diverse completed fasts across months and start times.
    samples=[
      ('2026-04-01T07:00:00Z','2026-04-01T19:00:00Z',14),
      ('2026-05-02T12:00:00Z','2026-05-03T04:00:00Z',16),
      ('2026-06-03T18:00:00Z','2026-06-04T12:00:00Z',16),
      ('2026-07-04T21:00:00Z','2026-07-05T17:00:00Z',18),
      ('2026-08-05T00:00:00Z','2026-08-06T00:00:00Z',20),
      ('2026-09-06T03:00:00Z','2026-09-08T03:00:00Z',24),
      ('2026-10-01T15:00:00Z','2026-10-02T07:00:00Z',16),
    ]
    for i,(start,end,goal) in enumerate(samples):
        rec.append({'id':f'f{i}','start':start,'end':end,'goalHours':goal,'timeZone':'UTC','createdAt':end,'modifiedAt':None,'editHistory':[]})
    return {'dataVersion':1,'revision':5,'updatedAt':'2026-10-05T10:00:00.000Z','goalHours':16,'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,'records':rec,'deletedFasts':[],'weights':[],'deletedWeights':[],'weightUnit':'kg','targetWeightKg':None,'gamificationEnabled':True,'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},'language':'en','appearance':'system','iconChoice':'plate'}

def main():
    # Helper module correctly detects a mixed deployment.
    js=(ROOT/'js/release-health.js').read_text(encoding='utf-8')
    check="global.window=global;\n"+js+"\nconst x=FTReleaseHealth.consistency('1.11.4','1.10.1'); if(x.ok||x.reason!=='version-mismatch') process.exit(2); console.log('ok');\n"
    cp=subprocess.run(['node','-e',check],capture_output=True,text=True)
    assert cp.returncode==0, cp.stderr

    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':390,'height':844})
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.evaluate(STORAGE_SHIM)
        page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.11.4'}));}",data())
        page.set_content(inlined_html(),wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.11.4'",timeout=20000)
        page.locator('.tab[data-screen="stats"]').click();page.wait_for_timeout(100)
        for mode,canvas in [('months','fastMonthsChart'),('distribution','fastDistributionChart'),('success','fastSuccessChart'),('startpattern','fastStartPatternChart')]:
            page.locator(f'#statsVizSwitcher [data-viz="{mode}"]').click();page.wait_for_timeout(120)
            assert page.locator(f'#{canvas}').is_visible(), mode
            # Show chart data must expose non-empty equivalent text.
            if page.locator('#statsChartData').is_hidden(): page.locator('#statsChartDataBtn').click()
            page.wait_for_timeout(80)
            text=page.locator('#statsChartData').inner_text().strip()
            assert text and 'No chart data' not in text, (mode,text)
        page.locator('.tab[data-screen="settings"]').click();page.wait_for_timeout(100)
        assert page.locator('#healthDeploymentStatus').inner_text().strip()
        page.locator('#deviceChecksBtn').click();page.wait_for_timeout(150)
        assert page.locator('#deviceCheckModal').is_visible()
        assert page.locator('#deviceCheckList li').count()>=6
        page.locator('#deviceCheckCloseBtn').click()
        assert not errors, errors[:5]
        browser.close()
    print('PASS: v1.11.4 fasting visuals, deployment helper and device checks')

if __name__=='__main__': main()
