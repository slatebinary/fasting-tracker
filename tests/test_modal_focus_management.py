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
    page.locator("#settingsGroupAdvanced > summary").click()

    # Open a parent dialog from a keyboard-focused page control, then open a second dialog.
    page.locator("#createSnapshotBtn").focus()
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
    page.wait_for_function("document.activeElement?.id === 'manualSnapshotLabel'")
    if page.evaluate("document.activeElement?.id") != "manualSnapshotLabel":
        raise AssertionError("Closing the child dialog did not restore focus to its parent opener")

    # Closing the parent must restore focus to the original page control.
    page.keyboard.press("Escape")
    page.wait_for_function("document.querySelector('#manualSnapshotModal').hidden")
    page.wait_for_function("document.activeElement?.id === 'createSnapshotBtn'")

    # With every control disabled, initial focus and Tab fallback must land on
    # the dialog container itself rather than leaving focus behind the overlay.
    page.evaluate("""() => {
      const modal = document.querySelector('#manualSnapshotModal');
      modal.querySelectorAll('button, input, select, textarea, a[href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])').forEach(node => {
        if ('disabled' in node) node.disabled = true;
        else node.setAttribute('tabindex', '-1');
      });
      showModal('manualSnapshotModal');
    }""")
    page.wait_for_function("!document.querySelector('#manualSnapshotModal').hidden")
    page.wait_for_function("document.activeElement === document.querySelector('#manualSnapshotModal [role=dialog]')")
    dialog = page.locator("#manualSnapshotModal [role=dialog]")
    if dialog.get_attribute("tabindex") != "-1":
        raise AssertionError("Dialog fallback did not become programmatically focusable")
    page.keyboard.press("Tab")
    if page.evaluate("document.activeElement === document.querySelector('#manualSnapshotModal [role=dialog]')") is not True:
        raise AssertionError("Tab escaped a dialog with no enabled focusable controls")
    page.keyboard.press("Shift+Tab")
    if page.evaluate("document.activeElement === document.querySelector('#manualSnapshotModal [role=dialog]')") is not True:
        raise AssertionError("Shift+Tab escaped a dialog with no enabled focusable controls")
    if errors:
        raise AssertionError("Browser errors: " + " | ".join(errors[:3]))
    browser.close()

print("PASS: nested modal Escape/Tab handling and stacked focus restoration")
