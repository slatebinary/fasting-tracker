#!/usr/bin/env python3
"""Regression checks for button contrast and discoverable gamification guidance."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
html = (root / "index.html").read_text(encoding="utf-8")
version = json.loads((root / "version.json").read_text(encoding="utf-8"))["version"]

assert tuple(int(part) for part in version.split(".")) >= (1, 15, 3), "release must retain the accessibility fix"
assert f'<meta name="ft-app-version" content="{version}"' in html
assert f"const APP_VERSION = '{version}';" in html

# These rules deliberately override widget-level colors that previously won the cascade.
required_rules = [
    'html[data-theme="high-contrast-light"] button:not(.primary):not(.stop):not(.dangerText):not(.secondary)',
    'html[data-theme="high-contrast-light"] button.primary',
    'html[data-theme="high-contrast-light"] button.stop',
    'html[data-theme="high-contrast-dark"] button:not(.primary):not(.stop):not(.dangerText):not(.secondary)',
    'html[data-theme="high-contrast-dark"] button.primary',
    'html[data-theme="high-contrast-dark"] button.stop',
    'html[data-theme="grayscale"] button:not(.primary):not(.stop):not(.dangerText):not(.secondary)',
    'html[data-theme="grayscale"] button.secondary',
    'html[data-theme="grayscale"] button.primary',
]
for rule in required_rules:
    assert rule in html, f"missing explicit accessibility rule: {rule}"

for theme in ("high-contrast-light", "high-contrast-dark", "grayscale"):
    start = html.find(f'html[data-theme="{theme}"] button')
    assert start >= 0, f"missing theme button rules for {theme}"
    end = html.find("}", start)
    assert "!important" in html[start:end], f"{theme} rules must override widget styles"

# Specialized palettes must be selectable, persisted/importable, and localized.
specialized_themes = {
    "protanopia": "settings.appearanceProtanopia",
    "deuteranopia": "settings.appearanceDeuteranopia",
    "tritanopia": "settings.appearanceTritanopia",
}
for theme, key in specialized_themes.items():
    assert f'<option data-i18n="{key}" value="{theme}">' in html, f"missing appearance option for {theme}"
    assert f'"{theme}"' in html[html.find("function normalizeAppearance"):html.find("function normalizeIconChoice")], f"{theme} is not accepted by appearance normalization"
    assert f'"{theme}"' in html[html.find("invalid appearance")-300:html.find("invalid appearance")], f"{theme} is not accepted by imported settings"
    for language in ("en", "bg", "es"):
        translations = json.loads((root / "i18n" / f"{language}.json").read_text(encoding="utf-8"))
        assert key in translations and translations[key], f"missing {language} translation for {theme}"
    assert f'html[data-theme="{theme}"] button:focus-visible' in html, f"{theme} needs a visible keyboard focus indicator"

# Compute WCAG relative-luminance contrast from the actual theme tokens.
import re

def rgb(hex_color):
    value = hex_color.lstrip("#")
    if len(value) == 3:
        value = "".join(ch * 2 for ch in value)
    assert len(value) == 6 and all(ch in "0123456789abcdefABCDEF" for ch in value), hex_color
    return tuple(int(value[i:i+2], 16) / 255 for i in (0, 2, 4))

def luminance(hex_color):
    channels = []
    for channel in rgb(hex_color):
        channels.append(channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4)
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]

def contrast(foreground, background):
    high, low = sorted((luminance(foreground), luminance(background)), reverse=True)
    return (high + 0.05) / (low + 0.05)

for theme in ("grayscale", "high-contrast-light", "high-contrast-dark", "colorblind", "protanopia", "deuteranopia", "tritanopia"):
    match = re.search(rf'html\[data-theme="{re.escape(theme)}"\]\s*\{{([^}}]*)\}}', html)
    assert match, f"missing {theme} palette"
    tokens = dict(re.findall(r'--([a-z-]+):\s*(#[0-9a-fA-F]{3,6})', match.group(1)))
    for token in ("bg", "text", "muted", "accent"):
        assert token in tokens, f"{theme} is missing --{token}"
    assert contrast(tokens["text"], tokens["bg"]) >= 7, f"{theme} normal text must meet 7:1 contrast"
    assert contrast(tokens["muted"], tokens["bg"]) >= 4.5, f"{theme} secondary text must meet 4.5:1 contrast"
    assert contrast(tokens["accent"], tokens["bg"]) >= 4.5, f"{theme} accent must meet 4.5:1 contrast"

# Navigation must provide a non-colour-only selected state and monochrome symbols.
for theme in ("grayscale", "high-contrast-light", "high-contrast-dark", "colorblind", "protanopia", "deuteranopia", "tritanopia"):
    active_start = html.find(f'html[data-theme="{theme}"] .tab.active')
    assert active_start >= 0, f"{theme} navigation needs an explicit active-tab style"
    active_open = html.find("{", active_start)
    active_close = html.find("}", active_open)
    active_body = html[active_open:active_close]
    assert "background" in active_body and "box-shadow" in active_body, f"{theme} active tab must use a surface and underline"
    icon_start = html.find(f'html[data-theme="{theme}"] .tab .ico')
    assert icon_start >= 0, f"{theme} navigation symbols must be monochrome"
    icon_open = html.find("{", icon_start)
    icon_close = html.find("}", icon_open)
    assert "grayscale" in html[icon_open:icon_close], f"{theme} navigation symbols must be monochrome"

# Icon selector cards and the collapsible installation heading need visible boundaries.
assert ".iconChoice { padding:8px; background:var(--card); color:var(--text); border:2px solid var(--line);" in html
assert ".iconChoice.active { border:3px solid var(--accent);" in html
for theme in ("grayscale", "high-contrast-light", "high-contrast-dark"):
    assert f'html[data-theme="{theme}"] .iconInstallationGroup .iconChoice.active' in html, f"{theme} must preserve a visible selected app-icon border"
assert ".iconChoice:focus-visible { outline:3px solid var(--accent);" in html
assert "color:var(--text); background:var(--card); border:2px solid var(--line);" in html
assert '<details class="settingsGroup iconInstallationGroup" id="settingsGroupAppIcons"' in html
assert '<summary><span class="settingsIconSectionLead">' in html

# The level guidance must be visible by default, not hidden inside a collapsed <details>.
assert '<div class="scienceSources gameLevelGuide"' in html
assert '<details class="scienceSources gameLevelGuide"' not in html
for key in ("game.levelsExplainTitle", "game.levelsExplain", "game.levelsThresholds", "game.levelsPurpose"):
    assert f'data-i18n="{key}"' in html, f"missing visible/localized guide content: {key}"

print("Accessibility theme contrast and visible gamification guide checks passed.")
