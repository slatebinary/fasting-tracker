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
            hint:hint?.innerText||'',
            navBg:getComputedStyle(document.querySelector('nav')).backgroundColor,
            activeTabBg:getComputedStyle(document.querySelector('.tab.active')).backgroundColor
          };
        }""")

    general = palette()
    expected_general = {
        "theme": "colorblind",
        "bg": "#e5f1ff",
        "card": "#ecf5ff",
        "accent": "#004f8a",
        "good": "#006f55",
        "danger": "#c43d00",
    }
    for key, expected in expected_general.items():
        assert general[key] == expected, f"Colour-vision palette {key} mismatch: {general}"
    assert general["hintVisible"] and "Cool blue surfaces" in general["hint"], general
    assert general["navBg"] == "rgb(214, 232, 248)", general

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
    assert specialized["navBg"] == "rgb(245, 219, 114)", specialized
    assert general["activeTabBg"] != specialized["activeTabBg"], (general, specialized)
    for token in ("bg", "card", "accent", "good", "danger"):
        assert general[token] != specialized[token], f"Palette switch did not change --{token}"

    selector.select_option("colorblind")
    page.wait_for_function("document.documentElement.dataset.theme === 'colorblind'")
    restored = palette()
    assert restored["bg"] == general["bg"] and restored["accent"] == general["accent"], restored
    # Audit actual computed foreground/background pairs, not just palette tokens.
    page.locator("#settingsGroupData > summary").click()
    page.wait_for_function("() => !!document.querySelector('#restoreSnapshotBtn')?.offsetParent")
    for theme in ("grayscale", "high-contrast-light", "high-contrast-dark",
                  "colorblind", "protanopia", "deuteranopia", "tritanopia"):
        selector.select_option(theme)
        page.wait_for_function("value => document.documentElement.dataset.theme === value", arg=theme)
        audit = page.evaluate("""() => {
          const root = getComputedStyle(document.documentElement);
          const parse = value => {
            const raw = String(value).trim();
            if (raw.startsWith('#')) {
              let hex = raw.slice(1);
              if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
              if (hex.length === 6) return [0,2,4].map(index => parseInt(hex.slice(index,index+2),16));
            }
            const srgb = raw.match(/^color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)/i);
            if (srgb) return srgb.slice(1,4).map(channel => Number(channel) * 255);
            const parts = raw.match(/[0-9.]+/g);
            if (!parts || parts.length < 3) throw new Error('Unparseable colour: ' + value);
            return parts.slice(0,3).map(Number);
          };
          const luminance = value => {
            const channels = parse(value).map(channel => {
              const c = channel / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
            return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
          };
          const ratio = (foreground, background) => {
            const values = [luminance(foreground), luminance(background)].sort((a,b) => b-a);
            return (values[0] + 0.05) / (values[1] + 0.05);
          };
          const bg = root.getPropertyValue('--bg').trim();
          const card = root.getPropertyValue('--card').trim();
          const sample = (selector, fallback) => {
            const el = document.querySelector(selector);
            if (!el) throw new Error('Missing accessibility sample: ' + selector);
            const style = getComputedStyle(el);
            const color = style.color;
            const rawBackground = style.backgroundColor;
            const channels = rawBackground.match(/[0-9.]+/g) || [];
            const background = channels.length >= 4 && Number(channels[3]) === 0
              ? fallback : rawBackground;
            return {selector, color, background, contrast:ratio(color, background)};
          };
          const title = document.querySelector('#settingsGroupAppIcons > summary .settingsIconSectionCopy > strong');
          const subtitle = document.querySelector('#settingsGroupAppIcons > summary .settingsIconSectionCopy > .small');
          const nav = document.querySelector('nav');
          const active = document.querySelector('nav .tab.active');
          const activeIcon = active?.querySelector('.ico');
          const inactiveIcon = document.querySelector('nav .tab:not(.active) .ico');
          if (!title || !subtitle || !nav || !active || !activeIcon || !inactiveIcon) {
            throw new Error('Missing navigation or App icons & installation accessibility sample');
          }
          const navBg = getComputedStyle(nav).backgroundColor;
          const activeStyle = getComputedStyle(active);
          const activeBg = activeStyle.backgroundColor;
          const iconFilter = getComputedStyle(activeIcon).filter;
          const primarySample = sample('#toggleFast', bg);
          const toggle = document.querySelector('#toggleFast');
          const originalClass = toggle.className;
          toggle.classList.remove('primary');
          toggle.classList.add('stop');
          const stopSample = sample('#toggleFast', bg);
          toggle.className = originalClass;
          const buttonSamples = [
            primarySample,
            stopSample,
            sample('#restoreSnapshotBtn', card),
            sample('button.dangerText', card)
          ];
          return {
            titleContrast:ratio(getComputedStyle(title).color, bg),
            subtitleContrast:ratio(getComputedStyle(subtitle).color, bg),
            activeTabContrast:ratio(activeStyle.color, activeBg),
            activeIconContrast:ratio(getComputedStyle(activeIcon).color, activeBg),
            inactiveIconContrast:ratio(getComputedStyle(inactiveIcon).color, navBg),
            iconFilter,
            buttonSamples
          };
        }""")
        assert audit["titleContrast"] >= 4.5, f"{theme}: App icons & installation title contrast failed: {audit}"
        assert audit["subtitleContrast"] >= 4.5, f"{theme}: App icons & installation subtitle contrast failed: {audit}"
        assert audit["activeTabContrast"] >= 4.5, f"{theme}: active navigation label contrast failed: {audit}"
        assert audit["activeIconContrast"] >= 4.5, f"{theme}: active navigation icon contrast failed: {audit}"
        assert audit["inactiveIconContrast"] >= 4.5, f"{theme}: inactive navigation icon contrast failed: {audit}"
        assert "grayscale(1)" in audit["iconFilter"], f"{theme}: navigation icon must not rely on colour: {audit}"
        for button in audit["buttonSamples"]:
            assert button["contrast"] >= 4.5, f"{theme}: button text contrast failed: {button}"

    # Standard Light/Dark palettes must also expose readable navigation and card text.
    page.locator('.tab[data-screen="stats"]').click()
    page.wait_for_function("document.querySelector('#stats').classList.contains('active')")
    page.wait_for_function("() => !document.querySelector('#statsTimelineView').hidden")
    for theme in ("light", "dark"):
        # Appearance controls live in Settings; switch there before changing the theme.
        page.locator('.tab[data-screen="settings"]').click()
        page.wait_for_function("document.querySelector('#settings').classList.contains('active')")
        selector = page.locator("#appearanceSelect")
        selector.select_option(theme)
        page.wait_for_function("value => document.documentElement.dataset.theme === value", arg=theme)
        page.locator('.tab[data-screen="stats"]').click()
        page.wait_for_function("document.querySelector('#stats').classList.contains('active')")
        page.wait_for_function("() => !document.querySelector('#statsTimelineView').hidden")
        standard = page.evaluate("""() => {
          const contrast=(a,b)=>{
            const rgb=v=>{const m=v.match(/[0-9.]+/g);return m.slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});};
            const lum=v=>{const c=rgb(v);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
            const x=[lum(a),lum(b)].sort((a,b)=>b-a);return (x[0]+.05)/(x[1]+.05);
          };
          const nav=document.querySelector('nav'),active=document.querySelector('.tab.active');
          const navBg=getComputedStyle(nav).backgroundColor;
          const activeStyle=getComputedStyle(active),rawActiveBg=activeStyle.backgroundColor;
          // A transparent tab is painted over the navigation surface; compare against that
          // composited surface rather than treating transparent RGB channels as black.
          const alpha=rawActiveBg.match(/[0-9.]+/g);
          const activeBg=alpha && alpha.length >= 4 && Number(alpha[3]) === 0 ? navBg : rawActiveBg;
          const card=document.querySelector('#stats .card'),cardText=card.querySelector('h2');
          return {navLabel:contrast(activeStyle.color,activeBg),
            inactiveLabel:contrast(getComputedStyle(document.querySelector('.tab:not(.active)')).color,navBg),
            cardText:contrast(getComputedStyle(cardText).color,getComputedStyle(card).backgroundColor),
            chartVisible:!!document.querySelector('#statsTimelineView canvas')&&!document.querySelector('#statsTimelineView').hidden,
            canvasSize:[document.querySelector('#statsTimelineView canvas').width,document.querySelector('#statsTimelineView canvas').height]};
        }""")
        assert standard["navLabel"] >= 4.5, f"{theme}: active navigation label contrast: {standard}"
        assert standard["inactiveLabel"] >= 4.5, f"{theme}: inactive navigation label contrast: {standard}"
        assert standard["cardText"] >= 4.5, f"{theme}: card heading contrast: {standard}"
        assert standard["chartVisible"] and all(x>0 for x in standard["canvasSize"]), f"{theme}: chart missing: {standard}"

    # App-icons installation details remain genuinely collapsible after palette changes.
    page.locator('.tab[data-screen="settings"]').click()
    group=page.locator("#settingsGroupAppIcons")
    summary=group.locator(":scope > summary")
    if group.get_attribute("open") is not None:
        summary.click()
    assert group.get_attribute("open") is None, "App icons group should collapse"
    summary.click()
    assert group.get_attribute("open") is not None, "App icons group should expand"

    # Reinitialise the document against the same browser storage and verify appearance restoration.
    page.locator('.tab[data-screen="settings"]').click()
    page.wait_for_function("document.querySelector('#settings').classList.contains('active')")
    selector = page.locator("#appearanceSelect")
    selector.select_option("protanopia")
    page.wait_for_function("document.documentElement.dataset.theme === 'protanopia'")
    page.set_content(inlined_html(), wait_until="domcontentloaded")
    page.wait_for_function("v => document.querySelector('#appVersionLabel')?.textContent === 'v' + v", arg=VERSION, timeout=20000)
    page.wait_for_function("document.documentElement.dataset.theme === 'protanopia'")
    assert not errors, errors[:5]
    browser.close()

print("PASS: runtime accessibility palettes, standard themes, card/nav contrast, chart rendering, app-icon disclosure and appearance restoration")
