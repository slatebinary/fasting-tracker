#!/usr/bin/env python3
"""Regression: daily Weight chart positions measurements by actual calendar-day distance."""
import datetime, json, sys
from pathlib import Path
from browser_perf_common import STORAGE_SHIM, build_data, inlined_html
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)

root=Path(__file__).resolve().parents[1]
version=json.loads((root/"version.json").read_text())["version"]
data=build_data(4)
dates=["2026-11-10","2026-11-11","2026-11-14","2026-11-17"]
for entry,day in zip(data["weights"],dates):
    entry["when"]=f"{day}T08:00:00.000Z"
    entry["timeZone"]="UTC"

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path="/usr/bin/chromium",headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
    page=browser.new_page(viewport={"width":390,"height":844})
    errors=[]
    page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""arg=>{__seedFastingDbV2(arg.data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:arg.version,seenAt:new Date().toISOString()}));}""",{"data":data,"version":version})
    page.set_content(inlined_html(),wait_until="domcontentloaded")
    page.wait_for_function("v=>document.querySelector('#appVersionLabel')?.textContent==='v'+v",arg=version,timeout=20000)
    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_function("document.querySelector('#weight.screen')?.classList.contains('active')",timeout=5000)
    page.wait_for_function("document.querySelector('#weightChartScroller')?.dataset.period==='daily'",timeout=5000)
    result=page.locator("#weightChartScroller").evaluate("e=>({calendarBased:e.dataset.calendarTimeline,span:+e.dataset.calendarDaySpan,buckets:+e.dataset.bucketCount,points:+e.dataset.dataPointCount})")
    if result!={"calendarBased":"true","span":8,"buckets":4,"points":4}:
        print("FAIL: daily chart did not retain the 8-day calendar span for four irregularly spaced measurements",result)
        sys.exit(1)
    slider=page.locator("#weightChartRange")
    if slider.get_attribute("max")!="3":
        print("FAIL: calendar positioning changed individual-measurement navigation",slider.get_attribute("max"))
        sys.exit(1)
    slider.evaluate("(e)=>{e.value='0';e.dispatchEvent(new Event('input',{bubbles:true}))}")
    page.wait_for_function("document.querySelector('#weightChartRange')?.value==='0'",timeout=5000)
    if not page.locator("#weightChartDetail").is_visible():
        print("FAIL: oldest point could not be selected after calendar spacing")
        sys.exit(1)
    if errors:
        print("FAIL: browser errors: "+" | ".join(errors[:3]))
        sys.exit(1)
    browser.close()
print("PASS: daily Weight chart retains individual points and an 8-day calendar timeline across missing measurement dates")
