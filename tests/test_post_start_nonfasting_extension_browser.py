#!/usr/bin/env python3
"""Browser regression for extending the eating period after a fast is started."""
from datetime import datetime, timedelta, timezone
import sys
from browser_perf_common import CURRENT_VERSION, build_data, inlined_html, STORAGE_SHIM

try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)

now = datetime.now(timezone.utc)
created = now - timedelta(minutes=10)
data = build_data(0)
stamp = created.isoformat().replace("+00:00", "Z")
data.update({
    "goalHours": 16,
    "activeStart": stamp,
    "activeGoalHours": 16,
    "activeTimeZone": "UTC",
    "activeCreatedAt": stamp,
    "activeModifiedAt": None,
})

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
                                args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate(
        "data => { __seedFastingDb(data, []); localStorage.setItem('fastingTracker.appMeta', "
        "JSON.stringify({lastAppVersion:'" + CURRENT_VERSION + "',seenAt:new Date().toISOString()})); }",
        data,
    )
    page.set_content(inlined_html(), wait_until="domcontentloaded")
    page.wait_for_function(
        "document.querySelector('#appVersionLabel')?.textContent === 'v" + CURRENT_VERSION + "'",
        timeout=20000,
    )

    extend = page.locator("#extendNonFastingBtn")
    assert extend.is_visible(), "post-start extension should be available inside the 30-minute window"
    extend.click()
    page.locator("#extendNonFastingModal").wait_for(state="visible", timeout=5000)
    page.locator("#extendNonFastingAmount").select_option("5")
    assert "New fasting start:" in page.locator("#extendNonFastingPreview").inner_text()
    page.locator("#extendNonFastingConfirm").click()
    page.locator("#extendNonFastingModal").wait_for(state="hidden", timeout=10000)

    # The original start was ten minutes ago; adding five minutes must retain
    # an active fast with five minutes elapsed and the original 16-hour target.
    page.wait_for_function(
        "document.querySelector('#statusText')?.textContent.startsWith('Started')",
        timeout=10000,
    )
    timer = page.locator("#timer").inner_text()
    assert timer.startswith("00:05:"), f"expected about five minutes elapsed after extension, got {timer}"
    assert "16" in page.locator("#goalText").inner_text(), "the selected fasting target must remain unchanged"
    assert extend.is_visible(), "extension remains available during the original grace window"

    # A second extension may move the start into the future. It must become a
    # scheduled start rather than persisting an invalid future activeStart.
    extend.click()
    page.locator("#extendNonFastingModal").wait_for(state="visible", timeout=5000)
    page.locator("#extendNonFastingAmount").select_option("30")
    page.locator("#extendNonFastingConfirm").click()
    page.locator("#extendNonFastingModal").wait_for(state="hidden", timeout=10000)
    page.wait_for_function(
        "document.querySelector('#statusText')?.textContent.startsWith('Scheduled for')",
        timeout=10000,
    )
    assert extend.is_visible(), "the original grace window must survive conversion to a scheduled start"

    # A scheduled start can be extended again, then cancelled without leaving
    # active-fast metadata behind.
    extend.click()
    page.locator("#extendNonFastingModal").wait_for(state="visible", timeout=5000)
    page.locator("#extendNonFastingAmount").select_option("5")
    page.locator("#extendNonFastingConfirm").click()
    page.locator("#extendNonFastingModal").wait_for(state="hidden", timeout=10000)
    page.locator("#toggleFast").click()
    page.wait_for_function(
        "document.querySelector('#statusText')?.textContent === 'Ready to start'",
        timeout=10000,
    )
    assert page.locator("#extendNonFastingBtn").is_hidden()

    if errors:
        raise AssertionError("Browser errors: " + " | ".join(errors[:3]))
    browser.close()

print("PASS: extend eating period, preserve target, schedule future start, extend schedule and cancel safely")
