#!/usr/bin/env python3
"""v1.12.0 stabilization regression: edit rollback, chart ranges/rolling/cumulative, drill-down, rebuild and last-known-good state."""
import sys
from playwright.sync_api import sync_playwright
from browser_perf_common import inlined_html, STORAGE_SHIM
VERSION='1.12.0'

def seed():
    rows=[]
    samples=[
      ('2026-09-01T18:00:00Z','2026-09-02T10:00:00Z',16),
      ('2026-09-10T18:00:00Z','2026-09-11T12:00:00Z',16),
      ('2026-10-01T18:00:00Z','2026-10-02T10:00:00Z',16),
      ('2026-10-03T18:00:00Z','2026-10-04T12:00:00Z',16),
    ]
    for i,(a,b,g) in enumerate(samples):
        rows.append({'id':f'f{i}','start':a,'end':b,'goalHours':g,'timeZone':'UTC','createdAt':a,'modifiedAt':None,'editHistory':[]})
    rows[-1]['modifiedAt']='2026-10-04T13:00:00Z'
    rows[-1]['editHistory']=[{'editedAt':'2026-10-04T13:00:00Z','editedTimeZone':'UTC','start':'2026-10-03T18:00:00Z','end':'2026-10-04T10:00:00Z','goalHours':16,'timeZone':'UTC'}]
    daily={}
    for r in rows:
        import datetime as dt
        a=dt.datetime.fromisoformat(r['start'].replace('Z','+00:00'));b=dt.datetime.fromisoformat(r['end'].replace('Z','+00:00'))
        cur=a
        while cur<b:
            nxt=min(b,(cur.replace(hour=0,minute=0,second=0,microsecond=0)+dt.timedelta(days=1)))
            if nxt<=cur:nxt=cur+dt.timedelta(days=1)
            key=cur.date().isoformat();daily[key]=daily.get(key,0)+int((nxt-cur).total_seconds()*1000);cur=nxt
    return {'dataVersion':1,'revision':4,'updatedAt':'2026-10-05T15:00:00.000Z','goalHours':16,'activeStart':None,'activeGoalHours':None,'activeTimeZone':None,'activeCreatedAt':None,'activeModifiedAt':None,'records':rows,'deletedFasts':[],'weights':[],'deletedWeights':[],'weightUnit':'kg','targetWeightKg':None,'gamificationEnabled':True,'notificationPreferences':{'enabled':False,'targetReached':True,'backupDue':True,'longFastSafety':True,'weighIn':False,'weighInCadence':'weekly','cycleComplete':False},'language':'en','appearance':'system','iconChoice':'plate'}, list(daily.items())

def main():
    data,daily=seed()
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
        page=browser.new_page(viewport={'width':390,'height':844}); errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.evaluate(STORAGE_SHIM)
        page.evaluate("x=>{__seedFastingDbV2(x.data,x.daily);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.0'}));}",{'data':data,'daily':daily})
        page.set_content(inlined_html(),wait_until='domcontentloaded')
        page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent==='v1.12.0'",timeout=20000)
        # Edit-history rollback keeps same record and changes duration back from 18h to 16h.
        page.locator('.tab[data-screen="history"]').click();page.wait_for_timeout(120)
        page.locator('#historyList .textButton').last.click();page.wait_for_timeout(50)
        assert page.locator('#editAuditModal').is_visible()
        page.once('dialog',lambda d:d.accept())
        page.locator('#editAuditList button').first.click();page.wait_for_timeout(180)
        assert '16h' in page.locator('#historyList').inner_text()
        # Statistics ranges are remembered per chart and Trend exposes rolling averages.
        page.locator('.tab[data-screen="stats"]').click();page.wait_for_timeout(120)
        page.locator('#statsVizSelect').select_option('trend');page.wait_for_timeout(120)
        page.select_option('#statsRangeSelect','7d');page.wait_for_timeout(150)
        saved=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.chartRanges')).trend")
        assert saved=='7d',saved
        if page.locator('#statsChartData').is_hidden(): page.locator('#statsChartDataBtn').click()
        page.wait_for_timeout(50);txt=page.locator('#statsChartData').inner_text();assert '7d' in txt and '30d' in txt,txt
        # Cumulative view and accessible equivalent.
        page.locator('#statsVizSelect').select_option('cumulative');page.wait_for_timeout(150)
        assert page.locator('#fastCumulativeChart').is_visible()
        if page.locator('#statsChartData').is_hidden(): page.locator('#statsChartDataBtn').click()
        assert page.locator('#statsChartData li').count()>0
        # Monthly selection exposes contributing records drill-down.
        page.locator('#statsVizSelect').select_option('months');page.wait_for_timeout(150)
        canvas=page.locator('#fastMonthsChart');box=canvas.bounding_box();
        page.mouse.click(box['x']+box['width']*0.94,box['y']+box['height']*0.45);page.wait_for_timeout(100)
        assert not page.locator('#statsDrilldownBtn').is_hidden()
        page.locator('#statsDrilldownBtn').click();page.wait_for_timeout(50)
        assert page.locator('#statsDrilldownModal').is_visible() and page.locator('#statsDrilldownList .row').count()>=1
        page.locator('#statsDrilldownCloseBtn').click()
        # Rebuild derived data leaves primary records present and completes cleanly.
        page.locator('.tab[data-screen="settings"]').click();page.locator('#settingsGroupAdvanced > summary').click();page.wait_for_timeout(100)
        page.once('dialog',lambda d:d.accept())
        page.locator('#rebuildDerivedBtn').click();page.wait_for_timeout(250)
        assert page.locator('#healthRecordCount').inner_text().strip()!='0'
        # Delayed startup integrity stores a last-known-good marker.
        page.wait_for_timeout(1200)
        good=page.evaluate("JSON.parse(localStorage.getItem('fastingTracker.appMeta')).lastKnownGood")
        assert good and good['version']==VERSION,good
        assert not errors,errors[:5]
        browser.close()
    print('PASS: v1.12.0 edit rollback, chart ranges/rolling/cumulative, drill-down, rebuild and last-known-good state')

if __name__=='__main__':main()
