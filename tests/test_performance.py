#!/usr/bin/env python3
"""2,000+2,000 record interaction regression."""
import json, sys, time
from browser_perf_common import build_data, prepare_page, measure_click, measure_pointer_paint, measure_select_paint
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f'SKIP: Playwright unavailable: {exc}'); sys.exit(0)

payload=json.dumps(build_data(2000),separators=(',',':'))
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844}); errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    start=time.perf_counter(); prepare_page(page,payload)
    page.wait_for_function("document.querySelector('#appVersionLabel')?.textContent === 'v1.12.2'",timeout=20000)
    boot=(time.perf_counter()-start)*1000
    if errors: print('FAIL: browser errors: '+' | '.join(errors[:3])); sys.exit(1)
    if page.locator('#recoveryBanner').is_visible(): print('FAIL: valid dataset entered Recovery mode'); sys.exit(1)
    timings={'boot-migrate':boot}
    timings['weight']=measure_click(page,'.tab[data-screen="weight"]',"document.querySelector('#weight.screen.active') !== null && document.querySelector('#wLatest').textContent !== '—'")
    timings['history']=measure_click(page,'.tab[data-screen="history"]',"document.querySelector('#history.screen.active') !== null && document.querySelectorAll('#historyList .historyRow').length > 0")
    timings['stats']=measure_click(page,'.tab[data-screen="stats"]',"document.querySelector('#stats.screen.active') !== null && document.querySelector('#mTotal').textContent.replace(/\\D/g,'') === '2000'")
    for mode in ('calendar','trend','weeks','timeline'):
        timings[f'viz-{mode}']=measure_select_paint(page,'#statsVizSelect',mode); page.wait_for_timeout(120)
    browser.close()
print('Performance smoke (ms): '+', '.join(f'{k}={v:.1f}' for k,v in timings.items()))
if timings['boot-migrate']>15000: print('FAIL: 2k lifetime migration too slow'); sys.exit(1)
if any(v>1500 for k,v in timings.items() if k!='boot-migrate'): print('FAIL: interaction regression'); sys.exit(1)
print('PASS: large-history interaction smoke test')
