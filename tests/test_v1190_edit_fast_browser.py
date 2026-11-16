#!/usr/bin/env python3
"""Browser regression for the consolidated active-fast editor and quick presets."""
from datetime import datetime, timedelta, timezone
import sys
from browser_perf_common import CURRENT_VERSION, build_data, inlined_html, STORAGE_SHIM

try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)

now = datetime.now(timezone.utc)
start = now - timedelta(hours=2)
data = build_data(0)
data.update({
    "activeStart": start.isoformat().replace("+00:00", "Z"),
    "activeGoalHours": 16,
    "activeTimeZone": "UTC",
    "activeCreatedAt": start.isoformat().replace("+00:00", "Z"),
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

    assert page.locator("#editActiveFastBtn").is_visible()
    assert page.locator("#editActiveTargetBtn").count() == 0
    page.locator("#editActiveFastBtn").click()
    page.locator("#editActiveFastModal").wait_for(state="visible", timeout=5000)

    page.locator('[data-edit-start-hours="4"]').click()
    assert page.locator("#editActiveFastStart").input_value()
    assert page.locator('[data-edit-start-hours="4"]').get_attribute("aria-pressed") == "true"

    page.locator('[data-edit-goal="20"]').click()
    assert page.locator("#editActiveFastGoal").input_value() == "20"

    # A direct date/time edit must clear the quick-start highlight.
    manual_start = (datetime.now(timezone.utc) - timedelta(hours=3)).strftime("%Y-%m-%dT%H:%M")
    page.locator("#editActiveFastStart").fill(manual_start)
    assert page.locator('[data-edit-start-hours="4"]').get_attribute("aria-pressed") == "false"

    # Re-select the quick preset and save; progress must use the corrected
    # four-hour elapsed duration and the new 20-hour target.
    page.locator('[data-edit-start-hours="4"]').click()
    page.on("dialog", lambda dialog: dialog.accept())
    page.locator("#editActiveFastSave").click()
    page.locator("#editActiveFastModal").wait_for(state="hidden", timeout=10000)
    page.wait_for_function(
        "Math.abs(Number(document.querySelector('#fastProgressTrack')?.getAttribute('aria-valuenow')) - 20) <= 1",
        timeout=10000,
    )

    # The maximum remains 120 hours; invalid values are rejected without
    # closing the editor or modifying the active fast.
    page.locator("#editActiveFastBtn").click()
    page.locator("#editActiveFastModal").wait_for(state="visible", timeout=5000)
    page.locator("#editActiveFastGoal").fill("121")
    page.locator("#editActiveFastSave").click()
    page.locator("#editActiveFastError").wait_for(state="visible", timeout=5000)
    assert page.locator("#editActiveFastModal").is_visible()
    page.locator("#editActiveFastCancel").click()
    page.locator("#editActiveFastModal").wait_for(state="hidden", timeout=5000)

    if errors:
        raise AssertionError("Browser errors: " + " | ".join(errors[:3]))
    browser.close()

print("PASS: Edit fast quick presets, direct editing, progress recalculation and 120-hour validation")
