#!/usr/bin/env python3
"""Runtime regression for distinct colour-vision palettes and their live selector."""
import json
from pathlib import Path
from browser_perf_common import STORAGE_SHIM, build_data, inlined_html
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
VERSION = json.loads((ROOT / "version.json").read_text(encoding="utf-8"))["version"]
DATA = build_data(2)
DATA["appearance"] = "colorblind"

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
        """arg => {
          __seedFastingDbV2(arg.data, []);
          localStorage.setItem('fastingTracker.appMeta', JSON.stringify({lastAppVersion:arg.version}));
        }""",
        {"data": DATA, "version": VERSION},
    )
    page.set_content(inlined_html(), wait_until="domcontentloaded")
    page.wait_for_function(
        "v => document.querySelector('#appVersionLabel')?.textContent === 'v' + v",
        arg=VERSION,
        timeout=20000,
    )
    page.wait_for_function("document.documentElement.dataset.theme === 'colorblind'")
    page.locator('.tab[data-screen="settings"]').click()
    selector = page.locator("#appearanceSelect")
    assert selector.is_visible(), "Appearance selector must be visible in Settings"

    def palette():
        return page.evaluate("""() => {
          const css=getComputedStyle(document.documentElement);
          const hint=document.querySelector('#appearancePaletteHint');
          return {
            theme:document.documentElement.dataset.theme,
            bg:css.getPropertyValue('--bg').trim().toLowerCase(),
            card:css.getPropertyValue('--card').trim().toLowerCase(),
            accent:css.getPropertyValue('--accent').trim().toLowerCase(),
            good:css.getPropertyValue('--good').trim().toLowerCase(),
            danger:css.getPropertyValue('--danger').trim().toLowerCase(),
            hintVisible:!!hint && !hint.hidden,
            hint:hint?.innerText||''
          };
        }""")

    general = palette()
    expected_general = {
        "theme": "colorblind",
        "bg": "#e5f1ff",
        "card": "#ecf5ff",
        "accent": "#004f8a",
        "good": "#006f55",
        "danger": "#a84300",
    }
    for key, expected in expected_general.items():
        assert general[key] == expected, f"Colour-vision palette {key} mismatch: {general}"
    assert general["hintVisible"] and "Cool blue surfaces" in general["hint"], general

    selector.select_option("protanopia")
    page.wait_for_function("document.documentElement.dataset.theme === 'protanopia'")
    specialized = palette()
    expected_specialized = {
        "theme": "protanopia",
        "bg": "#fff0a8",
        "card": "#fff2c5",
        "accent": "#5b2a86",
        "good": "#006f8a",
        "danger": "#8b5700",
    }
    for key, expected in expected_specialized.items():
        assert specialized[key] == expected, f"Protanopia palette {key} mismatch: {specialized}"
    assert specialized["hintVisible"] and "Warm golden surfaces" in specialized["hint"], specialized
    for token in ("bg", "card", "accent", "good", "danger"):
        assert general[token] != specialized[token], f"Palette switch did not change --{token}"

    selector.select_option("colorblind")
    page.wait_for_function("document.documentElement.dataset.theme === 'colorblind'")
    restored = palette()
    assert restored["bg"] == general["bg"] and restored["accent"] == general["accent"], restored
    assert not errors, errors[:5]
    browser.close()

print("PASS: colour-vision and protanopia palettes apply distinct live tokens, surfaces and localized purpose hints")
