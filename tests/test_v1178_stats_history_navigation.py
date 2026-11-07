#!/usr/bin/env python3
"""v1.17.9 chronological Statistics history navigation regression."""
import sys, json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from browser_perf_common import STORAGE_SHIM, inlined_html, build_data
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

VERSION=json.loads((Path(__file__).resolve().parents[1]/'version.json').read_text())['version']
data=build_data(240)
# Add a current-day fast so the latest Timeline column always has a selectable
# fasting segment, independent of the wall-clock hour when CI runs.
now=datetime.now(timezone.utc)
recent_end=now-timedelta(minutes=1)
recent_start=recent_end-timedelta(hours=2)
data['records'].append({
    'id':'timeline-return-check',
    'start':recent_start.isoformat(timespec='milliseconds').replace('+00:00','Z'),
    'end':recent_end.isoformat(timespec='milliseconds').replace('+00:00','Z'),
    'goalHours':16,'timeZone':'UTC','createdAt':None,'modifiedAt':None
})
current_day_start=recent_end.replace(hour=0,minute=0,second=0,microsecond=0)
visible_start=max(recent_start,current_day_start)
selection_time=visible_start+(recent_end-visible_start)/2
selection_hour=selection_time.hour+selection_time.minute/60+selection_time.second/3600
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844},timezone_id='UTC')
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("d=>{__seedFastingDbV2(d,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.17.9'}));}",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{VERSION}'",timeout=20000)
    page.locator('.tab[data-screen="stats"]').click();page.wait_for_timeout(300)

    nav=page.locator('#statsHistoryNavigator')
    if nav.is_hidden():
        print('FAIL: Timeline history navigator is not visible');sys.exit(1)
    slider=page.locator('#statsHistoryRange')
    if int(slider.get_attribute('max') or 0)<100:
        print('FAIL: Timeline navigator does not span the complete history');sys.exit(1)

    def assert_boundaries(view, range_name=None, minimum=1):
        page.locator('#statsVizSelect').select_option(view);page.wait_for_timeout(120)
        if range_name:
            page.locator('#statsRangeSelect').select_option(range_name);page.wait_for_timeout(140)
        if nav.is_hidden():
            raise AssertionError(f'{view}: chronological navigator hidden')
        max_index=int(slider.get_attribute('max') or 0)
        if max_index<minimum:
            raise AssertionError(f'{view}: expected at least {minimum+1} navigation positions, got {max_index+1}')
        slider.fill('0');page.wait_for_timeout(50)
        if not page.locator('#statsHistoryOlderBtn').is_disabled() or page.locator('#statsHistoryNewerBtn').is_disabled():
            raise AssertionError(f'{view}: oldest boundary buttons are incorrect')
        page.locator('#statsHistoryNewerBtn').click();page.wait_for_timeout(40)
        if slider.input_value()!='1':
            raise AssertionError(f'{view}: Newer did not advance exactly one data point')
        page.locator('#statsHistoryOlderBtn').click();page.wait_for_timeout(40)
        if slider.input_value()!='0':
            raise AssertionError(f'{view}: Older did not return exactly one data point')
        slider.fill(str(max_index));page.wait_for_timeout(50)
        if page.locator('#statsHistoryOlderBtn').is_disabled() or not page.locator('#statsHistoryNewerBtn').is_disabled():
            raise AssertionError(f'{view}: newest boundary buttons are incorrect')
        page.locator('#statsHistoryOlderBtn').click();page.wait_for_timeout(40)
        if int(slider.input_value())!=max_index-1:
            raise AssertionError(f'{view}: Older did not move from newest to previous data point')

    assert_boundaries('timeline',minimum=100)
    assert_boundaries('trend','all',minimum=100)
    assert_boundaries('weeks',minimum=7)
    assert_boundaries('months','all',minimum=2)
    assert_boundaries('success','all',minimum=2)
    assert_boundaries('cumulative','all',minimum=100)

    # Calendar keeps its dedicated month controls; category charts do not get chronological controls.
    page.locator('#statsVizSelect').select_option('calendar');page.wait_for_timeout(100)
    if not nav.is_hidden() or page.locator('#calendarPrevBtn').is_hidden() or page.locator('#calendarNextBtn').is_hidden():
        print('FAIL: Calendar month navigation was not preserved independently');sys.exit(1)
    for view in ('distribution','startpattern'):
        page.locator('#statsVizSelect').select_option(view);page.wait_for_timeout(100)
        if not nav.is_hidden():
            print(f'FAIL: category-based {view} view incorrectly shows chronological navigation');sys.exit(1)

    # A selected Timeline segment must retain its details after leaving
    # Statistics for Weight and returning to Statistics.
    page.locator('#statsVizSelect').select_option('timeline');page.wait_for_timeout(180)
    scroller=page.locator('#timelineScroller')
    scroller.evaluate("e=>{e.scrollLeft=Math.max(0,e.scrollWidth-e.clientWidth)}")
    page.wait_for_timeout(80)
    point=page.locator('#chart').evaluate("""(c,hour)=>{
        const r=c.getBoundingClientRect();
        const y=18+(hour/24)*(c.clientHeight-18-38);
        return {x:r.left+c.clientWidth-10,y:r.top+y};
    }""",selection_hour)
    page.locator('#chart').evaluate("""(c,p)=>{
        const common={bubbles:true,cancelable:true,pointerId:91,pointerType:'touch',button:0};
        c.dispatchEvent(new PointerEvent('pointerdown',{...common,clientX:p.x,clientY:p.y}));
        c.dispatchEvent(new PointerEvent('pointerup',{...common,clientX:p.x,clientY:p.y}));
    }""",point)
    page.wait_for_function("""()=>{
        const title=document.querySelector('#chartDetailTitle')?.textContent?.trim()||'';
        const detail=document.querySelector('#chartDetailText')?.textContent?.trim()||'';
        return title.length>0 && detail.length>0 && /fast/i.test(detail);
    }""",timeout=5000)
    selected_title=page.locator('#chartDetailTitle').inner_text()
    selected_detail=page.locator('#chartDetailText').inner_text()
    page.locator('.tab[data-screen="weight"]').click();page.wait_for_timeout(120)
    page.locator('.tab[data-screen="stats"]').click()
    page.wait_for_function("""expected=>(
        document.querySelector('#chartDetailTitle')?.textContent?.trim()===expected.title &&
        document.querySelector('#chartDetailText')?.textContent?.trim()===expected.detail
    )""",arg={'title':selected_title,'detail':selected_detail},timeout=5000)
    if page.locator('#chartDetailText').inner_text()!=selected_detail:
        raise AssertionError('Timeline details were not restored after returning from Weight')

    # Older/Newer labels should not enter the text selection on touch or mouse,
    # while the controls remain ordinary, keyboard-operable buttons.
    for selector in ('#statsHistoryOlderBtn','#statsHistoryNewerBtn','#weightChartOlderBtn','#weightChartNewerBtn'):
        style=page.locator(selector).evaluate("(e)=>getComputedStyle(e).userSelect")
        if style!='none':
            raise AssertionError(f'{selector}: text selection is not disabled (user-select={style})')
        if page.locator(selector).evaluate("(e)=>e.tagName")!='BUTTON':
            raise AssertionError(f'{selector}: navigation control is no longer a native button')
    page.locator('#statsHistoryNewerBtn').focus()
    page.keyboard.press('Enter')
    page.wait_for_timeout(50)
    if not page.locator('#statsHistoryNewerBtn').is_visible():
        raise AssertionError('Statistics Newer control lost keyboard operability')

    if errors:
        print('FAIL: browser errors: '+' | '.join(errors[:5]));sys.exit(1)
    browser.close()
print('PASS: v1.17.9 Statistics history navigation across chronological views, exact stepping, boundaries, and Calendar/category exclusions')
