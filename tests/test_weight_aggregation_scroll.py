#!/usr/bin/env python3
"""Regression: aggregate weight periods fit the viewport without empty-gap scrolling."""
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
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function("document.querySelector('#weight.screen')?.classList.contains('active')",timeout=5000)

    counts={}
    for mode in ('daily','week','month','quarter','halfyear','year'):
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function(f"document.querySelector('#weightChartScroller')?.dataset.period === '{mode}'",timeout=5000)
        page.wait_for_function("Number(document.querySelector('#weightChartScroller')?.dataset.dataPointCount) >= 2",timeout=5000)
        info=page.locator('#weightChartScroller').evaluate("e=>({b:+e.dataset.bucketCount,d:+e.dataset.dataPointCount,left:e.scrollLeft,max:e.scrollWidth-e.clientWidth})")
        counts[mode]=info['d']
        if info['d'] < 2:
            print('FAIL: mode did not produce multiple points despite enough data',mode,info); sys.exit(1)
        if mode == 'daily' and info['d'] != 800:
            print('FAIL: Daily must preserve every individual measurement',info); sys.exit(1)
        if info['b'] != info['d']:
            print('FAIL: rolling series contains non-measurement or empty synthetic points',mode,info); sys.exit(1)
        if info['max'] <= 1 or abs(info['left']-info['max']) > 2:
            print('FAIL: chart did not preserve dense horizontal history or open at newest/right side',mode,info); sys.exit(1)
        if mode != 'daily' and info['d'] != 800:
            print('FAIL: rolling mode must sample all 800 actual measurement dates',mode,info); sys.exit(1)

    if len(set(counts.values())) != 1 or counts['daily'] != 800:
        print('FAIL: rolling modes should remain sampled on actual measurement dates',counts); sys.exit(1)

    # Each rolling point is calculated from its trailing window and carries the
    # calendar-period aggregate separately for transparent comparison.
    for mode,days in (('week',7),('month',30),('quarter',90),('halfyear',180),('year',365)):
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function(f"document.querySelector('#weightChartScroller')?.dataset.period === '{mode}'",timeout=5000)
        nav=page.locator('#weightChartRange')
        nav.evaluate("(e)=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}))}")
        page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.selectedWindowCount === '1'",timeout=5000)
        nav.evaluate("(e)=>{e.value='6';e.dispatchEvent(new Event('input',{bubbles:true}))}")
        page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.selectedWindowCount === '7'",timeout=5000)
        nav.evaluate("(e)=>{e.value='7';e.dispatchEvent(new Event('input',{bubbles:true}))}")
        page.wait_for_function("expected => document.querySelector('#weightChartScroller')?.dataset.selectedWindowCount === String(expected)",arg=Math.min(8,days),timeout=5000)
        result=page.locator('#weightChartScroller').evaluate("e=>({window:+e.dataset.rollingWindowDays,selectedCount:+e.dataset.selectedWindowCount,calendarCount:+e.dataset.selectedCalendarCount})")
        if result['window'] != days or result['selectedCount'] != min(8,days) or result['calendarCount'] < 1:
            print('FAIL: rolling window semantics or calendar summary incorrect',mode,result); sys.exit(1)
        nav.evaluate("(e)=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}))}")
        page.wait_for_function("e => document.querySelector('#weightChartRange')?.value === e",arg=nav.get_attribute('max'),timeout=5000)
        note=page.locator('#weightChartNote').inner_text().lower()
        if 'rolling' not in note:
            print('FAIL: rolling average is not clearly identified in chart help',mode,note); sys.exit(1)
        detail=page.locator('#weightChartDetail').inner_text().lower()
        if 'rolling' not in detail or 'calendar' not in detail:
            print('FAIL: selected point does not explain rolling and calendar averages',mode,detail); sys.exit(1)
        nav=page.locator('#weightChartRange')
        if int(nav.get_attribute('max') or '0') != 799:
            print('FAIL: rolling chart navigator does not include all real measurement dates',mode,nav.get_attribute('max')); sys.exit(1)

    # Daily chart values can be browsed point-by-point with the keyboard.
    page.locator('[data-weight-period="daily"]').click()
    page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.period === 'daily'",timeout=5000)
    chart=page.locator('#weightChart'); chart.focus()
    page.keyboard.press('ArrowRight')
    page.wait_for_function("() => { const detail=document.querySelector('#weightChartDetail'); return detail && !detail.hidden && detail.innerText.trim(); }",timeout=5000)
    latest_detail=page.locator('#weightChartDetail').inner_text()
    if not latest_detail.strip():
        print('FAIL: keyboard navigation did not reveal a selected Daily weight value'); sys.exit(1)
    page.keyboard.press('ArrowLeft')
    page.wait_for_function("(previous) => document.querySelector('#weightChartDetail')?.innerText !== previous",arg=latest_detail,timeout=5000)
    previous_detail=page.locator('#weightChartDetail').inner_text()
    if not previous_detail.strip() or previous_detail == latest_detail:
        print('FAIL: left/right keyboard navigation did not move between Daily weight values',latest_detail,previous_detail); sys.exit(1)

    # The range navigator and Older/Newer buttons must move the selected pointer,
    # not merely page the viewport. Manual scrolling remains available independently.
    page.locator('[data-weight-period="daily"]').click()
    page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.period === 'daily'",timeout=5000)
    slider = page.locator('#weightChartRange')
    if not slider.is_visible() or int(slider.get_attribute('max') or '0') < 799:
        print('FAIL: Daily range navigator does not cover the full history', slider.get_attribute('max')); sys.exit(1)
    slider.evaluate("(e)=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_function("e => document.querySelector('#weightChartRange')?.value === e",arg=slider.get_attribute('max'),timeout=5000)
    latest_detail = page.locator('#weightChartDetail').inner_text()
    latest_left = page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if not latest_detail.strip() or page.locator('#weightChartNewerBtn').is_enabled():
        print('FAIL: newest measurement was not selected or Newer was not disabled', latest_detail); sys.exit(1)
    page.locator('#weightChartOlderBtn').click()
    page.wait_for_function("(expected) => document.querySelector('#weightChartDetail')?.innerText !== expected",arg=latest_detail,timeout=5000)
    older_detail = page.locator('#weightChartDetail').inner_text()
    older_left = page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if older_detail == latest_detail:
        print('FAIL: Older did not move the selected pointer to the previous measurement', latest_detail, older_detail); sys.exit(1)
    page.locator('#weightChartNewerBtn').click()
    page.wait_for_function("(expected) => document.querySelector('#weightChartDetail')?.innerText === expected",arg=latest_detail,timeout=5000)
    newer_detail = page.locator('#weightChartDetail').inner_text()
    newer_left = page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if newer_detail != latest_detail:
        print('FAIL: Newer did not return the selected pointer to the next recent measurement', latest_detail, newer_detail); sys.exit(1)
    slider.evaluate("(e)=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_function("document.querySelector('#weightChartOlderBtn')?.disabled",timeout=5000)
    if page.locator('#weightChartOlderBtn').is_enabled():
        print('FAIL: Older must be disabled at the oldest measurement'); sys.exit(1)
    page.locator('#weightChartRange').evaluate("(e)=>{e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_function("document.querySelector('#weightChartRange')?.value === '100'",timeout=5000)
    selected_detail = page.locator('#weightChartDetail').inner_text()
    range_left = page.locator('#weightChartScroller').evaluate("e=>e.scrollLeft")
    if not selected_detail.strip() or not latest_detail.strip() or range_left >= latest_left:
        print('FAIL: range navigator did not select and reveal older measurements', latest_left, range_left, selected_detail); sys.exit(1)

    # Force a fresh period open so the first Daily pass verifies automatic newest selection.
    page.locator('[data-weight-period="month"]').click()
    page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.period === 'month'",timeout=5000)
    # Older/Newer must traverse every valid bucket from the newest endpoint
    # to the oldest endpoint and back, for every chart period.
    for mode in ('daily','week','month','quarter','halfyear','year'):
        page.locator(f'[data-weight-period="{mode}"]').click()
        page.wait_for_function(f"document.querySelector('#weightChartScroller')?.dataset.period === '{mode}'",timeout=5000)
        page.wait_for_function("Number(document.querySelector('#weightChartScroller')?.dataset.dataPointCount) >= 2",timeout=5000)
        nav = page.locator('#weightChartRange')
        if not nav.is_visible() or int(nav.get_attribute('max') or '0') < 1:
            print('FAIL: range navigator is missing historical buckets for', mode); sys.exit(1)
        info = page.locator('#weightChartScroller').evaluate("e=>({valid:+e.dataset.dataPointCount,buckets:+e.dataset.bucketCount})")
        if info['valid'] < 2:
            print('FAIL: not enough valid buckets for endpoint traversal', mode, info); sys.exit(1)
        latest_index = int(nav.input_value())
        if latest_index != int(nav.get_attribute('max') or '0'):
            print('FAIL: chart did not select the newest bucket on period open', mode, latest_index, nav.get_attribute('max')); sys.exit(1)
        if page.locator('#weightChartNewerBtn').is_enabled():
            print('FAIL: Newer should be disabled at the newest endpoint on period open', mode, latest_index); sys.exit(1)
        traversal = page.evaluate("""(count) => {
            const slider=document.querySelector('#weightChartRange');
            const older=document.querySelector('#weightChartOlderBtn');
            const newer=document.querySelector('#weightChartNewerBtn');
            const detail=document.querySelector('#weightChartDetail');
            const result={older:[],newer:[]};
            let previous=Number(slider.value), previousDetail=detail?.innerText||'';
            for(let step=0;step<count-1;step++){
                older.click();
                const current=Number(slider.value), currentDetail=detail?.innerText||'';
                if(current>=previous || !currentDetail.trim()) return {error:'Older monotonic selection/detail check failed',step,previous,current};
                if(step===0 && currentDetail===previousDetail) return {error:'Older did not change selected detail',step};
                result.older.push(current); previous=current; previousDetail=currentDetail;
            }
            if(!older.disabled) return {error:'Older remained enabled at oldest endpoint',last:previous};
            previous=Number(slider.value); previousDetail=detail?.innerText||'';
            for(let step=0;step<count-1;step++){
                newer.click();
                const current=Number(slider.value), currentDetail=detail?.innerText||'';
                if(current<=previous || !currentDetail.trim()) return {error:'Newer monotonic selection/detail check failed',step,previous,current};
                if(step===0 && currentDetail===previousDetail) return {error:'Newer did not change selected detail',step};
                result.newer.push(current); previous=current; previousDetail=currentDetail;
            }
            if(!newer.disabled) return {error:'Newer remained enabled at newest endpoint',last:previous};
            return result;
        }""", info['valid'])
        if traversal.get('error') or len(traversal.get('older',[])) != info['valid']-1 or len(traversal.get('newer',[])) != info['valid']-1:
            print('FAIL: exhaustive navigator traversal', mode, traversal, info); sys.exit(1)

    # Raw measurements are still present in the editable history list rather
    # than being replaced by aggregates.
    if page.locator('#weightHistoryList .historyRow').count() < 1 or page.locator('#weightHistoryList .loadMoreWrap').count() != 1:
        print('FAIL: individual weight history is not retained'); sys.exit(1)
    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    browser.close()
print('PASS: Daily raw points, rolling windows, calendar summaries, dense navigation and raw-entry retention')
