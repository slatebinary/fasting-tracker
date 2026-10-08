#!/usr/bin/env python3
"""v1.12.2: Statistics renders its remembered chart on first entry and after rapid tab changes."""
import json, sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_perf_common import STORAGE_SHIM, inlined_html, build_data

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'version.json').read_text())['version']
data=build_data(180)

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    page=browser.new_page(viewport={'width':390,'height':844})
    errors=[]; page.on('pageerror',lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("x=>{__seedFastingDbV2(x.data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:x.version}));localStorage.setItem('fastingTracker.statsVizSelection',JSON.stringify({activeGroup:'longterm',lastByGroup:{overview:'trend',timing:'distribution',goals:'months',longterm:'cumulative'}}));}", {'data':data,'version':VERSION})
    page.set_content(inlined_html(),wait_until='domcontentloaded')
    page.wait_for_function("v=>document.querySelector('#appVersionLabel')?.textContent==='v'+v",arg=VERSION,timeout=20000)

    # First entry must reveal and paint the remembered non-default chart.
    page.locator('.tab[data-screen="stats"]').click(); page.wait_for_timeout(180)
    assert page.locator('#statsVizSelect').input_value()=='cumulative'
    assert page.locator('#statsCumulativeView').is_visible()
    assert page.locator('#statsTimelineView').is_hidden()
    painted=page.locator('#fastCumulativeChart').evaluate("c=>{const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<x.length;i+=4){if(x[i])return true;}return false;}")
    assert painted, 'remembered cumulative chart was blank on first Statistics entry'

    # Rapidly leaving and returning must still leave a visible, painted chart.
    for _ in range(3):
        page.locator('.tab[data-screen="fasting"]').click(); page.wait_for_timeout(20)
        page.locator('.tab[data-screen="stats"]').click(); page.wait_for_timeout(100)
        assert page.locator('#statsCumulativeView').is_visible()
        painted=page.locator('#fastCumulativeChart').evaluate("c=>{const x=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<x.length;i+=4){if(x[i])return true;}return false;}")
        assert painted, 'cumulative chart became blank after tab return'

    # Re-selecting the already-active mode must restore the correct panel if DOM state is disturbed.
    page.evaluate("()=>{document.querySelector('#statsCumulativeView').hidden=true;document.querySelector('#statsTimelineView').hidden=false;}")
    page.locator('#statsVizSelect').select_option('cumulative'); page.wait_for_timeout(100)
    assert page.locator('#statsCumulativeView').is_visible()
    assert page.locator('#statsTimelineView').is_hidden()
    assert not errors, errors[:5]
    browser.close()
print(f'PASS: v{VERSION} Statistics first-entry/post-layout rendering stays visible and painted')
