#!/usr/bin/env python3
"""Regression: fasting/weight charts expose an on-demand text representation."""
import sys
from browser_perf_common import CURRENT_VERSION, build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}');sys.exit(0)

data=build_data(12)
for i,w in enumerate(data['weights']): w['kg']=60+i
for i,r in enumerate(data['records']):
    from datetime import datetime, timezone, timedelta
    start=datetime.fromisoformat(r['start'].replace('Z','+00:00'))
    r['end']=(start+timedelta(hours=10+i)).isoformat().replace('+00:00','Z')
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844});errors=[];page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM);page.evaluate("data=>{__seedFastingDbV2(data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.12.2'}));}",data)
    page.set_content(inlined_html(),wait_until='domcontentloaded');page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{CURRENT_VERSION}'",timeout=20000)
    page.locator('.tab[data-screen="weight"]').click();page.locator('#weightChartDataBtn').click();page.wait_for_function("!document.querySelector('#weightChartData').hidden && document.querySelectorAll('#weightChartData li').length>0")
    if page.locator('#weightChartDataBtn').get_attribute('aria-expanded')!='true': print('FAIL: weight data disclosure aria state wrong');sys.exit(1)
    weight_rows=page.locator('#weightChartData li').all_inner_texts()
    if '71' not in weight_rows[0] or '60' not in weight_rows[-1]: print('FAIL: weight chart data is not newest-first:',weight_rows);sys.exit(1)
    page.locator('.tab[data-screen="stats"]').click();page.locator('#statsChartDataBtn').click()
    # Statistics charts are intentionally rendered after the first screen paint.
    # Opening the text disclosure immediately must not leave a transient
    # "No chart data" placeholder as the final accessible representation.
    page.wait_for_function("""() => {
      const box=document.querySelector('#statsChartData');
      if(!box || box.hidden) return false;
      const rows=[...box.querySelectorAll('li')];
      return rows.length>=2 && /^\\w{3}, \\w{3} \\d{1,2}, \\d{4}/.test(rows[0].textContent.trim());
    }""",timeout=15000)
    stat_rows=page.locator('#statsChartData li').all_inner_texts()
    if len(stat_rows) < 2: print('FAIL: fasting chart data has too few rows:',stat_rows);sys.exit(1)
    from datetime import datetime as _dt
    first_date=_dt.strptime(stat_rows[0].split(' — ')[0],'%a, %b %d, %Y')
    last_date=_dt.strptime(stat_rows[-1].split(' — ')[0],'%a, %b %d, %Y')
    if first_date <= last_date: print('FAIL: fasting chart data is not newest-first:',stat_rows);sys.exit(1)

    # Calendar days form a labelled group with a live month heading and
    # roving keyboard focus. Arrow keys follow the visible seven-column grid.
    page.locator('#statsVizSelect').select_option('calendar')
    page.wait_for_function("document.querySelectorAll('#fastCalendar .calendarDay:not(:disabled)').length > 0")
    if page.locator('#calendarMonthTitle').get_attribute('aria-live') != 'polite':
        print('FAIL: calendar month heading is not announced');sys.exit(1)
    if page.locator('#fastCalendar').get_attribute('role') != 'group' or page.locator('#fastCalendar').get_attribute('aria-labelledby') != 'calendarMonthTitle':
        print('FAIL: calendar day group is not labelled by its month heading');sys.exit(1)
    tab_stops=page.locator('#fastCalendar .calendarDay[tabindex="0"]')
    if tab_stops.count()!=1:
        print('FAIL: calendar must expose exactly one roving keyboard tab stop');sys.exit(1)
    first_day=tab_stops.first
    first_day.focus()
    first_index=first_day.evaluate("(el)=>[...el.parentElement.children].indexOf(el)")
    page.keyboard.press('ArrowRight')
    right_index=page.evaluate("()=>[...document.querySelector('#fastCalendar').children].indexOf(document.activeElement)")
    if right_index != first_index+1:
        print('FAIL: calendar ArrowRight did not move one day');sys.exit(1)
    page.keyboard.press('ArrowDown')
    down_index=page.evaluate("()=>[...document.querySelector('#fastCalendar').children].indexOf(document.activeElement)")
    if down_index != right_index+7:
        print('FAIL: calendar ArrowDown did not move one week');sys.exit(1)
    page.keyboard.press('Enter')
    if page.locator('#fastCalendar .calendarDay.selected').count()!=1:
        print('FAIL: keyboard activation did not select a calendar day');sys.exit(1)
    if not page.locator('#statsSelectionLive').inner_text().strip():
        print('FAIL: calendar selection was not announced through the live region');sys.exit(1)

    if errors: print('FAIL: browser errors: '+' | '.join(errors[:3]));sys.exit(1)
    browser.close()
print('PASS: accessible chart-data disclosures for weight and fasting statistics')
