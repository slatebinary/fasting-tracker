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
    assert f"'{theme}'" in html[html.find("function normalizeAppearance"):html.find("function normalizeIconChoice")], f"{theme} is not accepted by appearance normalization"
    assert f"'{theme}'" in html[html.find("invalid appearance")-300:html.find("invalid appearance")], f"{theme} is not accepted by imported settings"
    for language in ("en", "bg", "es"):
        translations = json.loads((root / "i18n" / f"{language}.json").read_text(encoding="utf-8"))
        assert key in translations and translations[key], f"missing {language} translation for {theme}"
    assert f'html[data-theme="{theme}"] :is(button,input,select,textarea,a,summary,[tabindex]):focus-visible' in html, f"{theme} needs a visible keyboard focus indicator for every control"

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
    for token in ("good", "danger"):
        assert token in tokens, f"{theme} is missing --{token}"
        assert contrast(tokens[token], tokens["bg"]) >= 4.5, f"{theme} {token} status text must meet 4.5:1 contrast"

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

# Keyboard focus must be explicit and high-contrast on all interactive control types.
for theme in ("grayscale", "high-contrast-light", "high-contrast-dark", "colorblind", "protanopia", "deuteranopia", "tritanopia"):
    selector = f'html[data-theme="{theme}"] :is(button,input,select,textarea,a,summary,[tabindex]):focus-visible'
    assert selector in html, f"{theme} is missing the shared full-control focus rule"
assert "outline:3px solid var(--accent) !important; outline-offset:3px;" in html, "accessibility focus indicators must use a full-strength accent outline"

print("Accessibility theme contrast and visible gamification guide checks passed.")


# Validate that each specialist palette is visually distinct and keeps its status
# colours separated under a standard linear-RGB colour-vision-deficiency simulation.
def _srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(channel):
    channel = min(1.0, max(0.0, channel))
    return 12.92 * channel if channel <= 0.0031308 else 1.055 * channel ** (1 / 2.4) - 0.055


def _rgb_from_hex(value):
    value = value.lstrip("#")
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _simulate_cvd(value, matrix):
    linear = [_srgb_to_linear(channel) for channel in _rgb_from_hex(value)]
    simulated = [
        sum(matrix[row][column] * linear[column] for column in range(3))
        for row in range(3)
    ]
    return tuple(_linear_to_srgb(channel) for channel in simulated)


def _lab(rgb):
    red, green, blue = (_srgb_to_linear(channel) for channel in rgb)
    x = (0.4124564 * red + 0.3575761 * green + 0.1804375 * blue) / 0.95047
    y = 0.2126729 * red + 0.7151522 * green + 0.0721750 * blue
    z = (0.0193339 * red + 0.1191920 * green + 0.9503041 * blue) / 1.08883

    def pivot(channel):
        return channel ** (1 / 3) if channel > 216 / 24389 else (24389 / 27 * channel + 16) / 116

    fx, fy, fz = pivot(x), pivot(y), pivot(z)
    return (116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz))


def _delta_e(first, second):
    a, b = _lab(first), _lab(second)
    return sum((a[i] - b[i]) ** 2 for i in range(3)) ** 0.5


CVD_MATRICES = {
    # Machado et al. style full-severity linear-RGB approximations.
    "protanopia": (
        (0.152286, 1.052583, -0.204868),
        (0.114503, 0.786281, 0.099216),
        (-0.003882, -0.048116, 1.051998),
    ),
    "deuteranopia": (
        (0.367322, 0.860646, -0.227968),
        (0.280085, 0.672501, 0.047413),
        (-0.011820, 0.042940, 0.968881),
    ),
    "tritanopia": (
        (1.255528, -0.076749, -0.178779),
        (-0.078411, 0.930809, 0.147602),
        (0.004733, 0.691367, 0.303900),
    ),
}


def _palette_tokens(theme):
    match = re.search(rf'html\[data-theme="{re.escape(theme)}"\]\s*\{{([^}}]*)\}}', html)
    assert match, f"missing {theme} palette for colour simulation"
    return dict(re.findall(r'--([a-z-]+):\s*(#[0-9a-fA-F]{3,6})', match.group(1)))


baseline = _palette_tokens("colorblind")
specialist_expectations = {
    "protanopia": {"bg": 8.0, "accent": 8.0, "good": 15.0, "danger": 15.0},
    "deuteranopia": {"accent": 15.0, "good": 15.0, "danger": 15.0},
    "tritanopia": {"accent": 15.0, "good": 10.0, "danger": 15.0},
}
for theme, thresholds in specialist_expectations.items():
    palette = _palette_tokens(theme)
    for token, minimum in thresholds.items():
        distance = _delta_e(_rgb_from_hex(baseline[token]), _rgb_from_hex(palette[token]))
        assert distance >= minimum, (
            f"{theme} --{token} is too similar to the general colour-vision palette "
            f"(Delta E {distance:.1f}, expected at least {minimum:.1f})"
        )

    matrix = CVD_MATRICES[theme]
    simulated_good = _simulate_cvd(palette["good"], matrix)
    simulated_danger = _simulate_cvd(palette["danger"], matrix)
    separation = _delta_e(simulated_good, simulated_danger)
    assert separation >= 20, (
        f"{theme} success and danger colours converge under its deficiency simulation "
        f"(Delta E {separation:.1f})"
    )


# Compare all four options pairwise in CIEDE2000 (Delta E 00), a perceptually
# weighted Lab colour-difference formula. The minimums enforce a distinct surface
# and accent identity across all six combinations.
import itertools
import math

def _delta_e_2000(first, second):
    L1, a1, b1 = _lab(first)
    L2, a2, b2 = _lab(second)
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cbar = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cbar ** 7 / (Cbar ** 7 + 25 ** 7)))
    ap1, ap2 = (1 + G) * a1, (1 + G) * a2
    cp1, cp2 = math.hypot(ap1, b1), math.hypot(ap2, b2)
    def hue(a, b):
        value = math.degrees(math.atan2(b, a))
        return value + 360 if value < 0 else value
    hp1, hp2 = hue(ap1, b1), hue(ap2, b2)
    dL, dC = L2 - L1, cp2 - cp1
    dh = hp2 - hp1
    if cp1 * cp2 == 0: dh = 0
    elif dh > 180: dh -= 360
    elif dh < -180: dh += 360
    dH = 2 * math.sqrt(cp1 * cp2) * math.sin(math.radians(dh / 2))
    Lbar, cpbar = (L1 + L2) / 2, (cp1 + cp2) / 2
    if cp1 * cp2 == 0: hpbar = hp1 + hp2
    elif abs(hp1 - hp2) <= 180: hpbar = (hp1 + hp2) / 2
    elif hp1 + hp2 < 360: hpbar = (hp1 + hp2 + 360) / 2
    else: hpbar = (hp1 + hp2 - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hpbar - 30))
         + 0.24 * math.cos(math.radians(2 * hpbar))
         + 0.32 * math.cos(math.radians(3 * hpbar + 6))
         - 0.20 * math.cos(math.radians(4 * hpbar - 63)))
    dtheta = 30 * math.exp(-((hpbar - 275) / 25) ** 2)
    Rc = 2 * math.sqrt(cpbar ** 7 / (cpbar ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbar - 50) ** 2 / math.sqrt(20 + (Lbar - 50) ** 2)
    Sc, Sh = 1 + 0.045 * cpbar, 1 + 0.015 * cpbar * T
    Rt = -math.sin(math.radians(2 * dtheta)) * Rc
    return math.sqrt((dL / Sl) ** 2 + (dC / Sc) ** 2 + (dH / Sh) ** 2
                     + Rt * (dC / Sc) * (dH / Sh))

theme_names = ("colorblind", "protanopia", "deuteranopia", "tritanopia")
for first_name, second_name in itertools.combinations(theme_names, 2):
    first, second = _palette_tokens(first_name), _palette_tokens(second_name)
    for token, minimum in (("bg", 8.0), ("accent", 18.0)):
        distance = _delta_e_2000(_rgb_from_hex(first[token]), _rgb_from_hex(second[token]))
        assert distance >= minimum, (
            f"{first_name} and {second_name} --{token} are too similar "
            f"(Delta E 00 {distance:.1f}, expected at least {minimum:.1f})"
        )

print("All four colour-vision palettes pass six pairwise CIEDE2000 comparisons.")



# Each colour-vision palette must explain its intended accessibility purpose
# in the selected interface language, and the hint must update with the selector.
assert 'id="appearancePaletteHint"' in html
assert 'function updateAppearancePaletteHint()' in html
assert "updateAppearancePaletteHint();" in html
for language in ("en", "bg", "es"):
    dictionary = json.loads((root / "i18n" / f"{language}.json").read_text(encoding="utf-8"))
    runtime = (root / "i18n" / f"{language}.js").read_text(encoding="utf-8")
    for palette in ("colorblind", "protanopia", "deuteranopia", "tritanopia"):
        key = f"settings.paletteHint.{palette}"
        assert dictionary.get(key), f"Missing {language} purpose hint for {palette}"
        assert dictionary[key] in runtime, f"Runtime bundle missing {language} purpose hint for {palette}"
source = json.loads((root / "i18n-source.json").read_text(encoding="utf-8"))
for palette in ("colorblind", "protanopia", "deuteranopia", "tritanopia"):
    assert source["strings"].get(f"settings.paletteHint.{palette}")
print("All four palette purpose hints are present in English, Bulgarian and Spanish.")
