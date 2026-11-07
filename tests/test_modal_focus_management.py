#!/usr/bin/env python3
"""Regression: nested dialogs keep topmost keyboard handling and restore focus in stack order."""
import json
from pathlib import Path
from browser_perf_common import inlined_html, STORAGE_SHIM
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
EMPTY = {
    "dataVersion": 1, "revision": 0, "updatedAt": None, "goalHours": 16,
    "activeStart": None, "activeGoalHours": None, "activeTimeZone": None,
    "activeCreatedAt": None, "activeModifiedAt": None, "records": [],
    "deletedFasts": [], "weights": [], "deletedWeights": [], "weightUnit": "kg",
    "targetWeightKg": None, "gamificationEnabled": True, "language": "en",
    "appearance": "system", "iconChoice": "plate",
}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
                                args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.evaluate("""d => {
      __seedFastingDbV2(d, []);
      localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:'1.17.27'}));
    }""", EMPTY)
    page.set_content(inlined_html(), wait_until="domcontentloaded")
    page.wait_for_function(
        f"document.querySelector('#appVersionLabel')?.textContent === 'v{VERSION}'",
        timeout=20000,
    )
    page.locator('.tab[data-screen="settings"]').click()

    # Open a parent dialog, then open a second dialog while it remains active.
    page.locator("#createSnapshotBtn").evaluate("e => e.click()")
    page.wait_for_function("!document.querySelector('#manualSnapshotModal').hidden")
    page.wait_for_function("document.activeElement?.id === 'manualSnapshotLabel'")
    page.locator("#deviceChecksBtn").evaluate("e => e.click()")
    page.wait_for_function("!document.querySelector('#deviceCheckModal').hidden", timeout=10000)
    page.wait_for_function("document.activeElement?.id === 'deviceCheckCloseBtn'")

    # The topmost dialog owns Tab and Escape; the parent must remain open.
    page.keyboard.press("Tab")
    if page.evaluate("document.activeElement?.id") != "deviceCheckCloseBtn":
        raise AssertionError("Tab escaped a single-control topmost dialog")
    page.keyboard.press("Escape")
    page.wait_for_function("document.querySelector('#deviceCheckModal').hidden")
    if page.locator("#manualSnapshotModal").is_hidden():
        raise AssertionError("Escape closed the parent instead of the topmost dialog")
    if page.evaluate("document.activeElement?.id") != "manualSnapshotLabel":
        raise AssertionError("Closing the child dialog did not restore focus to its parent opener")

    # Closing the parent must restore focus to the original page control.
    page.keyboard.press("Escape")
    page.wait_for_function("document.querySelector('#manualSnapshotModal').hidden")
    page.wait_for_function("document.activeElement?.id === 'createSnapshotBtn'")
    if errors:
        raise AssertionError("Browser errors: " + " | ".join(errors[:3]))
    browser.close()

print("PASS: nested modal Escape/Tab handling and stacked focus restoration")
