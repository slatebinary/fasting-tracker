#!/usr/bin/env python3
"""Regression: Daily preserves raw points; aggregate modes bucket by period and all scroll newest-first."""
import sys, datetime, json
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

release_version=json.loads((Path(__file__).resolve().parents[1]/'version.json').read_text())['version']
now=datetime.datetime.now(datetime.timezone.utc)
base_ms=int((now+datetime.timedelta(hours=16)).timestamp()*1000)
data=build_data(800, base=base_ms)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}); errors=[]
    page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate(f"data => {{ __seedFastingDbV2(data, []); localStorage.setItem('fastingTracker.appMeta', JSON.stringify({{lastAppVersion:'{release_version}',seenAt:new Date().toISOString()}})); }}", data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("version => document.querySelector('#appVersionLabel')?.textContent === 'v' + version",arg=release_version,timeout=20000)
    page.locator('.tab[data-screen="weight"]').click(); page.wait_for_timeout(150)

    counts={}
    for mode in ('daily','week','month','quarter','halfyear','year'):
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function(f"document.querySelector('#weightChartScroller')?.dataset.period === '{mode}'",timeout=5000)
        page.wait_for_timeout(100)
        info=page.locator('#weightChartScroller').evaluate("e=>({b:+e.dataset.bucketCount,d:+e.dataset.dataPointCount,left:e.scrollLeft,max:e.scrollWidth-e.clientWidth})")
        counts[mode]=info['d']
        if info['d'] < 2:
            print('FAIL: mode did not produce multiple points despite enough data',mode,info); sys.exit(1)
        if mode == 'daily' and info['d'] != 800:
            print('FAIL: Daily must preserve every individual measurement',info); sys.exit(1)
        if info['max'] > 1 and abs(info['left']-info['max']) > 2:
            print('FAIL: chart did not open on newest/right side',mode,info); sys.exit(1)

    if not (counts['daily'] > counts['week'] > counts['month'] > counts['quarter'] > counts['halfyear'] > counts['year']):
        print('FAIL: aggregate granularity counts are unexpected',counts); sys.exit(1)

    # Manual historical scrolling must remain where the user leaves it rather
    # than snapping back to newest on each redraw.
    page.locator('[data-weight-period="month"]').click(); page.wait_for_timeout(100)
    page.locator('#weightChartScroller').evaluate("e=>{e.scrollLeft=0}"); page.wait_for_timeout(150)
    left=page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if left > 2:
        print('FAIL: chart could not be manually scrolled to older periods',left); sys.exit(1)
    # A normal redraw (unit toggle) must not destroy the manual scroll position.
    page.locator('#unitLbBtn').click(); page.wait_for_timeout(150)
    left_after=page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if left_after > 2:
        print('FAIL: ordinary redraw snapped chart back to newest',left_after); sys.exit(1)

    # Daily chart values can be browsed point-by-point with the keyboard.
    page.locator('[data-weight-period="daily"]').click(); page.wait_for_timeout(120)
    chart=page.locator('#weightChart'); chart.focus(); page.keyboard.press('ArrowRight'); page.wait_for_timeout(80)
    latest_detail=page.locator('#weightChartDetail').inner_text()
    if not latest_detail.strip():
        print('FAIL: keyboard navigation did not reveal a selected Daily weight value'); sys.exit(1)
    page.keyboard.press('ArrowLeft'); page.wait_for_timeout(80)
    previous_detail=page.locator('#weightChartDetail').inner_text()
    if not previous_detail.strip() or previous_detail == latest_detail:
        print('FAIL: left/right keyboard navigation did not move between Daily weight values',latest_detail,previous_detail); sys.exit(1)

    # A continuous touch drag should directly select a different historical point.
    page.locator('[data-weight-period="daily"]').click(); page.wait_for_timeout(120)
    chart = page.locator('#weightChart')
    before_drag = page.locator('#weightChartDetail').inner_text()
    chart.dispatch_event('pointerdown', {'pointerId': 77, 'pointerType': 'touch', 'isPrimary': True, 'button': 0, 'clientX': 190, 'clientY': 120})
    chart.dispatch_event('pointermove', {'pointerId': 77, 'pointerType': 'touch', 'isPrimary': True, 'button': 0, 'clientX': 90, 'clientY': 120})
    chart.dispatch_event('pointerup', {'pointerId': 77, 'pointerType': 'touch', 'isPrimary': True, 'button': 0, 'clientX': 90, 'clientY': 120})
    page.wait_for_timeout(100)
    after_drag = page.locator('#weightChartDetail').inner_text()
    if not after_drag.strip() or after_drag == before_drag:
        print('FAIL: continuous touch drag did not select another historical weight value', before_drag, after_drag); sys.exit(1)

    # Raw measurements are still present in the editable history list rather
    # than being replaced by aggregates.
    if page.locator('#weightHistoryList .historyRow').count() < 1 or page.locator('#weightHistoryList .loadMoreWrap').count() != 1:
        print('FAIL: individual weight history is not retained'); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: Daily raw points, calendar aggregation, newest-first loading, historical scrolling and raw-entry retention')
