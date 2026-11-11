#!/usr/bin/env python3
"""Regression: selected Timeline segment and its detail survive Statistics -> Weight -> Statistics."""
import sys, json
from datetime import datetime, timezone, timedelta
from pathlib import Path
from browser_perf_common import STORAGE_SHIM, inlined_html, build_data

try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
now = datetime.now(timezone.utc)
end = now - timedelta(minutes=1)
start = end - timedelta(hours=2)
iso = lambda value: value.isoformat(timespec="milliseconds").replace("+00:00", "Z")
data = build_data(240)
data["records"].append({
    "id": "timeline-persistence-focus",
    "start": iso(start), "end": iso(end), "goalHours": 16,
    "timeZone": "UTC", "createdAt": None, "modifiedAt": None
})

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
                                args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 390, "height": 844}, timezone_id="UTC")
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""d => {
      __seedFastingDbV2(d, []);
      localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion: 'VERSION_PLACEHOLDER'}));
    }""".replace("VERSION_PLACEHOLDER", VERSION), data)
    page.set_content(inlined_html(), wait_until="domcontentloaded")
    page.wait_for_function(f"document.querySelector('#appVersionLabel')?.textContent==='v{VERSION}'", timeout=20000)
    page.locator('.tab[data-screen="stats"]').click()
    page.wait_for_timeout(250)
    page.locator("#statsVizSelect").select_option("timeline")
    page.wait_for_timeout(150)

    scroller = page.locator("#timelineScroller")
    scroller.evaluate("e => { e.scrollLeft = e.scrollWidth - e.clientWidth; }")
    page.wait_for_timeout(100)
    canvas = page.locator("#chart")
    point = canvas.evaluate("""(c, hour) => {
      const r=c.getBoundingClientRect();
      const x=r.right-12;
      const y=r.top+18+(hour/24)*(c.clientHeight-18-38);
      return {x,y,canvasRight:r.right,canvasLeft:r.left,scrollRight:c.parentElement.getBoundingClientRect().right};
    }""", (start + (end-start)/2).hour + ((start + (end-start)/2).minute/60))
    if point["x"] > point["scrollRight"] or point["x"] < 0:
        raise AssertionError(f"Latest Timeline column is not in the viewport: {point}")
    canvas.evaluate("""(c,p) => {
      const init={bubbles:true,cancelable:true,pointerId:91,pointerType:'touch',button:0};
      c.dispatchEvent(new PointerEvent('pointerdown',{...init,clientX:p.x,clientY:p.y}));
      c.dispatchEvent(new PointerEvent('pointerup',{...init,clientX:p.x,clientY:p.y}));
    }""", point)
    page.wait_for_timeout(100)
    selected = page.evaluate("() => chartSelectedTarget ? {...chartSelectedTarget} : null")
    title = page.locator("#chartDetailTitle").inner_text().strip()
    detail = page.locator("#chartDetailText").inner_text().strip()
    if not selected or selected.get("kind") != "segment" or selected.get("dayKey") != end.strftime("%Y-%m-%d"):
        raise AssertionError(f"Tap did not select today's Timeline segment: {selected}; point={point}")
    if not title or "Fasting this day:" not in detail:
        raise AssertionError(f"Selected Timeline detail was not rendered: {title!r} / {detail!r}")

    page.locator('.tab[data-screen="weight"]').click()
    page.wait_for_timeout(120)
    page.locator('.tab[data-screen="stats"]').click()
    page.wait_for_timeout(180)
    restored = page.evaluate("() => chartSelectedTarget ? {...chartSelectedTarget} : null")
    restored_title = page.locator("#chartDetailTitle").inner_text().strip()
    restored_detail = page.locator("#chartDetailText").inner_text().strip()
    if restored != selected:
        raise AssertionError(f"Timeline selection changed after Weight round-trip: {selected} -> {restored}")
    if (restored_title, restored_detail) != (title, detail):
        raise AssertionError(f"Timeline detail was lost after Weight round-trip: {title!r}/{detail!r} -> {restored_title!r}/{restored_detail!r}")
    if errors:
        raise AssertionError("Browser errors: " + " | ".join(errors[:5]))
    browser.close()
print("PASS: selected Timeline segment and exact detail persist across Statistics -> Weight -> Statistics")
