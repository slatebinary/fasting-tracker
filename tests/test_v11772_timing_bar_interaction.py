#!/usr/bin/env python3
"""v1.17.72: Timing duration/start-time bars retain independent click fallbacks."""
import sys
from browser_perf_common import CURRENT_VERSION, build_data, inlined_html, STORAGE_SHIM

try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)

data = build_data(60)

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path="/usr/bin/chromium",
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate(
        "d=>{__seedFastingDbV2(d,[]);"
        "localStorage.setItem('fastingTracker.appMeta',JSON.stringify({lastAppVersion:'1.17.71'}));}",
        data,
    )
    page.set_content(inlined_html(), wait_until="domcontentloaded")
    page.wait_for_function(
        f"document.querySelector('#appVersionLabel')?.textContent === 'v{CURRENT_VERSION}'",
        timeout=20000,
    )
    page.evaluate("""() => {
      window.__timingBarRects = {};
      const original = CanvasRenderingContext2D.prototype.fillRect;
      CanvasRenderingContext2D.prototype.fillRect = function(x,y,w,h) {
        const id = this.canvas?.id;
        if (id === 'fastDistributionChart' || id === 'fastStartPatternChart') {
          (window.__timingBarRects[id] ||= []).push({x,y,w,h});
        }
        return original.call(this,x,y,w,h);
      };
    }""")
    page.locator('.tab[data-screen="stats"]').click()
    page.locator("#statsVizSelect").select_option("distribution")
    page.wait_for_function(
        "window.__timingBarRects?.fastDistributionChart?.length > 0",
        timeout=5000,
    )
    default_title = page.locator("#chartDetailTitle").inner_text()

    # Exercise the pointer-first path on the Duration Bars canvas.
    page.locator("#fastDistributionChart").evaluate("""canvas => {
      const bar = window.__timingBarRects.fastDistributionChart[0];
      const rect = canvas.getBoundingClientRect();
      const init = {
        bubbles:true, cancelable:true, pointerId:71, pointerType:'touch',
        button:0, clientX:rect.left+bar.x+Math.max(1,bar.w/2),
        clientY:rect.top+100
      };
      canvas.dispatchEvent(new PointerEvent('pointerdown',init));
    }""")
    page.wait_for_function(
        "document.querySelector('#chartDetailTitle')?.textContent?.trim() !== '' && "
        "document.querySelector('#chartDetailTitle')?.textContent !== arguments[0]",
        arg=default_title,
        timeout=5000,
    )
    duration_title = page.locator("#chartDetailTitle").inner_text()
    duration_detail = page.locator("#chartDetailText").inner_text()
    if not duration_title.strip() or not duration_detail.strip():
        raise AssertionError("Duration Bar pointer activation did not populate chart details")

    # A click-only fallback on a different canvas must not be suppressed by the
    # recent pointer event on Duration Bars.
    page.evaluate("window.__timingBarRects.fastStartPatternChart = []")
    page.locator("#statsVizSelect").select_option("startpattern")
    page.wait_for_function(
        "window.__timingBarRects?.fastStartPatternChart?.length > 0",
        timeout=5000,
    )
    start_default = page.locator("#chartDetailTitle").inner_text()
    page.locator("#fastStartPatternChart").evaluate("""canvas => {
      const bar = window.__timingBarRects.fastStartPatternChart[0];
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('click',{
        bubbles:true, cancelable:true, detail:1,
        clientX:rect.left+bar.x+Math.max(1,bar.w/2),
        clientY:rect.top+100
      }));
    }""")
    page.wait_for_function(
        "document.querySelector('#chartDetailTitle')?.textContent !== arguments[0]",
        arg=start_default,
        timeout=5000,
    )
    if not page.locator("#chartDetailText").inner_text().strip():
        raise AssertionError("Start-time Bar click fallback did not populate chart details")

    if errors:
        raise AssertionError("Browser errors: " + " | ".join(errors[:5]))
    browser.close()

print("PASS: Duration Bars pointer selection and independent Start-time Bars click fallback update chart details")
