#!/usr/bin/env python3
"""Primary navigation exposes a labelled, keyboard-operable tab/panel relationship."""
import sys
from browser_perf_common import CURRENT_VERSION, inlined_html, STORAGE_SHIM
try:
    from playwright.sync_api import sync_playwright
except Exception as exc:
    print(f"SKIP: Playwright unavailable: {exc}")
    sys.exit(0)

screens = ["fasting", "history", "weight", "stats", "settings"]
labels = {
    "en": ("Main navigation", "App sections"),
    "bg": ("Основна навигация", "Раздели на приложението"),
    "es": ("Navegación principal", "Secciones de la aplicación"),
}

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/chromium", headless=True,
                                args=["--no-sandbox", "--disable-dev-shm-usage"])
    page = browser.new_page(viewport={"width": 390, "height": 844})
    errors = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    page.evaluate(STORAGE_SHIM)
    page.set_content(inlined_html(), wait_until="domcontentloaded")
    page.wait_for_function(
        f"document.querySelector('#appVersionLabel')?.textContent === 'v{CURRENT_VERSION}'",
        timeout=20000,
    )

    nav = page.locator("nav")
    tabs = page.locator(".tabs[role=tablist]")
    if nav.get_attribute("aria-label") != labels["en"][0]:
        raise AssertionError("Navigation landmark must have a localized accessible name")
    if tabs.get_attribute("aria-label") != labels["en"][1]:
        raise AssertionError("Tablist must have a localized accessible name")

    tab_stops = page.locator(".tabs [role=tab][tabindex='0']")
    if tab_stops.count() != 1 or tab_stops.first.get_attribute("data-screen") != "fasting":
        raise AssertionError("Exactly the active tab must be the tablist's Tab stop")

    for screen in screens:
        tab = page.locator(f".tabs [role=tab][data-screen='{screen}']")
        panel = page.locator(f".screen#{screen}")
        tab_id = tab.get_attribute("id")
        if not tab_id or tab.get_attribute("aria-controls") != screen:
            raise AssertionError(f"{screen}: tab must identify and control its panel")
        if panel.get_attribute("role") != "tabpanel" or panel.get_attribute("aria-labelledby") != tab_id:
            raise AssertionError(f"{screen}: panel must be labelled by its corresponding tab")
        if not tab.inner_text().strip():
            raise AssertionError(f"{screen}: tab must have a non-empty accessible text label")

    page.locator(".tabs [data-screen='fasting']").focus()
    page.keyboard.press("ArrowRight")
    page.wait_for_function("""() => {
      const tab=document.querySelector('.tabs [data-screen="history"]');
      return document.activeElement===tab && tab.getAttribute('aria-selected')==='true' &&
        tab.getAttribute('aria-current')==='page' && tab.tabIndex===0 &&
        document.querySelector('#history').classList.contains('active');
    }""")
    if page.locator(".tabs [role=tab][tabindex='0']").count() != 1:
        raise AssertionError("Arrow navigation must preserve exactly one Tab stop")
    page.keyboard.press("End")
    page.wait_for_function("""() => {
      const tab=document.querySelector('.tabs [data-screen="settings"]');
      return document.activeElement===tab && tab.getAttribute('aria-selected')==='true' &&
        tab.tabIndex===0 && document.querySelector('#settings').classList.contains('active');
    }""")

    for language in ("bg", "es"):
        page.locator("#languageSelect").select_option(language)
        page.wait_for_function(
            "(expected) => document.querySelector('nav')?.getAttribute('aria-label')===expected[0] && document.querySelector('.tabs')?.getAttribute('aria-label')===expected[1]",
            arg=list(labels[language]),
            timeout=10000,
        )

    if errors:
        raise AssertionError("Browser errors: " + " | ".join(errors[:3]))
    browser.close()

print("PASS: primary navigation has localized landmark names, labelled tab panels and one keyboard Tab stop")
