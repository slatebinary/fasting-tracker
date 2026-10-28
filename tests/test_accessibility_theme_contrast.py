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

# The level guidance must be visible by default, not hidden inside a collapsed <details>.
assert '<div class="scienceSources gameLevelGuide"' in html
assert '<details class="scienceSources gameLevelGuide"' not in html
for key in ("game.levelsExplainTitle", "game.levelsExplain", "game.levelsThresholds", "game.levelsPurpose"):
    assert f'data-i18n="{key}"' in html, f"missing visible/localized guide content: {key}"

print("Accessibility theme contrast and visible gamification guide checks passed.")
