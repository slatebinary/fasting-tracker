#!/usr/bin/env python3
"""Regression: Goals / Months comparison follows the selected month column."""
import sys, json, datetime
from pathlib import Path
from browser_perf_common import build_data, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}"); sys.exit(0)

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/"version.json").read_text(encoding="utf-8"))["version"]
now=datetime.datetime.now(datetime.timezone.utc)
# Keep 480 consecutive daily fasts so the chart contains more than 12 months
# and every selected month has both comparison baselines.
latest_end=now-datetime.timedelta(hours=1)
base=int((latest_end-datetime.timedelta(hours=10)).timestamp()*1000)
data=build_data(480,base=base)
first_end=datetime.datetime.fromisoformat(data["records"][0]["end"].replace("Z","+00:00"))
month_count=(now.year-first_end.year)*12+(now.month-first_end.month)+1

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path="/usr/bin/chromium",headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
    page=browser.new_page(viewport={"width":390,"height":844},timezone_id="UTC")
    errors=[];page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate(
        """arg=>{__seedFastingDbV2(arg.data,[]);localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:arg.version}));}""",
        {"data":data,"version":VERSION},
    )
    page.set_content(inlined_html(),wait_until="domcontentloaded")
    page.wait_for_function("v=>document.querySelector('#appVersionLabel')?.textContent==='v'+v",arg=VERSION,timeout=20000)
    page.locator('.tab[data-screen="stats"]').click()
    page.wait_for_function("document.querySelector('#stats')?.classList.contains('active')",timeout=5000)
    page.locator('#statsVizSelect').select_option("months")
    page.locator('#statsRangeSelect').select_option("all")
    page.wait_for_function("document.querySelector('#fastMonthsChart')?.clientWidth>100 && document.querySelector('#fastMonthsComparison')?.textContent.trim().length>0",timeout=10000)

    def select_month(index):
        return page.locator('#fastMonthsChart').evaluate(
            """(canvas,arg)=>{
              const {index,count}=arg;
              const w=canvas.clientWidth||660,h=canvas.clientHeight||220,left=44,right=10,plotW=w-left-right;
              const gap=count>80?0.25:Math.max(2,Math.min(10,plotW/(count*5)));
              const barW=Math.max(.35,(plotW-gap*(count-1))/count);
              const x=left+index*(barW+gap)+barW/2,y=Math.min(h-45,Math.max(25,80));
              const r=canvas.getBoundingClientRect(),clientX=r.left+x,clientY=r.top+y;
              const common={bubbles:true,cancelable:true,pointerId:33,pointerType:'mouse',button:0};
              canvas.dispatchEvent(new PointerEvent('pointerdown',{...common,clientX,clientY}));
              canvas.dispatchEvent(new PointerEvent('pointerup',{...common,clientX,clientY}));
              return {x,y};
            }""",{"index":index,"count":month_count}
        )
    def assert_selected_month(index):
        select_month(index)
        page.wait_for_function(
            """()=>{const title=document.querySelector('#chartDetailTitle')?.textContent?.trim()||'';
              const summary=document.querySelector('#fastMonthsComparison')?.textContent?.trim()||'';
              return title.length>0 && summary.startsWith(title+':');}""",
            timeout=5000,
        )
        title=page.locator('#chartDetailTitle').inner_text().strip()
        summary=page.locator('#fastMonthsComparison').inner_text().strip()
        if not summary.startswith(title+":"):
            raise AssertionError(f"Comparison does not follow selected month {title!r}: {summary!r}")
        if "vs previous month" not in summary or "vs same month last year" not in summary:
            raise AssertionError(f"Comparison baselines are missing: {summary!r}")
        return title,summary

    older=assert_selected_month(month_count-4)
    newer=assert_selected_month(month_count-2)
    if older[0]==newer[0] or older[1]==newer[1]:
        raise AssertionError(f"Changing the month column did not refresh the comparison: {older} / {newer}")
    if errors:
        raise AssertionError("Browser errors: "+" | ".join(errors[:5]))
    browser.close()
print("PASS: Goals / Months comparison label and month-over-month/year-over-year figures follow the selected column")
